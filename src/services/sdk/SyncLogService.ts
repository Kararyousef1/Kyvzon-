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
      orderBy: 'created_at',
      ascending: false,
      limit,
    });
  }

  async createSyncLog(data: Partial<SyncLogRecord>): Promise<SyncLogRecord> {
    return this.create({
      sync_time: new Date().toISOString(),
      source: data.source || 'manual',
      records_synced: data.records_synced ?? 0,
      status: data.status || 'success',
      error_message: data.error_message,
      details: data.details,
      device_id: data.device_id,
    } as Partial<SyncLogRecord>);
  }
}

export const syncLogService = new SyncLogService();