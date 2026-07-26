/** SpendAnalyticsService — Unit 07 — تحليل الإنفاق وذكاء المشتريات */

import { BaseService } from '../BaseService';

export interface SpendParetoRecord { tenant_id: string; supplier_id: string; total_spend: number; cumulative_spend: number; grand_total: number; cumulative_percent: number; }
export interface PriceTrendRecord { tenant_id: string; item_code: string; valid_from: string; price: number; prev_price?: number | null; change_percent: number; }
export interface SpendForecastRecord { id: string; tenant_id: string; period: string; category_code?: string | null; forecasted_amount: number; actual_amount?: number | null; accuracy_percent?: number | null; method: string; }
export interface SpendTransactionRecord { id: string; tenant_id: string; supplier_id?: string | null; amount: number; currency_code?: string | null; is_maverick: boolean; is_tail?: boolean; source: string; category_code?: string | null; transaction_date?: string; }
export interface ProcurementExecutiveKpiRecord { tenant_id: string; total_spend_ytd: number; maverick_spend: number; active_suppliers: number; contracts_expiring_90: number; avg_supplier_otif: number; auction_savings: number; }
export interface SpendCategoryReportRecord { tenant_id: string; category_code: string; category_name: string; total_spend: number; transaction_count: number; supplier_count: number; maverick_spend: number; }
export interface SpendIntelligenceAlertRecord { id: string; tenant_id: string; alert_type: string; severity: string; title: string; details?: unknown; category_code?: string | null; status: string; created_at: string; }

class SpendParetoService {
  async findPareto(limit = 15): Promise<SpendParetoRecord[]> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.from('spend_pareto_80_20').select('*').limit(limit); if (error) throw new Error(error.message); return (data as any[]) || []; }
}

class PriceTrendService {
  async findByItem(itemCode: string, limit = 100): Promise<PriceTrendRecord[]> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.from('price_trend').select('*').eq('item_code', itemCode).order('valid_from', { ascending: true }).limit(limit); if (error) throw new Error(error.message); return (data as any[]) || []; }
}

class ProcurementExecutiveKpiService {
  async get(): Promise<ProcurementExecutiveKpiRecord | null> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.from('procurement_executive_kpis').select('*').maybeSingle(); if (error) throw new Error(error.message); return data as any; }
}

class SpendCategoryReportService {
  async findAll(limit = 100): Promise<SpendCategoryReportRecord[]> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.from('spend_category_report').select('*').limit(limit); if (error) throw new Error(error.message); return (data as any[]) || []; }
}

class SpendAlertService extends BaseService<SpendIntelligenceAlertRecord> {
  constructor() { super('spend_intelligence_alerts'); }
  async findOpen(): Promise<SpendIntelligenceAlertRecord[]> { return this.findAll({ filters: { status: 'open' }, orderBy: 'created_at', ascending: false, limit: 50 }); }
  async generate(): Promise<number> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.rpc('generate_spend_intelligence_alerts'); if (error) throw new Error(error.message); return Number(data || 0); }
}

class SpendForecastService extends BaseService<SpendForecastRecord> {
  constructor() { super('spend_forecasts'); }
  async forecast(period: string, categoryCode?: string | null): Promise<number> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.rpc('forecast_spend', { p_period: period, p_category_code: categoryCode || null }); if (error) throw new Error(error.message); return data as number; }
}

class SpendTransactionService extends BaseService<SpendTransactionRecord> {
  constructor() { super('spend_transactions'); }
  async findMaverick(limit = 20): Promise<SpendTransactionRecord[]> { return this.findAll({ filters: { is_maverick: true }, limit }); }
  async collect(): Promise<number> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.rpc('collect_procurement_spend_transactions'); if (error) throw new Error(error.message); return Number(data || 0); }
  async cleanseAliases(): Promise<number> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.rpc('cleanse_supplier_aliases'); if (error) throw new Error(error.message); return Number(data || 0); }
  async autoClassify(): Promise<number> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.rpc('auto_classify_spend_transactions'); if (error) throw new Error(error.message); return Number(data || 0); }
  async refreshSupplierSummary(): Promise<number> { const { supabase } = await import('../../supabase/supabase'); const { data, error } = await supabase.rpc('refresh_supplier_spend_summary'); if (error) throw new Error(error.message); return Number(data || 0); }
}

class SpendCategoryStrategyService extends BaseService<any> { constructor() { super('spend_category_strategies'); } }
class PCardTransactionService extends BaseService<any> { constructor() { super('p_card_transactions'); } }
class ToleranceRuleService extends BaseService<any> { constructor() { super('procurement_tolerance_rules'); } async seed(): Promise<void> { const { supabase } = await import('../../supabase/supabase'); const { error } = await supabase.rpc('seed_procurement_tolerance_rules'); if (error) throw new Error(error.message); } }
class PoReleaseService extends BaseService<any> { constructor() { super('po_releases'); } }
class ProcurementApprovalRuleService extends BaseService<any> { constructor() { super('procurement_approval_rules'); } }

export const spendParetoService = new SpendParetoService();
export const priceTrendService = new PriceTrendService();
export const procurementExecutiveKpiService = new ProcurementExecutiveKpiService();
export const spendCategoryReportService = new SpendCategoryReportService();
export const spendAlertService = new SpendAlertService();
export const spendForecastService = new SpendForecastService();
export const spendTransactionService = new SpendTransactionService();
export const spendCategoryStrategyService = new SpendCategoryStrategyService();
export const pCardTransactionService = new PCardTransactionService();
export const toleranceRuleService = new ToleranceRuleService();
export const poReleaseService = new PoReleaseService();
export const procurementApprovalRuleService = new ProcurementApprovalRuleService();
