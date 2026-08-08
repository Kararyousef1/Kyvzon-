/**
 * DriverAppService — طبقة تطبيق السائق (0291)
 *
 * لماذا خدمة منفصلة عن LogisticsDispatchOperationsService:
 *   دوال المُرسِل تتطلب دور logistics (رؤية الأسطول كاملاً). دوال
 *   السائق تعمل على رحلاته وحدها بلا أي دور خاص. خلطهما في خدمة
 *   واحدة يُغري باستدعاء دالة مكتبية من شاشة السائق.
 *
 * الوضع دون اتصال:
 *   السائق يعمل في مناطق تغطية ضعيفة. النقاط تُخزَّن في localStorage
 *   وتُرفع دفعةً عند عودة الشبكة عبر record_driver_position_batch.
 *   السبب في localStorage لا IndexedDB: الحجم صغير (نقطة ≈ 60 بايت،
 *   والسقف 500 نقطة ≈ 30 KB) وواجهته متزامنة تعمل داخل مستمع
 *   'beforeunload' حيث تفشل العمليات غير المتزامنة.
 */
import { supabase } from '../supabase/supabase';

/* ─── الأنواع ─────────────────────────────────────────────── */

export type DriverTripStatus =
  | 'dispatched' | 'en_route' | 'arrived' | 'completed' | 'failed';

export const TRIP_STATUS_LABELS: Record<string, string> = {
  dispatched: 'بانتظار الانطلاق',
  en_route: 'في الطريق',
  arrived: 'وصلت الوجهة',
  completed: 'مكتملة',
  failed: 'متعثّرة',
};

export type EpodStatus = 'delivered' | 'partially_delivered' | 'rejected' | 'disputed';

export const EPOD_STATUS_LABELS: Record<EpodStatus, string> = {
  delivered: 'سُلّمت كاملة',
  partially_delivered: 'سُلّمت جزئياً',
  rejected: 'رفض المستلم',
  disputed: 'نزاع على التسليم',
};

export interface DriverTrip {
  dispatch_id: string;
  dispatch_code: string;
  status: DriverTripStatus;
  dispatched_at: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  order_id: string | null;
  order_code: string | null;
  origin_address: string | null;
  destination_address: string | null;
  cargo_description: string | null;
  cargo_weight_kg: number | null;
  priority: string | null;
  vehicle_id: string | null;
  vehicle_code: string | null;
  plate_number: string | null;
  has_epod: boolean;
  last_ping_at: string | null;
}

export interface DriverSummary {
  driver_id: string;
  driver_name_ar: string;
  license_expiry_date: string;
  license_days_left: number;
  safety_score: number | null;
  active_trips: number;
  completed_today: number;
  km_today: number;
}

/** نقطة محفوظة محلياً بانتظار الرفع */
export interface QueuedPoint {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  at: string;
}

export interface BatchResult {
  accepted: number;
  rejected: number;
}

/* ─── الامتثال الذاتي (0297) ──────────────────────────────── */

export type DutyStatus = 'off_duty' | 'sleeper' | 'driving' | 'on_duty';

export const DRIVER_DUTY_LABELS: Record<DutyStatus, string> = {
  off_duty: 'خارج الخدمة',
  sleeper: 'راحة',
  driving: 'قيادة',
  on_duty: 'على رأس العمل',
};

/** ساعات السائق + المتبقّي — من get_my_hos_summary */
export interface MyHosSummary {
  driving_minutes_today: number;
  on_duty_minutes_today: number;
  driving_minutes_8days: number;
  last_rest_minutes: number;
  open_period_status: DutyStatus | null;
  open_period_minutes: number;
  driving_limit_exceeded: boolean;
  duty_limit_exceeded: boolean;
  cycle_limit_exceeded: boolean;
  rest_insufficient: boolean;
  /** ما تبقّى قبل حد الـ 11 ساعة */
  driving_minutes_left: number;
  duty_minutes_left: number;
}

export type DefectSeverity = 'minor' | 'major' | 'critical';
export type InspectionType = 'pre_trip' | 'post_trip' | 'periodic';

export interface DriverDefect {
  code: string;
  severity: DefectSeverity;
  note?: string;
}

export interface DriverInspectionResult {
  inspection_id: string;
  has_critical: boolean;
  vehicle_grounded: boolean;
}

/* ─── طابور العمليات دون اتصال (0298) ────────────────────── */

export type OfflineOpType = 'inspection' | 'trip_status' | 'delivery_proof';

/**
 * عملية مؤجَّلة.
 *
 * performed_at هو **وقت التنفيذ على الجهاز** لا وقت الرفع — الخادم
 * يرتّب الدفعة به، وبدونه ينهار التسلسل (الإكمال قبل التسليم مثلاً).
 */
export interface QueuedOperation {
  client_uuid: string;
  operation_type: OfflineOpType;
  dispatch_id: string;
  performed_at: string;
  /* حقول الفحص */
  inspection_type?: InspectionType;
  defects?: DriverDefect[];
  odometer_km?: number | null;
  signature_name?: string | null;
  /* حقول الحالة */
  trip_status?: 'en_route' | 'arrived' | 'completed';
  /* حقول التسليم */
  recipient_name?: string;
  epod_status?: EpodStatus;
  signature_url?: string | null;
  photo_url?: string | null;
  notes?: string | null;
}

export interface SyncOpResult {
  out_client_uuid: string | null;
  out_operation_type: string | null;
  out_status: 'applied' | 'duplicate' | 'failed';
  out_result_id: string | null;
  out_error_message: string | null;
}

export interface DriverInspectionRow {
  inspection_id: string;
  inspection_type: InspectionType;
  defect_count: number;
  has_critical: boolean;
  odometer_km: number | null;
  inspected_at: string;
  notes: string | null;
}

const QUEUE_KEY = 'kyvzon.driver.queue.v1';
/** طابور العمليات (فحص · حالة · تسليم) — منفصل عن طابور المواقع */
const OPS_KEY = 'kyvzon.driver.ops.v1';
/** يطابق سقف sync_driver_offline_batch */
const MAX_OPS = 100;
/** يطابق سقف الخادم في record_driver_position_batch */
const MAX_QUEUE = 500;

/* ─── طابور دون اتصال ─────────────────────────────────────── */

interface QueueShape {
  [dispatchId: string]: QueuedPoint[];
}

function readQueue(): QueueShape {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // تخزين تالف يجب ألا يُعطّل التطبيق
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as QueueShape;
  } catch {
    return {};
  }
}

function writeQueue(q: QueueShape): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* امتلأت الحصّة — الرفع سيُنظّف الطابور لاحقاً */
  }
}

export class DriverAppService {
  /* ─── القراءة ─── */

  /**
   * هل المستخدم الحالي سائق نشط؟
   *
   * تستدعي is_current_user_driver() (0301) وهي نظير هادئ لـ
   * movement_require_driver: تعيد BOOLEAN بدل رفع NOT_A_DRIVER.
   * السائق الموقوف (status='suspended') يعيد false.
   */
  async isDriver(): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_current_user_driver');
    if (error) return false;
    return data === true;
  }

  async findMyTrips(includeClosed = false): Promise<DriverTrip[]> {
    const { data, error } = await supabase.rpc('get_my_driver_trips', {
      p_include_closed: includeClosed,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as DriverTrip[];
  }

  async getMySummary(): Promise<DriverSummary | null> {
    const { data, error } = await supabase.rpc('get_my_driver_summary');
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as DriverSummary | null;
    return row ?? null;
  }

  /* ─── الكتابة ─── */

  async recordPosition(input: {
    dispatchId: string;
    latitude: number;
    longitude: number;
    speedKmh?: number;
    heading?: number;
    recordedAt?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('record_driver_position', {
      p_dispatch_id: input.dispatchId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_speed_kmh: input.speedKmh ?? 0,
      p_heading: input.heading ?? 0,
      p_recorded_at: input.recordedAt ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async recordPositionBatch(dispatchId: string, points: QueuedPoint[]): Promise<BatchResult> {
    const { data, error } = await supabase.rpc('record_driver_position_batch', {
      p_dispatch_id: dispatchId,
      p_points: points,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as BatchResult | null;
    return { accepted: Number(row?.accepted ?? 0), rejected: Number(row?.rejected ?? 0) };
  }

  /** السائق يملك en_route · arrived · completed فقط — لا failed */
  async updateTripStatus(dispatchId: string, status: 'en_route' | 'arrived' | 'completed'): Promise<void> {
    const { error } = await supabase.rpc('update_my_trip_status', {
      p_dispatch_id: dispatchId,
      p_status: status,
    });
    if (error) throw new Error(error.message);
  }

  /**
   * إثبات تسليم **idempotent** (0294).
   *
   * clientUuid يُولَّد مرة واحدة قبل أول إرسال ويُعاد استعماله في كل
   * محاولة. السيناريو الذي يحمينا منه: الطلب يصل الخادم ويُنشئ صفاً،
   * لكن الرد يضيع في تغطية ضعيفة — التطبيق يرى فشلاً فيعيد المحاولة.
   * بلا هذا المعرّف ينتج **صفّان لنفس التسليم**.
   *
   * الخادم يُرجع معرّف الصف الأصلي عند التكرار، فالسائق يرى نجاحاً
   * لا خطأً عن عمل أنجزه فعلاً.
   */
  async recordDeliveryProof(input: {
    dispatchId: string;
    recipientName: string;
    status?: EpodStatus;
    signatureUrl?: string | null;
    photoUrl?: string | null;
    notes?: string | null;
    clientUuid?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('record_my_delivery_proof', {
      p_dispatch_id: input.dispatchId,
      p_recipient_name: input.recipientName,
      p_status: input.status ?? 'delivered',
      p_signature_url: input.signatureUrl ?? null,
      p_photo_url: input.photoUrl ?? null,
      p_notes: input.notes ?? null,
      p_client_uuid: input.clientUuid ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * معرّف عملية ثابت لكل رحلة — أساس الـ idempotency.
   *
   * يُخزَّن محلياً لأن إعادة تحميل الصفحة (أو إغلاق التطبيق أثناء
   * انقطاع الشبكة) تُفقد حالة React. بلا الثبات عبر الجلسات يولّد
   * التطبيق معرّفاً جديداً فيسقط الغرض كله.
   *
   * crypto.randomUUID غير متاح على HTTP أو متصفحات قديمة — لذا بديل.
   */
  getOrCreateEpodClientUuid(dispatchId: string): string {
    const key = `kyvzon.epod.cuid.${dispatchId}`;
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
    } catch { /* التخزين محظور — نولّد بلا حفظ */ }

    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });

    try { localStorage.setItem(key, uuid); } catch { /* تجاهل */ }
    return uuid;
  }

  /** يُنظَّف بعد نجاح التسليم — لا داعي لإبقائه */
  clearEpodClientUuid(dispatchId: string): void {
    try { localStorage.removeItem(`kyvzon.epod.cuid.${dispatchId}`); } catch { /* تجاهل */ }
  }

  /** ربط/فك ربط حساب سائق — عملية إدارية بدور logistics */
  async linkDriverAccount(driverId: string, userId: string | null): Promise<void> {
    const { error } = await supabase.rpc('link_driver_account', {
      p_driver_id: driverId,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);
  }

  /* ─── الامتثال الذاتي (0297) ─── */

  /**
   * ساعات السائق.
   *
   * تُحتسب الفترة المفتوحة حتى اللحظة — السائق الذي يقود الآن يرى
   * رصيده يتناقص، ولا ينتظر إغلاق السجل.
   */
  async getMyHosSummary(): Promise<MyHosSummary | null> {
    const { data, error } = await supabase.rpc('get_my_hos_summary');
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as MyHosSummary | null;
  }

  /**
   * بدء فترة خدمة.
   *
   * ⚠️ القيادة **تُرفض** بعد تجاوز الحد (يرفع الخادم
   * HOS_DRIVING_LIMIT_REACHED). الراحة وخروج الخدمة مسموحان دائماً —
   * وإلا عَلِق السائق في حالة قيادة مفتوحة تتضخّم بلا نهاية.
   */
  async startMyDutyPeriod(input: {
    dutyStatus: DutyStatus;
    dispatchId?: string | null;
    notes?: string | null;
  }): Promise<{ logId: string; warning: string | null; minutesLeft: number }> {
    const { data, error } = await supabase.rpc('start_my_duty_period', {
      p_duty_status: input.dutyStatus,
      p_dispatch_id: input.dispatchId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      { log_id: string; hos_warning: string | null; minutes_left: number } | null;
    return {
      logId: row?.log_id ?? '',
      warning: row?.hos_warning ?? null,
      minutesLeft: Number(row?.minutes_left ?? 0),
    };
  }

  async endMyDutyPeriod(notes?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('end_my_duty_period', {
      p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }

  /**
   * فحص المركبة (DVIR) من التطبيق.
   *
   * السائق يفحص **مركبة رحلته فقط**. العيب الحرج يوقف المركبة، لكنه
   * لا يستطيع رفع الإيقاف بنفسه — تضارب مصالح صريح.
   */
  async recordMyInspection(input: {
    dispatchId: string;
    inspectionType: InspectionType;
    defects?: DriverDefect[];
    odometerKm?: number | null;
    signatureName?: string | null;
    notes?: string | null;
    clientUuid?: string | null;
    performedAt?: string | null;
  }): Promise<DriverInspectionResult> {
    const { data, error } = await supabase.rpc('record_my_vehicle_inspection', {
      p_dispatch_id: input.dispatchId,
      p_inspection_type: input.inspectionType,
      p_defects: input.defects ?? [],
      p_odometer_km: input.odometerKm ?? null,
      p_signature_name: input.signatureName ?? null,
      p_notes: input.notes ?? null,
      p_client_uuid: input.clientUuid ?? null,
      p_performed_at: input.performedAt ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as DriverInspectionResult | null;
    return {
      inspection_id: row?.inspection_id ?? '',
      has_critical: Boolean(row?.has_critical),
      vehicle_grounded: Boolean(row?.vehicle_grounded),
    };
  }

  async findMyInspections(dispatchId: string): Promise<DriverInspectionRow[]> {
    const { data, error } = await supabase.rpc('get_my_vehicle_inspections', {
      p_dispatch_id: dispatchId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as DriverInspectionRow[];
  }

  /* ─── طابور العمليات دون اتصال (0298) ─── */

  /**
   * يُدرج عملية في الطابور.
   *
   * الأقدم يُسقَط عند بلوغ السقف — لكن على عكس نقاط الموقع، فقدان
   * عملية هنا يعني فقدان **عمل ميداني**. السقف مرتفع (100) والرفع
   * يجري عند أول اتصال، فالسقوط استثناء نادر.
   */
  queueOperation(op: QueuedOperation): number {
    const list = this.readOps();
    // لا نُكرّر عملية بنفس المعرّف في الطابور
    if (list.some((o) => o.client_uuid === op.client_uuid)) return list.length;
    list.push(op);
    const trimmed = list.length > MAX_OPS ? list.slice(list.length - MAX_OPS) : list;
    this.writeOps(trimmed);
    return trimmed.length;
  }

  queuedOperationsCount(): number {
    return this.readOps().length;
  }

  clearOperations(): void {
    try { localStorage.removeItem(OPS_KEY); } catch { /* تجاهل */ }
  }

  /**
   * يرفع العمليات المؤجَّلة دفعةً واحدة.
   *
   * الخادم يرتّبها زمنياً — فالإرسال بأي ترتيب آمن. العمليات التي
   * نجحت أو كانت مكرَّرة تُزال من الطابور؛ الفاشلة **تبقى** للمحاولة
   * التالية إلا إن كان الفشل دائماً (بيانات فاسدة) فتُزال بعد إبلاغ
   * المتصل — وإلا علقت للأبد.
   */
  async syncOperations(): Promise<{
    applied: number; duplicate: number; failed: number; errors: string[];
  }> {
    const list = this.readOps();
    if (list.length === 0) return { applied: 0, duplicate: 0, failed: 0, errors: [] };

    const { data, error } = await supabase.rpc('sync_driver_offline_batch', {
      p_operations: list,
    });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as SyncOpResult[];
    const done = new Set(
      rows.filter((r) => r.out_status !== 'failed')
          .map((r) => r.out_client_uuid ?? ''),
    );
    /*
      فشل دائم: بيانات لن تنجح مهما أُعيدت (معرّف ناقص · نوع مجهول ·
      زمن خارج المدى). إبقاؤها يعني طابوراً لا يفرغ أبداً.
    */
    const permanent = new Set(
      rows.filter((r) =>
        r.out_status === 'failed' &&
        /CLIENT_UUID_REQUIRED|UNKNOWN_OPERATION_TYPE|PERFORMED_AT_(IN_FUTURE|TOO_OLD)|INVALID_/.test(
          r.out_error_message ?? '',
        ),
      ).map((r) => r.out_client_uuid ?? ''),
    );

    this.writeOps(
      list.filter((o) => !done.has(o.client_uuid) && !permanent.has(o.client_uuid)),
    );

    return {
      applied: rows.filter((r) => r.out_status === 'applied').length,
      duplicate: rows.filter((r) => r.out_status === 'duplicate').length,
      failed: rows.filter((r) => r.out_status === 'failed').length,
      errors: rows
        .filter((r) => r.out_status === 'failed' && r.out_error_message)
        .map((r) => r.out_error_message as string),
    };
  }

  private readOps(): QueuedOperation[] {
    try {
      const raw = localStorage.getItem(OPS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QueuedOperation[]) : [];
    } catch {
      return [];
    }
  }

  private writeOps(list: QueuedOperation[]): void {
    try { localStorage.setItem(OPS_KEY, JSON.stringify(list)); } catch { /* تجاهل */ }
  }

  /** معرّف عملية جديد — نفس مولّد ePOD */
  newOperationId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  }

  /* ─── الطابور المحلي ─── */

  /** يُخزّن نقطة محلياً عند تعذّر الرفع. يُسقط الأقدم عند بلوغ السقف. */
  queuePoint(dispatchId: string, point: QueuedPoint): number {
    const q = readQueue();
    const list = q[dispatchId] ?? [];
    list.push(point);
    // الأحدث أهم للتتبع الحي — نُسقط الأقدم لا الأحدث
    q[dispatchId] = list.length > MAX_QUEUE ? list.slice(list.length - MAX_QUEUE) : list;
    writeQueue(q);
    return q[dispatchId].length;
  }

  queuedCount(dispatchId?: string): number {
    const q = readQueue();
    if (dispatchId) return (q[dispatchId] ?? []).length;
    return Object.values(q).reduce((sum, list) => sum + list.length, 0);
  }

  clearQueue(dispatchId?: string): void {
    if (!dispatchId) {
      try { localStorage.removeItem(QUEUE_KEY); } catch { /* تجاهل */ }
      return;
    }
    const q = readQueue();
    delete q[dispatchId];
    writeQueue(q);
  }

  /**
   * يرفع كل النقاط المؤجَّلة.
   *
   * الطابور يُمسح **فقط** بعد نجاح الرفع لتلك الرحلة — فشل الشبكة
   * يجب ألا يفقد البيانات. رحلة تفشل لا تمنع رفع البواقي.
   */
  async flushQueue(): Promise<{ accepted: number; rejected: number; failedDispatches: string[] }> {
    const q = readQueue();
    let accepted = 0;
    let rejected = 0;
    const failed: string[] = [];

    for (const [dispatchId, points] of Object.entries(q)) {
      if (!points || points.length === 0) {
        delete q[dispatchId];
        continue;
      }
      try {
        const res = await this.recordPositionBatch(dispatchId, points);
        accepted += res.accepted;
        rejected += res.rejected;
        delete q[dispatchId];
      } catch {
        // نُبقي نقاط هذه الرحلة للمحاولة التالية
        failed.push(dispatchId);
      }
    }

    writeQueue(q);
    return { accepted, rejected, failedDispatches: failed };
  }
}

export const driverAppService = new DriverAppService();
