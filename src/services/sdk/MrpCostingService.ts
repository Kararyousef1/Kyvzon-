import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

type Row = Record<string, unknown>;

export class MrpCostElementService extends BaseService<Row> {
  constructor() { super('mrp_cost_elements'); }
  async upsert(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_mrp_cost_element', {
      p_element_code: input.element_code || null,
      p_name_ar: input.name_ar,
      p_cost_category: input.cost_category,
      p_finance_account_code: input.finance_account_code || null,
      p_is_capitalized: input.is_capitalized !== false,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_cost_element_status', { p_cost_element_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpCostingProfileService extends BaseService<Row> {
  constructor() { super('mrp_costing_profiles'); }
  async upsert(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_mrp_costing_profile', {
      p_profile_code: input.profile_code || null,
      p_name_ar: input.name_ar,
      p_plant_id: input.plant_id || null,
      p_costing_method: input.costing_method || 'standard',
      p_currency_code: input.currency_code || 'IQD',
      p_overhead_method: input.overhead_method || 'work_center_rate',
      p_overhead_rate: Number(input.overhead_rate || 0),
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_costing_profile_status', { p_profile_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpStandardCostService extends BaseService<Row> {
  constructor() { super('mrp_standard_cost_versions'); }
  async createVersion(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('create_mrp_standard_cost_version', {
      p_version_code: input.version_code || null,
      p_name_ar: input.name_ar,
      p_profile_id: input.profile_id || null,
      p_effective_from: input.effective_from || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async upsertItemCost(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_mrp_item_standard_cost', {
      p_standard_cost_version_id: input.standard_cost_version_id,
      p_item_id: input.item_id,
      p_material: Number(input.material_cost || 0),
      p_labor: Number(input.labor_cost || 0),
      p_machine: Number(input.machine_cost || 0),
      p_overhead: Number(input.overhead_cost || 0),
      p_subcontract: Number(input.subcontract_cost || 0),
      p_quality: Number(input.quality_cost || 0),
      p_maintenance: Number(input.maintenance_cost || 0),
      p_scrap: Number(input.scrap_cost || 0),
      p_rework: Number(input.rework_cost || 0),
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async approve(versionId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_mrp_standard_cost_version', { p_standard_cost_version_id: versionId });
    if (error) throw new Error(error.message);
  }
  async updateStatus(versionId: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_standard_cost_version_status', { p_version_id: versionId, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpCostRollupService extends BaseService<Row> {
  constructor() { super('mrp_cost_rollup_runs'); }
  async run(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('run_mrp_standard_cost_rollup', {
      p_standard_cost_version_id: input.standard_cost_version_id,
      p_item_id: input.item_id,
      p_bom_version_id: input.bom_version_id || null,
      p_routing_id: input.routing_id || null,
      p_rollup_qty: Number(input.rollup_qty || 1),
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class MrpActualCostingService extends BaseService<Row> {
  constructor() { super('mrp_actual_cost_runs'); }
  async runWorkOrder(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('run_mrp_actual_work_order_costing', {
      p_work_order_id: input.work_order_id,
      p_standard_cost_version_id: input.standard_cost_version_id || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async variances(workOrderId: string): Promise<number> {
    const { data, error } = await supabase.rpc('calculate_mrp_work_order_variances', { p_work_order_id: workOrderId });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async reviewVariance(input: Row): Promise<void> {
    const { error } = await supabase.rpc('review_mrp_cost_variance', { p_variance_id: input.variance_id, p_status: input.variance_status || 'reviewed', p_resolution_notes: input.resolution_notes || null });
    if (error) throw new Error(error.message);
  }
}

export class MrpWipCostService extends BaseService<Row> {
  constructor() { super('mrp_wip_cost_ledger'); }
  async post(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('post_mrp_wip_cost_ledger', {
      p_work_order_id: input.work_order_id,
      p_entry_type: input.entry_type,
      p_debit: Number(input.debit_amount || 0),
      p_credit: Number(input.credit_amount || 0),
      p_reference_table: input.reference_table || null,
      p_reference_id: input.reference_id || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async valueFinishedGoods(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('value_mrp_finished_goods_from_work_order', {
      p_work_order_id: input.work_order_id,
      p_valuation_method: input.valuation_method || 'actual',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class MrpCostPostingService extends BaseService<Row> {
  constructor() { super('mrp_cost_posting_drafts'); }
  async createDraft(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('create_mrp_cost_posting_draft', {
      p_source_type: input.source_type,
      p_source_id: input.source_id || null,
      p_description: input.description,
      p_amount: Number(input.amount || 0),
      p_debit_account_code: input.debit_account_code || null,
      p_credit_account_code: input.credit_account_code || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async review(id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_mrp_cost_posting_reviewed', { p_posting_id: id });
    if (error) throw new Error(error.message);
  }
  async post(id: string, journalEntryId?: string): Promise<void> {
    const { error } = await supabase.rpc('mark_mrp_cost_posting_posted', { p_posting_id: id, p_finance_journal_entry_id: journalEntryId || null });
    if (error) throw new Error(error.message);
  }
  async cancel(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_mrp_cost_posting_draft', { p_posting_id: id, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

class MrpCostingAnalyticsService {
  async dashboard() { const { data, error } = await supabase.from('mrp_costing_dashboard').select('*').limit(10); if (error) throw new Error(error.message); return data || []; }
  async rollups() { const { data, error } = await supabase.from('mrp_cost_rollup_summary').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async workOrders() { const { data, error } = await supabase.from('mrp_work_order_cost_dashboard').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async variances() { const { data, error } = await supabase.from('mrp_cost_variance_review_queue').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async wip() { const { data, error } = await supabase.from('mrp_wip_valuation').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async fg() { const { data, error } = await supabase.from('mrp_finished_goods_valuation').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async postings() { const { data, error } = await supabase.from('mrp_cost_posting_queue').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async kpis() { const { data, error } = await supabase.from('mrp_costing_kpis').select('*').limit(10); if (error) throw new Error(error.message); return data || []; }
  async byItem() { const { data, error } = await supabase.from('mrp_cost_by_item_report').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
}

export const mrpCostElementService = new MrpCostElementService();
export const mrpCostingProfileService = new MrpCostingProfileService();
export const mrpStandardCostService = new MrpStandardCostService();
export const mrpCostRollupService = new MrpCostRollupService();
export const mrpActualCostingService = new MrpActualCostingService();
export const mrpWipCostService = new MrpWipCostService();
export const mrpCostPostingService = new MrpCostPostingService();
export const mrpCostingAnalyticsService = new MrpCostingAnalyticsService();
