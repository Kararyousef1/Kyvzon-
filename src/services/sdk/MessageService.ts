/**
 * ════════════════════════════════════════════════════════════════
 *  MessageService - خدمة الرسائل الداخلية (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD لرسائل التواصل (hr_messages)
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface HrMessageRecord {
  id: string;
  employee_id?: string;
  subject: string;
  message: string;
  priority: 'low' | 'normal' | 'urgent';
  status: 'new' | 'read' | 'replied';
  created_at: string;
  profiles?: { full_name: string; department: string } | null;
  tenant_id: string;
}

export interface HrMessageInput {
  employee_id?: string;
  subject: string;
  message: string;
  priority: 'low' | 'normal' | 'urgent';
  status?: 'new' | 'read' | 'replied';
}

class MessageService extends BaseService<HrMessageRecord> {
  constructor() {
    super('hr_messages');
  }

  /**
   * جلب جميع الرسائل مع معلومات المستخدم
   */
  async findAllWithProfiles(): Promise<HrMessageRecord[]> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*, profiles(full_name, department)');

      const tenantId = getCurrentTenantId();
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as HrMessageRecord[];
    } catch (error) {
      console.error('MessageService.findAllWithProfiles error:', error);
      return [];
    }
  }

  /**
   * إنشاء رسالة جديدة
   */
  async createMessage(data: HrMessageInput): Promise<HrMessageRecord> {
    return this.create(data as unknown as Partial<HrMessageRecord>);
  }

  /**
   * تحديث حالة الرسالة
   */
  async updateMessageStatus(id: string, status: 'new' | 'read' | 'replied'): Promise<HrMessageRecord> {
    return this.update(id, { status } as unknown as Partial<HrMessageRecord>);
  }

  /**
   * جلب رسالة واحدة
   */
  async findMessageById(id: string): Promise<HrMessageRecord | null> {
    return this.findById(id);
  }
}

export const messageService = new MessageService();
