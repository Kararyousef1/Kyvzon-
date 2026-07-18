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

class LegalEntityService extends BaseService<LegalEntityRecord> {
  constructor() { super('legal_entities'); }

  async findActive() {
    return this.findAll({ filters: { status: 'active' }, orderBy: 'code' });
  }
}

class EntityMembershipService extends BaseService<EntityMembershipRecord> {
  constructor() { super('entity_memberships'); }

  async findForUser(userId: string) {
    return this.findAll({ filters: { user_id: userId, is_active: true }, orderBy: 'created_at' });
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

export const legalEntityService = new LegalEntityService();
export const entityMembershipService = new EntityMembershipService();
export const fiscalYearService = new FiscalYearService();
export const accountingPeriodService = new AccountingPeriodService();
