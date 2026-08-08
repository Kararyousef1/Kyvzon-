/**
 * MovementOperationsExtrasService — الجداول التي أُحييت في 0294
 *
 * لماذا خدمة واحدة لست وظائف متفرقة:
 *   كلها كانت جداول بلا كاتب، وكلها صغيرة (دالة أو دالتان). إنشاء ست
 *   خدمات منفصلة يعني ست ملفات بسطرين مفيدين لكل منها — ضجيج بلا فائدة.
 *   إن كبرت إحداها لاحقاً تُفصل حينها.
 *
 * التغطية:
 *   • field_visit_checkins        — تسجيل وصول ميداني بالسور الجغرافي
 *   • fleet_vehicle_documents     — وثائق المركبات (كان يُقرأ ولا يُكتب)
 *   • logistics_trip_stops        — محطات الرحلة
 *   • movement_permit_attachments — مرفقات التصاريح
 *   • logistics_carrier_rates     — تسعيرة الناقلين
 *   • logistics_kpi_snapshots     — لقطات المؤشرات (قراءة فقط هنا)
 */
import { supabase } from '../supabase/supabase';

/* ─── الأنواع ─────────────────────────────────────────────── */

export interface FieldVisitCheckinResult {
  checkin_id: string;
  /** false يعني تسجيلاً خارج السور الجغرافي المعتمد */
  geofence_ok: boolean;
  distance_km: number;
}

export interface FieldVisitCheckin {
  id: string;
  tenant_id: string;
  visit_id: string;
  latitude: number;
  longitude: number;
  geofence_ok: boolean;
  notes: string | null;
  created_at: string;
}

export interface VehicleDocument {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  doc_type: string;
  expiry_date: string;
  document_url: string | null;
  created_at: string;
}

export type StopType = 'pickup' | 'delivery' | 'depot' | 'fuel';
export type StopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

export const STOP_TYPE_LABELS: Record<StopType, string> = {
  pickup: 'استلام',
  delivery: 'تسليم',
  depot: 'مستودع',
  fuel: 'تزوّد وقود',
};

export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  pending: 'بانتظار',
  arrived: 'وصلت',
  completed: 'مكتملة',
  skipped: 'متجاوَزة',
};

export interface DispatchStop {
  stop_id: string;
  tenant_id: string;
  dispatch_id: string;
  dispatch_code: string | null;
  stop_sequence: number;
  stop_type: StopType;
  status: StopStatus;
  location_id: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  total_stops: number;
  completed_stops: number;
}

export interface PermitAttachment {
  id: string;
  tenant_id: string;
  permit_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

export interface CarrierRate {
  id: string;
  tenant_id: string;
  carrier_id: string;
  origin_zone: string | null;
  dest_zone: string | null;
  rate_amount: number;
  created_at: string;
}

export interface KpiSnapshot {
  id: string;
  tenant_id: string;
  snapshot_date: string;
  otif_percent: number;
  total_trips: number;
  avg_cost_per_km: number;
  created_at: string;
}

/** حد المرفق — يطابق الفحص في الخادم (0294) */
export const MAX_ATTACHMENT_BYTES = 26214400;

export class MovementOperationsExtrasService {
  /* ─── الزيارات الميدانية ─── */

  /**
   * تسجيل وصول ميداني.
   *
   * geofence_ok = false لا يمنع التسجيل — يوسمه فقط. المنع سيكون
   * قراراً إدارياً خاطئاً: قد يكون العميل انتقل، أو السور مضبوط خطأً.
   * التوثيق أفضل من الرفض.
   */
  async recordFieldVisitCheckin(input: {
    visitId: string;
    latitude: number;
    longitude: number;
    notes?: string | null;
  }): Promise<FieldVisitCheckinResult> {
    const { data, error } = await supabase.rpc('record_field_visit_checkin', {
      p_visit_id: input.visitId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as FieldVisitCheckinResult | null;
    return {
      checkin_id: row?.checkin_id ?? '',
      geofence_ok: Boolean(row?.geofence_ok),
      distance_km: Number(row?.distance_km ?? 0),
    };
  }

  async findVisitCheckins(visitId: string): Promise<FieldVisitCheckin[]> {
    const { data, error } = await supabase
      .from('field_visit_checkins')
      .select('*')
      .eq('visit_id', visitId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as FieldVisitCheckin[];
  }

  /* ─── وثائق المركبات ─── */

  async findVehicleDocuments(vehicleId?: string): Promise<VehicleDocument[]> {
    let q = supabase.from('fleet_vehicle_documents').select('*');
    if (vehicleId) q = q.eq('vehicle_id', vehicleId);
    const { data, error } = await q.order('expiry_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleDocument[];
  }

  /** إضافة أو تجديد — نوع واحد لكل مركبة، فالتجديد يُحدّث لا يُكرّر */
  async upsertVehicleDocument(input: {
    vehicleId: string;
    docType: string;
    expiryDate: string;
    documentUrl?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_vehicle_document', {
      p_vehicle_id: input.vehicleId,
      p_doc_type: input.docType,
      p_expiry_date: input.expiryDate,
      p_document_url: input.documentUrl ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /* ─── محطات الرحلة ─── */

  async findDispatchStops(dispatchId: string): Promise<DispatchStop[]> {
    const { data, error } = await supabase
      .from('logistics_dispatch_stops_view')
      .select('*')
      .eq('dispatch_id', dispatchId)
      .order('stop_sequence', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as DispatchStop[];
  }

  async addDispatchStop(input: {
    dispatchId: string;
    stopType: StopType;
    locationId?: string | null;
    sequence?: number | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('add_dispatch_stop', {
      p_dispatch_id: input.dispatchId,
      p_stop_type: input.stopType,
      p_location_id: input.locationId ?? null,
      p_sequence: input.sequence ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async updateStopStatus(stopId: string, status: StopStatus): Promise<void> {
    const { error } = await supabase.rpc('update_dispatch_stop_status', {
      p_stop_id: stopId,
      p_status: status,
    });
    if (error) throw new Error(error.message);
  }

  /* ─── مرفقات التصاريح ─── */

  async findPermitAttachments(permitId: string): Promise<PermitAttachment[]> {
    const { data, error } = await supabase
      .from('movement_permit_attachments')
      .select('*')
      .eq('permit_id', permitId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PermitAttachment[];
  }

  async addPermitAttachment(input: {
    permitId: string;
    fileName: string;
    fileUrl: string;
    fileSize?: number | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('add_permit_attachment', {
      p_permit_id: input.permitId,
      p_file_name: input.fileName,
      p_file_url: input.fileUrl,
      p_file_size: input.fileSize ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /* ─── تسعيرة الناقلين ─── */

  async findCarrierRates(carrierId?: string): Promise<CarrierRate[]> {
    let q = supabase.from('logistics_carrier_rates').select('*');
    if (carrierId) q = q.eq('carrier_id', carrierId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CarrierRate[];
  }

  async upsertCarrierRate(input: {
    carrierId: string;
    originZone: string;
    destZone: string;
    rateAmount: number;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_carrier_rate', {
      p_carrier_id: input.carrierId,
      p_origin_zone: input.originZone,
      p_dest_zone: input.destZone,
      p_rate_amount: input.rateAmount,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /* ─── لقطات المؤشرات ─── */

  /**
   * قراءة فقط: اللقطة تُكتب من مهمة مجدولة بصلاحية service_role،
   * لا من المتصفح. الواجهة تعرض الاتجاه التاريخي.
   */
  async findKpiSnapshots(days = 30): Promise<KpiSnapshot[]> {
    const from = new Date();
    from.setDate(from.getDate() - days);
    const { data, error } = await supabase
      .from('logistics_kpi_snapshots')
      .select('*')
      .gte('snapshot_date', from.toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as KpiSnapshot[];
  }
}

export const movementOperationsExtrasService = new MovementOperationsExtrasService();
