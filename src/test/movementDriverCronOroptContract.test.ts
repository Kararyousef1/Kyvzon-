/**
 * عقد الجولة السابعة — Or-opt · الجدولة الفعلية · تطبيق السائق
 *
 * يغطي: 0289 (Or-opt) · 0290 (pg_cron + سجل التشغيل) · 0291 (السائق)
 *
 * اختبارات عقد ثابتة تقرأ الملفات. التحقق السلوكي في
 * tools/dev/verify-movement-0289-0291.sql (54/54 على Postgres 17 محلي).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const exists = (p: string) => existsSync(resolve(process.cwd(), p));

const M0289 = read('supabase/migrations/0289_movement_route_or_opt.sql');
const M0290 = read('supabase/migrations/0290_movement_cron_schedule.sql');
const M0291 = read('supabase/migrations/0291_movement_driver_self_service.sql');
const DRIVER_SDK = read('src/services/sdk/DriverAppService.ts');
const TRIPS = read('src/pages/app/movement/driver/DriverTripsPage.tsx');
const DELIVERY = read('src/pages/app/movement/driver/DriverDeliveryPage.tsx');
const DRIVERS_PAGE = read('src/pages/app/movement/logistics/LogisticsDriversPage.tsx');
const FOUNDATION = read('src/pages/app/movement/logistics/LogisticsFoundationPage.tsx');
const TELEMETRY_SDK = read('src/services/sdk/MovementTelemetryService.ts');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const PERMS = read('src/core/constants/permissions.ts');

/* ══════════════════════════════════════════════════════════
   0289 — Or-opt
   ══════════════════════════════════════════════════════════ */
describe('0289 — Or-opt والمُحسِّن المركَّب', () => {
  it('يُعرّف Or-opt والمُحسِّن المركَّب', () => {
    expect(M0289).toContain('FUNCTION public.movement_or_opt');
    expect(M0289).toContain('FUNCTION public.movement_optimize_path');
  });

  it('ينقل مقاطع بطول 1..3 لا نقطة واحدة فقط', () => {
    expect(M0289).toMatch(/FOR v_L IN 1\.\.LEAST\(3/);
  });

  it('يجرّب الاتجاهين — عادي ومعكوس', () => {
    expect(M0289).toContain('v_add_fwd');
    expect(M0289).toContain('v_add_rev');
  });

  it('عكس مقطع من نقطة واحدة لا يُقيَّم مرتين', () => {
    expect(M0289).toMatch(/IF v_L = 1 THEN v_add_rev := v_add_fwd/);
  });

  it('يُثبّت نقطة الانطلاق', () => {
    expect(M0289).toMatch(/FOR v_i IN 1\.\.\(v_n - v_L\)/);
    expect(M0289).toContain('لا تُنقل ولا يُدرَج قبلها');
  });

  it('يُقيّم بالفارق لا بإعادة حساب المسار كاملاً', () => {
    expect(M0289).toContain('delta');
    expect(M0289).toContain('v_gain');
  });

  it('يحرس ضد الحلقة اللانهائية', () => {
    expect(M0289).toContain('p_max_passes');
    expect(M0289).toContain('p_max_rounds');
  });

  it('يتوقف عند الاستقرار لا يدور بلا طائل', () => {
    expect(M0289).toMatch(/EXIT WHEN v_curr >= v_prev/);
  });

  it('يحرس ضد أن يكون المركَّب أسوأ من 2-opt وحده', () => {
    expect(M0289).toMatch(/IF v_opt > v_2opt THEN/);
  });

  it('يُرجع طول كل مرحلة على حدة', () => {
    expect(M0289).toContain('naive_km');
    expect(M0289).toContain('nn_km');
    expect(M0289).toContain('two_opt_km');
    expect(M0289).toContain('optimized_km');
  });

  it('يُسقط الدالة قبل إعادة إنشائها — الأعمدة تغيّرت', () => {
    const drop = M0289.indexOf('DROP FUNCTION IF EXISTS public.plan_optimized_route');
    const create = M0289.indexOf('CREATE FUNCTION public.plan_optimized_route');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
  });

  it('يوثّق قياساً حقيقياً لا تقديراً', () => {
    expect(M0289).toContain('93.3%');
    expect(M0289).toContain('244.712');
  });

  it('حارسه يستعمل حالة مُثبَتة يعجز عنها 2-opt', () => {
    expect(M0289).toContain('or-opt must beat 2-opt on this known case');
  });

  it('السجل يذكر الخوارزمية الكاملة', () => {
    expect(M0289).toContain('nn+2opt+oropt');
  });

  it('يبقى صادقاً بأن الحل تقريبي', () => {
    expect(M0289).toContain('حل تقريبي لا أمثل');
  });

  it('anon محروم', () => {
    expect(M0289).toContain('FROM PUBLIC, anon');
    expect(M0289).toContain('0289 failed: anon can execute');
  });
});

/* ══════════════════════════════════════════════════════════
   0290 — الجدولة الفعلية
   ══════════════════════════════════════════════════════════ */
describe('0290 — جدولة pg_cron فعلية', () => {
  it('يجدول فعلياً لا يوثّق فقط — أول مايجريشن يفعلها', () => {
    expect(M0290).toContain('cron.schedule');
    expect(M0290).toContain('kyvzon_movement_daily_notifications');
    expect(M0290).toContain('kyvzon_telemetry_purge');
  });

  it('يُلغي الجدولة السابقة أولاً — إعادة التشغيل بلا ازدواج', () => {
    const un = M0290.indexOf('cron.unschedule');
    const sc = M0290.indexOf("cron.schedule(\n    'kyvzon_movement_daily_notifications'");
    expect(un).toBeGreaterThan(-1);
    expect(sc).toBeGreaterThan(un);
  });

  it('يتخطّى بأمان عند غياب pg_cron بدل الفشل', () => {
    expect(M0290).toContain('pg_cron غير متاح');
    expect(M0290).toMatch(/EXCEPTION WHEN OTHERS THEN\s+v_has_cron := FALSE/);
  });

  it('يُفصح أن الجدولة نفسها لم تُختبر محلياً', () => {
    expect(M0290).toContain('لم تُختبر محلياً');
  });

  it('يُنشئ سجل تشغيل — بدونه التوقّف صامت', () => {
    expect(M0290).toContain('CREATE TABLE IF NOT EXISTS public.scheduled_job_runs');
    expect(M0290).toContain('FUNCTION public.run_movement_notifications_job');
    expect(M0290).toContain('FUNCTION public.run_telemetry_purge_job');
  });

  it('يلتقط الفشل ويسجّله بلا إسقاط الدورة', () => {
    expect(M0290).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(M0290).toContain('لا RAISE: الفشل مُسجَّل، ودورة cron تكمل');
  });

  it('عرض الصحة يميّز الحالات الخمس', () => {
    for (const h of ['never_ran', 'failing', 'stale', 'stuck', 'healthy']) {
      expect(M0290).toContain(`'${h}'`);
    }
  });

  it('سجل التشغيل بـ RLS وسياسة — لا حجب كامل', () => {
    expect(M0290).toContain('ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY');
    expect(M0290).toContain('CREATE POLICY kyvzon_scheduled_job_runs_read');
    expect(M0290).toContain('RLS but no policy (total lockout)');
  });

  it('service_role وحده يُشغّل — لا authenticated ولا anon', () => {
    expect(M0290).toContain('FROM PUBLIC, anon, authenticated');
    expect(M0290).toContain('TO service_role');
    expect(M0290).toContain('0290 failed: authenticated must not execute');
  });

  it('anon لا يقرأ السجل ولا الصحة', () => {
    expect(M0290).toContain('0290 failed: anon can read scheduled_job_runs');
    expect(M0290).toContain('0290 failed: anon can read movement_cron_health');
  });

  it('يشرح لماذا pg_cron لا جدولة لوحة التحكم', () => {
    expect(M0290).toContain('خارج Git');
  });
});

describe('صحة الجدولة في الواجهة', () => {
  it('SDK يقرأ عرض الصحة', () => {
    expect(TELEMETRY_SDK).toContain('findCronHealth');
    expect(TELEMETRY_SDK).toContain("from('movement_cron_health')");
    expect(TELEMETRY_SDK).toContain('export interface CronJobHealth');
    expect(TELEMETRY_SDK).toContain('CRON_HEALTH_LABELS');
  });

  it('صفحة الأساس تعرضها', () => {
    expect(FOUNDATION).toContain('findCronHealth');
    expect(FOUNDATION).toContain('صحة المهام المجدولة');
  });

  it('تُفرّق بين «لم تُشغَّل» و«لا شيء يستحق الإشعار»', () => {
    expect(FOUNDATION).toContain('لا أن لا شيء يستحق الإشعار');
  });

  it('فشل قراءة الصحة لا يُسقط الصفحة', () => {
    expect(FOUNDATION).toContain('findCronHealth().catch(() => [])');
  });
});

/* ══════════════════════════════════════════════════════════
   0291 — تطبيق السائق
   ══════════════════════════════════════════════════════════ */
describe('0291 — طبقة السائق: الأساس', () => {
  it('يوثّق الفجوة المعمارية التي منعت التطبيق', () => {
    expect(M0291).toContain('مستحيلاً أمنياً');
    expect(M0291).toContain('تصعيد صلاحيات');
  });

  it('يربط السائق بحساب عبر مفتاح خارجي لا عمود حر', () => {
    expect(M0291).toContain('logistics_drivers_user_id_fkey');
    expect(M0291).toContain('REFERENCES public.profiles(id)');
  });

  it('حساب واحد لا يكون سائقَين', () => {
    expect(M0291).toContain('uq_logistics_driver_user');
    expect(M0291).toContain('USER_ALREADY_LINKED_TO_ANOTHER_DRIVER');
  });

  it('السائق لا يحتاج دور logistics — حارس مستقل', () => {
    expect(M0291).toContain('FUNCTION public.movement_require_driver');
    expect(M0291).toContain('NOT_A_DRIVER');
  });

  it('السائق الموقوف يُعامَل كغير سائق', () => {
    expect(M0291).toContain("d.status <> 'suspended'");
  });

  it('الربط عملية إدارية بدور logistics', () => {
    expect(M0291).toMatch(/link_driver_account[\s\S]{0,600}movement_require_role\('logistics'\)/);
  });

  it('لا ربط عابر للمستأجرين', () => {
    expect(M0291).toContain('USER_NOT_IN_TENANT');
  });
});

describe('0291 — العزل: السائق يرى رحلاته وحده', () => {
  it('كل دالة تفلتر بـ driver_id لا بالمستأجر وحده', () => {
    const fns = M0291.split('CREATE OR REPLACE FUNCTION').filter((f) =>
      /get_my_driver_trips|record_driver_position|update_my_trip_status|record_my_delivery_proof/.test(
        f.slice(0, 120),
      ),
    );
    expect(fns.length).toBeGreaterThanOrEqual(4);
    for (const f of fns) expect(f).toContain('driver_id');
  });

  it('يرفض العمل على رحلة غير مُسنَدة', () => {
    expect((M0291.match(/DISPATCH_NOT_ASSIGNED_TO_YOU/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('لا تكاليف ولا ربحية في مخرجات السائق', () => {
    const trips = M0291.slice(
      M0291.indexOf('FUNCTION public.get_my_driver_trips'),
      M0291.indexOf('COMMENT ON FUNCTION public.get_my_driver_trips'),
    );
    expect(trips).not.toContain('total_cost');
    expect(trips).not.toContain('net_profit');
    expect(trips).not.toContain('carrier');
  });

  it('السائق لا يملك إعلان فشل الرحلة', () => {
    expect(M0291).toContain('DRIVER_CANNOT_SET_STATUS');
    expect(M0291).toContain('الفشل يُعلنه المُرسِل');
  });

  it('الإكمال يتطلب إثبات تسليم', () => {
    expect(M0291).toContain('EPOD_REQUIRED_BEFORE_COMPLETION');
  });

  it('المركبة تُستنتج من الرحلة لا تُقبل من العميل', () => {
    expect(M0291).toContain('SELECT d.vehicle_id, d.status INTO v_vehicle');
  });
});

describe('0291 — الوضع دون اتصال ومقاومة التزوير', () => {
  it('يدعم الرفع دفعةً', () => {
    expect(M0291).toContain('FUNCTION public.record_driver_position_batch');
    expect(M0291).toContain('BATCH_TOO_LARGE');
  });

  it('نقطة فاسدة لا تُسقط الدفعة', () => {
    expect(M0291).toContain('تُتخطّى ولا تُسقط الدفعة');
    expect(M0291).toContain('v_bad := v_bad + 1');
  });

  it('يرفض الزمن المستقبلي والموغل في القدم', () => {
    expect(M0291).toContain('RECORDED_AT_IN_FUTURE');
    expect(M0291).toContain('RECORDED_AT_TOO_OLD');
  });

  it('يتحقق من صحة الإحداثيات والسرعة', () => {
    expect(M0291).toContain('INVALID_LATITUDE');
    expect(M0291).toContain('INVALID_LONGITUDE');
    expect(M0291).toContain('INVALID_SPEED');
  });

  it('الرفض والنزاع يتطلبان سبباً', () => {
    expect(M0291).toContain('NOTES_REQUIRED_FOR_');
  });

  it('لا ePOD مزدوج', () => {
    expect(M0291).toContain('EPOD_ALREADY_RECORDED');
  });

  it('السجل يميّز مصدر التغيير', () => {
    expect(M0291).toContain("'source', 'driver_app'");
  });

  it('anon محروم من الدوال التسع', () => {
    expect(M0291).toContain('0291 failed: anon can execute');
    expect((M0291.match(/FROM PUBLIC, anon/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it('دوال القراءة STABLE', () => {
    expect(M0291).toContain('driver read functions must be STABLE');
  });
});

/* ══════════════════════════════════════════════════════════
   واجهة السائق
   ══════════════════════════════════════════════════════════ */
describe('DriverAppService', () => {
  it('خدمة منفصلة عن خدمات المُرسِل', () => {
    expect(exists('src/services/sdk/DriverAppService.ts')).toBe(true);
    expect(DRIVER_SDK).toContain('لماذا خدمة منفصلة');
  });

  it('يستدعي RPCs 0291 بأسمائها', () => {
    for (const rpc of [
      'get_my_driver_trips', 'record_driver_position',
      'record_driver_position_batch', 'update_my_trip_status',
      'record_my_delivery_proof', 'get_my_driver_summary', 'link_driver_account',
    ]) {
      expect(DRIVER_SDK).toContain(`'${rpc}'`);
    }
  });

  it('isDriver يستدعي is_current_user_driver (0301) لا current_driver_id', () => {
    // تحديث 2026-08-05 (الجولة ١): current_driver_id ترفع NOT_A_DRIVER
    // عبر movement_require_driver، والواجهة تحتاج نظيراً هادئاً يعيد
    // BOOLEAN. أُضيفت is_current_user_driver في 0301 لهذا الغرض.
    expect(DRIVER_SDK).toContain("'is_current_user_driver'");
  });

  it('نوع التحديث يمنع failed على مستوى TypeScript', () => {
    expect(DRIVER_SDK).toContain("'en_route' | 'arrived' | 'completed'");
  });

  it('طابور محلي بسقف يطابق سقف الخادم', () => {
    expect(DRIVER_SDK).toContain('MAX_QUEUE = 500');
  });

  it('يُسقط الأقدم لا الأحدث عند الامتلاء', () => {
    expect(DRIVER_SDK).toContain('الأحدث أهم للتتبع الحي');
  });

  it('لا يمسح الطابور إلا بعد نجاح الرفع', () => {
    // delete داخل try بعد الاستدعاء، وقائمة الفاشلين تُعاد للمتصل
    expect(DRIVER_SDK).toMatch(
      /await this\.recordPositionBatch\([\s\S]{0,200}delete q\[dispatchId\];/,
    );
    expect(DRIVER_SDK).toContain('failedDispatches');
  });

  it('تخزين تالف لا يُعطّل التطبيق', () => {
    expect(DRIVER_SDK).toContain('catch {');
    expect(DRIVER_SDK).toContain('return {};');
  });

  it('بلا as any', () => {
    expect(DRIVER_SDK).not.toContain('as any');
  });
});

describe('شاشات السائق', () => {
  it('الملفان موجودان', () => {
    expect(exists('src/pages/app/movement/driver/DriverTripsPage.tsx')).toBe(true);
    expect(exists('src/pages/app/movement/driver/DriverDeliveryPage.tsx')).toBe(true);
  });

  it('تُفصح بوضوح لغير السائقين بدل صفحة فارغة', () => {
    expect(TRIPS).toContain('حسابك غير مرتبط بسائق');
  });

  it('watchPosition لا getCurrentPosition المتكرر — البطارية', () => {
    expect(TRIPS).toContain('watchPosition');
    expect(TRIPS).toContain('يستنزف البطارية');
  });

  it('توقف المراقبة عند مغادرة الصفحة', () => {
    expect(TRIPS).toContain('clearWatch');
  });

  it('تُخفّض معدل الإرسال يدوياً', () => {
    expect(TRIPS).toContain('PING_INTERVAL_MS');
    expect(TRIPS).toContain('lastSentRef');
  });

  it('تحوّل السرعة من م/ث إلى كم/س', () => {
    expect(TRIPS).toContain('* 3.6');
  });

  it('حالة الاتصال ظاهرة والرفع تلقائي عند العودة', () => {
    expect(TRIPS).toContain("addEventListener('online'");
    expect(TRIPS).toContain('flushQueue');
  });

  it('تحفظ النقطة محلياً عند فشل الشبكة رغم onLine', () => {
    expect(TRIPS).toContain('queuePoint');
  });

  it('أزرار كبيرة تناسب الاستعمال الميداني', () => {
    expect(TRIPS).toContain('min-h-[52px]');
  });

  it('تنبّه السائق لانتهاء رخصته', () => {
    expect(TRIPS).toContain('license_days_left');
  });

  it('التوقيع canvas خام بلا تبعية جديدة', () => {
    expect(DELIVERY).toContain('<canvas');
    expect(DELIVERY).toContain('onPointerDown');
    expect(DELIVERY).toContain('setPointerCapture');
  });

  it('اللوحة بدقة الشاشة — لا خط مُهشَّم', () => {
    expect(DELIVERY).toContain('devicePixelRatio');
  });

  it('touchAction none — الرسم لا يُمرّر الصفحة', () => {
    expect(DELIVERY).toContain("touchAction: 'none'");
  });

  it('تُفصح أن رفع الصور غير متاح بدل الادعاء', () => {
    expect(DELIVERY).toContain('رفع صور الشحنة غير متاح بعد');
  });

  /*
    الممنوعات تُقاس على **الكود** لا التعليقات: الملف يشرح لماذا
    تجنّبنا confirm() فيحتوي الكلمة نصاً. نجرّد التعليقات أولاً.
  */
  it('ممنوعات المشروع غائبة من الكود', () => {
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const src of [TRIPS, DELIVERY]) {
      const code = stripComments(src);
      expect(code).not.toMatch(/(?:window\.)?\bconfirm\s*\(/);
      expect(code).not.toMatch(/(?:window\.)?\bprompt\s*\(/);
      expect(code).not.toContain('as any');
    }
  });

  it('التأكيد لوحة داخل الصفحة لا confirm()', () => {
    expect(TRIPS).toContain('confirmTarget');
    expect(TRIPS).toContain('بديل confirm() الممنوع');
  });

  it('لا تلمس supabase مباشرة', () => {
    for (const src of [TRIPS, DELIVERY]) {
      expect(src).not.toMatch(/supabase\.(from|rpc)\(/);
    }
  });
});

describe('ربط حساب السائق في صفحة السائقين', () => {
  it('زر الربط موجود — بدونه التطبيق غير قابل للوصول', () => {
    expect(DRIVERS_PAGE).toContain('linkDriverAccount');
    expect(DRIVERS_PAGE).toContain('linkTarget');
  });

  it('يميّز السائق المُفعَّل', () => {
    expect(DRIVERS_PAGE).toContain('مُفعَّل');
    expect(DRIVERS_PAGE).toContain('d.user_id');
  });

  it('يتيح فك الربط', () => {
    expect(DRIVERS_PAGE).toContain('submitLink(true)');
    expect(DRIVERS_PAGE).toContain('فك الربط');
  });

  it('يشرح نطاق الصلاحية الممنوحة', () => {
    expect(DRIVERS_PAGE).toContain('رحلاته وحده');
    expect(DRIVERS_PAGE).toContain('لا يمنحه أي صلاحية على الأسطول');
  });
});

/* ══════════════════════════════════════════════════════════
   التسجيل في المواضع الأربعة
   ══════════════════════════════════════════════════════════ */
describe('تسجيل تطبيق السائق في المواضع الأربعة', () => {
  it('AppRouter — الشاشتان والمسار البارامتري', () => {
    expect(ROUTER).toContain('DriverTripsPage');
    expect(ROUTER).toContain('DriverDeliveryPage');
    expect(ROUTER).toContain('path="driver/trips"');
    expect(ROUTER).toContain('path="driver/delivery/:dispatchId"');
  });

  it('Sidebar', () => {
    expect(SIDEBAR).toContain("id: 'movement-driver-trips'");
    expect(SIDEBAR).toContain("'movement-driver-trips': 'movement'");
  });

  it('hybridPagesCatalog', () => {
    expect(CATALOG).toContain("id: 'movement-driver-trips'");
  });

  it('AdminEmployeesPage', () => {
    expect(ADMIN).toContain("id: 'movement-driver-trips'");
  });

  it('legacyRedirect', () => {
    expect(LEGACY).toContain('/app/movement/driver/trips');
  });

  it('مفتاح الصلاحية ممنوح لدور employee — السائق موظف عادي', () => {
    // PERMISSION_KEYS + employee + logistics + movement_manager
    expect((PERMS.match(/'movement-driver-trips'/g) ?? []).length).toBe(4);
    const employeeBlock = PERMS.slice(
      PERMS.indexOf('  employee: ['),
      PERMS.indexOf('  employee: [') + 900,
    );
    expect(employeeBlock).toContain('movement-driver-trips');
  });

  it('البند متاح لدور employee في Sidebar', () => {
    const line = SIDEBAR.split('\n').find((l) => l.includes("id: 'movement-driver-trips'")) ?? '';
    expect(line).toContain("'employee'");
  });
});
