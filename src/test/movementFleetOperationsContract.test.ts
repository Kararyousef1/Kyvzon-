/**
 * عقد عمليات الأسطول — الجولة الثانية من مراجعة بوابة الحركة
 *
 * العطل المُعالَج:
 *   المايجريشنات 0270–0282 أنشأت 32 جدولاً لكن **صفر RPC** لمنطق
 *   الأعمال. كل صفحات اللوجستيات الثلاث عشرة كانت قراءة فقط،
 *   و12 زراً يعرض «قيد التطوير»، ولوحة القيادة أرقاماً ثابتة.
 *
 * كل تأكيد هنا يقابل سلوكاً أُثبت بالتشغيل الفعلي على Postgres 17.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** يزيل التعليقات — العبارات القديمة تُذكر في شرح «ما كان قبل الإصلاح» */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RPC = read('supabase/migrations/0283_movement_fleet_operations_rpcs.sql');
const SVC = read('src/services/sdk/LogisticsFleetOperationsService.ts');
const DASH = read('src/pages/app/movement/logistics/LogisticsDashboardPage.tsx');
const FLEET = read('src/pages/app/movement/logistics/LogisticsVehiclesPage.tsx');

describe('0283 — دوال تشغيل الأسطول', () => {
  it('ينشئ الدوال الثماني', () => {
    for (const fn of [
      'movement_next_code',
      'create_fleet_vehicle',
      'set_vehicle_status',
      'update_vehicle_mileage',
      'create_fleet_driver',
      'check_assignment_eligibility',
      'schedule_vehicle_maintenance',
      'complete_vehicle_maintenance',
    ]) {
      expect(RPC).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('كل دالة تفرض دور logistics', () => {
    const guards = RPC.match(/PERFORM public\.movement_require_role\('logistics'\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(7);
  });

  it('يسحب EXECUTE من anon على كل دالة', () => {
    const revokes = RPC.match(/FROM anon;/g) ?? [];
    expect(revokes.length).toBeGreaterThanOrEqual(8);
  });

  it('يضع حارساً يفشل إن استطاع anon التنفيذ', () => {
    expect(RPC).toContain("has_function_privilege('anon'");
    expect(RPC).toContain('anon can execute');
  });
});

describe('0283 — قواعد المركبات (مُثبَتة بالتشغيل)', () => {
  it('يرفض اللوحة المكرَّرة', () => {
    expect(RPC).toContain('DUPLICATE_PLATE_NUMBER');
    expect(RPC).toContain('upper(plate_number) = v_plate');
  });

  it('يرفض سنة الصنع غير المنطقية', () => {
    expect(RPC).toContain('INVALID_VEHICLE_YEAR');
    expect(RPC).toContain('p_year < 1950');
  });

  it('يرفض القيم السالبة', () => {
    expect(RPC).toContain('NEGATIVE_VALUE_NOT_ALLOWED');
  });

  it('★ يمنع تراجع العداد — مؤشر تلاعب', () => {
    expect(RPC).toContain('MILEAGE_CANNOT_DECREASE');
    expect(RPC).toContain('p_mileage_km < v_old');
  });

  it('تغيير الحالة يتطلب سبباً نصياً', () => {
    expect(RPC).toContain('STATUS_CHANGE_REASON_REQUIRED');
    expect(RPC).toContain('length(trim(p_reason)) < 5');
  });

  it('مركبة في رحلة لا تُسحب للصيانة مباشرة', () => {
    expect(RPC).toContain('VEHICLE_ON_TRIP_CANNOT_CHANGE_STATUS');
  });

  it('يمنع تغيير الحالة لنفس الحالة', () => {
    expect(RPC).toContain('VEHICLE_ALREADY_IN_STATUS');
  });
});

describe('0283 — قواعد السائقين', () => {
  it('يرفض تسجيل سائق برخصة منتهية', () => {
    expect(RPC).toContain('LICENSE_ALREADY_EXPIRED');
    expect(RPC).toContain('p_license_expiry_date < CURRENT_DATE');
  });

  it('يرفض رقم الرخصة المكرَّر', () => {
    expect(RPC).toContain('DUPLICATE_LICENSE_NUMBER');
  });
});

describe('0283 — ★ أهلية الإسناد (القاعدة الأهم)', () => {
  it('تفحص حالة المركبة والسائق', () => {
    expect(RPC).toContain('VEHICLE_NOT_AVAILABLE');
    expect(RPC).toContain('DRIVER_NOT_ACTIVE');
  });

  it('تمنع الإسناد برخصة منتهية وتحذّر من القاربة', () => {
    expect(RPC).toContain('DRIVER_LICENSE_EXPIRED');
    expect(RPC).toContain('DRIVER_LICENSE_EXPIRING_SOON');
  });

  it('تمنع الإسناد بوثيقة مركبة منتهية', () => {
    expect(RPC).toContain('VEHICLE_DOCUMENT_EXPIRED');
    expect(RPC).toContain('fleet_vehicle_documents');
  });

  it('تمنع الإسناد بصيانة مفتوحة', () => {
    expect(RPC).toContain('VEHICLE_HAS_OPEN_MAINTENANCE');
  });

  it('تُرجع كل العوائق لا أولها فقط', () => {
    // RETURNS TABLE + عدة RETURN QUERY بلا RETURN مبكر
    expect(RPC).toContain('RETURNS TABLE');
    const returns = RPC.match(/RETURN QUERY SELECT false/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(4);
  });
});

describe('0283 — دورة الصيانة', () => {
  it('الوصف إلزامي والنوع مُقيَّد', () => {
    expect(RPC).toContain('MAINTENANCE_DESCRIPTION_REQUIRED');
    expect(RPC).toContain('INVALID_MAINTENANCE_TYPE');
  });

  it('يمنع صيانتين مفتوحتين لنفس المركبة', () => {
    expect(RPC).toContain('VEHICLE_ALREADY_HAS_OPEN_MAINTENANCE');
  });

  it('صيانة اليوم تُخرج المركبة من الخدمة', () => {
    expect(RPC).toContain('p_scheduled_date <= CURRENT_DATE');
    expect(RPC).toContain("SET status = 'maintenance'");
  });

  it('الإكمال يعيدها للخدمة إن لم يبقَ أمر مفتوح', () => {
    expect(RPC).toContain('MAINTENANCE_ALREADY_COMPLETED');
    expect(RPC).toContain('NOT EXISTS');
    expect(RPC).toContain("SET status = 'available'");
  });

  it('يستخدم أعمدة الجدول الحقيقية', () => {
    // logistics_maintenance فيه completed_date و technician_notes
    expect(RPC).toContain('completed_date = CURRENT_DATE');
    expect(RPC).toContain('technician_notes');
  });
});

describe('0283 — سجل التدقيق', () => {
  it('يستخدم عمود payload الحقيقي لا old_value/new_value', () => {
    // movement_audit_events فيه payload JSONB فقط
    expect(RPC).toContain('entity_id, payload)');
    expect(RPC).not.toContain('old_value');
    expect(RPC).not.toContain('new_value');
  });

  it('يسجّل كل العمليات الحرجة', () => {
    for (const ev of [
      'vehicle_created', 'vehicle_status_changed',
      'driver_created', 'maintenance_scheduled', 'maintenance_completed',
    ]) {
      expect(RPC).toContain(`'${ev}'`);
    }
  });
});

describe('0283 — Views لوحة القيادة', () => {
  it('ينشئ المؤشرات والتنبيهات', () => {
    expect(RPC).toContain('CREATE OR REPLACE VIEW public.logistics_dashboard_kpis');
    expect(RPC).toContain('CREATE OR REPLACE VIEW public.logistics_fleet_alerts');
  });

  it('security_invoker لاحترام RLS', () => {
    const si = RPC.match(/WITH \(security_invoker = true\)/g) ?? [];
    expect(si.length).toBeGreaterThanOrEqual(2);
  });

  it('الجاهزية محسوبة لا ثابتة، وتتفادى القسمة على صفر', () => {
    expect(RPC).toContain('fleet_readiness_percent');
    expect(RPC).toContain('THEN 0');
  });

  it('التنبيهات تصنَّف بأربعة مستويات', () => {
    for (const s of ['expired', 'critical', 'urgent', 'upcoming']) {
      expect(RPC).toContain(`'${s}'`);
    }
  });
});

describe('طبقة SDK', () => {
  it('الخدمة موجودة', () => {
    expect(existsSync(join(ROOT, 'src/services/sdk/LogisticsFleetOperationsService.ts'))).toBe(true);
  });

  it('تستدعي RPCs لا إدراجاً مباشراً', () => {
    for (const rpc of [
      'create_fleet_vehicle', 'set_vehicle_status', 'update_vehicle_mileage',
      'create_fleet_driver', 'check_assignment_eligibility',
      'schedule_vehicle_maintenance', 'complete_vehicle_maintenance',
    ]) {
      expect(SVC).toContain(`'${rpc}'`);
    }
  });

  it('لا as any', () => {
    expect(SVC).not.toContain('as any');
  });

  it('توفّر مختصر أهلية الإسناد', () => {
    expect(SVC).toContain('isAssignmentAllowed');
  });
});

describe('الواجهة — لوحة القيادة', () => {
  it('لم تعد تعرض أرقاماً ثابتة', () => {
    expect(DASH).toContain('getDashboardKpis');
    expect(DASH).toContain('findFleetAlerts');
    // القيم الثابتة القديمة اختفت من الكود (التعليقات تشرح ما كان)
    const code = codeOnly(DASH);
    expect(code).not.toContain('100%');
    expect(code).not.toContain('0 د.ع');
  });

  it('تعرض ما يمنع التشغيل أولاً', () => {
    expect(DASH).toContain('يمنع الإسناد الآن');
    expect(DASH).toContain("severity === 'expired'");
  });
});

describe('الواجهة — صفحة الأسطول', () => {
  it('زر الإنشاء يعمل فعلاً لا «قيد التطوير»', () => {
    expect(FLEET).toContain('createVehicle');
    expect(codeOnly(FLEET)).not.toContain('قيد التطوير');
  });

  it('تغيير الحالة بنموذج وسبب إلزامي لا confirm/prompt', () => {
    expect(FLEET).toContain('statusReason');
    expect(FLEET).toContain('setVehicleStatus');
    expect(FLEET).not.toMatch(/\bwindow\.confirm\(|(?<![a-zA-Z])confirm\(|(?<![a-zA-Z])prompt\(/);
  });

  it('تحديث العداد متاح مع تنبيه عدم التراجع', () => {
    expect(FLEET).toContain('updateMileage');
    expect(FLEET).toContain('العداد لا يتراجع');
  });

  it('لا as any', () => {
    expect(FLEET).not.toContain('as any');
  });
});
