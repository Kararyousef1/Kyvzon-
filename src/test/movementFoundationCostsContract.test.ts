/**
 * عقد الأساس والناقلين والتكاليف والمسارات — الجولة الرابعة
 *
 * يغطي 0285: E00 المواقع والسياسات · L06 المسارات · L10 الناقلون · L11 التكاليف
 * وإنهاء آخر أزرار «قيد التطوير» في البوابة.
 *
 * كل تأكيد يقابل سلوكاً أُثبت بالتشغيل على Postgres 17 (23 اختباراً).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** يزيل التعليقات — العبارات القديمة تُذكر في شرح «ما كان قبل الإصلاح» */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RPC = read('supabase/migrations/0285_movement_foundation_carriers_costs_rpcs.sql');
const SVC = read('src/services/sdk/MovementFoundationOperationsService.ts');
const LOCATIONS = read('src/pages/app/movement/employee/EmployeeMovementLocationsPage.tsx');
const POLICIES = read('src/pages/app/movement/employee/EmployeeMovementPoliciesPage.tsx');
const CARRIERS = read('src/pages/app/movement/logistics/LogisticsCarriersPage.tsx');
const COSTS = read('src/pages/app/movement/logistics/LogisticsCostAnalyticsPage.tsx');
const ROUTES = read('src/pages/app/movement/logistics/LogisticsRoutePlanningPage.tsx');
const EPOD = read('src/pages/app/movement/logistics/LogisticsEpodPage.tsx');

const ALL_MOVEMENT_PAGES = [
  ...['LogisticsCarriersPage', 'LogisticsCostAnalyticsPage', 'LogisticsDashboardPage',
      'LogisticsDispatchPage', 'LogisticsDriversPage', 'LogisticsEpodPage',
      'LogisticsFoundationPage', 'LogisticsFuelPage', 'LogisticsLiveTrackingPage',
      'LogisticsMaintenancePage', 'LogisticsRoutePlanningPage',
      'LogisticsShipmentOrdersPage', 'LogisticsVehiclesPage'].map((p) => `logistics/${p}`),
  ...['EmployeeComplianceViolationsPage', 'EmployeeFieldVisitsPage', 'EmployeeMissionsPage',
      'EmployeeMovementAnalyticsPage', 'EmployeeMovementApprovalsPage',
      'EmployeeMovementGateExecutionPage', 'EmployeeMovementLocationsPage',
      'EmployeeMovementNewPermitPage', 'EmployeeMovementPermitDetailPage',
      'EmployeeMovementPermitsPage', 'EmployeeMovementPoliciesPage',
      'EmployeeMovementTemplatesPage'].map((p) => `employee/${p}`),
];

describe('0285 — الدوال الست', () => {
  it('كلها مُنشأة', () => {
    for (const fn of [
      'create_movement_location', 'archive_movement_location',
      'upsert_movement_policy', 'create_logistics_carrier',
      'record_trip_cost', 'plan_optimized_route',
    ]) {
      expect(RPC).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('تسحب EXECUTE من anon صراحةً', () => {
    const revokes = RPC.match(/FROM anon;/g) ?? [];
    expect(revokes.length).toBeGreaterThanOrEqual(6);
  });

  it('حارس يفشل إن استطاع anon التنفيذ', () => {
    expect(RPC).toContain("has_function_privilege('anon'");
    expect(RPC).toContain('anon can execute');
  });
});

describe('0285 — المواقع (E00)', () => {
  it('الإحداثيات إما معاً أو لا شيء', () => {
    expect(RPC).toContain('COORDINATES_MUST_BE_BOTH_OR_NEITHER');
  });

  it('يتحقق من مدى خطَّي العرض والطول', () => {
    expect(RPC).toContain('INVALID_LATITUDE');
    expect(RPC).toContain('INVALID_LONGITUDE');
    expect(RPC).toContain('p_latitude < -90 OR p_latitude > 90');
  });

  it('يقيّد نوع الموقع بالقيم السبع', () => {
    expect(RPC).toContain('INVALID_LOCATION_TYPE');
    expect(RPC).toContain("'gate','warehouse','office','checkpoint','parking','hub','client_site'");
  });

  it('يمنع الاسم المكرَّر ونصف القطر غير الموجب', () => {
    expect(RPC).toContain('DUPLICATE_LOCATION_NAME');
    expect(RPC).toContain('RADIUS_MUST_BE_POSITIVE');
  });

  it('أرشفة لا حذف — بسبب إلزامي', () => {
    expect(RPC).toContain('ARCHIVE_REASON_REQUIRED');
    expect(RPC).toContain('SET is_active = FALSE');
    expect(RPC).not.toContain('DELETE FROM public.movement_locations');
  });

  it('يمنع أرشفة موقع في تصاريح نشطة', () => {
    expect(RPC).toContain('LOCATION_IN_USE_BY_ACTIVE_PERMITS');
    // العمود الحقيقي في 0273 اسمه destination_id
    expect(RPC).toContain('destination_id = p_location_id');
  });

  it('المواقع مشتركة بين الدورين', () => {
    expect(RPC).toContain("movement_has_role(auth.uid(), 'employee_movement')");
    expect(RPC).toContain("movement_has_role(auth.uid(), 'logistics')");
  });
});

describe('0285 — السياسات (E00)', () => {
  it('المدة ضمن 1..1440 دقيقة', () => {
    expect(RPC).toContain('INVALID_MAX_DURATION');
    expect(RPC).toContain('p_max_duration_minutes > 1440');
  });

  it('التعديل يتطلب سبباً — يؤثر على التصاريح القادمة', () => {
    expect(RPC).toContain('POLICY_CHANGE_REASON_REQUIRED');
  });

  it('يسجّل القيمة القديمة والجديدة في التدقيق', () => {
    expect(RPC).toContain("'old_max_duration'");
    expect(RPC).toContain("'new_max_duration'");
  });
});

describe('0285 — الناقلون (L10)', () => {
  it('يرفض العقد المنتهي والبريد غير الصالح', () => {
    expect(RPC).toContain('CONTRACT_ALREADY_EXPIRED');
    expect(RPC).toContain('INVALID_EMAIL');
  });

  it('يقيّد نوع الخدمة ويمنع الاسم المكرَّر', () => {
    expect(RPC).toContain('INVALID_SERVICE_TYPE');
    expect(RPC).toContain('DUPLICATE_CARRIER_NAME');
  });

  it('View الأداء يصنّف حالة العقد', () => {
    expect(RPC).toContain('contract_status');
    for (const s of ['no_contract', 'expired', 'expiring_soon', 'valid']) {
      expect(RPC).toContain(`'${s}'`);
    }
  });
});

describe('0285 — ★ التكاليف (L11)', () => {
  it('الإجمالي والربح يُحسبان في الخادم لا يُمرَّران', () => {
    expect(RPC).toContain(
      'v_total := p_fuel_cost + p_toll_cost + p_driver_allowance + p_maintenance_share');
    expect(RPC).toContain('v_net   := p_revenue - v_total');
    // لا معامل يستقبل الإجمالي أو الربح
    expect(RPC).not.toContain('p_total_cost');
    expect(RPC).not.toContain('p_net_profit');
  });

  it('تُسجَّل بعد انتهاء الرحلة فقط', () => {
    expect(RPC).toContain('CANNOT_RECORD_COST_FOR_ACTIVE_DISPATCH');
  });

  it('تمنع التكرار والمبالغ السالبة', () => {
    expect(RPC).toContain('TRIP_COST_ALREADY_RECORDED');
    expect(RPC).toContain('NEGATIVE_AMOUNT_NOT_ALLOWED');
  });

  it('View الربحية يحسب الهامش وتكلفة الكيلومتر', () => {
    expect(RPC).toContain('margin_percent');
    expect(RPC).toContain('cost_per_km');
    // حماية من القسمة على صفر
    expect(RPC).toContain('c.revenue > 0');
    expect(RPC).toContain('COALESCE(r.total_distance_km, 0) > 0');
  });
});

describe('0285 — ★ تخطيط المسار (L06)', () => {
  it('يستخدم Haversine من 0271', () => {
    expect(RPC).toContain('public.movement_haversine_km');
  });

  it('يشترط موقعين على الأقل وإحداثيات لكلٍّ منها', () => {
    expect(RPC).toContain('AT_LEAST_TWO_LOCATIONS_REQUIRED');
    expect(RPC).toContain('ALL_LOCATIONS_MUST_HAVE_COORDINATES');
  });

  it('يحدّ عدد المحطات — الخوارزمية O(n²)', () => {
    expect(RPC).toContain('TOO_MANY_STOPS_FOR_INLINE_OPTIMIZATION');
  });

  it('يقارن «قبل ← بعد» ولا يكتفي بالنتيجة', () => {
    expect(RPC).toContain('naive_km');
    expect(RPC).toContain('optimized_km');
    expect(RPC).toContain('saved_km');
  });

  it('★ يُفصح أن الحل تقريبي لا أمثل', () => {
    expect(RPC).toContain('heuristic');
    expect(RPC).toContain('حل تقريبي لا أمثل');
    // الإفصاح يجب أن يظهر في الملاحظة المخزَّنة مع المسار لا في تعليق فقط
    expect(RPC).toContain("'Nearest Neighbour (heuristic) — حل تقريبي لا أمثل'");
  });

  it('يمنع السرعة غير الموجبة', () => {
    expect(RPC).toContain('INVALID_AVG_SPEED');
  });
});

describe('طبقة SDK', () => {
  it('الخدمة موجودة وتستدعي كل RPCs', () => {
    expect(existsSync(join(ROOT, 'src/services/sdk/MovementFoundationOperationsService.ts'))).toBe(true);
    for (const rpc of [
      'create_movement_location', 'archive_movement_location',
      'upsert_movement_policy', 'create_logistics_carrier',
      'record_trip_cost', 'plan_optimized_route',
    ]) {
      expect(SVC).toContain(`'${rpc}'`);
    }
  });

  it('لا تمرّر الإجمالي ولا الربح', () => {
    expect(SVC).not.toContain('p_total_cost');
    expect(SVC).not.toContain('p_net_profit');
  });

  it('تُفصح عن كون التحسين تقريبياً', () => {
    expect(SVC).toContain('heuristic');
  });

  it('لا as any', () => {
    expect(SVC).not.toContain('as any');
  });
});

describe('الواجهة — الصفحات الأربع الأخيرة', () => {
  it('المواقع: إنشاء وأرشفة فعليان', () => {
    expect(LOCATIONS).toContain('createLocation');
    expect(LOCATIONS).toContain('archiveLocation');
    expect(LOCATIONS).toContain('archiveReason');
  });

  it('السياسات: إنشاء وتعديل بسبب', () => {
    expect(POLICIES).toContain('upsertPolicy');
    expect(POLICIES).toContain('سبب التعديل');
  });

  it('الناقلون: إنشاء فعلي', () => {
    expect(CARRIERS).toContain('createCarrier');
  });

  it('التكاليف: معاينة محلية والحساب في الخادم', () => {
    expect(COSTS).toContain('recordTripCost');
    expect(COSTS).toContain('previewTotal');
    expect(COSTS).toContain('معاينة فقط');
  });

  it('المسارات: تعرض «قبل ← بعد» وتنبيه الحل التقريبي', () => {
    expect(ROUTES).toContain('planRoute');
    expect(ROUTES).toContain('naive_km');
    expect(ROUTES).toContain('optimized_km');
    expect(ROUTES).toContain('حل تقريبي لا أمثل');
  });

  it('ePOD يوجّه للوحة الإرسال بدل تكرار النموذج', () => {
    expect(EPOD).toContain("navigate('/app/movement/logistics/dispatch')");
  });
});

describe('★ اكتمال البوابة', () => {
  it('صفر أزرار «قيد التطوير» في كل صفحات الحركة', () => {
    for (const page of ALL_MOVEMENT_PAGES) {
      const src = read(`src/pages/app/movement/${page}.tsx`);
      expect(codeOnly(src), `${page} ما زال فيه زر معطَّل`)
        .not.toContain('قيد التطوير');
    }
  });

  it('لا confirm/prompt في أي صفحة حركة', () => {
    for (const page of ALL_MOVEMENT_PAGES) {
      const src = read(`src/pages/app/movement/${page}.tsx`);
      expect(src, `${page} يستخدم confirm/prompt`)
        .not.toMatch(/\bwindow\.confirm\(|(?<![a-zA-Z])confirm\(|(?<![a-zA-Z])prompt\(/);
    }
  });

  it('لا as any في أي صفحة حركة', () => {
    for (const page of ALL_MOVEMENT_PAGES) {
      const src = read(`src/pages/app/movement/${page}.tsx`);
      expect(src, `${page} يستخدم as any`).not.toContain('as any');
    }
  });
});
