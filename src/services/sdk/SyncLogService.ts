/**
 * ════════════════════════════════════════════════════════════════
 *  SyncLogService - خدمة سجلات المزامنة (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD لجدول sync_log
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { SyncLogRecord } from '../../shared/types/sdk';

class SyncLogService extends BaseService<SyncLogRecord> {
  constructor() {
    super('sync_log');
  }

  /**
   * جلب آخر سجلات المزامنة
   */
  async findRecentLogs(limit: number = 50): Promise<any[]> {
    return this.findAll({
      orderBy: 'sync_time',
      ascending: false,
      limit,
    });
  }
}

export const syncLogService = new SyncLogService();