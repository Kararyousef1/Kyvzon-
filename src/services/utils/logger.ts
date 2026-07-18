/**
 * Structured Logger — Kyvzon Platform (v3 - Treatment Plan)
 * Features:
 * - Log levels, tenant enrichment, child logger
 * - Remote logging via ErrorLogService (SDK) for error/warn — respects SDK boundary
 * - Correlation ID propagation
 * - No sensitive data leak sanitization
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  component?: string;
  action?: string;
  correlationId?: string;
  [key: string]: unknown;
}

interface LoggerOptions {
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enableRemote?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCorrelationId(): string {
  try {
    let id = sessionStorage.getItem('correlation_id');
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem('correlation_id', id);
    }
    return id;
  } catch {
    return `corr_${Date.now()}`;
  }
}

class Logger {
  private minLevel: LogLevel = 'info';
  private enableConsole = true;
  private enableRemote = false;

  constructor(options: LoggerOptions = {}) {
    if (options.minLevel) this.minLevel = options.minLevel;
    if (options.enableConsole !== undefined) this.enableConsole = options.enableConsole;
    if (options.enableRemote !== undefined) this.enableRemote = options.enableRemote;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private getTenantId(): string | undefined {
    try { return localStorage.getItem('tenant_id') || undefined; } catch { return undefined; }
  }

  private getUserId(): string | undefined {
    try {
      const userStr = localStorage.getItem('auth_user');
      if (userStr) {
        const u = JSON.parse(userStr);
        return u?.id;
      }
      return undefined;
    } catch { return undefined; }
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctx}`;
  }

  private async sendToRemote(level: LogLevel, message: string, context: LogContext) {
    if (!this.enableRemote) return;
    if (level !== 'error' && level !== 'warn') return;

    try {
      // Use ErrorLogService (SDK) via dynamic import — respects SDK boundary
      const { errorLogService } = await import('../sdk/ErrorLogService');

      const sanitizedMessage = message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
                                      .replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');

      await errorLogService.logError({
        message: sanitizedMessage.slice(0, 2000),
        source: (context.component as string) || 'logger',
        stack_trace: (context.stack as string) || undefined,
        severity: level,
        category: (context.action as string) || 'general',
        user_id: (context.userId as string) || this.getUserId() || null,
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : undefined,
        metadata: {
          correlation_id: context.correlationId || getCorrelationId(),
          tenantId: context.tenantId || this.getTenantId(),
          ...context,
          url: typeof window !== 'undefined' ? window.location.href : null,
        },
      } as any);
    } catch (e) {
      console.warn('[Logger] Remote log failed:', e);
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (!this.shouldLog(level)) return;

    const enrichedContext: LogContext = {
      correlationId: getCorrelationId(),
      tenantId: context?.tenantId || this.getTenantId(),
      userId: context?.userId || this.getUserId(),
      ...context,
    };

    const formatted = this.formatMessage(level, message, enrichedContext);

    if (this.enableConsole) {
      switch (level) {
        case 'debug': console.debug(formatted); break;
        case 'info': console.info(formatted); break;
        case 'warn': console.warn(formatted); break;
        case 'error': console.error(formatted); break;
      }
    }

    if (this.enableRemote) {
      void this.sendToRemote(level, message, enrichedContext);
    } else if (level === 'error' && !import.meta.env.DEV) {
      void this.sendToRemote(level, message, enrichedContext);
    }
  }

  debug(message: string, context?: LogContext) { this.log('debug', message, context); }
  info(message: string, context?: LogContext) { this.log('info', message, context); }
  warn(message: string, context?: LogContext) { this.log('warn', message, context); }
  error(message: string, context?: LogContext) { this.log('error', message, context); }

  logError(error: unknown, message?: string, context?: LogContext) {
    const errorMessage = message || 'An error occurred';
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack?.slice(0, 2000), name: error.name }
      : { error: String(error).slice(0, 2000) };

    this.error(errorMessage, { ...context, ...errorDetails });
  }

  child(defaultContext: LogContext) {
    return {
      debug: (message: string, ctx?: LogContext) => this.debug(message, { ...defaultContext, ...ctx }),
      info: (message: string, ctx?: LogContext) => this.info(message, { ...defaultContext, ...ctx }),
      warn: (message: string, ctx?: LogContext) => this.warn(message, { ...defaultContext, ...ctx }),
      error: (message: string, ctx?: LogContext) => this.error(message, { ...defaultContext, ...ctx }),
      logError: (error: unknown, msg?: string, ctx?: LogContext) => this.logError(error, msg, { ...defaultContext, ...ctx }),
    };
  }

  setRemote(enabled: boolean) { this.enableRemote = enabled; }
}

export const logger = new Logger({
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  enableConsole: true,
  enableRemote: !import.meta.env.DEV,
});

export default logger;
