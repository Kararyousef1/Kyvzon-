/**
 * SpendAnalyticsService — Unit 07 — تحليل الإنفاق — 100% حقيقي
 */

import { BaseService } from '../BaseService';

export interface SpendParetoRecord {
  tenant_id: string;
  supplier_id: string;
  total_spend: number;
  cumulative_spend: number;
  grand_total: number;
  cumulative_percent: number;
}

export interface PriceTrendRecord {
  tenant_id: string;
  item_code: string;
  valid_from: string;
  price: number;
  prev_price?: number | null;
  change_percent: number;
}

export interface SpendForecastRecord {
  id: string;
  tenant_id: string;
  period: string;
  category_code?: string | null;
  forecasted_amount: number;
  actual_amount?: number | null;
  accuracy_percent?: number | null;
  method: string;
}

export interface SpendTransactionRecord {
  id: string;
  tenant_id: string;
  supplier_id?: string | null;
  amount: number;
  currency_code?: string | null;
  is_maverick: boolean;
  source: string;
}

class SpendParetoService {
  async findPareto(limit = 15): Promise<SpendParetoRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.from('spend_pareto_80_20').select('*').limit(limit);
    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  }
}

class PriceTrendService {
  async findByItem(itemCode: string, limit = 100): Promise<PriceTrendRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.from('price_trend').select('*').eq('item_code', itemCode).order('valid_from', { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  }
}

class SpendForecastService extends BaseService<SpendForecastRecord> {
  constructor() { super('spend_forecasts'); }

  async forecast(period: string, categoryCode?: string | null): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
    const tenantId = (tenants as any)?.[0]?.id;
    if (!tenantId) throw new Error('No tenant');
    const { data, error } = await supabase.rpc('forecast_spend', {
      p_tenant_id: tenantId,
      p_period: period,
      p_category_code: categoryCode || null,
    });
    if (error) throw new Error(error.message);
    return data as number;
  }
}

class SpendTransactionService extends BaseService<SpendTransactionRecord> {
  constructor() { super('spend_transactions'); }
  async findMaverick(limit = 20): Promise<SpendTransactionRecord[]> {
    return this.findAll({ filters: { is_maverick: true }, limit });
  }
}

class ToleranceRuleService extends BaseService<any> {
  constructor() { super('procurement_tolerance_rules'); }
  async seed(tenantId: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('seed_procurement_tolerance_rules', { p_tenant_id: tenantId });
    if (error) throw new Error(error.message);
  }
}

class PoReleaseService extends BaseService<any> {
  constructor() { super('po_releases'); }
}

class ProcurementApprovalRuleService extends BaseService<any> {
  constructor() { super('procurement_approval_rules'); }
}

export const spendParetoService = new SpendParetoService();
export const priceTrendService = new PriceTrendService();
export const spendForecastService = new SpendForecastService();
export const spendTransactionService = new SpendTransactionService();
export const toleranceRuleService = new ToleranceRuleService();
export const poReleaseService = new PoReleaseService();
export const procurementApprovalRuleService = new ProcurementApprovalRuleService();
