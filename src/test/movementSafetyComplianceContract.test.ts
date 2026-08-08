/**
 * عقد 0296 — HOS · DVIR · احتيال الوقود
 *
 * التحقق السلوكي في tools/dev/verify-movement-0296.sql
 * (35/35 على Postgres 17 من الصفر).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const M = read('supabase/migrations/0296_movement_hos_dvir_fuel_compliance.sql');
const SDK = read('src/services/sdk/MovementSafetyComplianceService.ts');
const PAGE = read('src/pages/app/movement/logistics/LogisticsSafetyCompliancePage.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const PERMS = read('src/core/constants/permissions.ts');
const NAV = read('src/pages/app/movement/shared/MovementUnitNav.tsx');

describe('0296 — DVIR: العيب الحرج يوقف المركبة', () => {
  it('يُنشئ جدول الفحص بـ RLS وسياسة', () => {
    expect(M).toContain('CREATE TABLE IF NOT EXISTS public.fleet_vehicle_inspections');
    expect(M).toContain('ALTER TABLE public.fleet_vehicle_inspections ENABLE ROW LEVEL SECURITY');
    expect(M).toContain('CREATE POLICY kyvzon_vehicle_inspections_all');
  });

  it('حارسه يمنع RLS بلا سياسة — درس 0282', () => {
    expect(M).toContain('inspections has RLS but no policy (total lockout)');
  });

  it('🔴 العيب الحرج ينقل المركبة إلى out_of_service تلقائياً', () => {
    expect(M).toMatch(/IF v_crit AND v_vehicle\.status = 'available' THEN/);
    expect(M).toContain("SET status = 'out_of_service'");
  });

  it('لا يوقف مركبة في رحلة — يترك القرار للمُرسِل', () => {
    expect(M).toContain('السائق على الطريق');
  });

  it('يتحقق من صحة كل عيب قبل القبول', () => {
    expect(M).toContain('INVALID_DEFECT_ENTRY');
    expect(M).toContain("NOT IN ('minor','major','critical')");
  });

  it('العداد لا يتراجع في الفحص', () => {
    expect(M).toContain('ODOMETER_CANNOT_DECREASE');
  });

  it('رفع الإيقاف بفحص جديد لا بتعديل السجل — دليل تدقيقي', () => {
    expect(M).toContain('clear_vehicle_defects');
    expect(M).toContain('لا تعديل للسجل الأصلي');
    expect(M).toContain('NO_CRITICAL_DEFECT_TO_CLEAR');
    expect(M).toContain('REPAIR_NOTES_REQUIRED');
  });
});

describe('0296 — HOS: حدود ساعات القيادة', () => {
  it('يوسّع الجدول بما يجعله قابلاً للاستعمال', () => {
    expect(M).toContain('ADD COLUMN IF NOT EXISTS started_at');
    expect(M).toContain('ADD COLUMN IF NOT EXISTS ended_at');
  });

  it('الحدود الأربعة مطبَّقة بالدقائق الصحيحة', () => {
    expect(M).toContain('(v_drive >= 660)');   // 11 ساعة
    expect(M).toContain('(v_duty  >= 840)');   // 14 ساعة
    expect(M).toContain('(v_cycle >= 4200)');  // 70 ساعة
    expect(M).toContain('v_rest < 600');       // 10 ساعات
  });

  it('🔴 الفترة المفتوحة تُحتسب حتى الآن لا تُهمل', () => {
    expect(M).toContain('WHEN h.ended_at IS NULL AND h.started_at IS NOT NULL');
    expect(M).toContain('EXTRACT(EPOCH FROM (now() - h.started_at))');
  });

  it('حساب مركزي واحد — لا تكرار يتباعد', () => {
    expect(M).toContain('دالة واحدة تحسب كل الحدود');
    expect(M).toContain('نفس درس 0292');
  });

  it('فترة مفتوحة واحدة — البدء يُغلق السابقة', () => {
    expect(M).toContain('إغلاق أي فترة مفتوحة سابقة');
    expect(M).toContain('NO_OPEN_DUTY_PERIOD');
  });

  it('يُحذّر عند الاقتراب ولا يمنع تسجيل الوقت', () => {
    expect(M).toContain('HOS_APPROACHING_LIMIT');
    expect(M).toContain('تحذير لا منع');
  });

  it('نقص الراحة لا يُحتسب لمن لم يعمل', () => {
    expect(M).toContain('v_duty > 0 AND v_rest > 0');
  });
});

describe('0296 — 🔴 الربط بحارس الإسناد', () => {
  it('العيب الحرج يمنع الإسناد', () => {
    expect(M).toContain('VEHICLE_HAS_CRITICAL_DEFECT');
  });

  it('حدود HOS الثلاثة تمنع الإسناد', () => {
    expect(M).toContain("'HOS_LIMIT_EXCEEDED'");
    expect(M).toContain("'HOS_DUTY_LIMIT_EXCEEDED'");
    expect(M).toContain("'HOS_CYCLE_LIMIT_EXCEEDED'");
  });

  it('الفحوص السابقة محفوظة — لا انحسار', () => {
    expect(M).toContain('DRIVER_LICENSE_EXPIRED');
    expect(M).toContain('VEHICLE_DOCUMENT_EXPIRED');
    expect(M).toContain('VEHICLE_NOT_AVAILABLE');
    expect(M).toContain('DRIVER_ON_ACTIVE_DISPATCH');
  });

  it('رسالة المنع تذكر الرقم الفعلي لا نصاً عاماً', () => {
    expect(M).toContain('ساعة من 11');
    expect(M).toContain('ساعة من 14');
  });

  it('حارس يمنع الحِمل الزائد — درس 0294', () => {
    expect(M).toContain('overloads (must be 1)');
  });
});

describe('0296 — احتيال الوقود', () => {
  it('تصحيح موثَّق: أربعة أعلام كانت موجودة سلفاً', () => {
    expect(M).toContain('ينفّذ أربعة أعلام فعلاً');
  });

  it('يضيف سعة الخزان بقيد يمنع الصفر والسالب', () => {
    expect(M).toContain('fuel_tank_capacity_l');
    expect(M).toContain('logistics_vehicles_tank_capacity_check');
    expect(M).toContain('fuel_tank_capacity_l > 0');
  });

  it('🔴 علم تجاوز السعة', () => {
    expect(M).toContain('TANK_CAPACITY_EXCEEDED');
    expect(M).toMatch(/p_liters > v_vehicle\.fuel_tank_capacity_l \* 1\.05/);
  });

  it('هامش 5% يمنع الإنذار الكاذب', () => {
    expect(M).toContain('يولّد إنذارات كاذبة');
  });

  it('السعة غير المسجَّلة لا تُفحص', () => {
    expect(M).toContain('fuel_tank_capacity_l IS NOT NULL');
  });

  it('الأعلام الخمسة السابقة محفوظة', () => {
    for (const f of ['RAPID_REFUEL', 'ABNORMAL_CONSUMPTION',
      'NO_DISTANCE_SINCE_LAST_REFUEL', 'EXCESSIVE_QUANTITY',
      'FUEL_FOR_ELECTRIC_VEHICLE']) {
      expect(M).toContain(f);
    }
  });
});

describe('0296 — العروض والأمان', () => {
  it('عرضان للامتثال', () => {
    expect(M).toContain('logistics_safety_compliance');
    expect(M).toContain('logistics_vehicle_safety_status');
  });

  it('تصنيف السائقين والمركبات', () => {
    for (const s of ['license_expired', 'hos_violation', 'hos_warning', 'compliant']) {
      expect(M).toContain(`'${s}'`);
    }
    for (const s of ['grounded_defect', 'document_expired', 'never_inspected', 'inspection_overdue']) {
      expect(M).toContain(`'${s}'`);
    }
  });

  it('anon محروم من كل شيء', () => {
    expect(M).toContain('0296 failed: anon can execute');
    expect(M).toContain('anon can read safety data');
  });

  it('الحساب STABLE لا VOLATILE', () => {
    expect(M).toMatch(/get_driver_hos_summary[\s\S]{0,800}?LANGUAGE plpgsql STABLE/);
  });
});

describe('SDK — MovementSafetyComplianceService', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(process.cwd(),
      'src/services/sdk/MovementSafetyComplianceService.ts'))).toBe(true);
  });

  it('يستدعي RPCs 0296', () => {
    for (const rpc of ['get_driver_hos_summary', 'start_driver_duty_period',
      'end_driver_duty_period', 'record_vehicle_inspection', 'clear_vehicle_defects']) {
      expect(SDK).toContain(`'${rpc}'`);
    }
  });

  it('الحدود المعلنة تطابق الخادم بالدقيقة', () => {
    expect(SDK).toContain('drivingMinutesPerDay: 660');
    expect(SDK).toContain('dutyMinutesPerDay: 840');
    expect(SDK).toContain('drivingMinutesPer8Days: 4200');
  });

  it('قائمة فحص DVIR موحَّدة', () => {
    expect(SDK).toContain('DVIR_CHECKLIST');
    expect(SDK).toContain('BRAKES');
    expect(SDK).toContain('TIRES');
  });

  it('تسميات أعلام الوقود الستة', () => {
    expect(SDK).toContain('FUEL_FLAG_LABELS');
    expect(SDK).toContain('TANK_CAPACITY_EXCEEDED');
  });

  it('يشرح لماذا التحذير لا يمنع', () => {
    expect(SDK).toContain('المنع مكانه');
  });

  it('بلا as any', () => {
    expect(SDK).not.toContain('as any');
    expect(PAGE).not.toContain('as any');
  });
});

describe('صفحة امتثال السلامة', () => {
  it('الملف موجود وفيه تنقّل الوحدة', () => {
    expect(existsSync(resolve(process.cwd(),
      'src/pages/app/movement/logistics/LogisticsSafetyCompliancePage.tsx'))).toBe(true);
    expect(PAGE).toContain('MovementUnitNav');
  });

  it('تجمع النظامين في شاشة واحدة وتشرح السبب', () => {
    expect(PAGE).toContain('لماذا شاشة واحدة');
    expect(PAGE).toContain("tab === 'drivers'");
    expect(PAGE).toContain("tab === 'vehicles'");
  });

  it('تُفصح أن المنع في الخادم لا في الواجهة', () => {
    expect(PAGE).toContain('مفروض في الخادم');
  });

  it('تُحذّر قبل حفظ عيب حرج', () => {
    expect(PAGE).toContain("includes('critical')");
    expect(PAGE).toContain('خارج الخدمة فوراً');
  });

  it('البند بلا تحديد يُعدّ سليماً', () => {
    expect(PAGE).toContain('يُعدّ سليماً');
  });

  it('تُبرز تجاوز الحدود بلون مختلف', () => {
    expect(PAGE).toContain('hos_driving_exceeded');
    expect(PAGE).toContain('text-rose-700');
  });

  it('توضح أن السجل الأصلي يبقى', () => {
    expect(PAGE).toContain('لا يُعدَّل ولا يُحذف');
  });

  it('بلا confirm/prompt في الكود', () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?:window\.)?\bconfirm\s*\(/);
    expect(code).not.toMatch(/(?:window\.)?\bprompt\s*\(/);
  });

  it('لا تلمس supabase مباشرة', () => {
    expect(PAGE).not.toMatch(/supabase\.(from|rpc)\(/);
  });
});

describe('تسجيل الصفحة في المواضع الأربعة', () => {
  it('AppRouter', () => {
    expect(ROUTER).toContain('LogisticsSafetyCompliancePage');
    expect(ROUTER).toContain('path="logistics/safety"');
  });

  it('Sidebar', () => {
    expect(SIDEBAR).toContain("id: 'movement-log-safety'");
    expect(SIDEBAR).toContain("'movement-log-safety': 'movement'");
  });

  it('hybridPagesCatalog', () => {
    expect(CATALOG).toContain("id: 'movement-log-safety'");
  });

  it('AdminEmployeesPage', () => {
    expect(ADMIN).toContain("id: 'movement-log-safety'");
  });

  it('legacyRedirect', () => {
    expect(LEGACY).toContain('/app/movement/logistics/safety');
  });

  it('مفتاح الصلاحية للدورين', () => {
    expect((PERMS.match(/'movement-log-safety'/g) ?? []).length).toBe(3);
  });

  it('MovementUnitNav يربطها من موضعين', () => {
    expect((NAV.match(/logistics\/safety/g) ?? []).length).toBe(2);
  });
});
