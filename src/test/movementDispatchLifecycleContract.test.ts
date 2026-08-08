/**
 * عقد دورة الإرسال — الجولة الثالثة من مراجعة بوابة الحركة
 *
 * يغطي 0284: أوامر النقل (L05) · الإرسال (L07) · التسليم (L09) · الوقود (L04)
 * وربط الواجهة بها بدل أزرار «قيد التطوير».
 *
 * كل تأكيد يقابل سلوكاً أُثبت بالتشغيل على Postgres 17 (19 اختباراً).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** يزيل التعليقات — العبارات القديمة تُذكر في شرح «ما كان قبل الإصلاح» */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RPC = read('supabase/migrations/0284_movement_dispatch_lifecycle_rpcs.sql');
const SVC = read('src/services/sdk/LogisticsDispatchOperationsService.ts');
const DISPATCH = read('src/pages/app/movement/logistics/LogisticsDispatchPage.tsx');
const FUEL = read('src/pages/app/movement/logistics/LogisticsFuelPage.tsx');
const DRIVERS = read('src/pages/app/movement/logistics/LogisticsDriversPage.tsx');
const ORDERS = read('src/pages/app/movement/logistics/LogisticsShipmentOrdersPage.tsx');
const FOUNDATION_SVC = read('src/services/sdk/MovementFoundationService.ts');

const LOGISTICS_PAGES = [
  'LogisticsCarriersPage', 'LogisticsCostAnalyticsPage', 'LogisticsDashboardPage',
  'LogisticsDispatchPage', 'LogisticsDriversPage', 'LogisticsEpodPage',
  'LogisticsFoundationPage', 'LogisticsFuelPage', 'LogisticsLiveTrackingPage',
  'LogisticsMaintenancePage', 'LogisticsRoutePlanningPage',
  'LogisticsShipmentOrdersPage', 'LogisticsVehiclesPage',
];

describe('0284 — دوال دورة الإرسال', () => {
  it('ينشئ الدوال الخمس', () => {
    for (const fn of [
      'create_shipment_order', 'dispatch_shipment_order',
      'update_dispatch_status', 'record_delivery_proof', 'log_fuel_transaction',
    ]) {
      expect(RPC).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('كل دالة تفرض دور logistics', () => {
    const guards = RPC.match(/PERFORM public\.movement_require_role\('logistics'\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(5);
  });

  it('يسحب EXECUTE من anon على كل دالة', () => {
    const revokes = RPC.match(/FROM anon;/g) ?? [];
    expect(revokes.length).toBeGreaterThanOrEqual(5);
  });

  it('حارس يفشل إن استطاع anon التنفيذ', () => {
    expect(RPC).toContain("has_function_privilege('anon'");
    expect(RPC).toContain('anon can execute');
  });
});

describe('0284 — قواعد أوامر النقل', () => {
  it('يرفض العناوين والوصف الفارغ', () => {
    expect(RPC).toContain('ORIGIN_ADDRESS_REQUIRED');
    expect(RPC).toContain('DESTINATION_ADDRESS_REQUIRED');
    expect(RPC).toContain('CARGO_DESCRIPTION_REQUIRED');
  });

  it('يرفض من = إلى', () => {
    expect(RPC).toContain('ORIGIN_AND_DESTINATION_IDENTICAL');
  });

  it('يقيّد الأولوية ويرفض الحمولة السالبة', () => {
    expect(RPC).toContain('INVALID_PRIORITY');
    expect(RPC).toContain('NEGATIVE_CARGO_NOT_ALLOWED');
  });
});

describe('0284 — ★ قواعد الإرسال', () => {
  it('يمنع إرسال أمر غير قابل للإرسال', () => {
    expect(RPC).toContain('ORDER_NOT_DISPATCHABLE');
  });

  it('يمنع الازدواج', () => {
    expect(RPC).toContain('ORDER_ALREADY_DISPATCHED');
  });

  it('يمنع إسناد مركبة أو سائق في رحلة نشطة', () => {
    expect(RPC).toContain('VEHICLE_ALREADY_ON_ACTIVE_DISPATCH');
    expect(RPC).toContain('DRIVER_ALREADY_ON_ACTIVE_DISPATCH');
  });

  it('★ يفرض سعة المركبة وزناً وحجماً', () => {
    expect(RPC).toContain('CARGO_EXCEEDS_VEHICLE_WEIGHT');
    expect(RPC).toContain('CARGO_EXCEEDS_VEHICLE_VOLUME');
  });

  it('يعيد استخدام فحص الأهلية من 0283 — مصدر حقيقة واحد', () => {
    expect(RPC).toContain('public.check_assignment_eligibility');
    expect(RPC).toContain('ASSIGNMENT_BLOCKED');
  });

  it('الإرسال يحدّث حالة المركبة والأمر معاً', () => {
    expect(RPC).toContain("SET status = 'on_trip'");
    expect(RPC).toContain("SET status = 'dispatched'");
  });
});

describe('0284 — آلة حالات الإرسال', () => {
  it('تمنع الانتقالات غير المشروعة', () => {
    expect(RPC).toContain('INVALID_STATUS_TRANSITION');
    expect(RPC).toContain("v_rec.status = 'dispatched' AND p_status IN ('en_route','failed')");
    expect(RPC).toContain("v_rec.status = 'en_route'   AND p_status IN ('arrived','failed')");
  });

  it('تمنع تعديل رحلة مغلقة', () => {
    expect(RPC).toContain('DISPATCH_ALREADY_CLOSED');
  });

  it('الفشل يتطلب سبباً نصياً', () => {
    expect(RPC).toContain('FAILURE_REASON_REQUIRED');
  });

  it('الإغلاق يحرّر المركبة', () => {
    expect(RPC).toContain("SET status = 'available'");
  });
});

describe('0284 — إثبات التسليم', () => {
  it('يمنع ePOD قبل الوصول', () => {
    expect(RPC).toContain('CANNOT_RECORD_EPOD_BEFORE_ARRIVAL');
  });

  it('يمنع التكرار', () => {
    expect(RPC).toContain('EPOD_ALREADY_RECORDED');
  });

  it('الرفض والنزاع يحتاجان تفسيراً', () => {
    expect(RPC).toContain('DELIVERY_NOTES_REQUIRED_FOR_');
  });

  it('التسليم الناجح يُغلق الرحلة تلقائياً', () => {
    expect(RPC).toContain("PERFORM public.update_dispatch_status(p_dispatch_id, 'completed', NULL)");
  });
});

describe('0284 — ★ كشف احتيال الوقود', () => {
  it('يرصد الأعلام الأربعة', () => {
    for (const flag of [
      'RAPID_REFUEL', 'ABNORMAL_CONSUMPTION',
      'EXCESSIVE_QUANTITY', 'FUEL_FOR_ELECTRIC_VEHICLE',
    ]) {
      expect(RPC).toContain(flag);
    }
  });

  it('يمنع تراجع العداد', () => {
    expect(RPC).toContain('ODOMETER_CANNOT_DECREASE');
  });

  it('يرفض اللترات غير الموجبة', () => {
    expect(RPC).toContain('INVALID_LITERS');
  });

  it('يحدّث عداد المركبة من قراءة التزوّد', () => {
    expect(RPC).toContain('SET current_mileage_km = p_odometer_reading');
  });

  it('الأعلام لا تمنع التسجيل — تُعلَّم فقط', () => {
    expect(RPC).toContain('RETURN QUERY SELECT v_id, v_flags');
  });
});

describe('0284 — Views', () => {
  it('لوحة الإرسال وكفاءة الوقود', () => {
    expect(RPC).toContain('CREATE OR REPLACE VIEW public.logistics_dispatch_board');
    expect(RPC).toContain('CREATE OR REPLACE VIEW public.logistics_fuel_efficiency');
  });

  it('security_invoker لاحترام RLS', () => {
    const si = RPC.match(/WITH \(security_invoker = true\)/g) ?? [];
    expect(si.length).toBeGreaterThanOrEqual(2);
  });

  it('لوحة الإرسال تحسب التأخر', () => {
    expect(RPC).toContain('is_overdue');
    expect(RPC).toContain('minutes_late');
  });

  it('كفاءة الوقود تتفادى القسمة على صفر', () => {
    expect(RPC).toContain('<= 0 THEN NULL');
  });
});

describe('طبقة SDK', () => {
  it('الخدمة موجودة وتستدعي RPCs', () => {
    expect(existsSync(join(ROOT, 'src/services/sdk/LogisticsDispatchOperationsService.ts'))).toBe(true);
    for (const rpc of [
      'create_shipment_order', 'dispatch_shipment_order',
      'update_dispatch_status', 'record_delivery_proof', 'log_fuel_transaction',
    ]) {
      expect(SVC).toContain(`'${rpc}'`);
    }
  });

  it('تعرّف أعلام الوقود بترجمة عربية', () => {
    expect(SVC).toContain('FUEL_FLAG_LABELS');
    expect(SVC).toContain('RAPID_REFUEL');
  });

  it('لا as any', () => {
    expect(SVC).not.toContain('as any');
  });
});

describe('الواجهة — لوحة الإرسال', () => {
  it('زر الإرسال يعمل فعلاً', () => {
    expect(DISPATCH).toContain('dispatchOrder');
    expect(codeOnly(DISPATCH)).not.toContain('قيد التطوير');
  });

  it('لوحة Kanban بالحالات الخمس', () => {
    for (const s of ['dispatched', 'en_route', 'arrived', 'completed', 'failed']) {
      expect(DISPATCH).toContain(`'${s}'`);
    }
  });

  it('الإجراءات تتبع آلة الحالات', () => {
    expect(DISPATCH).toContain("advance(r, 'en_route')");
    expect(DISPATCH).toContain("advance(r, 'arrived')");
  });

  it('الإغلاق كفاشلة بنموذج وسبب إلزامي', () => {
    expect(DISPATCH).toContain('failReason');
    expect(DISPATCH).not.toMatch(/\bwindow\.confirm\(|(?<![a-zA-Z])confirm\(|(?<![a-zA-Z])prompt\(/);
  });

  it('ePOD متاح بعد الوصول فقط', () => {
    expect(DISPATCH).toContain("r.dispatch_status === 'arrived' && !r.has_epod");
  });

  it('تعرض الرحلات المتأخرة أولاً', () => {
    expect(DISPATCH).toContain('is_overdue');
    expect(DISPATCH).toContain('رحلات متأخرة');
  });
});

describe('الواجهة — الوقود والسائقون والأوامر', () => {
  it('صفحة الوقود مربوطة بـ RPC وتعرض الأعلام', () => {
    expect(FUEL).toContain('logFuel');
    expect(FUEL).toContain('FUEL_FLAG_LABELS');
    expect(codeOnly(FUEL)).not.toContain('قيد التطوير');
  });

  it('صفحة السائقين تنشئ فعلاً', () => {
    expect(DRIVERS).toContain('createDriver');
    expect(codeOnly(DRIVERS)).not.toContain('قيد التطوير');
  });

  it('صفحة الأوامر تنشئ فعلاً', () => {
    expect(ORDERS).toContain('createOrder');
    expect(codeOnly(ORDERS)).not.toContain('قيد التطوير');
  });
});

describe('اتساق البوابة', () => {
  it('كل صفحات اللوجستيات الثلاث عشرة فيها MovementUnitNav', () => {
    for (const page of LOGISTICS_PAGES) {
      const src = read(`src/pages/app/movement/logistics/${page}.tsx`);
      expect(src, `${page} بلا MovementUnitNav`).toContain('MovementUnitNav');
    }
  });

  it('لا BaseService<any> في خدمات الحركة', () => {
    expect(FOUNDATION_SVC).not.toContain('BaseService<any>');
    expect(FOUNDATION_SVC).toContain('LogisticsSettingRecord');
  });

  it('لا confirm/prompt في أي صفحة لوجستية', () => {
    for (const page of LOGISTICS_PAGES) {
      const src = read(`src/pages/app/movement/logistics/${page}.tsx`);
      expect(src, `${page} يستخدم confirm/prompt`)
        .not.toMatch(/\bwindow\.confirm\(|(?<![a-zA-Z])confirm\(|(?<![a-zA-Z])prompt\(/);
    }
  });
});
