/**
 * MovementFoundationOperationsService — الأساس والناقلون والتكاليف والمسارات
 *
 * يقابل المايجريشن 0285. يغطّي الوحدات التي بقيت قراءة فقط:
 *   E00 المواقع والسياسات · L06 المسارات · L10 الناقلون · L11 التكاليف
 *
 * ملاحظة على التكاليف: total_cost و net_profit عمودان عاديان في
 * الجدول (لا GENERATED)، فكانا قابلين للكتابة يدوياً بقيمة لا تطابق
 * مكوّناتها. الحساب الآن حصري في الخادم — الواجهة لا تمرّرهما إطلاقاً.
 */
import { BaseService } from './BaseService';
import type {
  MovementLocationRecord,
  MovementPolicyRecord,
} from '../../shared/types/movement-foundation';

// ─── الأنواع ────────────────────────────────────────────────────

export type MovementLocationType =
  | 'gate' | 'warehouse' | 'office' | 'checkpoint' | 'parking' | 'hub' | 'client_site';

export type CarrierServiceType =
  | '3pl' | 'freight_forwarder' | 'courier' | 'owner_operator';

export const LOCATION_TYPE_LABELS: Record<MovementLocationType, string> = {
  gate: 'بوابة',
  warehouse: 'مستودع',
  office: 'مكتب',
  checkpoint: 'نقطة تفتيش',
  parking: 'موقف',
  hub: 'مركز تجميع',
  client_site: 'موقع عميل',
};

export const CARRIER_SERVICE_LABELS: Record<CarrierServiceType, string> = {
  '3pl': 'طرف ثالث 3PL',
  freight_forwarder: 'وسيط شحن',
  courier: 'بريد سريع',
  owner_operator: 'مالك ومشغّل',
};

/** نتيجة تخطيط المسار — تُعرض دائماً كـ «قبل ← بعد» */
/**
 * نتيجة تخطيط المسار — 0289 يُرجع طول كل مرحلة على حدة:
 *   naive_km     → بالترتيب المُدخَل (خط الأساس)
 *   nn_km        → بعد Nearest Neighbour
 *   two_opt_km   → بعد 2-opt
 *   optimized_km → بعد Or-opt بالتناوب مع 2-opt (النهائي)
 * الفروق تُحسب في الواجهة: رياضيات عرض لا منطق أعمال.
 */
export interface RoutePlanResult {
  route_id: string;
  ordered_count: number;
  naive_km: number;
  nn_km: number;
  two_opt_km: number;
  optimized_km: number;
  saved_km: number;
  duration_min: number;
}

/** محطة في مسار مخطَّط — عنصر من waypoints_json */
export interface RouteWaypoint {
  seq: number;
  location_id: string;
  name: string;
  code?: string;
  lat: number;
  lng: number;
  leg_km: number;
}

export interface TripCostResult {
  cost_id: string;
  total_cost: number;
  net_profit: number;
}

export interface ProfitabilityRow {
  cost_id: string;
  dispatch_code: string;
  order_code: string;
  vehicle_code: string;
  fuel_cost: number;
  toll_cost: number;
  driver_allowance: number;
  maintenance_share: number;
  total_cost: number;
  revenue: number;
  net_profit: number;
  cost_status: string;
  margin_percent: number | null;
  total_distance_km: number | null;
  cost_per_km: number | null;
  created_at: string;
}

export interface CarrierPerformanceRow {
  carrier_id: string;
  carrier_code: string;
  carrier_name_ar: string;
  service_type: CarrierServiceType;
  status: string;
  rating: number | null;
  contract_expiry: string | null;
  contract_status: 'no_contract' | 'expired' | 'expiring_soon' | 'valid';
  trips_count: number;
  total_spend: number;
  total_profit: number;
}

// ─── الخدمة ─────────────────────────────────────────────────────

class MovementFoundationOperationsService extends BaseService<MovementLocationRecord> {
  constructor() {
    super('movement_locations');
  }

  /**
   * إنشاء موقع. الإحداثيات تُلتقط من الخريطة — إما معاً أو لا شيء.
   * أخطاء: COORDINATES_MUST_BE_BOTH_OR_NEITHER · INVALID_LATITUDE ·
   * DUPLICATE_LOCATION_NAME · INVALID_LOCATION_TYPE
   */
  async createLocation(input: {
    nameAr: string;
    locationType?: MovementLocationType;
    nameEn?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    radiusMeters?: number;
    description?: string | null;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('create_movement_location', {
      p_name_ar: input.nameAr,
      p_location_type: input.locationType ?? 'checkpoint',
      p_name_en: input.nameEn ?? null,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_radius_meters: input.radiusMeters ?? 50,
      p_description: input.description ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** أرشفة لا حذف — سبب إلزامي · تُمنع إن كان الموقع في تصاريح نشطة */
  async archiveLocation(locationId: string, reason: string): Promise<void> {
    const { supabase } = await import('../supabase/supabase');
    const { error } = await supabase.rpc('archive_movement_location', {
      p_location_id: locationId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
  }

  /**
   * إنشاء أو تعديل سياسة. التعديل يتطلب سبباً لأنه يؤثر على كل
   * التصاريح القادمة.
   */
  async upsertPolicy(input: {
    titleAr: string;
    destinationType: string;
    maxDurationMinutes: number;
    requiresApproval?: boolean;
    autoNotifyOverdue?: boolean;
    policyId?: string | null;
    reason?: string | null;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('upsert_movement_policy', {
      p_title_ar: input.titleAr,
      p_destination_type: input.destinationType,
      p_max_duration_minutes: input.maxDurationMinutes,
      p_requires_approval: input.requiresApproval ?? false,
      p_auto_notify_overdue: input.autoNotifyOverdue ?? true,
      p_policy_id: input.policyId ?? null,
      p_reason: input.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** إنشاء ناقل — يرفض العقد المنتهي والبريد غير الصالح والاسم المكرَّر */
  async createCarrier(input: {
    carrierNameAr: string;
    serviceType?: CarrierServiceType;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    contractExpiry?: string | null;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('create_logistics_carrier', {
      p_carrier_name_ar: input.carrierNameAr,
      p_service_type: input.serviceType ?? '3pl',
      p_contact_person: input.contactPerson ?? null,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_contract_expiry: input.contractExpiry ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * تسجيل تكلفة رحلة. الإجمالي والربح يُحسبان في الخادم — لا تُمرَّر.
   * أخطاء: CANNOT_RECORD_COST_FOR_ACTIVE_DISPATCH · TRIP_COST_ALREADY_RECORDED
   */
  async recordTripCost(input: {
    dispatchId: string;
    fuelCost?: number;
    tollCost?: number;
    driverAllowance?: number;
    maintenanceShare?: number;
    revenue?: number;
    carrierId?: string | null;
  }): Promise<TripCostResult> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('record_trip_cost', {
      p_dispatch_id: input.dispatchId,
      p_fuel_cost: input.fuelCost ?? 0,
      p_toll_cost: input.tollCost ?? 0,
      p_driver_allowance: input.driverAllowance ?? 0,
      p_maintenance_share: input.maintenanceShare ?? 0,
      p_revenue: input.revenue ?? 0,
      p_carrier_id: input.carrierId ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as TripCostResult | null;
    return {
      cost_id: row?.cost_id ?? '',
      total_cost: Number(row?.total_cost ?? 0),
      net_profit: Number(row?.net_profit ?? 0),
    };
  }

  /**
   * تخطيط مسار محسَّن.
   *
   * ⚠️ الخوارزمية: Nearest Neighbour + Haversine — **حل تقريبي
   * (heuristic) لا أمثل**. OR-Tools لا تعمل داخل Postgres. النتيجة
   * تُعرض دائماً كمقارنة «قبل ← بعد» ليقرّر المستخدم.
   * الحد الأقصى 50 توقفاً.
   */
  async planRoute(input: {
    routeName: string;
    locationIds: string[];
    dispatchId?: string | null;
    avgSpeedKmh?: number;
  }): Promise<RoutePlanResult> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('plan_optimized_route', {
      p_route_name: input.routeName,
      p_location_ids: input.locationIds,
      p_dispatch_id: input.dispatchId ?? null,
      p_avg_speed_kmh: input.avgSpeedKmh ?? 45,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RoutePlanResult | null;
    return {
      route_id: row?.route_id ?? '',
      ordered_count: Number(row?.ordered_count ?? 0),
      naive_km: Number(row?.naive_km ?? 0),
      nn_km: Number(row?.nn_km ?? 0),
      two_opt_km: Number(row?.two_opt_km ?? 0),
      optimized_km: Number(row?.optimized_km ?? 0),
      saved_km: Number(row?.saved_km ?? 0),
      duration_min: Number(row?.duration_min ?? 0),
    };
  }

  /** المواقع النشطة التي تملك إحداثيات — صالحة لتخطيط المسار */
  async findRoutableLocations(): Promise<MovementLocationRecord[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('movement_locations')
      .select('*')
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('name_ar', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MovementLocationRecord[];
  }

  async findProfitability(): Promise<ProfitabilityRow[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_profitability')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProfitabilityRow[];
  }

  async findCarrierPerformance(): Promise<CarrierPerformanceRow[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_carrier_performance')
      .select('*')
      .order('carrier_code', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CarrierPerformanceRow[];
  }
}

export const movementFoundationOperationsService =
  new MovementFoundationOperationsService();

export type { MovementLocationRecord, MovementPolicyRecord };
