import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface InventoryItemRecord {
  id: string;
  tenant_id: string;
  item_code: string;
  name_ar: string;
  name_en?: string | null;
  item_type: string;
  category_id?: string | null;
  base_uom: string;
  tracking_policy: 'none' | 'lot' | 'serial' | 'expiry' | 'lot_expiry';
  status: 'active' | 'inactive' | 'archived';
  reorder_point?: number | null;
  reorder_qty?: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface InventoryWarehouseRecord {
  id: string;
  tenant_id: string;
  warehouse_code: string;
  name_ar: string;
  name_en?: string | null;
  warehouse_type: string;
  status: string;
  created_at: string;
}

export interface InventoryLocationRecord {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  zone_id?: string | null;
  parent_id?: string | null;
  location_code: string;
  location_type: string;
  status: string;
  barcode?: string | null;
  max_capacity?: number | null;
  current_capacity_used?: number | null;
  created_at: string;
}

export interface InventoryStockBalanceRecord {
  id: string;
  tenant_id: string;
  item_id: string;
  warehouse_id: string;
  location_id?: string | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  quality_hold_qty?: number | null;
  updated_at: string;
}

export interface InventoryStockMovementRecord {
  id: string;
  tenant_id: string;
  movement_number: string;
  movement_date: string;
  movement_type: string;
  item_id: string;
  warehouse_id: string;
  quantity: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason_code?: string | null;
}

export interface InventoryCodeSequenceRecord {
  id: string;
  tenant_id: string;
  entity_type: string;
  sequence_name: string;
  prefix: string;
  separator: string;
  padding: number;
  next_number: number;
  suffix: string;
  include_year: boolean;
  include_month: boolean;
  barcode_prefix?: string | null;
  barcode_type: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface InventoryBarcodeRecord {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  barcode_value: string;
  barcode_type: string;
  is_primary: boolean;
  created_at: string;
}

const INVENTORY_LOOKUPS = {
  inventory_items: { select: 'id,item_code,name_ar,base_uom,status', limit: 500 },
  inventory_warehouses: { select: 'id,warehouse_code,name_ar,warehouse_type,status', limit: 500 },
  inventory_locations: { select: 'id,warehouse_id,location_code,barcode,location_type,status', limit: 500 },
  inventory_docks: { select: 'id,dock_code,dock_type,status', limit: 500 },
  inventory_asns: { select: 'id,asn_number,status,expected_arrival_at', limit: 500 },
  inventory_receiving_sessions: { select: 'id,session_number,status,source_type', limit: 500 },
  inventory_rmas: { select: 'id,rma_number,status,reason_code', limit: 500 },
  inventory_rma_lines: { select: 'id,expected_qty,status', limit: 500 },
  suppliers: { select: 'id,supplier_code,legal_name,trade_name', limit: 500 },
  profiles: { select: 'id,email,full_name,role', limit: 500 },
  inventory_pick_orders: { select: 'id,pick_order_number,status,priority', limit: 500 },
  inventory_pick_tasks: { select: 'id,task_number,status,required_qty', limit: 500 },
  inventory_pick_waves: { select: 'id,wave_number,status,wave_type', limit: 500 },
  inventory_pick_lists: { select: 'id,pick_list_number,status,route_algorithm', limit: 500 },
  inventory_packages: { select: 'id,package_number,package_barcode,status', limit: 500 },
  inventory_shipments: { select: 'id,shipment_number,status,tracking_number', limit: 500 },
  inventory_loading_manifests: { select: 'id,manifest_number,status,truck_number', limit: 500 },
  inventory_carriers: { select: 'id,carrier_code,name_ar,provider', limit: 500 },
  inventory_cycle_count_plans: { select: 'id,plan_number,status,plan_type', limit: 500 },
  inventory_count_tasks: { select: 'id,task_number,status,count_round', limit: 500 },
  inventory_count_task_lines: { select: 'id,counted_qty,system_qty', limit: 500 },
  inventory_return_receipt_lines: { select: 'id,status,received_qty', limit: 500 },
  inventory_return_condition_assessments: { select: 'id,condition_grade,recommended_disposition,defect_type', limit: 500 },
  inventory_return_disposition_tasks: { select: 'id,task_number,disposition,status', limit: 500 },
  inventory_production_returns: { select: 'id,production_return_number,status,reason_code', limit: 500 },
  inventory_labor_dispatch_tasks: { select: 'id,task_number,task_type,status', limit: 500 },
  inventory_labor_task_interleaving_suggestions: { select: 'id,status,estimated_minutes_saved', limit: 500 },
  inventory_labor_incentive_programs: { select: 'id,program_name,status,period_start,period_end', limit: 500 },
  inventory_analytics_alerts: { select: 'id,title,severity,status', limit: 500 },
  inventory_periodic_report_runs: { select: 'id,report_number,report_type,delivery_status', limit: 500 },
} as const;

export type InventoryLookupKey = keyof typeof INVENTORY_LOOKUPS;
export type InventoryLookupRow = Record<string, unknown>;
export type InventoryMasterEntity = 'item' | 'warehouse' | 'location';
export type InventoryUnitKey = 'foundation' | 'receiving' | 'storage' | 'picking' | 'shipping' | 'counting' | 'returns' | 'labor' | 'analytics';
export type InventoryStatusTable =
  | 'inventory_asns'
  | 'inventory_dock_appointments'
  | 'inventory_receiving_sessions'
  | 'inventory_osd_cases'
  | 'inventory_quarantine_holds'
  | 'inventory_putaway_tasks'
  | 'inventory_cross_dock_tasks'
  | 'inventory_receiving_scans'
  | 'inventory_lpn_label_prints'
  | 'inventory_inbound_notifications'
  | 'inventory_receiving_attachments'
  | 'inventory_quality_ncr_cases'
  | 'inventory_pick_orders'
  | 'inventory_pick_exceptions'
  | 'inventory_shipments'
  | 'inventory_packages'
  | 'inventory_loading_manifests'
  | 'inventory_cycle_count_plans'
  | 'inventory_rmas'
  | 'inventory_return_rtv_claims'
  | 'inventory_production_returns'
  | 'inventory_periodic_report_runs'
  | 'inventory_analytics_alerts';

export class InventoryItemService extends BaseService<InventoryItemRecord> {
  constructor() { super('inventory_items'); }
  async createSmart(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_item_smart', {
      p_item_code: input.item_code || null,
      p_barcode: input.barcode || null,
      p_name_ar: input.name_ar,
      p_name_en: input.name_en || null,
      p_item_type: input.item_type || 'raw_material',
      p_category_id: input.category_id || null,
      p_base_uom: input.base_uom || 'PCS',
      p_tracking_policy: input.tracking_policy || 'none',
      p_reorder_point: input.reorder_point || 0,
      p_reorder_qty: input.reorder_qty || 0,
      p_barcode_type: input.barcode_type || 'code128',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventoryWarehouseService extends BaseService<InventoryWarehouseRecord> {
  constructor() { super('inventory_warehouses'); }
  async createSmart(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_warehouse_smart', {
      p_warehouse_code: input.warehouse_code || null,
      p_barcode: input.barcode || null,
      p_name_ar: input.name_ar,
      p_name_en: input.name_en || null,
      p_warehouse_type: input.warehouse_type || 'main',
      p_barcode_type: input.barcode_type || 'code128',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventoryLocationService extends BaseService<InventoryLocationRecord> {
  constructor() { super('inventory_locations'); }
  async createSmart(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('create_inventory_location_smart', {
      p_warehouse_id: input.warehouse_id,
      p_zone_id: input.zone_id || null,
      p_location_code: input.location_code || null,
      p_barcode: input.barcode || null,
      p_location_type: input.location_type || 'bin',
      p_max_capacity: input.max_capacity || null,
      p_current_capacity_used: input.current_capacity_used || 0,
      p_barcode_type: input.barcode_type || 'code128',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventoryStockBalanceService extends BaseService<InventoryStockBalanceRecord> { constructor() { super('inventory_stock_balances'); } }
export class InventoryStockMovementService extends BaseService<InventoryStockMovementRecord> { constructor() { super('inventory_stock_movements'); } }
export class InventoryCodeSequenceService extends BaseService<InventoryCodeSequenceRecord> {
  constructor() { super('inventory_code_sequences'); }
  async upsert(input: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_inventory_code_sequence', {
      p_entity_type: input.entity_type,
      p_sequence_name: input.sequence_name,
      p_prefix: input.prefix,
      p_separator: input.separator || '-',
      p_padding: Number(input.padding || 4),
      p_next_number: Number(input.next_number || 1),
      p_suffix: input.suffix || '',
      p_include_year: Boolean(input.include_year),
      p_include_month: Boolean(input.include_month),
      p_barcode_prefix: input.barcode_prefix || null,
      p_barcode_type: input.barcode_type || 'code128',
      p_is_default: input.is_default ?? true,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async preview(entityType: string, sequenceId?: string): Promise<string> {
    const { data, error } = await supabase.rpc('preview_inventory_next_code', { p_entity_type: entityType, p_sequence_id: sequenceId || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async generate(entityType: string, sequenceId?: string, manualCode?: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_inventory_next_code', { p_entity_type: entityType, p_sequence_id: sequenceId || null, p_manual_code: manualCode || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
  async barcode(entityType: string, code: string, sequenceId?: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_inventory_entity_barcode', { p_entity_type: entityType, p_entity_code: code, p_sequence_id: sequenceId || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
export class InventoryBarcodeService extends BaseService<InventoryBarcodeRecord> {
  constructor() { super('inventory_barcodes'); }
  async register(entityType: string, entityId: string, barcodeValue: string, barcodeType = 'code128'): Promise<string> {
    const { data, error } = await supabase.rpc('register_inventory_entity_barcode', { p_entity_type: entityType, p_entity_id: entityId, p_barcode_value: barcodeValue, p_barcode_type: barcodeType, p_is_primary: true });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class InventoryPostingService {
  async postMovement(input: {
    movement_type: string;
    item_id: string;
    warehouse_id: string;
    location_id?: string | null;
    quantity: number;
    reference_type?: string | null;
    reference_id?: string | null;
    reason_code?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('post_inventory_movement', {
      p_movement_type: input.movement_type,
      p_item_id: input.item_id,
      p_warehouse_id: input.warehouse_id,
      p_location_id: input.location_id || null,
      p_quantity: input.quantity,
      p_reference_type: input.reference_type || null,
      p_reference_id: input.reference_id || null,
      p_reason_code: input.reason_code || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class InventoryLookupService {
  async find(key: InventoryLookupKey): Promise<InventoryLookupRow[]> {
    const config = INVENTORY_LOOKUPS[key];
    const { data, error } = await supabase
      .from(key)
      .select(config.select)
      .limit(config.limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InventoryLookupRow[];
  }
}

class InventoryRecordService {
  async updateStatus(input: {
    table: InventoryStatusTable;
    id: string;
    status: string;
    reason: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('update_inventory_record_status', {
      p_entity_table: input.table,
      p_entity_id: input.id,
      p_new_status: input.status,
      p_reason: input.reason,
    });
    if (error) throw new Error(error.message);
  }

  async updateMaster(input: {
    entityType: InventoryMasterEntity;
    id: string;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('update_inventory_master_record', {
      p_entity_type: input.entityType,
      p_entity_id: input.id,
      p_patch: input.patch,
      p_reason: input.reason,
    });
    if (error) throw new Error(error.message);
  }

  async findUnitActivity(unit: InventoryUnitKey, limit = 8): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from('inventory_unit_activity')
      .select('*')
      .eq('unit_key', unit)
      .limit(Math.max(1, Math.min(limit, 50)));
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }
}

class InventoryAnalyticsService {
  async kpis(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from('inventory_kpis').select('*').limit(1);
    if (error) throw new Error(error.message);
    return data || [];
  }
  async reorderAlerts(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.from('inventory_reorder_alerts').select('*').limit(100);
    if (error) throw new Error(error.message);
    return data || [];
  }
}

export const inventoryItemService = new InventoryItemService();
export const inventoryWarehouseService = new InventoryWarehouseService();
export const inventoryLocationService = new InventoryLocationService();
export const inventoryStockBalanceService = new InventoryStockBalanceService();
export const inventoryStockMovementService = new InventoryStockMovementService();
export const inventoryCodeSequenceService = new InventoryCodeSequenceService();
export const inventoryBarcodeService = new InventoryBarcodeService();
export const inventoryPostingService = new InventoryPostingService();
export const inventoryLookupService = new InventoryLookupService();
export const inventoryRecordService = new InventoryRecordService();
export const inventoryAnalyticsService = new InventoryAnalyticsService();
