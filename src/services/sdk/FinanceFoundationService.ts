import { BaseService, requireTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export type EntityStatus = 'active' | 'inactive' | 'archived';
export type FinanceRole = 'viewer' | 'accountant' | 'approver' | 'finance_manager' | 'entity_admin';
export type FiscalYearStatus = 'draft' | 'open' | 'closed';
export type AccountingPeriodStatus = 'draft' | 'open' | 'soft_closed' | 'closed';

export interface CurrencyRecord {
  code: string;
  name: string;
  symbol?: string | null;
  decimal_places: number;
  is_active: boolean;
}

export interface LegalEntityRecord {
  id: string;
  tenant_id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  registration_number?: string | null;
  tax_number?: string | null;
  country_code: string;
  base_currency_code: string;
  status: EntityStatus;
  address: Record<string, unknown>;
  settings: Record<string, unknown>;
}

export interface EntityMembershipRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  user_id: string;
  finance_role: FinanceRole;
  is_active: boolean;
}

export interface FiscalYearRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: FiscalYearStatus;
}

export interface AccountingPeriodRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  fiscal_year_id: string;
  period_number: number;
  name: string;
  start_date: string;
  end_date: string;
  status: AccountingPeriodStatus;
  locked_at?: string | null;
  locked_by?: string | null;
}

export interface CostCenterRecord { id:string; tenant_id:string; legal_entity_id:string; code:string; name_ar:string; name_en?:string|null; parent_id?:string|null; is_active:boolean; }
export interface FinanceProjectRecord { id:string; tenant_id:string; legal_entity_id:string; code:string; name_ar:string; name_en?:string|null; status:'active'|'on_hold'|'closed'|'archived'; start_date?:string|null; end_date?:string|null; }
export interface ExchangeRateRecord { id:string; tenant_id:string; legal_entity_id:string; rate_date:string; from_currency_code:string; to_currency_code:string; rate:number; source:string; status:'draft'|'approved'|'superseded'; }
export interface FinancePeriodCloseTaskRecord { id:string; tenant_id:string; legal_entity_id:string; accounting_period_id:string; task_code:string; title_ar:string; title_en?:string|null; severity:'required'|'recommended'|'blocking'; status:'open'|'completed'|'waived'; evidence_ref?:string|null; notes?:string|null; waiver_reason?:string|null; }
export interface FinancePeriodCloseReadinessRecord { tenant_id:string; legal_entity_id:string; entity_code:string; entity_name:string; fiscal_year_id:string; fiscal_year_name:string; accounting_period_id:string; period_number:number; period_name:string; start_date:string; end_date:string; status:AccountingPeriodStatus; open_journal_entries:number; unbalanced_entries:number; checklist_tasks:number; required_open_tasks:number; completed_tasks:number; waived_tasks:number; ready_for_final_close:boolean; }
export interface FinanceCloseChecklistBoardRecord extends FinancePeriodCloseTaskRecord { entity_code:string; entity_name:string; period_name:string; start_date:string; end_date:string; period_status:AccountingPeriodStatus; completed_at?:string|null; completed_by_name?:string|null; waived_at?:string|null; waived_by_name?:string|null; }
export interface FinanceGrcDashboardRecord { tenant_id:string; legal_entity_id:string; entity_code:string; entity_name:string; open_periods:number; soft_closed_periods:number; closed_periods:number; periods_ready_for_close:number; open_required_close_tasks:number; audit_events_last_7_days:number; }

class LegalEntityService extends BaseService<LegalEntityRecord> {
  constructor() { super('legal_entities'); }

  async findActive() {
    return this.findAll({ filters: { status: 'active' }, orderBy: 'code' });
  }

  async updateStatus(id: string, status: EntityStatus, reason: string): Promise<LegalEntityRecord> {
    const { data, error } = await supabase.rpc('update_legal_entity_status', { p_legal_entity_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as LegalEntityRecord;
  }
}

class EntityMembershipService extends BaseService<EntityMembershipRecord> {
  constructor() { super('entity_memberships'); }

  async findForUser(userId: string) {
    return this.findAll({ filters: { user_id: userId, is_active: true }, orderBy: 'created_at' });
  }

  async assign(input: { legalEntityId: string; userId: string; financeRole: FinanceRole }): Promise<EntityMembershipRecord> {
    const { data, error } = await supabase.rpc('assign_finance_entity_membership', { p_legal_entity_id: input.legalEntityId, p_user_id: input.userId, p_finance_role: input.financeRole });
    if (error) throw new Error(error.message);
    return data as EntityMembershipRecord;
  }

  async deactivate(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('deactivate_finance_entity_membership', { p_membership_id: id, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

class FiscalYearService extends BaseService<FiscalYearRecord> {
  constructor() { super('fiscal_years'); }

  async findForEntity(legalEntityId: string) {
    return this.findAll({ filters: { legal_entity_id: legalEntityId }, orderBy: 'start_date', ascending: false });
  }
}

class AccountingPeriodService extends BaseService<AccountingPeriodRecord> {
  constructor() { super('accounting_periods'); }

  async findForFiscalYear(fiscalYearId: string) {
    return this.findAll({ filters: { fiscal_year_id: fiscalYearId }, orderBy: 'period_number' });
  }

  async setStatus(id: string, status: Exclude<AccountingPeriodStatus, 'draft'>, reason: string): Promise<AccountingPeriodRecord> {
    const { data, error } = await supabase.rpc('set_accounting_period_status', {
      p_period_id: id,
      p_status: status,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data as AccountingPeriodRecord;
  }
}

export const financeSetupService = {
  async createLegalEntity(input: {
    code: string;
    nameAr: string;
    nameEn?: string;
    baseCurrencyCode?: string;
    registrationNumber?: string;
    taxNumber?: string;
  }): Promise<LegalEntityRecord> {
    const { data, error } = await supabase.rpc('create_legal_entity', {
      p_code: input.code,
      p_name_ar: input.nameAr,
      p_name_en: input.nameEn || null,
      p_base_currency_code: input.baseCurrencyCode || 'IQD',
      p_registration_number: input.registrationNumber || null,
      p_tax_number: input.taxNumber || null,
    });
    if (error) throw new Error(error.message);
    return data as LegalEntityRecord;
  },

  async createFiscalYearWithMonthlyPeriods(input: {
    legalEntityId: string;
    name: string;
    startDate: string;
  }): Promise<FiscalYearRecord> {
    const { data, error } = await supabase.rpc('create_fiscal_year_with_monthly_periods', {
      p_legal_entity_id: input.legalEntityId,
      p_name: input.name,
      p_start_date: input.startDate,
    });
    if (error) throw new Error(error.message);
    return data as FiscalYearRecord;
  },
};

export const currencyService = {
  async findActive(): Promise<CurrencyRecord[]> {
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .eq('is_active', true)
      .order('code');
    if (error) throw new Error(error.message);
    return (data || []) as CurrencyRecord[];
  },
};

/** Ensures callers fail early instead of sending a finance command without a tenant context. */
export function requireFinanceTenantId(): string {
  return requireTenantId();
}

class CostCenterService extends BaseService<CostCenterRecord> {
  constructor() { super('cost_centers'); }
  async upsert(input: { legalEntityId:string; code:string; nameAr:string; nameEn?:string; parentId?:string|null }): Promise<CostCenterRecord> {
    const { data, error } = await supabase.rpc('upsert_finance_cost_center', { p_legal_entity_id: input.legalEntityId, p_code: input.code, p_name_ar: input.nameAr, p_name_en: input.nameEn || null, p_parent_id: input.parentId || null });
    if (error) throw new Error(error.message);
    return data as CostCenterRecord;
  }
  async setActive(id: string, isActive: boolean, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_finance_cost_center_status', { p_cost_center_id: id, p_is_active: isActive, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

class FinanceProjectService extends BaseService<FinanceProjectRecord> {
  constructor() { super('finance_projects'); }
  async upsert(input: { legalEntityId:string; code:string; nameAr:string; nameEn?:string; status?:string; startDate?:string; endDate?:string }): Promise<FinanceProjectRecord> {
    const { data, error } = await supabase.rpc('upsert_finance_project', { p_legal_entity_id: input.legalEntityId, p_code: input.code, p_name_ar: input.nameAr, p_name_en: input.nameEn || null, p_status: input.status || 'active', p_start_date: input.startDate || null, p_end_date: input.endDate || null });
    if (error) throw new Error(error.message);
    return data as FinanceProjectRecord;
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_finance_project_status', { p_project_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

class ExchangeRateService extends BaseService<ExchangeRateRecord> {
  constructor() { super('exchange_rates'); }
  async upsert(input: { legalEntityId:string; rateDate:string; fromCurrency:string; toCurrency:string; rate:number; source?:string; status?:string }): Promise<ExchangeRateRecord> {
    const { data, error } = await supabase.rpc('upsert_finance_exchange_rate', { p_legal_entity_id: input.legalEntityId, p_rate_date: input.rateDate, p_from_currency_code: input.fromCurrency, p_to_currency_code: input.toCurrency, p_rate: input.rate, p_source: input.source || 'manual', p_status: input.status || 'approved' });
    if (error) throw new Error(error.message);
    return data as ExchangeRateRecord;
  }
}

class FinancePeriodCloseService {
  async findReadiness(fiscalYearId?: string): Promise<FinancePeriodCloseReadinessRecord[]> {
    let query = supabase.from('finance_period_close_readiness').select('*').order('start_date', { ascending: false });
    if (fiscalYearId) query = query.eq('fiscal_year_id', fiscalYearId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as FinancePeriodCloseReadinessRecord[];
  }
  async findChecklist(periodId: string): Promise<FinanceCloseChecklistBoardRecord[]> {
    const { data, error } = await supabase.from('finance_close_checklist_board').select('*').eq('accounting_period_id', periodId).order('task_code');
    if (error) throw new Error(error.message);
    return (data || []) as FinanceCloseChecklistBoardRecord[];
  }
  async findGrcDashboard(legalEntityId?: string): Promise<FinanceGrcDashboardRecord[]> {
    let query = supabase.from('finance_grc_dashboard').select('*').order('entity_code');
    if (legalEntityId) query = query.eq('legal_entity_id', legalEntityId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as FinanceGrcDashboardRecord[];
  }
  async generateChecklist(periodId: string): Promise<FinancePeriodCloseTaskRecord[]> {
    const { data, error } = await supabase.rpc('generate_finance_period_close_checklist', { p_period_id: periodId });
    if (error) throw new Error(error.message);
    return (data || []) as FinancePeriodCloseTaskRecord[];
  }
  async completeTask(taskId: string, evidenceRef?: string, notes?: string): Promise<FinancePeriodCloseTaskRecord> {
    const { data, error } = await supabase.rpc('complete_finance_close_task', { p_task_id: taskId, p_evidence_ref: evidenceRef || null, p_notes: notes || null });
    if (error) throw new Error(error.message);
    return data as FinancePeriodCloseTaskRecord;
  }
  async waiveTask(taskId: string, reason: string): Promise<FinancePeriodCloseTaskRecord> {
    const { data, error } = await supabase.rpc('waive_finance_close_task', { p_task_id: taskId, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as FinancePeriodCloseTaskRecord;
  }
  async closePeriod(periodId: string, status: 'soft_closed' | 'closed', reason: string): Promise<AccountingPeriodRecord> {
    const { data, error } = await supabase.rpc('close_accounting_period_controlled', { p_period_id: periodId, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as AccountingPeriodRecord;
  }
  async reopenPeriod(periodId: string, reason: string): Promise<AccountingPeriodRecord> {
    const { data, error } = await supabase.rpc('reopen_accounting_period_controlled', { p_period_id: periodId, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as AccountingPeriodRecord;
  }
}

export const legalEntityService = new LegalEntityService();
export const entityMembershipService = new EntityMembershipService();
export const fiscalYearService = new FiscalYearService();
export const accountingPeriodService = new AccountingPeriodService();
export const financeCostCenterService = new CostCenterService();
export const financeProjectService = new FinanceProjectService();
export const exchangeRateService = new ExchangeRateService();
export const financePeriodCloseService = new FinancePeriodCloseService();
