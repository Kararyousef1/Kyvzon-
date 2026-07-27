import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

type Row = Record<string, unknown>;

export class MrpWorkstationService extends BaseService<Row> {
  constructor() { super('mrp_shop_floor_workstations'); }
  async upsert(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_mrp_workstation', {
      p_workstation_code: input.workstation_code || null,
      p_name_ar: input.name_ar,
      p_device_type: input.device_type || 'tablet',
      p_work_center_id: input.work_center_id || null,
      p_asset_id: input.asset_id || null,
      p_sop_url: input.sop_url || null,
      p_work_instructions: input.work_instructions || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_workstation_status', { p_workstation_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpTerminalSessionService extends BaseService<Row> {
  constructor() { super('mrp_shop_floor_terminal_sessions'); }
  async open(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('open_mrp_terminal_session', {
      p_workstation_id: input.workstation_id,
      p_shift_id: input.shift_id || null,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async close(sessionId: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('close_mrp_terminal_session', { p_session_id: sessionId, p_notes: notes || null });
    if (error) throw new Error(error.message);
  }
  async forceClose(sessionId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('force_close_mrp_terminal_session', { p_session_id: sessionId, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpShopFloorExecutionService {
  async startOperation(operationId: string, workstationId?: string): Promise<void> {
    const { error } = await supabase.rpc('start_mrp_operation', { p_work_order_operation_id: operationId, p_workstation_id: workstationId || null });
    if (error) throw new Error(error.message);
  }
  async pauseOperation(operationId: string, reasonId: string, workstationId?: string, notes?: string): Promise<string> {
    const { data, error } = await supabase.rpc('pause_mrp_operation', { p_work_order_operation_id: operationId, p_reason_id: reasonId, p_workstation_id: workstationId || null, p_notes: notes || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async resumeOperation(downtimeEventId: string, resolutionNotes?: string): Promise<void> {
    const { error } = await supabase.rpc('resume_mrp_operation', { p_downtime_event_id: downtimeEventId, p_resolution_notes: resolutionNotes || null });
    if (error) throw new Error(error.message);
  }
  async recordProduction(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('record_mrp_production_event', {
      p_work_order_operation_id: input.operation_id,
      p_workstation_id: input.workstation_id,
      p_event_type: input.event_type || 'unit_completed',
      p_good_qty: Number(input.good_qty || 0),
      p_scrap_qty: Number(input.scrap_qty || 0),
      p_rework_qty: Number(input.rework_qty || 0),
      p_cycle_time_seconds: input.cycle_time_seconds ? Number(input.cycle_time_seconds) : null,
      p_lot_code: input.lot_code || null,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async recordConsumption(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('record_mrp_actual_material_consumption', {
      p_production_event_id: input.production_event_id,
      p_work_order_material_id: input.work_order_material_id,
      p_actual_qty: Number(input.actual_qty || 0),
      p_standard_qty: input.standard_qty ? Number(input.standard_qty) : null,
      p_lot_id: input.lot_id || null,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async raiseQualityIssue(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('raise_mrp_quality_issue_from_floor', {
      p_work_order_id: input.work_order_id,
      p_operation_id: input.operation_id || null,
      p_item_id: input.item_id || null,
      p_description: input.description,
      p_affected_qty: Number(input.affected_qty || 0),
      p_defect_class: input.defect_class || 'major',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async cancelProductionEvent(eventId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_mrp_production_event', { p_event_id: eventId, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpDowntimeService extends BaseService<Row> {
  constructor() { super('mrp_downtime_events'); }
  async start(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('start_mrp_downtime', {
      p_reason_id: input.reason_id,
      p_workstation_id: input.workstation_id || null,
      p_work_order_operation_id: input.operation_id || null,
      p_asset_id: input.asset_id || null,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async end(downtimeEventId: string, resolutionNotes?: string): Promise<void> {
    const { error } = await supabase.rpc('end_mrp_downtime', { p_downtime_event_id: downtimeEventId, p_resolution_notes: resolutionNotes || null });
    if (error) throw new Error(error.message);
  }
}

export class MrpDowntimeReasonService extends BaseService<Row> { constructor() { super('mrp_downtime_reason_codes'); } async upsert(input: Row): Promise<string> { const { data, error } = await supabase.rpc('upsert_mrp_downtime_reason', { p_reason_code: input.reason_code || null, p_name_ar: input.name_ar, p_category: input.category || 'unplanned', p_reason_type: input.reason_type || 'other', p_oee_loss_bucket: input.oee_loss_bucket || 'availability', p_requires_comment: Boolean(input.requires_comment), p_triggers_maintenance: Boolean(input.triggers_maintenance) }); if (error) throw new Error(error.message); return data as string; } }

export class MrpLaborAssignmentService extends BaseService<Row> {
  constructor() { super('mrp_labor_assignments'); }
  async assign(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('assign_mrp_labor_to_operation', {
      p_worker_id: input.worker_id || null,
      p_work_order_operation_id: input.operation_id,
      p_shift_id: input.shift_id || null,
      p_workstation_id: input.workstation_id || null,
      p_labor_role: input.labor_role || 'operator',
      p_skill_code: input.skill_code || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async close(assignmentId: string, goodQty = 0, scrapQty = 0, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('close_mrp_labor_assignment', { p_assignment_id: assignmentId, p_good_qty: goodQty, p_scrap_qty: scrapQty, p_notes: notes || null });
    if (error) throw new Error(error.message);
  }
}

export class MrpAndonService extends BaseService<Row> {
  constructor() { super('mrp_andon_signals'); }
  async raise(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('raise_mrp_andon_signal', {
      p_workstation_id: input.workstation_id,
      p_work_order_id: input.work_order_id || null,
      p_operation_id: input.operation_id || null,
      p_color: input.color || 'yellow',
      p_signal_type: input.signal_type || 'attention',
      p_title: input.title,
      p_description: input.description || null,
      p_create_downtime: Boolean(input.create_downtime || false),
      p_reason_id: input.reason_id || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async acknowledge(signalId: string): Promise<void> {
    const { error } = await supabase.rpc('acknowledge_mrp_andon_signal', { p_signal_id: signalId });
    if (error) throw new Error(error.message);
  }
  async resolve(signalId: string, resolutionNotes: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_mrp_andon_signal', { p_signal_id: signalId, p_resolution_notes: resolutionNotes });
    if (error) throw new Error(error.message);
  }
}

export class MrpMaintenanceBridgeService extends BaseService<Row> {
  constructor() { super('mrp_shopfloor_maintenance_requests'); }
  async createBreakdown(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('create_mrp_breakdown_maintenance_request', {
      p_downtime_event_id: input.downtime_event_id || null,
      p_asset_id: input.asset_id || null,
      p_work_center_id: input.work_center_id || null,
      p_severity: input.severity || 'urgent',
      p_description: input.description,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async updateStatus(id: string, status: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('update_mrp_shopfloor_maintenance_request_status', { p_request_id: id, p_status: status, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

export class MrpOeeService extends BaseService<Row> {
  constructor() { super('mrp_oee_snapshots'); }
  async calculate(input: Row): Promise<string> {
    const { data, error } = await supabase.rpc('calculate_mrp_oee_snapshot', {
      p_work_center_id: input.work_center_id,
      p_period_start: input.period_start,
      p_period_end: input.period_end,
      p_shift_id: input.shift_id || null,
      p_work_order_id: input.work_order_id || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class MrpShopFloorAnalyticsService {
  async dashboard() { const { data, error } = await supabase.from('mrp_shop_floor_dashboard').select('*').limit(10); if (error) throw new Error(error.message); return data || []; }
  async workstations() { const { data, error } = await supabase.from('mrp_digital_workstation_board').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async tracking() { const { data, error } = await supabase.from('mrp_real_time_production_tracking').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async consumption() { const { data, error } = await supabase.from('mrp_actual_vs_standard_consumption').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async oee() { const { data, error } = await supabase.from('mrp_oee_dashboard').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async downtime() { const { data, error } = await supabase.from('mrp_downtime_dashboard').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async pareto() { const { data, error } = await supabase.from('mrp_downtime_pareto').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async workOrders() { const { data, error } = await supabase.from('mrp_work_order_execution_status').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async labor() { const { data, error } = await supabase.from('mrp_labor_shift_dashboard').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async andon() { const { data, error } = await supabase.from('mrp_andon_board').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async supervisor() { const { data, error } = await supabase.from('mrp_supervisor_dashboard').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async manager() { const { data, error } = await supabase.from('mrp_production_manager_dashboard').select('*').limit(20); if (error) throw new Error(error.message); return data || []; }
  async maintenance() { const { data, error } = await supabase.from('mrp_shopfloor_maintenance_queue').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async kpis() { const { data, error } = await supabase.from('mrp_shopfloor_kpis').select('*').limit(10); if (error) throw new Error(error.message); return data || []; }
}

export const mrpWorkstationService = new MrpWorkstationService();
export const mrpTerminalSessionService = new MrpTerminalSessionService();
export const mrpShopFloorExecutionService = new MrpShopFloorExecutionService();
export const mrpDowntimeService = new MrpDowntimeService();
export const mrpDowntimeReasonService = new MrpDowntimeReasonService();
export const mrpLaborAssignmentService = new MrpLaborAssignmentService();
export const mrpAndonService = new MrpAndonService();
export const mrpMaintenanceBridgeService = new MrpMaintenanceBridgeService();
export const mrpOeeService = new MrpOeeService();
export const mrpShopFloorAnalyticsService = new MrpShopFloorAnalyticsService();
