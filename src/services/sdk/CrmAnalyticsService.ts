/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CrmAnalyticsService — بوابة CRM، الوحدة 6: التحليلات والتنبؤ (التقرير 06)
 *
 *  يغلّف جداول ودوال migration 0170:
 *    • crm_sales_targets  → أهداف الموظفين/الفريق
 *    • crm_deal_forecast  → تصنيف تنبؤ الصفقة
 *    • crm_mrr_snapshots  → لقطات MRR الشهرية
 *    • crm_health_weights → أوزان مؤشر صحة الحساب
 *
 *  الدوال (RPC): crm_weighted_forecast · crm_conversion_funnel ·
 *    crm_pipeline_velocity_report · crm_winloss_by_competitor · crm_segmentation ·
 *    crm_account_health_score · crm_mrr_movement · crm_rep_performance ·
 *    crm_exec_kpis · crm_seed_health_weights.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

// ─── الأنواع ────────────────────────────────────────────────────────────────

export type ForecastCategory = 'commit' | 'best_case' | 'pipeline' | 'omitted';

export interface CrmSalesTarget {
  id: string; tenant_id: string; owner_id: string | null; period_month: string;
  target_amount: number; created_at: string; updated_at: string;
}
export interface CrmSalesTargetInput { owner_id?: string | null; period_month: string; target_amount: number; }

export interface CrmMrrSnapshot {
  id: string; tenant_id: string; period_month: string;
  starting_mrr: number; new_business: number; expansion: number; churn: number; contraction: number; created_at: string;
}
export interface CrmMrrSnapshotInput {
  period_month: string; starting_mrr?: number; new_business?: number; expansion?: number; churn?: number; contraction?: number;
}

export interface WeightedForecastRow {
  stageName: string; dealsCount: number; totalValue: number; probability: number; weightedValue: number;
}
export interface FunnelRow { stageName: string; sortOrder: number; reachedCount: number; }
export interface VelocityRow { stageName: string; avgDaysInStage: number; dealsMeasured: number; }
export interface CompetitorRow { competitor: string; faced: number; won: number; lost: number; winRate: number; }
export interface SegmentRow { segment: string; accounts: number; avgLtv: number; totalLtv: number; }
export interface MrrMovementRow {
  periodMonth: string; startingMrr: number; newBusiness: number; expansion: number;
  churn: number; contraction: number; endingMrr: number;
}
export interface RepPerformanceRow {
  ownerId: string; targetAmount: number; achieved: number; pipelineValue: number; attainmentPct: number;
}
export interface ExecKpis {
  totalCustomers: number; totalLtv: number; openPipeline: number; weightedForecast: number;
  wonThisMonth: number; atRiskAccounts: number; avgSalesCycleDays: number;
}

// ─── الخدمات ────────────────────────────────────────────────────────────────

class CrmTargetService extends BaseService<CrmSalesTarget> {
  constructor() { super('crm_sales_targets'); }
  listTargets() { return this.findAll({ orderBy: 'period_month', ascending: false }); }
  createTarget(input: CrmSalesTargetInput) { return this.create(input as Partial<CrmSalesTarget>); }
}

class CrmMrrService extends BaseService<CrmMrrSnapshot> {
  constructor() { super('crm_mrr_snapshots'); }
  createSnapshot(input: CrmMrrSnapshotInput) { return this.create(input as Partial<CrmMrrSnapshot>); }
}

class CrmAnalyticsEngine {
  async weightedForecast(pipelineId?: string): Promise<WeightedForecastRow[]> {
    const { data, error } = await supabase.rpc('crm_weighted_forecast', { p_pipeline_id: pipelineId ?? null });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      stageName: String(r.stage_name ?? ''), dealsCount: Number(r.deals_count || 0),
      totalValue: Number(r.total_value || 0), probability: Number(r.probability || 0),
      weightedValue: Number(r.weighted_value || 0),
    }));
  }
  async conversionFunnel(pipelineId?: string): Promise<FunnelRow[]> {
    const { data, error } = await supabase.rpc('crm_conversion_funnel', { p_pipeline_id: pipelineId ?? null });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      stageName: String(r.stage_name ?? ''), sortOrder: Number(r.sort_order || 0), reachedCount: Number(r.reached_count || 0),
    }));
  }
  async pipelineVelocity(pipelineId?: string): Promise<VelocityRow[]> {
    const { data, error } = await supabase.rpc('crm_pipeline_velocity_report', { p_pipeline_id: pipelineId ?? null });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      stageName: String(r.stage_name ?? ''), avgDaysInStage: Number(r.avg_days_in_stage || 0), dealsMeasured: Number(r.deals_measured || 0),
    }));
  }
  async winLossByCompetitor(): Promise<CompetitorRow[]> {
    const { data, error } = await supabase.rpc('crm_winloss_by_competitor');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      competitor: String(r.competitor ?? ''), faced: Number(r.faced || 0),
      won: Number(r.won || 0), lost: Number(r.lost || 0), winRate: Number(r.win_rate || 0),
    }));
  }
  async segmentation(): Promise<SegmentRow[]> {
    const { data, error } = await supabase.rpc('crm_segmentation');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      segment: String(r.segment ?? ''), accounts: Number(r.accounts || 0),
      avgLtv: Number(r.avg_ltv || 0), totalLtv: Number(r.total_ltv || 0),
    }));
  }
  async accountHealth(accountId: string): Promise<number> {
    const { data, error } = await supabase.rpc('crm_account_health_score', { p_account_id: accountId });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async mrrMovement(): Promise<MrrMovementRow[]> {
    const { data, error } = await supabase.rpc('crm_mrr_movement');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      periodMonth: String(r.period_month ?? ''), startingMrr: Number(r.starting_mrr || 0),
      newBusiness: Number(r.new_business || 0), expansion: Number(r.expansion || 0),
      churn: Number(r.churn || 0), contraction: Number(r.contraction || 0), endingMrr: Number(r.ending_mrr || 0),
    }));
  }
  async repPerformance(month?: string): Promise<RepPerformanceRow[]> {
    const { data, error } = await supabase.rpc('crm_rep_performance', { p_month: month ?? null });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      ownerId: String(r.owner_id ?? ''), targetAmount: Number(r.target_amount || 0),
      achieved: Number(r.achieved || 0), pipelineValue: Number(r.pipeline_value || 0), attainmentPct: Number(r.attainment_pct || 0),
    }));
  }
  async execKpis(): Promise<ExecKpis> {
    const { data, error } = await supabase.rpc('crm_exec_kpis');
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      totalCustomers: Number(r.total_customers || 0), totalLtv: Number(r.total_ltv || 0),
      openPipeline: Number(r.open_pipeline || 0), weightedForecast: Number(r.weighted_forecast || 0),
      wonThisMonth: Number(r.won_this_month || 0), atRiskAccounts: Number(r.at_risk_accounts || 0),
      avgSalesCycleDays: Number(r.avg_sales_cycle_days || 0),
    };
  }
  async seedHealthWeights(): Promise<void> {
    const { error } = await supabase.rpc('crm_seed_health_weights');
    if (error) throw new Error(error.message);
  }
}

// ─── ثوابت مرجعية من التقرير ─────────────────────────────────────────────────

export const FORECAST_CATEGORY_LABEL: Record<ForecastCategory, string> = {
  commit: 'ملتزم (Commit)', best_case: 'أفضل حالة', pipeline: 'في الأنابيب', omitted: 'مستبعد',
};
/** أوزان مؤشر صحة الحساب من التقرير */
export const HEALTH_WEIGHTS_REFERENCE = {
  login: 25, usage: 20, csat: 20, tickets: 15, payment: 10, nps: 10,
} as const;
/** عتبات تصنيف صحة الحساب */
export function healthTier(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'صحي', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  if (score >= 60) return { label: 'يحتاج انتباهاً', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  if (score >= 40) return { label: 'في خطر', color: 'text-orange-600 bg-orange-50 border-orange-200' };
  return { label: 'خطر مغادرة', color: 'text-rose-600 bg-rose-50 border-rose-200' };
}
/** مؤشرات الأداء المرجعية من التقرير (الأهداف) */
export const CRM_KPI_TARGETS = {
  leadToCustomer: '10-25%', salesCycle: '< 45 يوم', nrr: '110%+',
  grossRetention: '85%+', churn: '< 2%', clvCacRatio: '> 3×', pipelineCoverage: '3× الهدف', forecastAccuracy: '±10%',
} as const;

// ─── Singletons ──────────────────────────────────────────────────────────────
export const crmTargetService = new CrmTargetService();
export const crmMrrService = new CrmMrrService();
export const crmAnalytics = new CrmAnalyticsEngine();
