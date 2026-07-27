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
export const inventoryAnalyticsService = new InventoryAnalyticsService();
