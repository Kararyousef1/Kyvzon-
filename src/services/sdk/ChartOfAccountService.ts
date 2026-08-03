import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';
import type { ChartOfAccountRecord } from '../../shared/types/sdk';

export interface FinanceChartAccountTreeRecord extends ChartOfAccountRecord {
  entity_code?: string;
  entity_name?: string;
  parent_code?: string | null;
  parent_name?: string | null;
  account_category?: string | null;
  is_control_account?: boolean;
  archived_at?: string | null;
  child_count: number;
  line_count: number;
  open_line_count: number;
  posted_debit: number;
  posted_credit: number;
  posted_net_balance: number;
  require_cost_center: boolean;
  require_project: boolean;
}

export interface FinancePostingAccountLookupRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  entity_code: string;
  code: string;
  display_name: string;
  name: string;
  name_ar?: string | null;
  account_type: ChartOfAccountRecord['account_type'];
  normal_balance?: 'debit' | 'credit' | null;
  require_cost_center: boolean;
  require_project: boolean;
}

export interface FinanceAccountUsageSummaryRecord {
  tenant_id: string;
  legal_entity_id: string;
  account_id: string;
  code: string;
  name: string;
  name_ar?: string | null;
  line_count: number;
  open_line_count: number;
  posted_debit: number;
  posted_credit: number;
  posted_net_balance: number;
  last_entry_date?: string | null;
}

export interface FinanceAccountDimensionPolicyRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  account_name_ar?: string | null;
  account_type?: string;
  require_cost_center: boolean;
  require_project: boolean;
  notes?: string | null;
  updated_at?: string;
}

export interface FinanceDimensionsDashboardRecord {
  tenant_id: string;
  legal_entity_id: string;
  entity_code: string;
  entity_name: string;
  active_accounts: number;
  posting_accounts: number;
  control_accounts: number;
  accounts_requiring_cost_center: number;
  accounts_requiring_project: number;
  active_cost_centers: number;
  active_projects: number;
}

export interface FinanceHierarchyIssueRecord {
  severity: 'error' | 'warning';
  account_id: string;
  code: string;
  issue_code: string;
  issue_message: string;
}

export interface UpsertFinanceChartAccountInput {
  legalEntityId: string;
  accountId?: string | null;
  code: string;
  name: string;
  nameAr?: string | null;
  accountType: ChartOfAccountRecord['account_type'];
  parentId?: string | null;
  normalBalance?: 'debit' | 'credit' | null;
  allowPosting?: boolean;
  isControlAccount?: boolean;
  reason?: string;
}

class ChartOfAccountService extends BaseService<ChartOfAccountRecord> {
  constructor() { super('chart_of_accounts'); }

  async findByType(type: string): Promise<ChartOfAccountRecord[]> {
    return this.findAll({ filters: { account_type: type as any, is_active: true }, orderBy: 'code' });
  }

  async findActive(): Promise<ChartOfAccountRecord[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'code' });
  }

  async findForEntity(legalEntityId: string): Promise<ChartOfAccountRecord[]> {
    return this.findAll({ filters: { legal_entity_id: legalEntityId }, orderBy: 'code' });
  }

  async findTree(legalEntityId: string): Promise<FinanceChartAccountTreeRecord[]> {
    const { data, error } = await supabase
      .from('finance_chart_of_accounts_tree')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .order('code');
    if (error) throw new Error(error.message);
    return (data || []) as FinanceChartAccountTreeRecord[];
  }

  async findPostingLookup(legalEntityId: string): Promise<FinancePostingAccountLookupRecord[]> {
    const { data, error } = await supabase
      .from('finance_posting_account_lookup')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .order('code');
    if (error) throw new Error(error.message);
    return (data || []) as FinancePostingAccountLookupRecord[];
  }

  async findUsageSummary(legalEntityId: string): Promise<FinanceAccountUsageSummaryRecord[]> {
    const { data, error } = await supabase
      .from('finance_account_usage_summary')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .order('code');
    if (error) throw new Error(error.message);
    return (data || []) as FinanceAccountUsageSummaryRecord[];
  }

  async findDimensionPolicies(legalEntityId: string): Promise<FinanceAccountDimensionPolicyRecord[]> {
    const { data, error } = await supabase
      .from('finance_account_dimension_policy_board')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .order('account_code');
    if (error) throw new Error(error.message);
    return (data || []) as FinanceAccountDimensionPolicyRecord[];
  }

  async findDimensionsDashboard(legalEntityId?: string): Promise<FinanceDimensionsDashboardRecord[]> {
    let query = supabase.from('finance_dimensions_dashboard').select('*').order('entity_code');
    if (legalEntityId) query = query.eq('legal_entity_id', legalEntityId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as FinanceDimensionsDashboardRecord[];
  }

  async upsertAccount(input: UpsertFinanceChartAccountInput): Promise<ChartOfAccountRecord> {
    const { data, error } = await supabase.rpc('upsert_finance_chart_account', {
      p_legal_entity_id: input.legalEntityId,
      p_account_id: input.accountId || null,
      p_code: input.code,
      p_name: input.name,
      p_name_ar: input.nameAr || null,
      p_account_type: input.accountType,
      p_parent_id: input.parentId || null,
      p_normal_balance: input.normalBalance || null,
      p_allow_posting: input.allowPosting ?? true,
      p_is_control_account: input.isControlAccount ?? false,
      p_reason: input.reason || null,
    });
    if (error) throw new Error(error.message);
    return data as ChartOfAccountRecord;
  }

  async archiveAccount(accountId: string, reason: string): Promise<ChartOfAccountRecord> {
    const { data, error } = await supabase.rpc('archive_finance_chart_account', {
      p_account_id: accountId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data as ChartOfAccountRecord;
  }

  async updatePosting(accountId: string, allowPosting: boolean, reason: string): Promise<ChartOfAccountRecord> {
    const { data, error } = await supabase.rpc('update_finance_account_posting', {
      p_account_id: accountId,
      p_allow_posting: allowPosting,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data as ChartOfAccountRecord;
  }

  async upsertDimensionPolicy(input: { accountId: string; requireCostCenter: boolean; requireProject: boolean; reason?: string }): Promise<FinanceAccountDimensionPolicyRecord> {
    const { data, error } = await supabase.rpc('upsert_finance_account_dimension_policy', {
      p_account_id: input.accountId,
      p_require_cost_center: input.requireCostCenter,
      p_require_project: input.requireProject,
      p_reason: input.reason || null,
    });
    if (error) throw new Error(error.message);
    return data as FinanceAccountDimensionPolicyRecord;
  }

  async validateHierarchy(legalEntityId: string): Promise<FinanceHierarchyIssueRecord[]> {
    const { data, error } = await supabase.rpc('validate_finance_account_hierarchy', {
      p_legal_entity_id: legalEntityId,
    });
    if (error) throw new Error(error.message);
    return (data || []) as FinanceHierarchyIssueRecord[];
  }
}

export const chartOfAccountService = new ChartOfAccountService();
