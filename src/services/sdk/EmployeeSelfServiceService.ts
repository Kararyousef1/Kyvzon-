/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeSelfServiceService
 *  مجال: مركز خدمات HR للموظف + طلبات الخطابات
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';
import { BaseService, SdkError } from './BaseService';
import type {
  HRCaseRecord,
  HRCaseCommentRecord,
  HRCasePriority,
  EmployeeLetterRequestRecord,
} from '../../shared/types/sdk';

class HRCaseService extends BaseService<HRCaseRecord> {
  constructor() { super('hr_cases'); }

  async findByEmployee(employeeId: string): Promise<HRCaseRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
      limit: 50,
    });
  }

  /**
   * ينشئ حالة الموظف ورسالة صندوق HR في معاملة واحدة.
   * لا يقبل tenant_id أو employee_id؛ الدالة تشتقهما من جلسة المستخدم.
   */
  async submitCase(input: {
    caseType: string;
    subject: string;
    description: string;
    priority: HRCasePriority;
  }): Promise<{ caseId: string; messageId: string }> {
    const { data, error } = await supabase.rpc('employee_hr_case_submit', {
      p_case_type: input.caseType,
      p_subject: input.subject.trim(),
      p_description: input.description.trim(),
      p_priority: input.priority,
    });
    if (error) throw SdkError.fromSupabaseError(error);

    const row = (data?.[0] ?? null) as {
      out_case_id?: string;
      out_message_id?: string;
    } | null;
    if (!row?.out_case_id || !row.out_message_id) {
      throw new Error('لم تُعِد القاعدة معرّفي الحالة والرسالة');
    }
    return { caseId: row.out_case_id, messageId: row.out_message_id };
  }

  async createCase(data: Partial<HRCaseRecord>): Promise<HRCaseRecord> {
    return this.create({
      ...data,
      status: data.status || 'open',
      priority: data.priority || 'normal',
      channel: data.channel || 'employee_portal',
    });
  }
}

class HRCaseCommentService extends BaseService<HRCaseCommentRecord> {
  constructor() { super('hr_case_comments'); }

  async findByCase(caseId: string): Promise<HRCaseCommentRecord[]> {
    return this.findAll({
      filters: { case_id: caseId },
      orderBy: 'created_at',
      ascending: true,
      limit: 100,
    });
  }

  async addComment(data: Partial<HRCaseCommentRecord>): Promise<HRCaseCommentRecord> {
    return this.create(data);
  }
}

class EmployeeLetterRequestService extends BaseService<EmployeeLetterRequestRecord> {
  constructor() { super('employee_letter_requests'); }

  async findByEmployee(employeeId: string): Promise<EmployeeLetterRequestRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
      limit: 50,
    });
  }

  async createLetterRequest(data: Partial<EmployeeLetterRequestRecord>): Promise<EmployeeLetterRequestRecord> {
    return this.create({
      ...data,
      status: data.status || 'submitted',
      delivery_method: data.delivery_method || 'portal',
    });
  }
}

export const hrCaseService = new HRCaseService();
export const hrCaseCommentService = new HRCaseCommentService();
export const employeeLetterRequestService = new EmployeeLetterRequestService();
