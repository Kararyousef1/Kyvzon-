/**
 * ════════════════════════════════════════════════════════════════
 *  TimeLogService - خدمة سجلات الوقت (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD لجدول time_logs
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import type { TimeLogRecord } from '../../shared/types/sdk';
import { supabase } from '../supabase/supabase';

class TimeLogService extends BaseService<TimeLogRecord> {
  constructor() {
    super('time_logs');
  }

  /**
   * جلب جميع سجلات الوقت مع معلومات الموظف
   */
  async findAllWithProfiles(): Promise<any[]> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*, profiles!employee_id(full_name, department)');

      const tenantId = getCurrentTenantId();
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      query = query.order('timestamp', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('TimeLogService.findAllWithProfiles error:', error);
      return [];
    }
  }
}

export const timeLogService = new TimeLogService();