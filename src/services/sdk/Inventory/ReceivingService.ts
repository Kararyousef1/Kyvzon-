import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryAsnRecord { id: string; tenant_id: string; asn_number: string; supplier_id?: string | null; po_id?: string | null; expected_arrival_at?: string | null; carrier_name?: string | null; truck_number?: string | null; bol_number?: string | null; total_packages?: number | null; status: string; created_at: string; }
export interface InventoryDockAppointmentRecord { id: string; tenant_id: string; appointment_number: string; warehouse_id: string; dock_id?: string | null; asn_id?: string | null; scheduled_start: string; scheduled_end: string; status: string; package_count?: number | null; created_at: string; }
export interface InventoryReceivingSessionRecord { id: string; tenant_id: string; session_number: string; warehouse_id: string; receiving_location_id?: string | null; asn_id?: string | null; status: string; source_type: string; started_at: string; posted_at?: string | null; }
export interface InventoryReceivingLineRecord { id: string; tenant_id: string; session_id: string; item_id: string; expected_qty: number; received_qty: number; accepted_qty: number; rejected_qty: number; condition_status: string; requires_quality: boolean; created_at: string; }
export interface InventoryOsdCaseRecord { id: string; tenant_id: string; case_number: string; session_id?: string | null; osd_type: string; severity: string; description: string; status: string; created_at: string; }
export interface InventoryQuarantineHoldRecord { id: string; tenant_id: string; hold_number: string; item_id: string; warehouse_id: string; quantity: number; reason: string; status: string; created_at: string; }
export interface InventoryPutawayTaskRecord { id: string; tenant_id: string; task_number: string; item_id: string; warehouse_id: string; quantity: number; status: string; created_at: string; }
export interface InventoryCrossDockTaskRecord { id: string; tenant_id: string; task_number: string; item_id: string; quantity: number; destination_type: string; status: string; created_at: string; }
export interface InventoryReceivingScanRecord { id: string; tenant_id: string; session_id: string; scanned_value: string; scan_type: string; scan_result: string; result_message?: string | null; scanned_at: string; }
export interface InventoryLpnLabelPrintRecord { id: string; tenant_id: string; lpn_id: string; label_payload: Record<string, unknown>; printer_name?: string | null; printed_at: string; }
export interface InventoryInboundNotificationRecord { id: string; tenant_id: string; event_type: string; target_role?: string | null; title: string; body?: string | null; is_read: boolean; created_at: string; }
export interface InventoryReceivingAttachmentRecord { id: string; tenant_id: string; entity_type: string; entity_id: string; file_name: string; file_url: string; file_mime?: string | null; file_size?: number | null; created_at: string; }
export interface InventoryQualityNcrCaseRecord { id: string; tenant_id: string; ncr_number: string; osd_case_id?: string | null; defect_type: string; description: string; status: string; disposition?: string | null; created_at: string; }
export interface InventorySupplierDockInviteRecord { id: string; tenant_id: string; supplier_id?: string | null; warehouse_id: string; asn_id?: string | null; email: string; status: string; expires_at: string; created_at: string; }

export class InventoryAsnService extends BaseService<InventoryAsnRecord> {
  constructor() { super('inventory_asns'); }
  async createFull(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_asn', {
      p_supplier_id: input.supplier_id || null,
      p_po_id: input.po_id || null,
      p_expected_arrival_at: input.expected_arrival_at || null,
      p_carrier_name: input.carrier_name || null,
      p_truck_number: input.truck_number || null,
      p_bol_number: input.bol_number || null,
      p_total_packages: input.total_packages || 0,
      p_total_weight: input.total_weight || null,
      p_lines: input.lines || [],
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryDockAppointmentService extends BaseService<InventoryDockAppointmentRecord> {
  constructor() { super('inventory_dock_appointments'); }
  async schedule(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('schedule_inventory_dock_appointment', {
      p_warehouse_id: input.warehouse_id,
      p_dock_id: input.dock_id || null,
      p_asn_id: input.asn_id || null,
      p_scheduled_start: input.scheduled_start,
      p_scheduled_end: input.scheduled_end,
      p_package_count: input.package_count || 0,
      p_special_requirements: input.special_requirements || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryReceivingSessionService extends BaseService<InventoryReceivingSessionRecord> {
  constructor() { super('inventory_receiving_sessions'); }
  async start(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('start_inventory_receiving_session', {
      p_warehouse_id: input.warehouse_id,
      p_receiving_location_id: input.receiving_location_id || null,
      p_asn_id: input.asn_id || null,
      p_appointment_id: input.appointment_id || null,
      p_po_id: input.po_id || null,
      p_source_type: input.source_type || 'manual',
      p_driver_name: input.driver_name || null,
      p_bol_number: input.bol_number || null,
      p_seal_number: input.seal_number || null,
      p_seal_status: input.seal_status || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async post(sessionId: string): Promise<void> {
    const { error } = await supabase.rpc('post_inventory_receiving_session', { p_session_id: sessionId });
    if (error) throw new Error(error.message);
  }
}

export class InventoryReceivingLineService extends BaseService<InventoryReceivingLineRecord> {
  constructor() { super('inventory_receiving_lines'); }
  async record(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('record_inventory_receiving_line', {
      p_session_id: input.session_id,
      p_item_id: input.item_id,
      p_expected_qty: input.expected_qty || 0,
      p_received_qty: input.received_qty || 0,
      p_accepted_qty: input.accepted_qty || 0,
      p_rejected_qty: input.rejected_qty || 0,
      p_uom: input.uom || 'PCS',
      p_lot_number: input.lot_number || null,
      p_expiry_date: input.expiry_date || null,
      p_requires_quality: Boolean(input.requires_quality),
      p_condition_status: input.condition_status || 'ok',
      p_target_location_id: input.target_location_id || null,
      p_generate_lpn: input.generate_lpn !== false,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryOsdCaseService extends BaseService<InventoryOsdCaseRecord> {
  constructor() { super('inventory_osd_cases'); }
  async createCase(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_osd_case', {
      p_session_id: input.session_id || null,
      p_receiving_line_id: input.receiving_line_id || null,
      p_osd_type: input.osd_type,
      p_severity: input.severity || 'warning',
      p_description: input.description,
      p_quantity_difference: input.quantity_difference || null,
      p_attachments: input.attachments || [],
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryQuarantineHoldService extends BaseService<InventoryQuarantineHoldRecord> { constructor() { super('inventory_quarantine_holds'); } }
export class InventoryPutawayTaskService extends BaseService<InventoryPutawayTaskRecord> { constructor() { super('inventory_putaway_tasks'); } }
export class InventoryCrossDockTaskService extends BaseService<InventoryCrossDockTaskRecord> { constructor() { super('inventory_cross_dock_tasks'); } }
export class InventoryReceivingScanService extends BaseService<InventoryReceivingScanRecord> {
  constructor() { super('inventory_receiving_scans'); }
  async scan(sessionId: string, scannedValue: string, scanType = 'barcode'): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.rpc('scan_inventory_receiving_barcode', {
      p_session_id: sessionId,
      p_scanned_value: scannedValue,
      p_scan_type: scanType,
    });
    if (error) throw new Error(error.message);
    return data || [];
  }
}
export class InventoryLpnLabelPrintService extends BaseService<InventoryLpnLabelPrintRecord> {
  constructor() { super('inventory_lpn_label_prints'); }
  async print(lpnId: string, printerName?: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('print_inventory_lpn_label', {
      p_lpn_id: lpnId,
      p_printer_name: printerName || null,
    });
    if (error) throw new Error(error.message);
    return (data || {}) as Record<string, unknown>;
  }
}
export class InventoryInboundNotificationService extends BaseService<InventoryInboundNotificationRecord> { constructor() { super('inventory_inbound_notifications'); } }
export class InventoryReceivingAttachmentService extends BaseService<InventoryReceivingAttachmentRecord> {
  constructor() { super('inventory_receiving_attachments'); }
  async attach(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('attach_inventory_receiving_file', {
      p_entity_type: input.entity_type,
      p_entity_id: input.entity_id,
      p_file_name: input.file_name,
      p_file_url: input.file_url,
      p_file_mime: input.file_mime || null,
      p_file_size: input.file_size || null,
      p_uploaded_by_email: input.uploaded_by_email || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventoryQualityNcrCaseService extends BaseService<InventoryQualityNcrCaseRecord> {
  constructor() { super('inventory_quality_ncr_cases'); }
  async createFromOsd(osdCaseId: string, defectType: string, description: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_quality_ncr_from_osd', {
      p_osd_case_id: osdCaseId,
      p_defect_type: defectType,
      p_description: description,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventorySupplierDockInviteService extends BaseService<InventorySupplierDockInviteRecord> { constructor() { super('inventory_supplier_dock_invites'); } }

class InventoryReceivingAnalyticsService {
  async dashboard(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from('inventory_receiving_dashboard').select('*').limit(100);
    if (error) throw new Error(error.message);
    return data || [];
  }
  async kpis(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from('inventory_receiving_kpis').select('*').limit(1);
    if (error) throw new Error(error.message);
    return data || [];
  }
  async osdReport(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from('inventory_receiving_osd_report').select('*').limit(100);
    if (error) throw new Error(error.message);
    return data || [];
  }
  async productivity(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from('inventory_receiving_productivity').select('*').limit(100);
    if (error) throw new Error(error.message);
    return data || [];
  }
}

export const inventoryAsnService = new InventoryAsnService();
export const inventoryDockAppointmentService = new InventoryDockAppointmentService();
export const inventoryReceivingSessionService = new InventoryReceivingSessionService();
export const inventoryReceivingLineService = new InventoryReceivingLineService();
export const inventoryOsdCaseService = new InventoryOsdCaseService();
export const inventoryQuarantineHoldService = new InventoryQuarantineHoldService();
export const inventoryPutawayTaskService = new InventoryPutawayTaskService();
export const inventoryCrossDockTaskService = new InventoryCrossDockTaskService();
export const inventoryReceivingScanService = new InventoryReceivingScanService();
export const inventoryLpnLabelPrintService = new InventoryLpnLabelPrintService();
export const inventoryInboundNotificationService = new InventoryInboundNotificationService();
export const inventoryReceivingAttachmentService = new InventoryReceivingAttachmentService();
export const inventoryQualityNcrCaseService = new InventoryQualityNcrCaseService();
export const inventorySupplierDockInviteService = new InventorySupplierDockInviteService();
export const inventoryReceivingAnalyticsService = new InventoryReceivingAnalyticsService();
