/**
 * عقد الجولة السادسة — الخريطة التفاعلية وتحسين المسار وإعادة التشغيل
 *
 * يغطي: 0287 (2-opt + get_dispatch_track) · 0288 (قيد أدوار profiles)
 *        MovementMap · CoordinatePicker · LogisticsTrackReplayPage
 *        وإصلاحَي مودال الأرشفة الميت وتنقّل صفحات الموظفين.
 *
 * هذه اختبارات عقد ثابتة (static contract) — تقرأ الملفات وتتحقق من
 * بنيتها. لا تُشغّل SQL ولا تفتح متصفحاً. التحقق السلوكي الفعلي في
 * tools/dev/verify-movement-0287.sql (45/45 على Postgres 17 محلي).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const M0287 = read('supabase/migrations/0287_movement_route_2opt_and_track_replay.sql');
const M0288 = read('supabase/migrations/0288_movement_profile_roles_constraint.sql');
const MAP = read('src/pages/app/movement/shared/MovementMap.tsx');
const REPLAY = read('src/pages/app/movement/logistics/LogisticsTrackReplayPage.tsx');
const TRACKING = read('src/pages/app/movement/logistics/LogisticsLiveTrackingPage.tsx');
const ROUTES = read('src/pages/app/movement/logistics/LogisticsRoutePlanningPage.tsx');
const LOCATIONS = read('src/pages/app/movement/employee/EmployeeMovementLocationsPage.tsx');
const TELEMETRY_SDK = read('src/services/sdk/MovementTelemetryService.ts');
const FOUNDATION_SDK = read('src/services/sdk/MovementFoundationOperationsService.ts');
const NAV = read('src/pages/app/movement/shared/MovementUnitNav.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const PERMS = read('src/core/constants/permissions.ts');
const PKG = JSON.parse(read('package.json'));

/* ════════════════════════════════════════════════════════════
   0287 — الخوارزمية والمسار
   ════════════════════════════════════════════════════════════ */
describe('0287 — تحسين المسار 2-opt', () => {
  it('يُعرّف دوال 2-opt الثلاث', () => {
    expect(M0287).toContain('FUNCTION public.movement_path_length_km');
    expect(M0287).toContain('FUNCTION public.movement_two_opt');
    expect(M0287).toContain('FUNCTION public.plan_optimized_route');
  });

  it('يُسقط plan_optimized_route قبل إعادة إنشائها — أعمدة RETURNS TABLE تغيّرت', () => {
    // CREATE OR REPLACE يرفض تغيير أعمدة الإرجاع؛ بدون DROP يفشل التطبيق
    expect(M0287).toContain('DROP FUNCTION IF EXISTS public.plan_optimized_route');
    const dropAt = M0287.indexOf('DROP FUNCTION IF EXISTS public.plan_optimized_route');
    const createAt = M0287.indexOf('CREATE FUNCTION public.plan_optimized_route');
    expect(dropAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(dropAt);
  });

  it('يُرجع مراحل الخوارزمية الثلاث منفصلة لا رقماً واحداً', () => {
    expect(M0287).toContain('naive_km');
    expect(M0287).toContain('nn_km');
    expect(M0287).toContain('optimized_km');
    expect(M0287).toContain('two_opt_saved_km');
  });

  it('يُثبّت نقطة الانطلاق ولا يعكسها', () => {
    expect(M0287).toContain('النقطة الأولى مثبَّتة');
    expect(M0287).toMatch(/v_i\s*:=\s*1;/);
  });

  it('يحرس ضد الحلقة اللانهائية بحد أقصى للتمريرات', () => {
    expect(M0287).toContain('p_max_passes');
    expect(M0287).toMatch(/v_pass\s*<\s*p_max_passes/);
  });

  it('يحرس ضد انحراف عددي يجعل 2-opt أسوأ من NN', () => {
    expect(M0287).toMatch(/IF v_opt > v_nn THEN/);
  });

  it('يرفض المواقع المكرّرة — ثغرة كانت في 0285', () => {
    expect(M0287).toContain('DUPLICATE_LOCATIONS_NOT_ALLOWED');
  });

  it('يتحقق أن الرحلة المربوطة تخصّ المستأجر نفسه', () => {
    expect(M0287).toContain('DISPATCH_NOT_FOUND_IN_TENANT');
  });

  it('كسر التعادل حتمي — نتيجة ثابتة لنفس المدخلات', () => {
    expect(M0287).toContain('ORDER BY dist ASC, l.id ASC');
  });

  it('يصف الخوارزمية بصدق في ملاحظات المسار المحفوظ', () => {
    expect(M0287).toContain('heuristic');
    expect(M0287).toContain('حل تقريبي لا أمثل');
  });
});

describe('0287 — مسار الرحلة وإعادة التشغيل', () => {
  it('يُعرّف دوال المسار والملخّص والعرض', () => {
    expect(M0287).toContain('FUNCTION public.get_dispatch_track');
    expect(M0287).toContain('FUNCTION public.get_dispatch_track_summary');
    expect(M0287).toContain('VIEW public.logistics_trackable_dispatches');
  });

  it('يحسب المسافة التراكمية والفجوات في الخادم لا المتصفح', () => {
    expect(M0287).toContain('cumulative_km');
    expect(M0287).toContain('gap_minutes');
    expect(M0287).toContain('is_stop');
  });

  it('دوال القراءة STABLE لا VOLATILE', () => {
    expect(M0287).toMatch(/get_dispatch_track\([\s\S]{0,900}?LANGUAGE plpgsql STABLE/);
  });

  it('يحدّ حجم القراءة — لا استعلام مفتوح', () => {
    expect(M0287).toContain('INVALID_LIMIT');
  });

  it('يستعمل driver_name_ar لا name_ar — العمود الحقيقي في logistics_drivers', () => {
    expect(M0287).toContain('dr.driver_name_ar');
    expect(M0287).not.toContain('dr.name_ar');
  });
});

describe('0287 — الأمان', () => {
  it('يسحب الصلاحية من anon صراحةً لا من PUBLIC وحدها', () => {
    // منحة Supabase الصريحة لـ anon لا تسحبها REVOKE FROM PUBLIC
    const revokes = M0287.match(/REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC, anon;/g) ?? [];
    expect(revokes.length).toBeGreaterThanOrEqual(5);
  });

  it('يسحب قراءة العرض من anon', () => {
    expect(M0287).toContain('REVOKE ALL ON public.logistics_trackable_dispatches FROM PUBLIC, anon');
  });

  it('يمنح authenticated ما يحتاجه — وإلا الواجهة معطَّلة', () => {
    expect(M0287).toContain('GRANT SELECT ON public.logistics_trackable_dispatches TO authenticated');
  });

  it('كل دالة تفرض الدور والمستأجر', () => {
    expect(M0287).toContain("movement_require_role('logistics')");
    expect(M0287).toContain('NO_TENANT');
  });

  it('حارس نهائي يفشل المايجريشن إن نفّذ anon أياً منها', () => {
    expect(M0287).toContain("has_function_privilege('anon'");
    expect(M0287).toContain('0287 failed: anon can execute');
  });

  it('حارس يتحقق أن plan_optimized_route تُرجع 8 أعمدة', () => {
    expect(M0287).toContain('must return 8 columns');
  });
});

/* ════════════════════════════════════════════════════════════
   0288 — ثغرة قيد الأدوار
   ════════════════════════════════════════════════════════════ */
describe('0288 — قيد أدوار profiles (ثغرة P0)', () => {
  it('يضيف أدوار الحركة الثلاثة إلى القيد', () => {
    expect(M0288).toContain("'employee_movement'");
    expect(M0288).toContain("'logistics'");
    expect(M0288).toContain("'movement_manager'");
  });

  it('يحتفظ بكل الأدوار السابقة — لا يكسر بيانات قائمة', () => {
    for (const r of [
      'employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor',
      'manager', 'it_admin', 'tech', 'finance', 'marketing', 'sales',
      'procurement', 'inventory', 'manufacturing',
    ]) {
      expect(M0288).toContain(`'${r}'`);
    }
  });

  it('يبقى القيد مغلقاً — يرفض الأدوار المختلَقة', () => {
    expect(M0288).toContain('constraint accepts arbitrary roles');
    expect(M0288).toContain('WHEN check_violation THEN NULL');
  });

  it('قائمة القيد تطابق UserRole في TypeScript', () => {
    const ts = read('src/shared/types/index.ts');
    const line = ts.split('\n').find((l) => l.includes('export type UserRole')) ?? '';
    const tsRoles = [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(tsRoles.length).toBe(18);
    for (const r of tsRoles) expect(M0288).toContain(`'${r}'`);
  });
});

/* ════════════════════════════════════════════════════════════
   الخريطة التفاعلية
   ════════════════════════════════════════════════════════════ */
describe('MovementMap — الخريطة المشتركة', () => {
  it('leaflet و react-leaflet و @types/leaflet مثبَّتة فعلياً', () => {
    expect(PKG.dependencies.leaflet).toBeTruthy();
    expect(PKG.dependencies['react-leaflet']).toBeTruthy();
    expect(PKG.devDependencies['@types/leaflet']).toBeTruthy();
    expect(existsSync(resolve(process.cwd(), 'node_modules/leaflet/dist/leaflet.css'))).toBe(true);
  });

  it('تستورد CSS الخاص بـ leaflet وإلا انهار التخطيط', () => {
    expect(MAP).toContain("import 'leaflet/dist/leaflet.css'");
  });

  it('تستعمل divIcon بـ SVG مضمَّن — أيقونة leaflet الافتراضية مكسورة مع الحزم', () => {
    expect(MAP).toContain('L.divIcon');
    expect(MAP).toContain('<svg');
    expect(MAP).not.toContain('marker-icon.png');
  });

  it('تنسب البلاطات لـ OpenStreetMap كما يوجب ترخيصها', () => {
    expect(MAP).toContain('openstreetmap.org/copyright');
    expect(MAP).toContain('attribution');
  });

  it('تعيد قياس الخريطة بعد التركيب — تُصلح الحاويات المخفية', () => {
    expect(MAP).toContain('invalidateSize');
  });

  it('تستبعد الإحداثيات غير الصالحة بدل رسمها في المحيط', () => {
    expect(MAP).toContain('Number.isFinite');
    expect(MAP).toMatch(/Math\.abs\(p\.lat\)\s*<=\s*90/);
    expect(MAP).toContain('!(p.lat === 0 && p.lng === 0)');
  });

  it('تصدّر منتقي الإحداثيات', () => {
    expect(MAP).toContain('export function CoordinatePicker');
    expect(MAP).toContain("map.on('click'");
  });

  it('تنظّف مستمع النقر والدائرة عند التفكيك — لا تسريب', () => {
    expect(MAP).toContain("map.off('click'");
    expect(MAP).toContain('circleRef.current?.remove()');
  });

  it('تضبط دقة الإحداثيات على 7 منازل — يطابق numeric(10,7)', () => {
    expect(MAP).toContain('toFixed(7)');
  });

  it('بلا as any', () => {
    expect(MAP).not.toContain('as any');
  });
});

/* ════════════════════════════════════════════════════════════
   الصفحات
   ════════════════════════════════════════════════════════════ */
describe('صفحة التتبع الحي — خريطة فعلية', () => {
  it('ترسم خريطة لا مجرد جدول', () => {
    expect(TRACKING).toContain('MovementMap');
    expect(TRACKING).toContain('mapPoints');
  });

  it('حُذف الإفصاح القديم بأن الخريطة غير متاحة — لم يعد صادقاً', () => {
    expect(TRACKING).not.toContain('مكتبة الخرائط غير مثبَّتة');
  });

  it('تُبقي الجدول تحت الخريطة — الخريطة وحدها لا تصلح للمسح ولا لقارئات الشاشة', () => {
    expect(TRACKING).toContain('<table');
  });

  it('ترسم فقط المركبات التي لها إحداثيات', () => {
    expect(TRACKING).toContain('p.latitude !== null && p.longitude !== null');
  });

  it('لون العلامة يتبع حالة الاتصال', () => {
    expect(TRACKING).toContain('pin:');
  });
});

describe('صفحة إعادة تشغيل المسار (L12)', () => {
  it('الملف موجود — findDispatchTrack لم تعد بلا واجهة', () => {
    expect(existsSync(resolve(process.cwd(),
      'src/pages/app/movement/logistics/LogisticsTrackReplayPage.tsx'))).toBe(true);
  });

  it('تستعمل RPC المُجمَّع لا القراءة الخام', () => {
    expect(REPLAY).toContain('getDispatchTrack');
    expect(REPLAY).toContain('getDispatchTrackSummary');
  });

  it('تعرض الملخّص من الخادم لا محسوباً في المتصفح', () => {
    expect(REPLAY).toContain('summary.total_km');
    expect(REPLAY).toContain('summary.stop_count');
  });

  it('فيها تحكّم تشغيل كامل', () => {
    expect(REPLAY).toContain('setPlaying');
    expect(REPLAY).toContain('SPEEDS');
    expect(REPLAY).toContain('type="range"');
  });

  it('التشغيل يتوقف عند النهاية لا يدور بلا نهاية', () => {
    expect(REPLAY).toContain('setPlaying(false)');
    expect(REPLAY).toMatch(/c >= track\.length - 1/);
  });

  it('تُنظّف المؤقّت عند التفكيك', () => {
    expect(REPLAY).toContain('clearInterval');
  });

  it('تُحذّر أن الخط عبر فجوة الإشارة تقدير لا مسار مسجَّل', () => {
    expect(REPLAY).toContain('longGaps');
    expect(REPLAY).toContain('تقدير');
  });

  it('فيها تنقّل الوحدة', () => {
    expect(REPLAY).toContain('MovementUnitNav');
  });

  it('بلا confirm/prompt/as any', () => {
    expect(REPLAY).not.toMatch(/\bconfirm\(/);
    expect(REPLAY).not.toMatch(/\bprompt\(/);
    expect(REPLAY).not.toContain('as any');
  });
});

describe('تخطيط المسار — عرض مراحل الخوارزمية', () => {
  /* 0289 أضاف مرحلة Or-opt: المراحل صارت أربعاً لا ثلاثاً */
  it('يعرض المراحل الأربع لا رقماً واحداً', () => {
    expect(ROUTES).toContain('result.naive_km');
    expect(ROUTES).toContain('result.nn_km');
    expect(ROUTES).toContain('result.two_opt_km');
    expect(ROUTES).toContain('result.optimized_km');
  });

  it('يرسم المسار النهائي على الخريطة', () => {
    expect(ROUTES).toContain('MovementMap');
    expect(ROUTES).toContain('plannedPoints');
  });

  it('يقرأ المحطات من الصف المحفوظ لا يُعيد ترتيبها محلياً', () => {
    expect(ROUTES).toContain('logisticsRouteService.findById');
    expect(ROUTES).toContain('waypoints_json');
  });

  it('يبقى صادقاً بأن الحل تقريبي والمسافة جوّية', () => {
    expect(ROUTES).toContain('حل تقريبي لا أمثل');
    expect(ROUTES).toContain('جوّية');
  });

  it('فشل قراءة المحطات لا يُبطل التخطيط الناجح', () => {
    expect(ROUTES).toContain('setPlanned(null)');
  });
});

describe('صفحة المواقع — إصلاح المودال الميت والمنتقي', () => {
  it('زر الأرشفة موجود — المودال كان بلا مُشغّل إطلاقاً', () => {
    expect(LOCATIONS).toContain('setArchiveTarget({ id: l.id');
  });

  it('يُصفّر سبب الأرشفة عند فتح المودال — لا يتسرّب سبب سابق', () => {
    expect(LOCATIONS).toMatch(/setArchiveReason\(''\);\s*setArchiveTarget\(\{/);
  });

  it('لا يعرض زر أرشفة لموقع مؤرشف سلفاً', () => {
    expect(LOCATIONS).toContain('l.is_active ? (');
  });

  it('فيه منتقي إحداثيات على الخريطة', () => {
    expect(LOCATIONS).toContain('CoordinatePicker');
  });

  it('يرسم السور الجغرافي بنصف القطر المُدخَل', () => {
    expect(LOCATIONS).toContain('radiusMeters={form.radiusMeters}');
  });

  it('لا حذف نهائي — أرشفة بسبب إلزامي', () => {
    expect(LOCATIONS).toContain('archiveLocation');
    expect(LOCATIONS).toContain('لا حذف نهائي');
    expect(LOCATIONS).not.toMatch(/\.delete\(/);
  });
});

describe('تنقّل صفحات حركة الموظفين — كان مفقوداً كلياً', () => {
  const PAGES = [
    'EmployeeComplianceViolationsPage', 'EmployeeFieldVisitsPage',
    'EmployeeMissionsPage', 'EmployeeMovementAnalyticsPage',
    'EmployeeMovementApprovalsPage', 'EmployeeMovementGateExecutionPage',
    'EmployeeMovementLocationsPage', 'EmployeeMovementNewPermitPage',
    'EmployeeMovementPermitDetailPage', 'EmployeeMovementPermitsPage',
    'EmployeeMovementPoliciesPage', 'EmployeeMovementTemplatesPage',
  ];

  it.each(PAGES)('%s فيها MovementUnitNav', (page) => {
    const src = read(`src/pages/app/movement/employee/${page}.tsx`);
    expect(src).toContain('MovementUnitNav');
    expect(src).toMatch(/<MovementUnitNav unit="employee_/);
  });

  it('كل مفاتيح الوحدات المستعملة معرَّفة في MovementUnitNav', () => {
    const defined = new Set(
      [...NAV.matchAll(/^\s{2}(employee_\w+|logistics_\w+):\s*\{/gm)].map((m) => m[1]),
    );
    for (const page of PAGES) {
      const src = read(`src/pages/app/movement/employee/${page}.tsx`);
      const used = src.match(/<MovementUnitNav unit="(\w+)"/)?.[1];
      expect(used, `${page} يستعمل مفتاحاً`).toBeTruthy();
      expect(defined.has(used as string), `${page}: المفتاح ${used} غير معرَّف`).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════
   التسجيل في المواضع الأربعة
   ════════════════════════════════════════════════════════════ */
describe('تسجيل صفحة إعادة التشغيل في المواضع الأربعة', () => {
  it('AppRouter — استيراد كسول ومسار', () => {
    expect(ROUTER).toContain('LogisticsTrackReplayPage');
    expect(ROUTER).toContain('path="logistics/track-replay"');
  });

  it('Sidebar — بند وخريطة وحدة وقسم', () => {
    expect(SIDEBAR).toContain("id: 'movement-log-track-replay'");
    expect(SIDEBAR).toContain("'movement-log-track-replay': 'movement'");
  });

  it('hybridPagesCatalog', () => {
    expect(CATALOG).toContain("id: 'movement-log-track-replay'");
  });

  it('AdminEmployeesPage', () => {
    expect(ADMIN).toContain("id: 'movement-log-track-replay'");
  });

  it('legacyRedirect يشير للمسار الصحيح', () => {
    expect(LEGACY).toContain("'movement-log-track-replay'");
    expect(LEGACY).toContain('/app/movement/logistics/track-replay');
  });

  it('مفتاح الصلاحية معرَّف وممنوح للدورين', () => {
    // مرة في PERMISSION_KEYS + مرة لكل من logistics و movement_manager
    expect((PERMS.match(/'movement-log-track-replay'/g) ?? []).length).toBe(3);
  });

  it('MovementUnitNav يربطها من القائمة الرئيسية ومن وحدة التتبع', () => {
    expect((NAV.match(/logistics\/track-replay/g) ?? []).length).toBe(2);
  });
});

/* ════════════════════════════════════════════════════════════
   طبقة SDK
   ════════════════════════════════════════════════════════════ */
describe('SDK — الأنواع والدوال الجديدة', () => {
  it('MovementTelemetryService يُصدّر الأنواع الثلاثة', () => {
    expect(TELEMETRY_SDK).toContain('export interface DispatchTrackPoint');
    expect(TELEMETRY_SDK).toContain('export interface DispatchTrackSummary');
    expect(TELEMETRY_SDK).toContain('export interface TrackableDispatch');
  });

  it('يستدعي RPCs 0287 بالأسماء الصحيحة', () => {
    expect(TELEMETRY_SDK).toContain("rpc('get_dispatch_track'");
    expect(TELEMETRY_SDK).toContain("rpc('get_dispatch_track_summary'");
    expect(TELEMETRY_SDK).toContain("from('logistics_trackable_dispatches')");
  });

  it('يتعامل مع RETURNS TABLE كصف واحد لا مصفوفة', () => {
    expect(TELEMETRY_SDK).toContain('Array.isArray(data) ? data[0] : data');
  });

  it('RoutePlanResult يعكس أعمدة 0289 الثمانية', () => {
    expect(FOUNDATION_SDK).toContain('nn_km: number');
    expect(FOUNDATION_SDK).toContain('two_opt_km: number');
    expect(FOUNDATION_SDK).toContain('optimized_km: number');
    expect(FOUNDATION_SDK).toContain('export interface RouteWaypoint');
  });

  it('لا صفحة تلمس supabase مباشرة — كل شيء عبر SDK', () => {
    for (const src of [REPLAY, TRACKING, ROUTES, LOCATIONS, MAP]) {
      expect(src).not.toContain("from '../../../../services/supabase/supabase'");
      expect(src).not.toMatch(/supabase\.from\(/);
    }
  });

  it('بلا as any في أي ملف من الجولة', () => {
    for (const src of [REPLAY, TRACKING, ROUTES, LOCATIONS, MAP, TELEMETRY_SDK]) {
      expect(src).not.toContain('as any');
    }
  });
});
