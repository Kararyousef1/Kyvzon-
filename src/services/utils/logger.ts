/**
 * ════════════════════════════════════════════════════════════════
 *  Structured Logger — Kyvzon Platform (v2 - Production Ready)
 *  ════════════════════════════════════════════════════════════════
 *
 *  A lightweight, type-safe, and extensible structured logger.
 *  Designed to work with the SDK layer and future observability tools.
 *
 *  Features:
 *  - Log levels with proper hierarchy
 *  - Automatic tenant context enrichment
 *  - Contextual metadata (tenant, user, component, action)
 *  - Child logger pattern for scoped logging
 *  - Ready for Sentry / OpenTelemetry integration
 *  - Zero dependencies
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  component?: string;
  action?: string;
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

  /**
   * Get current tenant ID safely (without throwing)
   */
  private getTenantId(): string | undefined {
    try {
      return localStorage.getItem('tenant_id') || undefined;
    } catch {
      return undefined;
    }
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctx}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (!this.shouldLog(level)) return;

    // Auto-enrich with tenant context if not provided
    const enrichedContext: LogContext = {
      ...context,
      tenantId: context?.tenantId || this.getTenantId(),
    };

    const formatted = this.formatMessage(level, message, enrichedContext);

    if (this.enableConsole) {
      switch (level) {
        case 'debug':
          console.debug(formatted);
          break;
        case 'info':
          console.info(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'error':
          console.error(formatted);
          break;
      }
    }

    // Future: Remote logging (Sentry, etc.)
    if (this.enableRemote) {
      // TODO: Implement remote logging integration
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  /**
   * Log an error with stack trace and additional details
   */
  logError(error: unknown, message?: string, context?: LogContext) {
    const errorMessage = message || 'An error occurred';
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { error: String(error) };

    this.error(errorMessage, {
      ...context,
      ...errorDetails,
    });
  }

  /**
   * Create a child logger with default context (useful for modules)
   */
  child(defaultContext: LogContext) {
    return {
      debug: (message: string, ctx?: LogContext) =>
        this.debug(message, { ...defaultContext, ...ctx }),
      info: (message: string, ctx?: LogContext) =>
        this.info(message, { ...defaultContext, ...ctx }),
      warn: (message: string, ctx?: LogContext) =>
        this.warn(message, { ...defaultContext, ...ctx }),
      error: (message: string, ctx?: LogContext) =>
        this.error(message, { ...defaultContext, ...ctx }),
      logError: (error: unknown, msg?: string, ctx?: LogContext) =>
        this.logError(error, msg, { ...defaultContext, ...ctx }),
    };
  }
}

// Singleton instance
export const logger = new Logger({
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  enableConsole: true,
  enableRemote: false,
});

export default logger;