/**
 * عقد 0294 (client_uuid + إحياء الجداول) و 0295 (جدولة اللقطة)
 *
 * التحقق السلوكي في tools/dev/verify-movement-0294.sql
 * (32/32 على Postgres 17 من الصفر).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const M0294 = read('supabase/migrations/0294_movement_dead_tables_and_epod_idempotency.sql');
const M0295 = read('supabase/migrations/0295_movement_kpi_snapshot_schedule.sql');
const EXTRAS = read('src/services/sdk/MovementOperationsExtrasService.ts');
const DRIVER_SDK = read('src/services/sdk/DriverAppService.ts');
const DELIVERY = read('src/pages/app/movement/driver/DriverDeliveryPage.tsx');
const VEHICLES = read('src/pages/app/movement/logistics/LogisticsVehiclesPage.tsx');

/* ══════════════════════════════════════════════════════════
   🔴 client_uuid — منع ازدواج ePOD
   ══════════════════════════════════════════════════════════ */
describe('0294 — client_uuid يمنع ازدواج إثبات التسليم', () => {
  it('العمود والقيد الفريد الذي طلبه المخطط', () => {
    expect(M0294).toContain('ADD COLUMN IF NOT EXISTS client_uuid UUID');
    expect(M0294).toContain('uq_logistics_epod_client_uuid');
    expect(M0294).toMatch(/ON public\.logistics_epod \(tenant_id, client_uuid\)/);
  });

  it('الفهرس جزئي — NULL لا يمنع تسجيلات مستقلة', () => {
    expect(M0294).toContain('WHERE client_uuid IS NOT NULL');
  });

  it('إعادة الإرسال تُرجع الصف الأصلي لا خطأً', () => {
    expect(M0294).toContain('RETURN v_id;');
    expect(M0294).toContain('الطلب المكرَّر ليس طلباً جديداً يُقيَّم');
  });

  it('الفحص يسبق كل تحقق آخر — الصدى لا يُعاد تقييمه', () => {
    const fn = M0294.slice(
      M0294.indexOf('FUNCTION public.record_my_delivery_proof'),
      M0294.indexOf('COMMENT ON FUNCTION public.record_my_delivery_proof'),
    );
    const idempotencyCheck = fn.indexOf('p_client_uuid IS NOT NULL');
    const statusCheck = fn.indexOf('INVALID_EPOD_STATUS');
    expect(idempotencyCheck).toBeGreaterThan(-1);
    expect(idempotencyCheck).toBeLessThan(statusCheck);
  });

  it('🔴 يُسقط التوقيع القديم — الحِمل الزائد يكسر كل استدعاء بستة وسائط', () => {
    // ERROR: function ... is not unique — مُثبَت بالتشغيل
    expect(M0294).toContain('DROP FUNCTION IF EXISTS public.record_my_delivery_proof(UUID,TEXT,TEXT,TEXT,TEXT,TEXT);');
    expect(M0294).toContain('is not unique');
    expect(M0294).toContain('overloads of record_my_delivery_proof (must be 1)');
  });

  it('يعالج السباق الحقيقي عبر unique_violation', () => {
    expect(M0294).toContain('WHEN unique_violation THEN');
    expect(M0294).toContain('سباق حقيقي');
  });

  it('يشرح السيناريو الذي يحمي منه', () => {
    expect(M0294).toContain('تغطية ضعيفة');
    expect(M0294).toContain('صفّان لنفس التسليم');
  });

  it('SDK يمرّر clientUuid', () => {
    expect(DRIVER_SDK).toContain('p_client_uuid');
    expect(DRIVER_SDK).toContain('getOrCreateEpodClientUuid');
  });

  it('المعرّف يبقى عبر الجلسات — إعادة التحميل تُفقد حالة React', () => {
    expect(DRIVER_SDK).toContain('localStorage.getItem(key)');
    expect(DRIVER_SDK).toContain('إعادة تحميل الصفحة');
  });

  it('بديل عن crypto.randomUUID غير المتاح على HTTP', () => {
    expect(DRIVER_SDK).toContain("typeof crypto.randomUUID === 'function'");
    expect(DRIVER_SDK).toContain('Math.random()');
  });

  it('التخزين المحظور لا يُعطّل التطبيق', () => {
    expect(DRIVER_SDK).toMatch(/catch \{ \/\* التخزين محظور/);
  });

  it('صفحة التسليم تستعمله وتنظّفه بعد النجاح', () => {
    expect(DELIVERY).toContain('getOrCreateEpodClientUuid');
    expect(DELIVERY).toContain('clearEpodClientUuid');
    expect(DELIVERY).toContain('clientUuid,');
  });
});

/* ══════════════════════════════════════════════════════════
   إحياء الجداول
   ══════════════════════════════════════════════════════════ */
describe('0294 — كل جدول ميت صار له كاتب', () => {
  const TABLES = [
    'field_visit_checkins',
    'fleet_vehicle_documents',
    'logistics_trip_stops',
    'movement_permit_attachments',
    'logistics_carrier_rates',
    'logistics_kpi_snapshots',
  ];

  it.each(TABLES)('%s فيه INSERT من دالة', (t) => {
    expect(M0294).toContain(`INSERT INTO public.${t}`);
  });

  it('حارس المايجريشن يفحص ذلك برمجياً لا بالثقة', () => {
    expect(M0294).toContain('tables still have no writer');
    expect(M0294).toContain("p.prosrc ILIKE '%INSERT INTO public.'");
  });
});

describe('0294 — تسجيل الوصول الميداني بالسور', () => {
  it('يستعمل دوال السور الموجودة لا يُعيد اختراعها', () => {
    expect(M0294).toContain('movement_point_in_geofence');
    expect(M0294).toContain('movement_haversine_km');
  });

  it('غياب السور لا يُعدّ مخالفة', () => {
    expect(M0294).toContain('لا نُعاقب موظفاً');
    expect(M0294).toMatch(/v_ok\s+BOOLEAN := TRUE/);
  });

  it('أول تسجيل ينقل الزيارة إلى checked_in', () => {
    expect(M0294).toContain("status = 'checked_in'");
  });

  it('الزيارة المغلقة لا تقبل تسجيلاً', () => {
    expect(M0294).toContain('VISIT_ALREADY_CLOSED');
  });

  it('يتحقق من الإحداثيات', () => {
    expect(M0294).toContain('INVALID_LATITUDE');
    expect(M0294).toContain('INVALID_LONGITUDE');
  });

  it('SDK يوضح أن المخالفة تُوسَم لا تُمنع', () => {
    expect(EXTRAS).toContain('لا يمنع التسجيل');
  });
});

describe('0294 — وثائق المركبات', () => {
  it('تصحيح: الجدول كان يُقرأ ولا يُكتب', () => {
    expect(M0294).toContain('يُقرأ** فعلاً');
    expect(M0294).toContain('ما ينقصه');
  });

  it('التجديد يُحدّث لا يُكرّر', () => {
    expect(M0294).toContain('نوع واحد لكل مركبة');
    expect(M0294).toContain('UPDATE public.fleet_vehicle_documents');
  });

  it('يرفض وثيقة منتهية سلفاً', () => {
    expect(M0294).toContain('DOCUMENT_ALREADY_EXPIRED');
  });

  it('يميّز الإضافة عن التجديد في سجل التدقيق', () => {
    expect(M0294).toContain('vehicle_document_added');
    expect(M0294).toContain('vehicle_document_renewed');
  });

  it('واجهة المركبات فيها زر الوثائق', () => {
    expect(VEHICLES).toContain('openDocs');
    expect(VEHICLES).toContain('upsertVehicleDocument');
    expect(VEHICLES).toContain('الوثائق');
  });

  it('الواجهة تُنبّه أن الوثيقة المنتهية تمنع الإسناد', () => {
    expect(VEHICLES).toContain('تمنع إسناد المركبة');
  });

  it('الواجهة تُلوّن حسب قرب الانتهاء', () => {
    expect(VEHICLES).toContain('منتهية منذ');
    expect(VEHICLES).toContain('يوم متبقٍّ');
  });
});

describe('0294 — محطات الرحلة', () => {
  it('الترتيب تلقائي والإدراج الوسطي يُزيح', () => {
    expect(M0294).toContain('COALESCE(MAX(stop_sequence), 0) + 1');
    expect(M0294).toContain('stop_sequence = stop_sequence + 1');
    expect(M0294).toContain('إفساح مكان');
  });

  it('المحطة المغلقة لا تُعاد فتحها', () => {
    expect(M0294).toContain('STOP_ALREADY_CLOSED');
  });

  it('يتحقق من نوع المحطة وحدود المستأجر', () => {
    expect(M0294).toContain('INVALID_STOP_TYPE');
    expect(M0294).toContain('LOCATION_NOT_FOUND_IN_TENANT');
  });

  it('عرض يُظهر تقدّم الإنجاز', () => {
    expect(M0294).toContain('logistics_dispatch_stops_view');
    expect(M0294).toContain('completed_stops');
  });
});

describe('0294 — المرفقات والتسعيرة واللقطات', () => {
  it('حدّ حجم المرفق مطبَّق في الخادم', () => {
    expect(M0294).toContain('FILE_TOO_LARGE');
    expect(M0294).toContain('26214400');
  });

  it('SDK يعلن الحد نفسه', () => {
    expect(EXTRAS).toContain('MAX_ATTACHMENT_BYTES = 26214400');
  });

  it('تسعيرة واحدة لكل مسار', () => {
    expect(M0294).toContain('تسعيرة واحدة لكل مسار');
    expect(M0294).toContain('INVALID_RATE_AMOUNT');
  });

  it('اللقطة تشرح لماذا لا يكفي الـ view', () => {
    expect(M0294).toContain('الـ view يعطي **الحاضر**');
  });

  it('لقطة واحدة لكل يوم', () => {
    expect(M0294).toContain('لقطة واحدة لكل يوم');
  });

  it('🔴 تكلفة الكم تُحسب من المسافة الحقيقية لا عمود مخترَع', () => {
    // logistics_trip_costs لا يحمل distance_km — تحققتُ من أعمدته
    expect(M0294).toContain('logistics_trip_costs لا يحمل المسافة');
    expect(M0294).toContain('logistics_routes');
    expect(M0294).not.toMatch(/c\.distance_km/);
  });

  it('مستأجر فاشل لا يوقف البقية', () => {
    expect(M0294).toContain('فشل مستأجر لا يوقف البقية');
  });
});

describe('0294 — الجدول المهجور', () => {
  it('logistics_shipments موثَّق مهجوراً لا محذوفاً', () => {
    expect(M0294).toContain('COMMENT ON TABLE public.logistics_shipments');
    expect(M0294).toContain('مهجور (0294)');
    expect(M0294).not.toMatch(/DROP TABLE.*logistics_shipments/);
  });

  it('يشرح لماذا لا يُحيا: تكرار معماري', () => {
    expect(M0294).toContain('تكرار معماري');
    expect(M0294).toContain('مسارَي بيانات');
  });

  it('حارسه يمنع الحذف ويطلب التوثيق', () => {
    expect(M0294).toContain('deprecated table must not be dropped');
    expect(M0294).toContain('deprecated table not documented');
  });
});

describe('0294 — الأمان', () => {
  it('anon محروم من كل الدوال', () => {
    expect(M0294).toContain('0294 failed: anon can execute');
    expect((M0294.match(/FROM PUBLIC, anon/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('دوال cron محجوبة عن authenticated أيضاً', () => {
    expect(M0294).toContain('FROM PUBLIC, anon, authenticated');
    expect(M0294).toContain('authenticated must not run kpi cron');
  });

  it('كل دالة تفرض الدور والمستأجر', () => {
    expect(M0294).toContain('movement_require_role');
    expect(M0294).toContain('NO_TENANT');
  });
});

/* ══════════════════════════════════════════════════════════
   0295 — جدولة اللقطة
   ══════════════════════════════════════════════════════════ */
describe('0295 — جدولة لقطة المؤشرات', () => {
  it('يشرح لماذا مايجريشن منفصل عن 0294', () => {
    expect(M0295).toContain('بنية 0290');
    expect(M0295).toContain('scheduled_job_runs');
  });

  it('مُغلِّف مُسجِّل بنمط 0290', () => {
    expect(M0295).toContain('run_kpi_snapshot_job');
    expect(M0295).toContain('scheduled_job_runs');
    expect(M0295).toContain("'failed'");
  });

  it('يجدول فعلياً عبر pg_cron', () => {
    expect(M0295).toContain('cron.schedule');
    expect(M0295).toContain('kyvzon_logistics_kpi_snapshot');
    expect(M0295).toContain('cron.unschedule');
  });

  it('يتخطّى بأمان عند غياب pg_cron', () => {
    expect(M0295).toContain('pg_cron غير متاح');
  });

  it('عرض الصحة صار ثلاث مهام', () => {
    expect(M0295).toContain("'logistics_kpi_snapshot'");
    expect(M0295).toContain('health view has % rows (expected 3)');
  });

  it('حارسه يُشغّل المهمة فعلياً لا يفحص وجودها فقط', () => {
    expect(M0295).toContain('PERFORM public.run_kpi_snapshot_job(CURRENT_DATE)');
    expect(M0295).toContain('did not report success');
  });

  it('service_role حصراً', () => {
    expect(M0295).toContain('FROM PUBLIC, anon, authenticated');
    expect(M0295).toContain('kpi job must be service_role only');
  });
});

/* ══════════════════════════════════════════════════════════
   طبقة SDK
   ══════════════════════════════════════════════════════════ */
describe('MovementOperationsExtrasService', () => {
  it('الملف موجود ويشرح سبب التجميع', () => {
    expect(existsSync(resolve(process.cwd(),
      'src/services/sdk/MovementOperationsExtrasService.ts'))).toBe(true);
    expect(EXTRAS).toContain('لماذا خدمة واحدة');
  });

  it('يستدعي RPCs 0294 بأسمائها', () => {
    for (const rpc of [
      'record_field_visit_checkin', 'upsert_vehicle_document',
      'add_dispatch_stop', 'update_dispatch_stop_status',
      'add_permit_attachment', 'upsert_carrier_rate',
    ]) {
      expect(EXTRAS).toContain(`'${rpc}'`);
    }
  });

  it('اللقطات قراءة فقط — تُكتب من cron', () => {
    expect(EXTRAS).toContain('قراءة فقط');
    expect(EXTRAS).not.toContain('capture_logistics_kpi_snapshot');
  });

  it('يتعامل مع RETURNS TABLE كصف واحد', () => {
    expect(EXTRAS).toContain('Array.isArray(data) ? data[0] : data');
  });

  it('بلا as any', () => {
    expect(EXTRAS).not.toContain('as any');
    expect(VEHICLES).not.toContain('as any');
  });

  it('لا تلمس الصفحات supabase مباشرة', () => {
    expect(VEHICLES).not.toMatch(/supabase\.(from|rpc)\(/);
    expect(DELIVERY).not.toMatch(/supabase\.(from|rpc)\(/);
  });
});
