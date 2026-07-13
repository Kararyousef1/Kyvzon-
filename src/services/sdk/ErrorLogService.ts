/**
 * ════════════════════════════════════════════════════════════════
 *  ErrorLogService - خدمة سجل الأخطاء
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { ErrorLogRecord } from '../../shared/types/sdk';

class ErrorLogService extends BaseService<ErrorLogRecord> {
  constructor() {
    super('error_logs');
  }

  async logError(data: {
    message: string;
    stack?: string;
    url?: string;
    user_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ErrorLogRecord> {
    return this.create(data as unknown as Partial<ErrorLogRecord>);
  }
}

export const errorLogService = new ErrorLogService();
