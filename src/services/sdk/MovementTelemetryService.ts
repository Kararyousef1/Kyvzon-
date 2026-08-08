/**
 * MovementTelemetryService — التتبع الحي وحالة الإشعارات المجدولة
 *
 * يقابل المايجريشن 0286.
 *
 * قبله كان جدول logistics_telemetry ميتاً: لا دالة تكتب إليه ولا view
 * يقرأه، وصفحة التتبع تعرض جدولاً بلا مصدر بيانات.
 */
import { BaseService } from './BaseService';

// ─── الأنواع ────────────────────────────────────────────────────

/**
 * حالة الاتصال — «خارج الاتصال» منفصلة عن «متوقف» عمداً:
 * انقطاع الشبكة في منطقة نائية ليس توقفاً، والخلط بينهما يولّد
 * إنذارات كاذبة تُفقد الثقة باللوحة.
 */
export type VehicleConnectionStatus = 'moving' | 'stopped' | 'offline' | 'no_data';

export const CONNECTION_STATUS_LABELS: Record<VehicleConnectionStatus, string> = {
  moving: 'في حركة',
  stopped: 'متوقفة',
  offline: 'خارج الاتصال',
  no_data: 'لا بيانات',
};

export interface LiveVehiclePosition {
  vehicle_id: string;
  vehicle_code: string;
  plate_number: string;
  vehicle_status: string;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  heading: number | null;
  recorded_at: string | null;
  dispatch_id: string | null;
  dispatch_code: string | null;
  driver_name_ar: string | null;
  connection_status: VehicleConnectionStatus;
  minutes_since_update: number | null;
}

/** نقطة في مسار رحلة — مخرجات get_dispatch_track (0287) */
export interface DispatchTrackPoint {
  seq: number;
  telemetry_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading: number | null;
  recorded_at: string;
  /** المسافة من النقطة السابقة بالكيلومتر */
  leg_km: number;
  cumulative_km: number;
  /** الفجوة الزمنية عن النقطة السابقة بالدقائق */
  gap_minutes: number;
  /** سرعة صفر لأكثر من 5 دقائق */
  is_stop: boolean;
}

/** ملخّص مسار رحلة — مخرجات get_dispatch_track_summary (0287) */
export interface DispatchTrackSummary {
  point_count: number;
  total_km: number;
  first_ping_at: string | null;
  last_ping_at: string | null;
  duration_min: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  stop_count: number;
  max_gap_minutes: number;
}

/** رحلة لها إشارات GPS مسجَّلة — من العرض logistics_trackable_dispatches */
export interface TrackableDispatch {
  dispatch_id: string;
  tenant_id: string;
  dispatch_code: string;
  status: string;
  dispatched_at: string | null;
  vehicle_code: string | null;
  plate_number: string | null;
  driver_name_ar: string | null;
  ping_count: number;
  first_ping_at: string | null;
  last_ping_at: string | null;
}

export type DispatchHealth = 'healthy' | 'stale' | 'not_running';

/** حالة ترحيل بيانات النظام القديم — من movement_legacy_migration_status (0292) */
export interface LegacyMigrationStatus {
  legacy_table: string;
  target_table: string;
  legacy_rows: number;
  migrated_rows: number;
  /** > 0 يعني صفوفاً في القديم بلا مقابل — انقسام بيانات قائم */
  pending_rows: number;
}

/** صحة المهام المجدولة — مخرجات movement_cron_health (0290) */
export type CronHealth = 'healthy' | 'stale' | 'failing' | 'stuck' | 'never_ran';

export const CRON_HEALTH_LABELS: Record<CronHealth, string> = {
  healthy: 'تعمل',
  stale: 'متأخرة',
  failing: 'فاشلة',
  stuck: 'معلَّقة',
  never_ran: 'لم تُشغَّل قط',
};

export interface CronJobHealth {
  job_name: string;
  label_ar: string;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  tenants_processed: number | null;
  rows_affected: number | null;
  error_message: string | null;
  health: CronHealth;
  hours_since_last: number | null;
}

export interface NotificationDispatchStatus {
  notification_kind: string;
  last_dispatch_date: string | null;
  days_since_last: number | null;
  dispatched_today: number;
  recipients_today: number | null;
  total_dispatched: number;
  dispatch_health: DispatchHealth;
}

export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  driver_license: 'رخص السائقين',
  vehicle_document: 'وثائق المركبات',
  permit_overdue: 'تصاريح متأخرة',
  trip_late: 'رحلات متأخرة',
  carrier_contract: 'عقود الناقلين',
};

export interface TelemetryRecord {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  dispatch_id: string | null;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading: number | null;
  recorded_at: string;
}

// ─── الخدمة ─────────────────────────────────────────────────────

class MovementTelemetryService extends BaseService<TelemetryRecord> {
  constructor() {
    super('logistics_telemetry');
  }

  /**
   * تسجيل موقع مركبة.
   * أخطاء: INVALID_LATITUDE · INVALID_LONGITUDE · INVALID_SPEED ·
   * VEHICLE_NOT_FOUND · COORDINATES_REQUIRED
   */
  async recordPosition(input: {
    vehicleId: string;
    latitude: number;
    longitude: number;
    speedKmh?: number;
    heading?: number;
    dispatchId?: string | null;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('record_vehicle_telemetry', {
      p_vehicle_id: input.vehicleId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_speed_kmh: input.speedKmh ?? 0,
      p_heading: input.heading ?? 0,
      p_dispatch_id: input.dispatchId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** آخر موقع معروف لكل مركبة + حالة الاتصال */
  async findLivePositions(): Promise<LiveVehiclePosition[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_live_vehicle_positions')
      .select('*')
      .order('vehicle_code', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LiveVehiclePosition[];
  }

  /** مسار رحلة محددة — قراءة خام من الجدول (بلا حسابات) */
  async findDispatchTrack(dispatchId: string, limit = 500): Promise<TelemetryRecord[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_telemetry')
      .select('*')
      .eq('dispatch_id', dispatchId)
      .order('recorded_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as TelemetryRecord[];
  }

  /**
   * مسار رحلة مُجمَّع للخريطة وإعادة التشغيل (0287).
   *
   * الفرق عن findDispatchTrack: المسافة التراكمية والفجوات الزمنية
   * ورصد التوقفات تُحسب في الخادم لا في المتصفح — منطق واحد لا
   * يتباعد بين شاشة وأخرى.
   */
  async getDispatchTrack(dispatchId: string, limit = 2000): Promise<DispatchTrackPoint[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('get_dispatch_track', {
      p_dispatch_id: dispatchId,
      p_limit: limit,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as DispatchTrackPoint[];
  }

  /** ملخّص الرحلة: المسافة والمدة والسرعات والتوقفات (0287) */
  async getDispatchTrackSummary(dispatchId: string): Promise<DispatchTrackSummary | null> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('get_dispatch_track_summary', {
      p_dispatch_id: dispatchId,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as DispatchTrackSummary | null;
    return row ?? null;
  }

  /** الرحلات التي سُجِّلت لها إشارات GPS — قائمة اختيار إعادة التشغيل */
  async findTrackableDispatches(): Promise<TrackableDispatch[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_trackable_dispatches')
      .select('*')
      .order('last_ping_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TrackableDispatch[];
  }

  /**
   * حالة الجدولة التلقائية — تكشف توقّف cron بصمت.
   *
   * ملاحظة: الإشعارات تُولَّد بواسطة Edge Function
   * `movement-daily-notifications` بصلاحية service_role. هذه الدالة
   * تقرأ أثر ذلك التشغيل فقط ولا تُشغّله.
   */
  async findDispatchStatus(): Promise<NotificationDispatchStatus[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('movement_notification_dispatch_status')
      .select('*');
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationDispatchStatus[];
  }

  /**
   * صحة المهام المجدولة عبر pg_cron (0290).
   *
   * تختلف عن findDispatchStatus: تلك تقيس **أثر** الإشعارات في
   * الجداول، وهذه تقيس تشغيل المهمة نفسها. مهمة لم تُجدوَل أصلاً
   * تظهر هنا never_ran، بينما تبدو هناك كأن «لا شيء يستحق الإشعار».
   */
  /**
   * حالة ترحيل بيانات الحركة القديمة (0292 + 0293).
   *
   * محفّزات 0293 تُزامن لحظياً، فالمتوقَّع pending_rows = 0 دائماً.
   * أي قيمة أكبر تعني أن محفّزاً عُطِّل أو أن صفوفاً كُتبت قبل تفعيله —
   * وكلاهما يستدعي تشغيل migrate_pending_legacy_movements().
   */
  async findLegacyMigrationStatus(): Promise<LegacyMigrationStatus[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('movement_legacy_migration_status')
      .select('*');
    if (error) throw new Error(error.message);
    return (data ?? []) as LegacyMigrationStatus[];
  }

  async findCronHealth(): Promise<CronJobHealth[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('movement_cron_health')
      .select('*')
      .order('job_name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CronJobHealth[];
  }
}

export const movementTelemetryService = new MovementTelemetryService();
