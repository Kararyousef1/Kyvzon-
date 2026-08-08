/**
 * عقد الإشعارات المجدولة والتتبع الحي — الجولة الخامسة
 *
 * يغطي 0286 والدالة الحدّية movement-daily-notifications.
 *
 * العطلان المعالَجان:
 *   ① لا إشعارات إطلاقاً — البوابة ترصد ولا تُبلّغ. من لا يفتح الصفحة
 *      لا يعلم أن رخصة سائق انتهت أو أن موظفاً لم يعد.
 *   ② logistics_telemetry جدول ميت — لا كتابة ولا قراءة.
 *
 * كل تأكيد يقابل سلوكاً أُثبت بالتشغيل على Postgres 17 (12 اختباراً).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const RPC = read('supabase/migrations/0286_movement_scheduled_notifications_and_telemetry.sql');
const EDGE = read('supabase/functions/movement-daily-notifications/index.ts');
const SVC = read('src/services/sdk/MovementTelemetryService.ts');
const TRACKING = read('src/pages/app/movement/logistics/LogisticsLiveTrackingPage.tsx');
const FOUNDATION = read('src/pages/app/movement/logistics/LogisticsFoundationPage.tsx');
const COSTS = read('src/pages/app/movement/logistics/LogisticsCostAnalyticsPage.tsx');

const ALERT_FNS = [
  'dispatch_driver_license_alerts_for_tenant',
  'dispatch_vehicle_document_alerts_for_tenant',
  'dispatch_overdue_permit_alerts_for_tenant',
  'dispatch_late_trip_alerts_for_tenant',
  'dispatch_carrier_contract_alerts_for_tenant',
];

describe('0286 — بنية الإشعارات المجدولة', () => {
  it('ينشئ سجل منع التكرار بقيد فريد يومي', () => {
    expect(RPC).toContain('CREATE TABLE IF NOT EXISTS public.movement_notification_log');
    expect(RPC).toContain('UNIQUE (tenant_id, notification_kind, entity_id, severity, sent_on)');
  });

  it('ينشئ دوال التنبيه الخمس + المساعد + المُشغِّل', () => {
    for (const fn of [...ALERT_FNS, 'notify_movement_roles_for_tenant',
                      'run_movement_daily_notifications_cron']) {
      expect(RPC).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('★ الدوال تستقبل p_tenant_id ولا تعتمد على الجلسة', () => {
    // الدرس من 0268: cron بلا جلسة ⇒ current_user_tenant_id() تُرجع NULL
    for (const fn of ALERT_FNS) {
      // نبدأ من تعريف الدالة نفسه لا من أول ورود لاسمها
      const block = RPC.slice(RPC.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`));
      // المحاذاة تستخدم مسافات متعددة أحياناً
      expect(block.slice(0, 400), `${fn} لا يستقبل p_tenant_id`)
        .toMatch(/p_tenant_id\s+UUID/);
    }
  });

  it('المُشغِّل يمرّ على المستأجرين المفعِّلين لوحدة movement فقط', () => {
    expect(RPC).toContain("tm.module_key = 'movement'");
    expect(RPC).toContain('tm.is_enabled = true');
  });

  it('يعزل أخطاء كل مستأجر — فشل واحد لا يوقف البقية', () => {
    const handlers = RPC.match(/EXCEPTION WHEN OTHERS THEN/g) ?? [];
    expect(handlers.length).toBeGreaterThanOrEqual(5);
    expect(RPC).toContain('SQLERRM::TEXT');
  });

  it('يمنع تكرار الإشعار في نفس اليوم', () => {
    const guards = RPC.match(/sent_on = CURRENT_DATE/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(5);
    expect(RPC).toContain('THEN CONTINUE; END IF;');
  });
});

describe('0286 — ★ أمان دوال cron', () => {
  it('service_role فقط ينفّذ المُشغِّل', () => {
    expect(RPC).toContain(
      'GRANT EXECUTE ON FUNCTION public.run_movement_daily_notifications_cron(INTEGER) TO service_role');
  });

  it('anon و authenticated محرومان من كل دوال cron', () => {
    // REVOKE FROM PUBLIC لا يسحب منحة Supabase التلقائية لـ anon
    for (const fn of [...ALERT_FNS, 'notify_movement_roles_for_tenant',
                      'run_movement_daily_notifications_cron', 'purge_old_telemetry']) {
      const block = RPC.slice(RPC.indexOf(`REVOKE ALL ON FUNCTION public.${fn}`));
      expect(block.slice(0, 500), `${fn} بلا سحب صريح`).toContain('FROM anon, authenticated');
    }
  });

  it('حارس يفشل المايجريشن إن انكشفت دالة cron', () => {
    expect(RPC).toContain('cron functions exposed to anon/authenticated');
    expect(RPC).toContain('service_role cannot execute the cron dispatcher');
  });
});

describe('0286 — تغطية التنبيهات الخمسة', () => {
  it('رخص السائقين بأربعة مستويات خطورة', () => {
    expect(RPC).toContain("'driver_license'");
    for (const s of ['expired', 'critical', 'urgent', 'upcoming']) {
      expect(RPC).toContain(`'${s}'`);
    }
  });

  it('وثائق المركبات', () => {
    expect(RPC).toContain("'vehicle_document'");
    expect(RPC).toContain('fleet_vehicle_documents');
  });

  it('التصاريح المتأخرة تحترم مهلة السماح', () => {
    expect(RPC).toContain("'permit_overdue'");
    expect(RPC).toContain('p_grace_minutes');
    // الأعمدة الحقيقية في 0273
    expect(RPC).toContain('l.expected_return_at');
    expect(RPC).not.toContain('expected_return_time');
  });

  it('الاسم يُجلب من profiles — الجدول يخزّن employee_id فقط', () => {
    expect(RPC).toContain('LEFT JOIN public.profiles pr ON pr.id = l.employee_id');
    expect(RPC).toContain('pr.full_name');
  });

  it('الرحلات المتأخرة وعقود الناقلين', () => {
    expect(RPC).toContain("'trip_late'");
    expect(RPC).toContain("'carrier_contract'");
  });

  it('المستقبلون: أصحاب أدوار الحركة + مديرو النظام', () => {
    expect(RPC).toContain("a.portal_role = 'movement_manager'");
    expect(RPC).toContain("pr.role IN ('admin', 'hr')");
  });
});

describe('0286 — التتبع الحي', () => {
  it('دالة التسجيل موجودة وتتحقق من المدى', () => {
    expect(RPC).toContain('CREATE OR REPLACE FUNCTION public.record_vehicle_telemetry');
    expect(RPC).toContain('INVALID_LATITUDE');
    expect(RPC).toContain('INVALID_LONGITUDE');
  });

  it('يرفض السرعة السالبة أو الخيالية', () => {
    expect(RPC).toContain('INVALID_SPEED');
    expect(RPC).toContain('p_speed_kmh < 0 OR p_speed_kmh > 300');
  });

  it('anon ممنوع من تسجيل المواقع', () => {
    expect(RPC).toContain('REVOKE ALL ON FUNCTION public.record_vehicle_telemetry(UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,UUID) FROM anon');
    expect(RPC).toContain('anon must not record telemetry');
  });

  it('★ «خارج الاتصال» حالة منفصلة عن «متوقف»', () => {
    // انقطاع الشبكة ليس توقفاً — الخلط يولّد إنذارات كاذبة
    expect(RPC).toContain("'offline'");
    expect(RPC).toContain("'stopped'");
    expect(RPC).toContain("'no_data'");
    expect(RPC).toContain("t.recorded_at < NOW() - INTERVAL '15 minutes'");
  });

  it('View يعرض آخر موقع لكل مركبة', () => {
    expect(RPC).toContain('CREATE OR REPLACE VIEW public.logistics_live_vehicle_positions');
    expect(RPC).toContain('DISTINCT ON (v.id)');
    expect(RPC).toContain('ORDER BY v.id, t.recorded_at DESC NULLS LAST');
  });

  it('تنظيف البيانات القديمة + فهارس الأداء', () => {
    expect(RPC).toContain('purge_old_telemetry');
    expect(RPC).toContain('idx_telemetry_vehicle_time');
    expect(RPC).toContain('idx_telemetry_dispatch_time');
  });
});

describe('0286 — View حالة الجدولة', () => {
  it('يكشف توقّف cron بصمت', () => {
    expect(RPC).toContain('CREATE OR REPLACE VIEW public.movement_notification_dispatch_status');
    for (const h of ['healthy', 'stale', 'not_running']) {
      expect(RPC).toContain(`'${h}'`);
    }
  });

  it('security_invoker لاحترام RLS', () => {
    const si = RPC.match(/WITH \(security_invoker = true\)/g) ?? [];
    expect(si.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Edge Function — movement-daily-notifications', () => {
  it('الملف موجود', () => {
    expect(existsSync(join(ROOT, 'supabase/functions/movement-daily-notifications/index.ts'))).toBe(true);
  });

  it('CRON_SECRET بمقارنة ثابتة الزمن', () => {
    expect(EDGE).toContain('CRON_SECRET');
    expect(EDGE).toContain('diff |=');
    expect(EDGE).toContain('provided.length !== secret.length');
  });

  it('يستخدم service_role ويستدعي المُشغِّل', () => {
    expect(EDGE).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(EDGE).toContain('run_movement_daily_notifications_cron');
  });

  it('يحدّ المعاملات الخارجية ولا يسرّب الأخطاء', () => {
    expect(EDGE).toContain('clampInt');
    expect(EDGE).toContain("{ error: 'Cron failed' }");
  });

  it('يدعم تنظيف التتبع ويسجّل في التدقيق', () => {
    expect(EDGE).toContain('purge_old_telemetry');
    expect(EDGE).toContain('platform_audit_log');
  });
});

describe('طبقة SDK والواجهة', () => {
  it('خدمة التتبع موجودة وتستدعي RPC', () => {
    expect(existsSync(join(ROOT, 'src/services/sdk/MovementTelemetryService.ts'))).toBe(true);
    expect(SVC).toContain("'record_vehicle_telemetry'");
    expect(SVC).toContain('logistics_live_vehicle_positions');
    expect(SVC).toContain('movement_notification_dispatch_status');
  });

  it('لا as any', () => {
    expect(SVC).not.toContain('as any');
  });

  it('صفحة التتبع تقرأ من View لا من الجدول الخام', () => {
    expect(TRACKING).toContain('findLivePositions');
    expect(TRACKING).not.toContain('logisticsTelemetryService');
  });

  it('صفحة التتبع تحدّث دورياً لا عبر Realtime لكل نقطة', () => {
    expect(TRACKING).toContain('REFRESH_MS');
    expect(TRACKING).toContain('setInterval');
  });

  it('تميّز «خارج الاتصال» وتوضح أنه قد يكون تغطية ضعيفة', () => {
    expect(TRACKING).toContain('خارج الاتصال');
    expect(TRACKING).toContain('منطقة تغطية ضعيفة');
  });

  /*
   * تصحيح الجولة السادسة: هذا الاختبار كان يؤكد أن الصفحة **تُفصح**
   * بأن مكتبة الخرائط غير مثبَّتة — وكان صحيحاً حين كُتب. الجولة
   * السادسة ثبّتت leaflet + react-leaflet، فالإفصاح لم يعد صادقاً
   * وأصبح وجوده هو الخطأ. الاختبار الآن يؤكد وجود الخريطة الفعلية.
   */
  it('تعرض خريطة تفاعلية فعلية لا مجرد روابط خارجية', () => {
    expect(TRACKING).toContain('MovementMap');
    expect(TRACKING).toContain('mapPoints');
    expect(TRACKING).not.toContain('مكتبة الخرائط غير مثبَّتة');
  });

  it('تنسب بلاطات الخرائط لـ OpenStreetMap كما يوجب ترخيصها', () => {
    expect(TRACKING).toContain('OpenStreetMap');
  });

  it('صفحة الأساس تعرض حالة الجدولة', () => {
    expect(FOUNDATION).toContain('findDispatchStatus');
    expect(FOUNDATION).toContain('HEALTH_STYLE');
    expect(FOUNDATION).toContain('movement-daily-notifications');
  });

  it('التكاليف تُصدَّر عبر dataExport الآمن', () => {
    expect(COSTS).toContain('exportToCsv');
    expect(COSTS).toContain("from '../../../../utils/dataExport'");
  });
});
