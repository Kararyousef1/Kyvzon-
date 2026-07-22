/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CrmActivitiesService — بوابة CRM، الوحدة 3: الأنشطة والأتمتة (التقرير 03)
 *
 *  يغلّف جداول ودوال migration 0167:
 *    • crm_tasks               → المهام (أولوية/استحقاق/ربط/حالة)
 *    • crm_sequences/_steps/_enrollments → سلاسل المتابعة (Cadences)
 *    • crm_automation_rules/_log → قواعد If-Then + سجل التنفيذ
 *    • crm_assignment_rules    → الإسناد التلقائي
 *
 *  الدوال (RPC): crm_log_call · crm_complete_task · crm_enroll_in_sequence ·
 *    crm_advance_sequence · crm_apply_assignment · crm_activity_stats ·
 *    crm_activity_gaps · crm_seed_default_sequences.
 *
 *  Auto-Logging (Gmail/Outlook/VoIP) hook — يُوصَل عند إدخال المفاتيح.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────────────────

export type TaskType = 'todo' | 'call' | 'email' | 'meeting' | 'demo' | 'follow_up' | 'custom';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';
export type TaskOrigin = 'manual' | 'sequence' | 'automation';

export interface CrmTask {
  id: string; tenant_id: string; title: string; description: string | null;
  task_type: TaskType; priority: TaskPriority; status: TaskStatus;
  due_at: string | null; assignee_id: string | null;
  contact_id: string | null; account_id: string | null; deal_id: string | null;
  origin: TaskOrigin; sequence_enrollment_id: string | null;
  completed_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmTaskInput {
  title: string; description?: string | null; task_type?: TaskType; priority?: TaskPriority;
  status?: TaskStatus; due_at?: string | null; assignee_id?: string | null;
  contact_id?: string | null; account_id?: string | null; deal_id?: string | null;
}

export type SequenceType = 'cold_outreach' | 'post_demo' | 'proposal_sent' | 're_engagement' | 'renewal' | 'onboarding' | 'custom';
export type SequenceActionType = 'task' | 'email' | 'call' | 'sms' | 'wait' | 'stop';
export type SequenceEnrollmentStatus = 'active' | 'completed' | 'stopped';

export interface CrmSequence {
  id: string; tenant_id: string; name: string; sequence_type: SequenceType;
  description: string | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmSequenceInput { name: string; sequence_type?: SequenceType; description?: string | null; }
export interface CrmSequenceStep {
  id: string; tenant_id: string; sequence_id: string; step_order: number;
  delay_days: number; action_type: SequenceActionType; title: string; body: string | null; created_at: string;
}
export interface CrmSequenceStepInput {
  sequence_id: string; step_order: number; delay_days?: number; action_type?: SequenceActionType; title: string; body?: string | null;
}
export interface CrmSequenceEnrollment {
  id: string; tenant_id: string; sequence_id: string;
  contact_id: string | null; deal_id: string | null; assignee_id: string | null;
  status: SequenceEnrollmentStatus; current_step: number; enrolled_at: string; completed_at: string | null;
}

export type AutomationTrigger =
  | 'deal_created' | 'deal_stage_changed' | 'deal_won' | 'deal_overdue'
  | 'call_outcome' | 'lead_score_reached' | 'task_completed' | 'no_activity';
export type AutomationAction =
  | 'notify_manager' | 'create_task' | 'move_stage' | 'create_deal'
  | 'notify_team' | 'start_sequence' | 'assign_owner';

export interface CrmAutomationRule {
  id: string; tenant_id: string; name: string;
  trigger_event: AutomationTrigger; condition: Record<string, unknown>;
  action_type: AutomationAction; action_config: Record<string, unknown>;
  is_active: boolean; run_count: number; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmAutomationRuleInput {
  name: string; trigger_event: AutomationTrigger; condition?: Record<string, unknown>;
  action_type: AutomationAction; action_config?: Record<string, unknown>; is_active?: boolean;
}

export type AssignmentMatchType = 'region' | 'value_gte' | 'source' | 'industry';
export interface CrmAssignmentRule {
  id: string; tenant_id: string; name: string;
  match_type: AssignmentMatchType; match_value: string; assign_to: string | null;
  priority: number; is_active: boolean; created_at: string;
}
export interface CrmAssignmentRuleInput {
  name: string; match_type?: AssignmentMatchType; match_value: string; assign_to?: string | null; priority?: number;
}

export interface ActivityStats {
  calls: number; meetings: number; emails: number; tasksCompleted: number; tasksOverdue: number;
}
export interface ActivityGap { dealId: string; dealName: string; daysSilent: number; amount: number; }
export type CallOutcome = 'interested' | 'thinking' | 'no_answer' | 'callback' | 'rejected';

// ─── الخدمات ────────────────────────────────────────────────────────────────

class CrmTaskService extends BaseService<CrmTask> {
  constructor() { super('crm_tasks'); }
  listTasks() { return this.findAll({ orderBy: 'due_at', ascending: true }); }
  listMine(assigneeId: string) {
    return this.findWhere([{ column: 'assignee_id', value: assigneeId }], { orderBy: 'due_at', ascending: true });
  }
  listForDeal(dealId: string) {
    return this.findWhere([{ column: 'deal_id', value: dealId }], { orderBy: 'due_at', ascending: true });
  }
  createTask(input: CrmTaskInput) { return this.create(input as Partial<CrmTask>); }
  updateTask(id: string, input: Partial<CrmTaskInput>) { return this.update(id, input as Partial<CrmTask>); }

  async complete(taskId: string): Promise<void> {
    const { error } = await supabase.rpc('crm_complete_task', { p_task_id: taskId });
    if (error) throw new Error(error.message);
  }

  /** تسجيل مكالمة (يكتب في الجدول الزمني + مهمة خطوة تالية اختيارية) */
  async logCall(params: {
    contactId?: string | null; accountId?: string | null; dealId?: string | null;
    durationMin?: number | null; outcome: CallOutcome; summary?: string | null;
    nextStep?: string | null; nextStepDue?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_log_call', {
      p_contact_id: params.contactId ?? null, p_account_id: params.accountId ?? null,
      p_deal_id: params.dealId ?? null, p_duration_min: params.durationMin ?? null,
      p_outcome: params.outcome, p_summary: params.summary ?? null,
      p_next_step: params.nextStep ?? null, p_next_step_due: params.nextStepDue ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async activityStats(days = 30): Promise<ActivityStats> {
    const { data, error } = await supabase.rpc('crm_activity_stats', { p_days: days });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      calls: Number(r.calls || 0), meetings: Number(r.meetings || 0), emails: Number(r.emails || 0),
      tasksCompleted: Number(r.tasks_completed || 0), tasksOverdue: Number(r.tasks_overdue || 0),
    };
  }

  async activityGaps(days = 7): Promise<ActivityGap[]> {
    const { data, error } = await supabase.rpc('crm_activity_gaps', { p_days: days });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      dealId: String(r.deal_id), dealName: String(r.deal_name ?? ''),
      daysSilent: Number(r.days_silent || 0), amount: Number(r.amount || 0),
    }));
  }
}

class CrmSequenceService extends BaseService<CrmSequence> {
  constructor() { super('crm_sequences'); }
  listSequences() { return this.findAll({ orderBy: 'created_at', ascending: true }); }
  createSequence(input: CrmSequenceInput) { return this.create(input as Partial<CrmSequence>); }

  listSteps(sequenceId: string): Promise<CrmSequenceStep[]> {
    return new CrmSequenceStepService().listForSequence(sequenceId);
  }
  addStep(input: CrmSequenceStepInput) { return new CrmSequenceStepService().createStep(input); }
  listEnrollments(sequenceId: string): Promise<CrmSequenceEnrollment[]> {
    return new CrmEnrollmentService().listForSequence(sequenceId);
  }

  /** التحاق صفقة/جهة اتصال بسلسلة (يطلق أول خطوة) */
  async enroll(params: { sequenceId: string; contactId?: string | null; dealId?: string | null; assigneeId?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('crm_enroll_in_sequence', {
      p_sequence_id: params.sequenceId, p_contact_id: params.contactId ?? null,
      p_deal_id: params.dealId ?? null, p_assignee_id: params.assigneeId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** تهيئة السلاسل القياسية (Post-Demo + Cold Outreach) — idempotent */
  async seedDefault(): Promise<number> {
    const { data, error } = await supabase.rpc('crm_seed_default_sequences');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

class CrmSequenceStepService extends BaseService<CrmSequenceStep> {
  constructor() { super('crm_sequence_steps'); }
  listForSequence(sequenceId: string) {
    return this.findWhere([{ column: 'sequence_id', value: sequenceId }], { orderBy: 'step_order', ascending: true });
  }
  createStep(input: CrmSequenceStepInput) { return this.create(input as Partial<CrmSequenceStep>); }
}

class CrmEnrollmentService extends BaseService<CrmSequenceEnrollment> {
  constructor() { super('crm_sequence_enrollments'); }
  listForSequence(sequenceId: string) {
    return this.findWhere([{ column: 'sequence_id', value: sequenceId }], { orderBy: 'enrolled_at', ascending: false });
  }
}

class CrmAutomationService extends BaseService<CrmAutomationRule> {
  constructor() { super('crm_automation_rules'); }
  listRules() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createRule(input: CrmAutomationRuleInput) { return this.create(input as Partial<CrmAutomationRule>); }
  toggle(id: string, active: boolean) { return this.update(id, { is_active: active } as Partial<CrmAutomationRule>); }
}

class CrmAssignmentService extends BaseService<CrmAssignmentRule> {
  constructor() { super('crm_assignment_rules'); }
  listRules() { return this.findAll({ orderBy: 'priority', ascending: false }); }
  createRule(input: CrmAssignmentRuleInput) { return this.create(input as Partial<CrmAssignmentRule>); }

  /** تطبيق أول قاعدة إسناد مطابقة على صفقة */
  async applyToDeal(dealId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('crm_apply_assignment', { p_deal_id: dealId });
    if (error) throw new Error(error.message);
    return (data as string) ?? null;
  }
}

// ─── ثوابت مرجعية من التقرير ─────────────────────────────────────────────────

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  todo: 'مهمة', call: 'مكالمة', email: 'بريد', meeting: 'اجتماع', demo: 'عرض تجريبي', follow_up: 'متابعة', custom: 'مخصص',
};
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'عاجل', high: 'عالية', medium: 'متوسطة', low: 'منخفضة',
};
export const TASK_PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: 'bg-rose-50 text-rose-600 border-rose-200',
  high: 'bg-amber-50 text-amber-600 border-amber-200',
  medium: 'bg-sky-50 text-sky-600 border-sky-200',
  low: 'bg-slate-100 text-slate-500 border-slate-200',
};
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', completed: 'منتهية', cancelled: 'ملغاة',
};
export const SEQUENCE_TYPE_LABEL: Record<SequenceType, string> = {
  cold_outreach: 'تواصل بارد', post_demo: 'ما بعد العرض', proposal_sent: 'بعد إرسال العرض',
  re_engagement: 'إعادة اشتباك', renewal: 'تجديد', onboarding: 'تأهيل', custom: 'مخصص',
};
export const SEQUENCE_ACTION_LABEL: Record<SequenceActionType, string> = {
  task: 'مهمة', email: 'بريد', call: 'مكالمة', sms: 'رسالة', wait: 'انتظار', stop: 'إيقاف',
};
export const AUTOMATION_TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  deal_created: 'إنشاء صفقة', deal_stage_changed: 'تغيّر مرحلة صفقة', deal_won: 'فوز بصفقة',
  deal_overdue: 'تجاوز تاريخ الإغلاق', call_outcome: 'نتيجة مكالمة', lead_score_reached: 'بلوغ نقاط العميل',
  task_completed: 'إكمال مهمة', no_activity: 'انعدام نشاط',
};
export const AUTOMATION_ACTION_LABEL: Record<AutomationAction, string> = {
  notify_manager: 'إشعار المدير', create_task: 'إنشاء مهمة', move_stage: 'تحريك المرحلة',
  create_deal: 'إنشاء صفقة', notify_team: 'إشعار الفريق', start_sequence: 'بدء سلسلة', assign_owner: 'إسناد مالك',
};
export const ASSIGNMENT_MATCH_LABEL: Record<AssignmentMatchType, string> = {
  region: 'المنطقة', value_gte: 'القيمة ≥', source: 'المصدر', industry: 'القطاع',
};
export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  interested: 'مهتم', thinking: 'سيفكر', no_answer: 'لم يُرَد', callback: 'طلب إعادة الاتصال', rejected: 'رفض',
};

// ─── Singletons ──────────────────────────────────────────────────────────────
export const crmTaskService = new CrmTaskService();
export const crmSequenceService = new CrmSequenceService();
export const crmSequenceStepService = new CrmSequenceStepService();
export const crmEnrollmentService = new CrmEnrollmentService();
export const crmAutomationService = new CrmAutomationService();
export const crmAssignmentService = new CrmAssignmentService();
