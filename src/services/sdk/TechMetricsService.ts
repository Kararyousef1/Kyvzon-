/**
 * ════════════════════════════════════════════════════════════════════════
 *  TechMetricsService — قياسات بوابة التقنية الحقيقية
 *
 *  ═══ الفجوة التي تسدّها (كلها مُقاسة على Postgres) ═══════════════════
 *
 *  ① ★ الرسم الساعي للبصمات كان **مُختلَقاً**.
 *     `TechDashboard.tsx:250`:
 *        const avg = Math.floor(logs2 / 12);
 *        punchBuckets[i] = avg + Math.floor(Math.random() * 3);
 *
 *     مقيس بتوزيع واقعي (ذروة 20 بصمة في ساعة واحدة):
 *        الحقيقة : الساعة 10 ⇒ 20 · بقية الساعات ⇒ 0
 *        المعروض : 12 عموداً بقيمة ~1
 *     ⇒ الذروة تختفي. مسؤول التقنية لا يكتشف ازدحام البوابة.
 *
 *  ② ★ حذف جهاز البصمة يُيتّم سجلّات الحضور.
 *     `attendance_logs.device_id` نصّ حرّ بلا مفتاح أجنبي.
 *     مقيس: بعد الحذف تبقى السجلّات ويضيع اسم الجهاز
 *     ⇒ لا يُعرف من أي بوابة جاءت البصمة.
 *     `is_active` موجود على الجدول ولم يُستعمل للتعطيل.
 *
 *  ③ صحّة الأجهزة كانت تُقاس مقابل رقم ثابت لا مقابل
 *     `sync_interval_minutes` المُعرَّف على الجهاز نفسه.
 * ════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

/** نتيجة تغيير حالة الجهاز */
export type DeviceToggleResult =
  | 'activated'
  | 'deactivated'
  | 'already_active'
  | 'already_inactive';

/** صفّ في تقرير العزل: كم يرى المستخدم داخل شركته وخارجها */
export interface IsolationRow {
  area: string;
  visible: number;
  /** صفوف تخصّ شركات أخرى — يجب أن يكون صفراً دائماً */
  foreign: number;
  isIsolated: boolean;
}

/** صحّة جهاز بصمة واحد */
export interface DeviceHealth {
  deviceId: string;
  name: string;
  location: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  /** دقائق منذ آخر مزامنة — `null` يعني «لم يزامن قطّ» لا «زامن الآن» */
  minutesBehind: number | null;
  /** الفترة المتوقَّعة بالدقائق من إعداد الجهاز */
  expectedEvery: number;
  /** تجاوز ضعف فترته المُعرَّفة — الجهاز المعطَّل لا يُعدّ متأخّراً */
  isStale: boolean;
  punchesToday: number;
}

class TechMetricsService {
  /**
   * تعطيل/تفعيل جهاز بصمة — بديل الحذف النهائي.
   * @throws رسالة القاعدة كما هي (مثل `NOT_AUTHORIZED`) — لا ابتلاع صامت
   */
  async setDeviceActive(deviceId: string, active: boolean): Promise<DeviceToggleResult> {
    const { data, error } = await supabase.rpc('deactivate_biometric_device', {
      p_device_id: deviceId,
      p_active: active,
    });
    if (error) throw new Error(error.message);
    return data as DeviceToggleResult;
  }

  /**
   * تقرير عزل بوابة التقنية — يُثبِت للمسؤول التقني أن شركته معزولة.
   *
   * ★ السياق: بوابة التقنية خاصة بالشركة المستأجِرة، لا نافذة على
   *   داخل المنصة. قبل 0328 كان `it_admin` يُعامَل **مالكاً للمنصة**
   *   (`current_user_is_platform_owner` تشمله) فيقرأ:
   *      tenants = 3 · tenant_subscriptions = 1 · legal_entities = 2
   *   أي قائمة كل الشركات العميلة وخططها واشتراكاتها.
   *
   *   الدالة `SECURITY INVOKER` عمداً: تقيس RLS الفعلي ولا تتجاوزه،
   *   فالرقم الذي تُعيده هو ما يراه المستخدم حقاً.
   */
  async isolationReport(): Promise<IsolationRow[]> {
    const { data, error } = await supabase.rpc('my_isolation_report');
    if (error) {
      console.error('isolationReport فشل:', error.message);
      return [];
    }
    type RawRow = {
      out_area: string;
      out_visible: number;
      out_foreign: number;
      out_is_isolated: boolean;
    };
    return ((data ?? []) as RawRow[]).map((r) => ({
      area: r.out_area,
      visible: r.out_visible,
      foreign: r.out_foreign,
      isIsolated: r.out_is_isolated,
    }));
  }

  /**
   * صحّة كل أجهزة البصمة.
   *
   * التأخّر مقيس مقابل `sync_interval_minutes` لكل جهاز لا مقابل رقم
   * ثابت، والجهاز المعطَّل لا يُعدّ متأخّراً (وإلا صار تنبيهاً دائماً
   * يُدرَّب المستخدم على تجاهله).
   */
  async devicesHealth(): Promise<DeviceHealth[]> {
    const { data, error } = await supabase.rpc('biometric_devices_health');
    if (error) {
      console.error('devicesHealth فشل:', error.message);
      return [];
    }
    type RawHealth = {
      out_device_id: string;
      out_name: string;
      out_location: string | null;
      out_is_active: boolean;
      out_last_sync_at: string | null;
      out_minutes_behind: number | null;
      out_expected_every: number;
      out_is_stale: boolean;
      out_punches_today: number;
    };
    return ((data ?? []) as RawHealth[]).map((d) => ({
      deviceId: d.out_device_id,
      name: d.out_name,
      location: d.out_location,
      isActive: d.out_is_active,
      lastSyncAt: d.out_last_sync_at,
      minutesBehind: d.out_minutes_behind,
      expectedEvery: d.out_expected_every,
      isStale: d.out_is_stale,
      punchesToday: d.out_punches_today,
    }));
  }
}

export const techMetricsService = new TechMetricsService();
export default techMetricsService;
