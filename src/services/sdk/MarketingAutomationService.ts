/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MarketingAutomationService — خدمة وحدة أتمتة التسويق (التقرير 1)
 *
 *  يغلّف جداول ودوال migration 0155:
 *    • marketing_leads                  → إدارة العملاء المحتملين
 *    • marketing_lead_score_rules       → قواعد تقييم العملاء (Lead Scoring)
 *    • marketing_lead_score_events      → سجل أحداث التقييم
 *    • marketing_workflows / steps      → المخططات الانسيابية (Workflows)
 *    • marketing_workflow_enrollments   → التحاق العملاء بالرحلات
 *    • marketing_action_log             → مركز تنفيذ الإجراءات + KPIs
 *
 *  الدوال (RPC) للمحرك المنطقي داخل DB:
 *    • seed_marketing_score_rules       → بذر القواعد القياسية عند التفعيل
 *    • apply_lead_score_event           → تطبيق حدث تقييم (يحدّث النقاط والتصنيف)
 *    • enroll_lead_in_workflow          → إدخال lead في رحلة
 *    • advance_workflow_enrollment      → تقديم الالتحاق للخطوة التالية
 *
 *  كل الكتابة tenant-scoped (BaseService يحقن tenant_id) والأمان عبر RLS.
 *  الإرسال الخارجي الفعلي (بريد/SMS) يُترك hook: الإجراء يُسجَّل 'simulated'
 *  ويُوصَل لاحقاً بوحدتي البريد(2)/الرسائل(4).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId, requireTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

// ════════════════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════════════════

export type JourneyStage =
  | 'awareness' | 'consideration' | 'purchase' | 'onboarding' | 'retention' | 'expansion';
export type PipelineStage =
  | 'not_contacted' | 'contacted' | 'negotiation' | 'won' | 'lost';
export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'sales_ready';

export interface MarketingLead {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  country: string | null;
  industry: string | null;
  company_size: string | null;
  source: string | null;
  journey_stage: JourneyStage;
  pipeline_stage: PipelineStage;
  score: number;
  temperature: LeadTemperature;
  tags: string[];
  is_subscribed: boolean;
  owner_id: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingLeadInput {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  country?: string | null;
  industry?: string | null;
  company_size?: string | null;
  source?: string | null;
  journey_stage?: JourneyStage;
  pipeline_stage?: PipelineStage;
  tags?: string[];
}

export type ScoreRuleType = 'demographic' | 'behavioral';
export interface LeadScoreRule {
  id: string;
  tenant_id: string;
  rule_type: ScoreRuleType;
  event_key: string;
  label: string;
  points: number;
  is_active: boolean;
  created_at: string;
}

export interface LeadScoreEvent {
  id: string;
  lead_id: string;
  event_key: string;
  points_applied: number;
  score_after: number;
  created_at: string;
}

export type CampaignType =
  | 'custom' | 'welcome' | 'nurturing' | 're_engagement' | 'post_purchase' | 'abandoned_cart';
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';
export type TriggerType = 'time_based' | 'behavioral' | 'data_based' | 'negative';

export interface MarketingWorkflow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  campaign_type: CampaignType;
  status: WorkflowStatus;
  trigger_type: TriggerType;
  trigger_event: string | null;
  trigger_config: Record<string, unknown>;
  entry_conditions: unknown[];
  frequency_cap_per_day: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingWorkflowInput {
  name: string;
  description?: string | null;
  campaign_type?: CampaignType;
  status?: WorkflowStatus;
  trigger_type?: TriggerType;
  trigger_event?: string | null;
  trigger_config?: Record<string, unknown>;
  entry_conditions?: unknown[];
  frequency_cap_per_day?: number | null;
}

export type StepType = 'action' | 'wait' | 'condition' | 'branch';
export type ActionType =
  | 'send_email' | 'send_sms' | 'send_whatsapp' | 'create_task' | 'update_field'
  | 'add_tag' | 'remove_tag' | 'change_pipeline_stage' | 'internal_notification' | 'retargeting_ad';

export interface WorkflowStep {
  id: string;
  tenant_id: string;
  workflow_id: string;
  step_order: number;
  step_type: StepType;
  action_type: ActionType | null;
  config: Record<string, unknown>;
  wait_hours: number | null;
  wait_for_event: string | null;
  next_step_yes: string | null;
  next_step_no: string | null;
  created_at: string;
}

export interface WorkflowStepInput {
  workflow_id: string;
  step_order: number;
  step_type: StepType;
  action_type?: ActionType | null;
  config?: Record<string, unknown>;
  wait_hours?: number | null;
  wait_for_event?: string | null;
  next_step_yes?: string | null;
  next_step_no?: string | null;
}

export type EnrollmentStatus = 'active' | 'completed' | 'exited' | 'failed';
export interface WorkflowEnrollment {
  id: string;
  tenant_id: string;
  workflow_id: string;
  lead_id: string;
  current_step_id: string | null;
  status: EnrollmentStatus;
  next_run_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
}

export type ActionLogStatus =
  | 'simulated' | 'queued' | 'sent' | 'delivered' | 'opened'
  | 'clicked' | 'bounced' | 'unsubscribed' | 'failed';
export interface ActionLogEntry {
  id: string;
  workflow_id: string | null;
  step_id: string | null;
  lead_id: string | null;
  action_type: string;
  channel: string | null;
  status: ActionLogStatus;
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

/** ملخّص KPIs للوحة التحليلات */
export interface MarketingKpiSummary {
  totalLeads: number;
  byTemperature: Record<LeadTemperature, number>;
  byPipeline: Record<PipelineStage, number>;
  activeWorkflows: number;
  totalEnrollments: number;
  completedEnrollments: number;
  actionsSent: number;
  openRate: number;      // %
  clickThroughRate: number; // %
  unsubscribeRate: number;  // %
  workflowCompletionRate: number; // %
}

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات (كل واحدة ترث BaseService لحقن tenant_id + RLS)
// ════════════════════════════════════════════════════════════════════════════

class MarketingLeadService extends BaseService<MarketingLead> {
  constructor() { super('marketing_leads'); }

  async listByTemperature(temp: LeadTemperature): Promise<MarketingLead[]> {
    return this.findAll({ filters: { temperature: temp }, orderBy: 'score', ascending: false });
  }

  async createLead(input: MarketingLeadInput): Promise<MarketingLead> {
    return this.create(input as Partial<MarketingLead>);
  }

  /** تطبيق حدث تقييم عبر دالة DB (يعيد النقاط الجديدة) */
  async applyScoreEvent(leadId: string, eventKey: string): Promise<number> {
    const { data, error } = await supabase.rpc('apply_lead_score_event', {
      p_lead_id: leadId,
      p_event_key: eventKey,
    });
    if (error) throw new Error(error.message);
    return data as number;
  }

  /** سجل أحداث التقييم لعميل معيّن */
  async scoreHistory(leadId: string): Promise<LeadScoreEvent[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase
      .from('marketing_lead_score_events')
      .select('id, lead_id, event_key, points_applied, score_after, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as LeadScoreEvent[];
  }
}

class LeadScoreRuleService extends BaseService<LeadScoreRule> {
  constructor() { super('marketing_lead_score_rules'); }

  async listRules(): Promise<LeadScoreRule[]> {
    return this.findAll({ orderBy: 'rule_type', ascending: true });
  }

  /** بذر القواعد القياسية من التقرير للـ tenant الحالي (idempotent) */
  async seedDefaults(): Promise<void> {
    const tenantId = requireTenantId();
    const { error } = await supabase.rpc('seed_marketing_score_rules', { p_tenant_id: tenantId });
    if (error) throw new Error(error.message);
  }
}

class MarketingWorkflowService extends BaseService<MarketingWorkflow> {
  constructor() { super('marketing_workflows'); }

  async listWorkflows(): Promise<MarketingWorkflow[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false });
  }

  async createWorkflow(input: MarketingWorkflowInput): Promise<MarketingWorkflow> {
    return this.create(input as Partial<MarketingWorkflow>);
  }

  async setStatus(id: string, status: WorkflowStatus): Promise<MarketingWorkflow> {
    return this.update(id, { status } as Partial<MarketingWorkflow>);
  }
}

class WorkflowStepService extends BaseService<WorkflowStep> {
  constructor() { super('marketing_workflow_steps'); }

  async listForWorkflow(workflowId: string): Promise<WorkflowStep[]> {
    return this.findAll({ filters: { workflow_id: workflowId }, orderBy: 'step_order', ascending: true });
  }

  async createStep(input: WorkflowStepInput): Promise<WorkflowStep> {
    return this.create(input as Partial<WorkflowStep>);
  }
}

class WorkflowEnrollmentService extends BaseService<WorkflowEnrollment> {
  constructor() { super('marketing_workflow_enrollments'); }

  /** إدخال lead في رحلة عبر دالة DB */
  async enroll(workflowId: string, leadId: string): Promise<string> {
    const { data, error } = await supabase.rpc('enroll_lead_in_workflow', {
      p_workflow_id: workflowId,
      p_lead_id: leadId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** تقديم الالتحاق للخطوة التالية (branch: 'yes'|'no' لخطوات القرار) */
  async advance(enrollmentId: string, branch?: 'yes' | 'no'): Promise<string> {
    const { data, error } = await supabase.rpc('advance_workflow_enrollment', {
      p_enrollment_id: enrollmentId,
      p_branch: branch ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async listForWorkflow(workflowId: string): Promise<WorkflowEnrollment[]> {
    return this.findAll({ filters: { workflow_id: workflowId }, orderBy: 'enrolled_at', ascending: false });
  }
}

class ActionLogService extends BaseService<ActionLogEntry> {
  constructor() { super('marketing_action_log'); }

  async listRecent(limit = 50): Promise<ActionLogEntry[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false, limit });
  }

  async listForWorkflow(workflowId: string): Promise<ActionLogEntry[]> {
    return this.findAll({ filters: { workflow_id: workflowId }, orderBy: 'created_at', ascending: false });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  خدمة التحليلات (KPIs) — تجمّع من الجداول
// ════════════════════════════════════════════════════════════════════════════

class MarketingAnalyticsService {
  private pct(part: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  async summary(): Promise<MarketingKpiSummary> {
    const tenantId = getCurrentTenantId();
    const scoped = <T>(q: T): T => q; // RLS يعزل تلقائياً؛ نضيف فلتر tenant للأمان المزدوج

    const leadQ = supabase.from('marketing_leads').select('temperature, pipeline_stage');
    const wfQ = supabase.from('marketing_workflows').select('status');
    const enrollQ = supabase.from('marketing_workflow_enrollments').select('status');
    const logQ = supabase.from('marketing_action_log').select('status, channel');

    const [leads, wfs, enrolls, logs] = await Promise.all([
      (tenantId ? leadQ.eq('tenant_id', tenantId) : leadQ),
      (tenantId ? wfQ.eq('tenant_id', tenantId) : wfQ),
      (tenantId ? enrollQ.eq('tenant_id', tenantId) : enrollQ),
      (tenantId ? logQ.eq('tenant_id', tenantId) : logQ),
    ]);
    void scoped;

    const leadRows = (leads.data || []) as Array<{ temperature: LeadTemperature; pipeline_stage: PipelineStage }>;
    const wfRows = (wfs.data || []) as Array<{ status: WorkflowStatus }>;
    const enrollRows = (enrolls.data || []) as Array<{ status: EnrollmentStatus }>;
    const logRows = (logs.data || []) as Array<{ status: ActionLogStatus; channel: string | null }>;

    const byTemperature: Record<LeadTemperature, number> = { cold: 0, warm: 0, hot: 0, sales_ready: 0 };
    const byPipeline: Record<PipelineStage, number> = { not_contacted: 0, contacted: 0, negotiation: 0, won: 0, lost: 0 };
    for (const r of leadRows) {
      byTemperature[r.temperature] = (byTemperature[r.temperature] || 0) + 1;
      byPipeline[r.pipeline_stage] = (byPipeline[r.pipeline_stage] || 0) + 1;
    }

    const activeWorkflows = wfRows.filter((w) => w.status === 'active').length;
    const totalEnrollments = enrollRows.length;
    const completedEnrollments = enrollRows.filter((e) => e.status === 'completed').length;

    // قنوات الإرسال (بريد/SMS/واتساب) لحساب معدلات الأداء
    const msgLogs = logRows.filter((l) => l.channel === 'email' || l.channel === 'sms' || l.channel === 'whatsapp');
    const sent = msgLogs.filter((l) => ['sent', 'delivered', 'opened', 'clicked', 'simulated'].includes(l.status)).length;
    const opened = msgLogs.filter((l) => ['opened', 'clicked'].includes(l.status)).length;
    const clicked = msgLogs.filter((l) => l.status === 'clicked').length;
    const unsub = msgLogs.filter((l) => l.status === 'unsubscribed').length;

    return {
      totalLeads: leadRows.length,
      byTemperature,
      byPipeline,
      activeWorkflows,
      totalEnrollments,
      completedEnrollments,
      actionsSent: sent,
      openRate: this.pct(opened, sent),
      clickThroughRate: this.pct(clicked, sent),
      unsubscribeRate: this.pct(unsub, sent),
      workflowCompletionRate: this.pct(completedEnrollments, totalEnrollments),
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const marketingLeadService = new MarketingLeadService();
export const leadScoreRuleService = new LeadScoreRuleService();
export const marketingWorkflowService = new MarketingWorkflowService();
export const workflowStepService = new WorkflowStepService();
export const workflowEnrollmentService = new WorkflowEnrollmentService();
export const marketingActionLogService = new ActionLogService();
export const marketingAnalyticsService = new MarketingAnalyticsService();

/** قوالب الحملات الخمس من التقرير (لاستخدامها في منشئ الرحلات) */
export interface CampaignTemplate {
  type: CampaignType;
  label: string;
  description: string;
  triggerType: TriggerType;
  triggerEvent: string;
  steps: Array<Omit<WorkflowStepInput, 'workflow_id'>>;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    type: 'welcome',
    label: 'حملة الترحيب',
    description: 'تسلسل ترحيبي فوري للعملاء الجدد (اليوم 0/2/5/10)',
    triggerType: 'behavioral',
    triggerEvent: 'form_submitted',
    steps: [
      { step_order: 0, step_type: 'action', action_type: 'send_email', config: { template: 'welcome', subject: 'أهلاً بك!' }, wait_hours: 0 },
      { step_order: 1, step_type: 'wait', wait_hours: 48 },
      { step_order: 2, step_type: 'action', action_type: 'send_email', config: { template: 'product_tour', subject: 'جولة في المنتج' } },
      { step_order: 3, step_type: 'wait', wait_hours: 72 },
      { step_order: 4, step_type: 'action', action_type: 'send_email', config: { template: 'case_study', subject: 'قصة نجاح' } },
      { step_order: 5, step_type: 'wait', wait_hours: 120 },
      { step_order: 6, step_type: 'action', action_type: 'send_email', config: { template: 'free_consult', subject: 'استشارة مجانية' } },
    ],
  },
  {
    type: 'nurturing',
    label: 'تغذية العملاء المحتملين',
    description: 'محتوى تثقيفي متدرّج يبني الثقة قبل الشراء',
    triggerType: 'data_based',
    triggerEvent: 'score_threshold',
    steps: [
      { step_order: 0, step_type: 'action', action_type: 'send_email', config: { template: 'edu_1' }, wait_hours: 0 },
      { step_order: 1, step_type: 'wait', wait_hours: 96 },
      { step_order: 2, step_type: 'action', action_type: 'send_email', config: { template: 'edu_2' } },
      { step_order: 3, step_type: 'wait', wait_hours: 96 },
      { step_order: 4, step_type: 'condition', wait_for_event: 'link_clicked', config: { desc: 'إن ضغط رابطاً → مبيعات' } },
    ],
  },
  {
    type: 're_engagement',
    label: 'استعادة العملاء الخاملين',
    description: 'للعملاء غير المتفاعلين منذ 30-90 يوماً مع عرض جذّاب',
    triggerType: 'negative',
    triggerEvent: 'no_activity_30d',
    steps: [
      { step_order: 0, step_type: 'action', action_type: 'send_email', config: { template: 'we_miss_you' }, wait_hours: 0 },
      { step_order: 1, step_type: 'wait', wait_hours: 168 },
      { step_order: 2, step_type: 'action', action_type: 'send_email', config: { template: 'special_offer' } },
    ],
  },
  {
    type: 'post_purchase',
    label: 'ما بعد الشراء',
    description: 'تأكيد + متابعة + upsell + طلب مراجعة',
    triggerType: 'data_based',
    triggerEvent: 'purchase_completed',
    steps: [
      { step_order: 0, step_type: 'action', action_type: 'send_email', config: { template: 'order_confirmation' }, wait_hours: 0 },
      { step_order: 1, step_type: 'wait', wait_hours: 168 },
      { step_order: 2, step_type: 'action', action_type: 'send_email', config: { template: 'how_was_experience' } },
      { step_order: 3, step_type: 'wait', wait_hours: 552 },
      { step_order: 4, step_type: 'action', action_type: 'send_email', config: { template: 'upsell' } },
      { step_order: 5, step_type: 'wait', wait_hours: 720 },
      { step_order: 6, step_type: 'action', action_type: 'send_email', config: { template: 'ask_review' } },
    ],
  },
  {
    type: 'abandoned_cart',
    label: 'استرداد العربة المتروكة',
    description: 'تذكير + مساعدة + خصم محدود الوقت',
    triggerType: 'negative',
    triggerEvent: 'cart_abandoned',
    steps: [
      { step_order: 0, step_type: 'wait', wait_hours: 1 },
      { step_order: 1, step_type: 'action', action_type: 'send_email', config: { template: 'forgot_something', subject: 'هل نسيت شيئاً؟' } },
      { step_order: 2, step_type: 'wait', wait_hours: 23 },
      { step_order: 3, step_type: 'action', action_type: 'send_email', config: { template: 'need_help' } },
      { step_order: 4, step_type: 'wait', wait_hours: 24 },
      { step_order: 5, step_type: 'action', action_type: 'send_email', config: { template: 'discount_10', subject: 'خصم 10% محدود' } },
    ],
  },
];
