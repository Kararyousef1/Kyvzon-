/**
 * ════════════════════════════════════════════════════════════════
 *  HrApprovalService — سلسلة موافقات HR التسلسلية
 *
 *  يغلّف دوال قاعدة البيانات (migration 0153):
 *    - createForRequest : ينشئ سلسلة موافقة لطلب (إجازة/إذن)
 *    - decide           : اعتماد/رفض المرحلة النشطة وتحريك السلسلة
 *    - findPendingForApprover : طلبات بانتظار قرار المستخدم الحالي
 *    - findStepsForRequest    : مراحل طلب معيّن (للعرض)
 *
 *  المنطق التسلسلي (مشرف → مدير → مدير مباشر) يُفرَض في قاعدة البيانات.
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';

export interface HrApprovalStep {
  id: string;
  request_id: string;
  step_order: number;
  approver_role: 'supervisor' | 'manager' | 'direct_manager';
  approver_id: string | null;
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'skipped';
  comments: string | null;
  decided_at: string | null;
}

export interface HrApprovalRequest {
  id: string;
  request_type: 'leave' | 'permission';
  related_id: string;
  employee_id: string;
  department_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  current_step: number;
  created_at: string;
}

const ROLE_LABEL: Record<HrApprovalStep['approver_role'], string> = {
  supervisor: 'المشرف',
  manager: 'المدير',
  direct_manager: 'المدير المباشر',
};

class HrApprovalService {
  /** ينشئ سلسلة الموافقة لطلب (يُستدعى فور إنشاء الإجازة/الإذن) */
  async createForRequest(
    requestType: 'leave' | 'permission',
    relatedId: string,
    employeeId: string,
  ): Promise<string | null> {
    const { data, error } = await supabase.rpc('create_hr_approval', {
      p_request_type: requestType,
      p_related_id: relatedId,
      p_employee_id: employeeId,
    });
    if (error) {
      console.error('createForRequest failed:', error.message);
      return null;
    }
    return data as string;
  }

  /** اعتماد/رفض المرحلة النشطة — يعيد الحالة النهائية للطلب */
  async decide(
    requestId: string,
    decision: 'approved' | 'rejected',
    comments?: string,
  ): Promise<'pending' | 'approved' | 'rejected'> {
    const { data, error } = await supabase.rpc('decide_hr_approval_step', {
      p_request_id: requestId,
      p_decision: decision,
      p_comments: comments ?? null,
    });
    if (error) throw new Error(error.message);
    return data as 'pending' | 'approved' | 'rejected';
  }

  /** الطلبات بانتظار قرار المستخدم الحالي (مرحلته active) */
  async findPendingForApprover(approverId: string): Promise<Array<HrApprovalRequest & { my_step: HrApprovalStep }>> {
    // المراحل النشطة المسندة للمستخدم
    const { data: steps, error } = await supabase
      .from('hr_approval_steps')
      .select('*')
      .eq('approver_id', approverId)
      .eq('status', 'active');
    if (error || !steps || steps.length === 0) return [];

    const reqIds = [...new Set(steps.map((s: any) => s.request_id))];
    const { data: reqs } = await supabase
      .from('hr_approval_requests')
      .select('*')
      .in('id', reqIds)
      .eq('status', 'pending');

    const byId = new Map((reqs || []).map((r: any) => [r.id, r]));
    return (steps as HrApprovalStep[])
      .filter((s) => byId.has(s.request_id))
      .map((s) => ({ ...(byId.get(s.request_id) as HrApprovalRequest), my_step: s }));
  }

  /** مراحل طلب معيّن (مرتّبة) — للعرض في تفاصيل الطلب */
  async findStepsForRequest(requestId: string): Promise<HrApprovalStep[]> {
    const { data, error } = await supabase
      .from('hr_approval_steps')
      .select('*')
      .eq('request_id', requestId)
      .order('step_order', { ascending: true });
    if (error) return [];
    return (data as HrApprovalStep[]) || [];
  }

  /** سلسلة الموافقة المرتبطة بطلب أصلي (leave/permission) عبر related_id */
  async findByRelatedId(relatedId: string): Promise<HrApprovalRequest | null> {
    const { data, error } = await supabase
      .from('hr_approval_requests')
      .select('*')
      .eq('related_id', relatedId)
      .maybeSingle();
    if (error) return null;
    return (data as HrApprovalRequest) || null;
  }

  /**
   * معرّف سلسلة الاعتماد لمصدر معيّن — للبتّ من شاشة المصدر.
   *
   * ★ يُرشّح بـ`request_type` أيضاً: `related_id` **بلا FK** لأنه متعدد
   *   الأشكال (leave·permission·expense·loan)، فالترشيح بالمعرّف وحده
   *   يعتمد على تفرّد UUID عبر جداول مختلفة — افتراض لا تفرضه القاعدة.
   *
   * ★ نأخذ الأحدث: قد تُعاد المحاولة فتُنشأ سلسلة ثانية لنفس المصدر.
   */
  async findRequestIdBySource(
    requestType: HrApprovalRequest['request_type'],
    relatedId: string,
  ): Promise<string | null> {
    const { data, error } = await supabase
      .from('hr_approval_requests')
      .select('id')
      .eq('related_id', relatedId)
      .eq('request_type', requestType)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    const rows = (data ?? []) as Array<{ id: string }>;
    return rows.length > 0 ? rows[0].id : null;
  }

  roleLabel(role: HrApprovalStep['approver_role']): string {
    return ROLE_LABEL[role] ?? role;
  }
}

export const hrApprovalService = new HrApprovalService();
