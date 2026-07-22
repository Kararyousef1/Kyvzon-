/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CrmPipelineService — بوابة CRM، الوحدة 2: خط الأنابيب والصفقات (التقرير 02)
 *
 *  يغلّف جداول ودوال migration 0166:
 *    • crm_pipelines            → خطوط الأنابيب المتعددة (new/renewals/expansion/partner)
 *    • crm_stages               → المراحل (احتمالية + شرط خروج + عتبة ركود)
 *    • crm_deals                → الصفقات (سجل كامل + سياق تنافسي + BANT)
 *    • crm_deal_loss_reasons    → أسباب الخسارة (تحليل Win/Loss)
 *    • crm_deal_stage_history   → سجل مراحل الصفقة (دورة المبيعات)
 *
 *  الدوال (RPC):
 *    crm_move_deal_stage · crm_close_deal · crm_deal_velocity ·
 *    crm_deal_stagnation_alerts · crm_seed_default_pipeline.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────────────────

export type PipelineType = 'new_business' | 'renewals' | 'expansion' | 'partner';
export type StageType = 'open' | 'won' | 'lost';
export type DealStatus = 'open' | 'won' | 'lost';
export type DealValueType = 'annual' | 'one_time' | 'lifetime';

export interface CrmPipeline {
  id: string; tenant_id: string; name: string; pipeline_type: PipelineType;
  description: string | null; is_default: boolean; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmPipelineInput {
  name: string; pipeline_type?: PipelineType; description?: string | null; is_default?: boolean;
}

export interface CrmStage {
  id: string; tenant_id: string; pipeline_id: string; name: string;
  stage_type: StageType; probability: number; exit_criteria: string | null;
  stagnation_days: number | null; sort_order: number; created_at: string;
}
export interface CrmStageInput {
  pipeline_id: string; name: string; stage_type?: StageType; probability?: number;
  exit_criteria?: string | null; stagnation_days?: number | null; sort_order?: number;
}

export interface CrmLossReason {
  id: string; tenant_id: string; code: string; label: string; is_active: boolean; created_at: string;
}

export interface CrmDeal {
  id: string; tenant_id: string; pipeline_id: string; stage_id: string; name: string;
  account_id: string | null; primary_contact_id: string | null;
  amount: number; currency: string; value_type: DealValueType; expected_close_date: string;
  status: DealStatus; probability: number; source: string | null; owner_id: string | null;
  competitors: string[]; our_strengths: string | null; risks: string | null;
  champions: string | null; detractors: string | null;
  bant_budget: boolean | null; bant_authority: boolean | null; bant_need: boolean | null; bant_timeline: boolean | null;
  won_at: string | null; lost_at: string | null;
  loss_reason_id: string | null; loss_competitor: string | null; loss_learning: string | null;
  finance_customer_id: string | null;
  last_stage_change_at: string; last_activity_at: string | null;
  notes: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmDealInput {
  pipeline_id: string; stage_id: string; name: string;
  account_id?: string | null; primary_contact_id?: string | null;
  amount?: number; currency?: string; value_type?: DealValueType; expected_close_date: string;
  source?: string | null; owner_id?: string | null; competitors?: string[];
  our_strengths?: string | null; risks?: string | null; champions?: string | null; detractors?: string | null;
  bant_budget?: boolean | null; bant_authority?: boolean | null; bant_need?: boolean | null; bant_timeline?: boolean | null;
  notes?: string | null;
}

export interface DealVelocity {
  openDeals: number; avgValue: number; winRate: number; avgCycleDays: number; velocityPerDay: number;
}
export interface StagnationAlert {
  dealId: string; dealName: string; stageName: string;
  daysInStage: number; thresholdDays: number | null; alertType: 'stagnant' | 'overdue_close' | 'closing_soon' | 'ok';
}

// ─── الخدمات ────────────────────────────────────────────────────────────────

class CrmPipelineDefService extends BaseService<CrmPipeline> {
  constructor() { super('crm_pipelines'); }
  listPipelines() { return this.findAll({ orderBy: 'created_at', ascending: true }); }
  createPipeline(input: CrmPipelineInput) { return this.create(input as Partial<CrmPipeline>); }

  /** إنشاء خط الأنابيب الافتراضي (6 مراحل + أسباب الخسارة) — idempotent */
  async seedDefault(): Promise<string> {
    const { data, error } = await supabase.rpc('crm_seed_default_pipeline');
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class CrmStageService extends BaseService<CrmStage> {
  constructor() { super('crm_stages'); }
  listForPipeline(pipelineId: string) {
    return this.findWhere([{ column: 'pipeline_id', value: pipelineId }], { orderBy: 'sort_order', ascending: true });
  }
  createStage(input: CrmStageInput) { return this.create(input as Partial<CrmStage>); }
}

class CrmLossReasonService extends BaseService<CrmLossReason> {
  constructor() { super('crm_deal_loss_reasons'); }
  listReasons() {
    return this.findWhere([{ column: 'is_active', value: true }], { orderBy: 'created_at', ascending: true });
  }
}

class CrmDealService extends BaseService<CrmDeal> {
  constructor() { super('crm_deals'); }

  listDeals(pipelineId?: string) {
    const conds = pipelineId ? [{ column: 'pipeline_id', value: pipelineId }] : [];
    return this.findWhere(conds, { orderBy: 'updated_at', ascending: false });
  }
  listForAccount(accountId: string) {
    return this.findWhere([{ column: 'account_id', value: accountId }], { orderBy: 'created_at', ascending: false });
  }
  createDeal(input: CrmDealInput) { return this.create(input as Partial<CrmDeal>); }
  updateDeal(id: string, input: Partial<CrmDealInput>) { return this.update(id, input as Partial<CrmDeal>); }

  /** نقل صفقة لمرحلة (تحدّث الاحتمالية وتسجّل التاريخ). لا يُستخدم لمراحل الإغلاق. */
  async moveStage(dealId: string, toStageId: string): Promise<void> {
    const { error } = await supabase.rpc('crm_move_deal_stage', { p_deal_id: dealId, p_to_stage_id: toStageId });
    if (error) throw new Error(error.message);
  }

  /** إغلاق صفقة (win/loss) — سبب الخسارة إلزامي عند الخسارة */
  async close(params: {
    dealId: string; outcome: 'won' | 'lost';
    lossReasonId?: string | null; lossCompetitor?: string | null; lossLearning?: string | null;
  }): Promise<void> {
    const { error } = await supabase.rpc('crm_close_deal', {
      p_deal_id: params.dealId, p_outcome: params.outcome,
      p_loss_reason_id: params.lossReasonId ?? null,
      p_loss_competitor: params.lossCompetitor ?? null,
      p_loss_learning: params.lossLearning ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /** مقياس سرعة الصفقة (Deal Velocity) */
  async velocity(pipelineId?: string): Promise<DealVelocity> {
    const { data, error } = await supabase.rpc('crm_deal_velocity', { p_pipeline_id: pipelineId ?? null });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      openDeals: Number(r.open_deals || 0),
      avgValue: Number(r.avg_value || 0),
      winRate: Number(r.win_rate || 0),
      avgCycleDays: Number(r.avg_cycle_days || 0),
      velocityPerDay: Number(r.velocity_per_day || 0),
    };
  }

  /** تنبيهات ركود الصفقات */
  async stagnationAlerts(): Promise<StagnationAlert[]> {
    const { data, error } = await supabase.rpc('crm_deal_stagnation_alerts');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      dealId: String(r.deal_id),
      dealName: String(r.deal_name ?? ''),
      stageName: String(r.stage_name ?? ''),
      daysInStage: Number(r.days_in_stage || 0),
      thresholdDays: r.threshold_days != null ? Number(r.threshold_days) : null,
      alertType: (r.alert_type as StagnationAlert['alertType']) ?? 'ok',
    }));
  }
}

// ─── ثوابت مرجعية من التقرير ─────────────────────────────────────────────────

export const PIPELINE_TYPE_LABEL: Record<PipelineType, string> = {
  new_business: 'مبيعات جديدة', renewals: 'تجديدات', expansion: 'توسيع الحسابات (Upsell)', partner: 'شراكات',
};
export const DEAL_VALUE_TYPE_LABEL: Record<DealValueType, string> = {
  annual: 'سنوي', one_time: 'لمرة واحدة', lifetime: 'دورة الحياة',
};
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  open: 'مفتوحة', won: 'فوز', lost: 'خسارة',
};
export const DEAL_STATUS_COLOR: Record<DealStatus, string> = {
  open: 'bg-sky-50 text-sky-600 border-sky-200',
  won: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  lost: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const ALERT_TYPE_LABEL: Record<StagnationAlert['alertType'], string> = {
  stagnant: 'ركود', overdue_close: 'تجاوز تاريخ الإغلاق', closing_soon: 'إغلاق وشيك', ok: 'سليم',
};
export const ALERT_TYPE_COLOR: Record<StagnationAlert['alertType'], string> = {
  stagnant: 'bg-amber-50 text-amber-600 border-amber-200',
  overdue_close: 'bg-rose-50 text-rose-600 border-rose-200',
  closing_soon: 'bg-sky-50 text-sky-600 border-sky-200',
  ok: 'bg-slate-100 text-slate-500 border-slate-200',
};
/** لون بطاقة Kanban حسب نوع المرحلة (خرائط ثابتة — لا تُحذف بواسطة Tailwind purge) */
export const STAGE_TYPE_ACCENT: Record<StageType, string> = {
  open: 'border-t-cyan-400', won: 'border-t-emerald-400', lost: 'border-t-rose-400',
};

// ─── Singletons ──────────────────────────────────────────────────────────────
export const crmPipelineService = new CrmPipelineDefService();
export const crmStageService = new CrmStageService();
export const crmLossReasonService = new CrmLossReasonService();
export const crmDealService = new CrmDealService();
