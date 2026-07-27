import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryPickOrderRecord { id:string; tenant_id:string; pick_order_number:string; source_type:string; picking_method:string; priority:string; critical_ratio?:number|null; status:string; due_at?:string|null; created_at:string; }
export interface InventoryPickTaskRecord { id:string; tenant_id:string; task_number:string; pick_order_id:string; item_id:string; required_qty:number; picked_qty:number; status:string; sequence_no:number; }
export interface InventoryPickWaveRecord { id:string; tenant_id:string; wave_number:string; wave_type:string; status:string; scheduled_start?:string|null; scheduled_end?:string|null; }
export interface InventoryPickExceptionRecord { id:string; tenant_id:string; exception_number:string; exception_type:string; expected_qty?:number|null; actual_qty?:number|null; status:string; created_at:string; }
export interface InventoryPickScanRecord { id:string; tenant_id:string; pick_task_id:string; scanned_value:string; scan_type:string; scan_result:string; scanned_at:string; }
export interface InventoryPickingTechnologyEventRecord { id:string; tenant_id:string; pick_task_id?:string|null; technology_type:string; event_type:string; payload:Record<string,unknown>; created_at:string; }
export interface InventoryPickSortingSessionRecord { id:string; tenant_id:string; sorting_number:string; pick_list_id:string; station_code?:string|null; status:string; created_at:string; }
export interface InventoryPickZoneHandoffRecord { id:string; tenant_id:string; handoff_number:string; pick_task_id:string; status:string; created_at:string; }

export class InventoryPickOrderService extends BaseService<InventoryPickOrderRecord> {
  constructor(){ super('inventory_pick_orders'); }
  async createFull(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_pick_order', {
      p_source_type: input.source_type,
      p_source_id: input.source_id || null,
      p_destination_type: input.destination_type || null,
      p_destination_id: input.destination_id || null,
      p_picking_method: input.picking_method || 'discrete',
      p_priority: input.priority || 'normal',
      p_critical_ratio: input.critical_ratio || null,
      p_due_at: input.due_at || null,
      p_lines: input.lines || [],
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async generatePickList(pickOrderId: string, routeAlgorithm = 's_shape'): Promise<string> {
    const { data, error } = await supabase.rpc('generate_inventory_pick_list', { p_pick_order_id: pickOrderId, p_route_algorithm: routeAlgorithm });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryPickTaskService extends BaseService<InventoryPickTaskRecord> {
  constructor(){ super('inventory_pick_tasks'); }
  async confirmScan(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('confirm_inventory_pick_scan', {
      p_pick_task_id: input.pick_task_id,
      p_location_barcode: input.location_barcode || null,
      p_item_barcode: input.item_barcode || null,
      p_lpn_barcode: input.lpn_barcode || null,
      p_quantity: input.quantity || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async confirmVoice(taskId: string, checkDigit: string, quantity: number): Promise<string> {
    const { data, error } = await supabase.rpc('confirm_inventory_voice_pick', { p_pick_task_id: taskId, p_check_digit: checkDigit, p_quantity: quantity });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async triggerPickToLight(taskId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('trigger_inventory_pick_to_light', { p_pick_task_id: taskId });
    if (error) throw new Error(error.message);
    return (data || {}) as Record<string, unknown>;
  }
  async ingestRfid(taskId: string, tagValues: string[], quantity: number): Promise<string> {
    const { data, error } = await supabase.rpc('ingest_inventory_rfid_pick_event', { p_pick_task_id: taskId, p_tag_values: tagValues, p_quantity: quantity });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryPickExceptionService extends BaseService<InventoryPickExceptionRecord> {
  constructor(){ super('inventory_pick_exceptions'); }
  async report(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('report_inventory_pick_exception', {
      p_pick_task_id: input.pick_task_id,
      p_exception_type: input.exception_type,
      p_actual_qty: input.actual_qty || null,
      p_description: input.description || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryPickWaveService extends BaseService<InventoryPickWaveRecord> {
  constructor(){ super('inventory_pick_waves'); }
  async createWave(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_pick_wave', {
      p_wave_type: input.wave_type || 'manual',
      p_scheduled_start: input.scheduled_start || null,
      p_scheduled_end: input.scheduled_end || null,
      p_pick_order_ids: input.pick_order_ids || [],
      p_criteria: input.criteria || {},
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async release(waveId: string): Promise<number> {
    const { data, error } = await supabase.rpc('release_inventory_pick_wave', { p_wave_id: waveId });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

export class InventoryPickScanService extends BaseService<InventoryPickScanRecord> { constructor(){ super('inventory_pick_scans'); } }
export class InventoryPickingTechnologyEventService extends BaseService<InventoryPickingTechnologyEventRecord> {
  constructor(){ super('inventory_picking_technology_events'); }
  async record(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('record_inventory_picking_technology_event', {
      p_pick_task_id: input.pick_task_id || null,
      p_technology_type: input.technology_type,
      p_event_type: input.event_type,
      p_payload: input.payload || {},
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventoryPickSortingSessionService extends BaseService<InventoryPickSortingSessionRecord> {
  constructor(){ super('inventory_pick_sorting_sessions'); }
  async createSession(pickListId: string, stationCode?: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_pick_sorting_session', { p_pick_list_id: pickListId, p_station_code: stationCode || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async confirmLine(sortingLineId: string, containerId?: string): Promise<void> {
    const { error } = await supabase.rpc('confirm_inventory_sorting_line', { p_sorting_line_id: sortingLineId, p_container_id: containerId || null });
    if (error) throw new Error(error.message);
  }
}
export class InventoryPickZoneHandoffService extends BaseService<InventoryPickZoneHandoffRecord> {
  constructor(){ super('inventory_pick_zone_handoffs'); }
  async createHandoff(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_zone_handoff', {
      p_pick_task_id: input.pick_task_id,
      p_from_zone_id: input.from_zone_id || null,
      p_to_zone_id: input.to_zone_id || null,
      p_to_user_id: input.to_user_id || null,
      p_notes: input.notes || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async complete(handoffId: string): Promise<void> {
    const { error } = await supabase.rpc('complete_inventory_zone_handoff', { p_handoff_id: handoffId });
    if (error) throw new Error(error.message);
  }
}

class InventoryPickingAnalyticsService {
  async taskQueue(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_pick_task_queue').select('*').limit(200); if(error) throw new Error(error.message); return data||[]; }
  async productivity(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_picking_productivity').select('*').limit(100); if(error) throw new Error(error.message); return data||[]; }
  async exceptions(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_picking_exceptions_report').select('*').limit(100); if(error) throw new Error(error.message); return data||[]; }
  async kpis(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_picking_kpis').select('*').limit(1); if(error) throw new Error(error.message); return data||[]; }
  async waveDashboard(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_pick_wave_dashboard').select('*').limit(100); if(error) throw new Error(error.message); return data||[]; }
  async routeMap(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_pick_route_map').select('*').limit(500); if(error) throw new Error(error.message); return data||[]; }
  async sortingDashboard(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_pick_sorting_dashboard').select('*').limit(100); if(error) throw new Error(error.message); return data||[]; }
  async technologyEventsReport(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_picking_technology_events_report').select('*').limit(100); if(error) throw new Error(error.message); return data||[]; }
  async handoffQueue(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_zone_handoff_queue').select('*').limit(100); if(error) throw new Error(error.message); return data||[]; }
  async interleaving(assignedTo?: string): Promise<number> { const { data, error } = await supabase.rpc('generate_inventory_picking_interleaving', { p_assigned_to: assignedTo || null }); if(error) throw new Error(error.message); return Number(data||0); }
}

export const inventoryPickOrderService = new InventoryPickOrderService();
export const inventoryPickTaskService = new InventoryPickTaskService();
export const inventoryPickExceptionService = new InventoryPickExceptionService();
export const inventoryPickWaveService = new InventoryPickWaveService();
export const inventoryPickScanService = new InventoryPickScanService();
export const inventoryPickingTechnologyEventService = new InventoryPickingTechnologyEventService();
export const inventoryPickSortingSessionService = new InventoryPickSortingSessionService();
export const inventoryPickZoneHandoffService = new InventoryPickZoneHandoffService();
export const inventoryPickingAnalyticsService = new InventoryPickingAnalyticsService();
