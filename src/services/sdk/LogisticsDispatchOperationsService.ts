/**
 * LogisticsDispatchOperationsService — دورة الإرسال والتسليم والوقود
 *
 * ─────────────────────────────────────────────────────────────────────────
 * يقابل المايجريشن 0284. كل عملية عبر RPC لأن قواعد الأعمال يجب أن
 * تُفرَض في قاعدة البيانات:
 *   • منع إرسال أمر مرسَل أصلاً
 *   • منع إسناد مركبة/سائق في رحلة نشطة
 *   • منع تحميل يتجاوز سعة المركبة
 *   • آلة حالات صارمة: dispatched → en_route → arrived → completed
 *   • منع ePOD قبل الوصول
 *   • كشف احتيال الوقود بأربعة أعلام
 */
import { BaseService } from './BaseService';

// ─── الأنواع ────────────────────────────────────────────────────

export type OrderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type OrderStatus =
  | 'draft' | 'scheduled' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';
export type DispatchStatus =
  | 'dispatched' | 'en_route' | 'arrived' | 'completed' | 'failed';
export type EpodStatus =
  | 'delivered' | 'partially_delivered' | 'rejected' | 'disputed';

/** أعلام كشف احتيال الوقود التي يُرجعها log_fuel_transaction */
export type FuelFlag =
  | 'RAPID_REFUEL'
  | 'ABNORMAL_CONSUMPTION'
  | 'EXCESSIVE_QUANTITY'
  | 'NO_DISTANCE_SINCE_LAST_REFUEL'
  | 'FUEL_FOR_ELECTRIC_VEHICLE';

export const FUEL_FLAG_LABELS: Record<FuelFlag, string> = {
  RAPID_REFUEL: 'تزوّدان خلال ساعة',
  ABNORMAL_CONSUMPTION: 'استهلاك شاذ مقارنةً بالمسافة',
  EXCESSIVE_QUANTITY: 'كمية مفرطة',
  NO_DISTANCE_SINCE_LAST_REFUEL: 'لا مسافة مقطوعة منذ آخر تزوّد',
  FUEL_FOR_ELECTRIC_VEHICLE: 'وقود لمركبة كهربائية',
};

export interface ShipmentOrderRecord {
  id: string;
  tenant_id: string;
  order_code: string;
  origin_address: string;
  destination_address: string;
  cargo_description: string;
  cargo_weight_kg: number;
  cargo_volume_cbm: number;
  priority: OrderPriority;
  status: OrderStatus;
  scheduled_departure?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DispatchBoardRow {
  dispatch_id: string;
  dispatch_code: string;
  dispatch_status: DispatchStatus;
  dispatched_at: string;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  order_id: string;
  order_code: string;
  origin_address: string;
  destination_address: string;
  cargo_description: string;
  cargo_weight_kg: number;
  priority: OrderPriority;
  vehicle_id: string;
  vehicle_code: string;
  plate_number: string;
  driver_id: string;
  driver_name_ar: string;
  driver_phone: string | null;
  has_epod: boolean;
  epod_status: EpodStatus | null;
  is_overdue: boolean;
  minutes_late: number | null;
}

export interface FuelEfficiencyRow {
  vehicle_id: string;
  vehicle_code: string;
  plate_number: string;
  fuel_type: string;
  refuel_count: number;
  total_liters: number;
  total_cost: number;
  distance_covered_km: number | null;
  liters_per_100km: number | null;
  flagged_transactions: number;
}

export interface CreateOrderInput {
  originAddress: string;
  destinationAddress: string;
  cargoDescription: string;
  cargoWeightKg?: number;
  cargoVolumeCbm?: number;
  priority?: OrderPriority;
  scheduledDeparture?: string | null;
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  notes?: string | null;
}

// ─── الخدمة ─────────────────────────────────────────────────────

class LogisticsDispatchOperationsService extends BaseService<ShipmentOrderRecord> {
  constructor() {
    super('logistics_shipment_orders');
  }

  /**
   * إنشاء أمر نقل.
   * أخطاء: ORIGIN_ADDRESS_REQUIRED · CARGO_DESCRIPTION_REQUIRED ·
   * INVALID_PRIORITY · ORIGIN_AND_DESTINATION_IDENTICAL
   */
  async createOrder(input: CreateOrderInput): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('create_shipment_order', {
      p_origin_address: input.originAddress,
      p_destination_address: input.destinationAddress,
      p_cargo_description: input.cargoDescription,
      p_cargo_weight_kg: input.cargoWeightKg ?? 0,
      p_cargo_volume_cbm: input.cargoVolumeCbm ?? 0,
      p_priority: input.priority ?? 'normal',
      p_scheduled_departure: input.scheduledDeparture ?? null,
      p_origin_location_id: input.originLocationId ?? null,
      p_destination_location_id: input.destinationLocationId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * ★ إرسال أمر — يفحص الأهلية والسعة والتعارض.
   * أخطاء: ORDER_ALREADY_DISPATCHED · VEHICLE_ALREADY_ON_ACTIVE_DISPATCH ·
   * DRIVER_ALREADY_ON_ACTIVE_DISPATCH · CARGO_EXCEEDS_VEHICLE_WEIGHT ·
   * ASSIGNMENT_BLOCKED (رخصة/وثيقة منتهية · صيانة مفتوحة)
   */
  async dispatchOrder(input: {
    orderId: string;
    vehicleId: string;
    driverId: string;
    estimatedArrival?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('dispatch_shipment_order', {
      p_order_id: input.orderId,
      p_vehicle_id: input.vehicleId,
      p_driver_id: input.driverId,
      p_estimated_arrival: input.estimatedArrival ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * تحديث حالة الإرسال. الانتقالات المشروعة فقط:
   *   dispatched → en_route → arrived → completed
   *   أي حالة نشطة → failed (بسبب إلزامي)
   */
  async updateDispatchStatus(
    dispatchId: string,
    status: DispatchStatus,
    reason?: string,
  ): Promise<void> {
    const { supabase } = await import('../supabase/supabase');
    const { error } = await supabase.rpc('update_dispatch_status', {
      p_dispatch_id: dispatchId,
      p_status: status,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /**
   * تسجيل إثبات التسليم. التسليم الناجح يُغلق الإرسال تلقائياً.
   * أخطاء: CANNOT_RECORD_EPOD_BEFORE_ARRIVAL · EPOD_ALREADY_RECORDED
   */
  async recordDeliveryProof(input: {
    dispatchId: string;
    recipientName: string;
    status?: EpodStatus;
    signatureUrl?: string | null;
    photoProofUrl?: string | null;
    deliveryNotes?: string | null;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('record_delivery_proof', {
      p_dispatch_id: input.dispatchId,
      p_recipient_name: input.recipientName,
      p_status: input.status ?? 'delivered',
      p_signature_url: input.signatureUrl ?? null,
      p_photo_proof_url: input.photoProofUrl ?? null,
      p_delivery_notes: input.deliveryNotes ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * تسجيل تزوّد وقود. يُرجع الأعلام المرصودة (قد تكون فارغة).
   * يرفض: ODOMETER_CANNOT_DECREASE · INVALID_LITERS
   */
  async logFuel(input: {
    vehicleId: string;
    liters: number;
    cost: number;
    odometerReading: number;
    driverId?: string | null;
    stationName?: string | null;
    notes?: string | null;
  }): Promise<{ fuelLogId: string; flags: FuelFlag[] }> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('log_fuel_transaction', {
      p_vehicle_id: input.vehicleId,
      p_liters: input.liters,
      p_cost: input.cost,
      p_odometer_reading: input.odometerReading,
      p_driver_id: input.driverId ?? null,
      p_station_name: input.stationName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { fuel_log_id: string; flags: FuelFlag[] }
      | null;
    return {
      fuelLogId: row?.fuel_log_id ?? '',
      flags: row?.flags ?? [],
    };
  }

  /** لوحة الإرسال — الرحلات مع سياقها الكامل وحالة التأخر */
  async findDispatchBoard(): Promise<DispatchBoardRow[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_dispatch_board')
      .select('*')
      .order('dispatched_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DispatchBoardRow[];
  }

  /** كفاءة الوقود لكل مركبة + عدد المعاملات المُعلَّمة */
  async findFuelEfficiency(): Promise<FuelEfficiencyRow[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_fuel_efficiency')
      .select('*')
      .order('vehicle_code', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as FuelEfficiencyRow[];
  }

  /** الأوامر القابلة للإرسال (مسودة أو مجدولة) */
  async findDispatchableOrders(): Promise<ShipmentOrderRecord[]> {
    return this.findWhere(
      [{ column: 'status', operator: 'in', value: ['draft', 'scheduled'] }],
      { orderBy: 'created_at', ascending: false },
    );
  }
}

export const logisticsDispatchOperationsService =
  new LogisticsDispatchOperationsService();
