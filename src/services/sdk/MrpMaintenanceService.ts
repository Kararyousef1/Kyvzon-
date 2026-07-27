import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

type Row = Record<string, unknown>;

export class MrpMaintenanceAssetService extends BaseService<Row> {
  constructor() { super('mrp_maintenance_assets'); }
  async upsert(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_mrp_maintenance_asset', {
      p_asset_number: input.asset_number || null,
      p_name_ar: input.name_ar,
      p_manufacturing_asset_id: input.manufacturing_asset_id || null,
      p_work_center_id: input.work_center_id || null,
      p_manufacturer: input.manufacturer || null,
      p_model: input.model || null,
      p_serial_number: input.serial_number || null,
      p_purchase_date: input.purchase_date || null,
      p_commissioning_date: input.commissioning_date || null,
      p_warranty_end_date: input.warranty_end_date || null,
      p_original_value: Number(input.original_value || 0),
      p_expected_life_years: input.expected_life_years ? Number(input.expected_life_years) : null,
      p_specs: input.technical_specs || {},
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async assessCriticality(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('assess_mrp_asset_criticality', {
      p_maintenance_asset_id: input.maintenance_asset_id,
      p_production_impact: Number(input.production_impact || 1),
      p_failure_likelihood: Number(input.failure_likelihood || 1),
      p_safety_impact: Number(input.safety_impact || 1),
      p_quality_impact: Number(input.quality_impact || 1),
      p_rationale: input.rationale || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_maintenance_asset_status', { p_maintenance_asset_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpPmPlanService extends BaseService<Row> {
  constructor() { super('mrp_pm_plans'); }
  async createPlan(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('create_mrp_pm_plan', {
      p_maintenance_asset_id: input.maintenance_asset_id,
      p_plan_code: input.plan_code || null,
      p_plan_name: input.plan_name,
      p_frequency_type: input.frequency_type,
      p_interval_value: Number(input.interval_value || 1),
      p_estimated_minutes: Number(input.estimated_minutes || 60),
      p_next_due_date: input.next_due_date || null,
      p_sop_url: input.sop_url || null,
      p_maintenance_type: input.maintenance_type || 'preventive',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async addTask(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('add_mrp_pm_plan_task', {
      p_pm_plan_id: input.pm_plan_id,
      p_sequence_no: Number(input.sequence_no || 1),
      p_task_text: input.task_text,
      p_expected_result: input.expected_result || null,
      p_estimated_minutes: Number(input.estimated_minutes || 0),
      p_required_skill: input.required_skill || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async generate(untilDate?: string): Promise<number> {
    const { data, error } = await supabase.rpc('generate_mrp_pm_work_orders', { p_until_date: untilDate || null });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_pm_plan_status', { p_pm_plan_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpMaintenanceWorkOrderService extends BaseService<Row> {
  constructor() { super('mrp_maintenance_work_orders'); }
  async createWorkOrder(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('create_mrp_maintenance_work_order', {
      p_maintenance_asset_id: input.maintenance_asset_id || null,
      p_maintenance_type: input.maintenance_type || 'preventive',
      p_priority: input.priority || 'medium',
      p_title: input.title,
      p_description: input.description || null,
      p_scheduled_start_at: input.scheduled_start_at || null,
      p_scheduled_end_at: input.scheduled_end_at || null,
      p_assigned_to: input.assigned_to || null,
      p_source_type: input.source_type || 'manual',
      p_source_id: input.source_id || null,
      p_pm_plan_id: input.pm_plan_id || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async assign(id: string, assignedTo: string): Promise<void> {
    const { error } = await supabase.rpc('assign_mrp_maintenance_work_order', { p_maintenance_wo_id: id, p_assigned_to: assignedTo });
    if (error) throw new Error(error.message);
  }
  async start(id: string): Promise<void> {
    const { error } = await supabase.rpc('start_mrp_maintenance_work_order', { p_maintenance_wo_id: id });
    if (error) throw new Error(error.message);
  }
  async complete(input: Row): Promise<void> {
    const { error } = await supabase.rpc('complete_mrp_maintenance_work_order', {
      p_maintenance_wo_id: input.maintenance_wo_id,
      p_actual_minutes: input.actual_minutes ? Number(input.actual_minutes) : null,
      p_labor_cost: Number(input.labor_cost || 0),
      p_other_cost: Number(input.other_cost || 0),
      p_completion_notes: input.completion_notes || null,
    });
    if (error) throw new Error(error.message);
  }
  async close(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('close_mrp_maintenance_work_order', { p_maintenance_wo_id: id, p_close_reason: reason });
    if (error) throw new Error(error.message);
  }
  async hold(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('hold_mrp_maintenance_work_order', { p_maintenance_wo_id: id, p_reason: reason });
    if (error) throw new Error(error.message);
  }
  async cancel(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_mrp_maintenance_work_order', { p_maintenance_wo_id: id, p_reason: reason });
    if (error) throw new Error(error.message);
  }
  async convertShopfloorRequest(requestId: string, assignedTo?: string): Promise<string> {
    const { data, error } = await supabase.rpc('convert_shopfloor_request_to_maintenance_wo', { p_shopfloor_request_id: requestId, p_assigned_to: assignedTo || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class MrpMaintenanceSparePartService extends BaseService<Row> {
  constructor() { super('mrp_maintenance_spare_parts'); }
  async upsert(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_mrp_maintenance_spare_part', {
      p_spare_part_code: input.spare_part_code || null,
      p_name_ar: input.name_ar,
      p_item_id: input.item_id || null,
      p_maintenance_asset_id: input.maintenance_asset_id || null,
      p_spare_part_type: input.spare_part_type || 'consumable',
      p_current_stock_qty: Number(input.current_stock_qty || 0),
      p_reorder_point: Number(input.reorder_point || 0),
      p_min_qty: Number(input.min_qty || 0),
      p_max_qty: Number(input.max_qty || 0),
      p_lead_time_days: Number(input.lead_time_days || 0),
      p_unit_cost: Number(input.unit_cost || 0),
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async addToWorkOrder(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('add_mrp_maintenance_work_order_part', { p_maintenance_wo_id: input.maintenance_wo_id, p_spare_part_id: input.spare_part_id, p_required_qty: Number(input.required_qty || 0) });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async issue(workOrderPartId: string, qty: number): Promise<void> {
    const { error } = await supabase.rpc('issue_mrp_maintenance_spare_part', { p_work_order_part_id: workOrderPartId, p_issued_qty: qty });
    if (error) throw new Error(error.message);
  }
  async reorder(): Promise<number> {
    const { data, error } = await supabase.rpc('generate_mrp_spare_part_reorder_recommendations');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_maintenance_spare_part_status', { p_spare_part_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpConditionMonitoringService extends BaseService<Row> {
  constructor() { super('mrp_condition_monitoring_readings'); }
  async record(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('record_mrp_condition_reading', {
      p_maintenance_asset_id: input.maintenance_asset_id,
      p_reading_type: input.reading_type,
      p_reading_value: Number(input.reading_value || 0),
      p_unit: input.unit,
      p_warning_threshold: input.warning_threshold ? Number(input.warning_threshold) : null,
      p_critical_threshold: input.critical_threshold ? Number(input.critical_threshold) : null,
      p_generate_work_order: input.generate_work_order !== false,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async closeAlert(alertId: string, status = 'resolved', reason?: string): Promise<void> {
    const { error } = await supabase.rpc('close_mrp_condition_alert', { p_alert_id: alertId, p_status: status, p_reason: reason || null });
    if (error) throw new Error(error.message);
  }
}

export class MrpAnnualShutdownService extends BaseService<Row> {
  constructor() { super('mrp_annual_shutdown_plans'); }
  async createPlan(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('create_mrp_annual_shutdown_plan', {
      p_title: input.title,
      p_start_date: input.start_date,
      p_end_date: input.end_date,
      p_plant_id: input.plant_id || null,
      p_line_id: input.line_id || null,
      p_production_buffer_plan: input.production_buffer_plan || null,
      p_external_vendor_plan: input.external_vendor_plan || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async addTask(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('add_mrp_shutdown_task', {
      p_shutdown_plan_id: input.shutdown_plan_id,
      p_sequence_no: Number(input.sequence_no || 1),
      p_task_text: input.task_text,
      p_maintenance_asset_id: input.maintenance_asset_id || null,
      p_required_spares: input.required_spares || null,
      p_assigned_to: input.assigned_to || null,
      p_planned_date: input.planned_date || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async updatePlanStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_annual_shutdown_status', { p_shutdown_plan_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
  async updateTaskStatus(id: string, status: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_shutdown_task_status', { p_shutdown_task_id: id, p_status: status, p_reason: reason || null });
    if (error) throw new Error(error.message);
  }
}

class MrpMaintenanceAnalyticsService {
  async dashboard() { const { data, error } = await supabase.from('mrp_maintenance_dashboard').select('*').limit(20); if (error) throw new Error(error.message); return data || []; }
  async assets() { const { data, error } = await supabase.from('mrp_maintenance_asset_registry').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async pmCalendar() { const { data, error } = await supabase.from('mrp_pm_calendar').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async workOrders() { const { data, error } = await supabase.from('mrp_maintenance_work_order_board').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async spareParts() { const { data, error } = await supabase.from('mrp_maintenance_spare_parts_status').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async condition() { const { data, error } = await supabase.from('mrp_condition_monitoring_board').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async alerts() { const { data, error } = await supabase.from('mrp_condition_alert_queue').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async shutdowns() { const { data, error } = await supabase.from('mrp_annual_shutdown_schedule').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async mtbfMttr() { const { data, error } = await supabase.from('mrp_maintenance_mtbf_mttr').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async kpis() { const { data, error } = await supabase.from('mrp_maintenance_kpis').select('*').limit(10); if (error) throw new Error(error.message); return data || []; }
  async costByAsset() { const { data, error } = await supabase.from('mrp_maintenance_cost_by_asset').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async integrations() { const { data, error } = await supabase.from('mrp_maintenance_integration_health').select('*').limit(10); if (error) throw new Error(error.message); return data || []; }
}

export const mrpMaintenanceAssetService = new MrpMaintenanceAssetService();
export const mrpPmPlanService = new MrpPmPlanService();
export const mrpMaintenanceWorkOrderService = new MrpMaintenanceWorkOrderService();
export const mrpMaintenanceSparePartService = new MrpMaintenanceSparePartService();
export const mrpConditionMonitoringService = new MrpConditionMonitoringService();
export const mrpAnnualShutdownService = new MrpAnnualShutdownService();
export const mrpMaintenanceAnalyticsService = new MrpMaintenanceAnalyticsService();
