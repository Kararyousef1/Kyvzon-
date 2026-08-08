/**
 * عقد 0297 — امتثال السائق الذاتي (HOS + DVIR)
 *
 * التحقق السلوكي في tools/dev/verify-movement-0297.sql
 * (32/32 على Postgres 17 من الصفر).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const M = read('supabase/migrations/0297_movement_driver_self_compliance.sql');
const SDK = read('src/services/sdk/DriverAppService.ts');
const TRIPS = read('src/pages/app/movement/driver/DriverTripsPage.tsx');
const INSP = read('src/pages/app/movement/driver/DriverInspectionPage.tsx');
const ROUTER = read('src/router/AppRouter.tsx');

describe('0297 — الفجوة التي يسدّها', () => {
  it('يوثّق المفارقة: السائق يقود ولا يستطيع تسجيل قيادته', () => {
    expect(M).toContain('السائق هو من يقود');
    expect(M).toContain('لا يستطيع تسجيل');
  });

  it('يشرح لماذا التسجيل بالنيابة يُبطل القيمة القانونية', () => {
    expect(M).toContain('ليس سجل امتثال');
  });

  it('دوال السائق لا تفرض دور logistics', () => {
    expect(M).toContain('must not require the logistics role');
  });

  it('وكلها تفرض هوية السائق', () => {
    expect(M).toContain('does not enforce driver identity');
    expect((M.match(/movement_require_driver\(\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe('0297 — HOS الذاتي', () => {
  it('يُعرّف دوال الساعات الثلاث', () => {
    expect(M).toContain('FUNCTION public.get_my_hos_summary');
    expect(M).toContain('FUNCTION public.start_my_duty_period');
    expect(M).toContain('FUNCTION public.end_my_duty_period');
  });

  it('يُرجع المتبقّي لا الإجمالي وحده', () => {
    expect(M).toContain('driving_minutes_left');
    expect(M).toContain('duty_minutes_left');
    expect(M).toContain('GREATEST(660 - s.driving_minutes_today, 0)');
  });

  it('لا يُعيد بناء منطق الحساب — يستدعي 0296', () => {
    expect(M).toContain('public.get_driver_hos_summary(v_driver, CURRENT_DATE)');
  });

  it('🔴 القيادة تُمنع بعد التجاوز — خلافاً لنسخة المُرسِل', () => {
    expect(M).toContain('HOS_DRIVING_LIMIT_REACHED');
    expect(M).toContain('HOS_DUTY_LIMIT_REACHED');
    expect(M).toContain('HOS_CYCLE_LIMIT_REACHED');
  });

  it('يشرح لماذا المنع هنا والتحذير هناك', () => {
    expect(M).toContain('يوثّق مخالفة بدل منعها');
  });

  it('الراحة مسموحة دائماً — وإلا عَلِق السائق', () => {
    expect(M).toContain('المنع يخصّ القيادة وحدها');
    expect(M).toContain('عالقاً');
  });

  it('فترة مفتوحة واحدة', () => {
    expect(M).toContain('NO_OPEN_DUTY_PERIOD');
  });

  it('رحلة زميل مرفوضة', () => {
    expect(M).toContain('DISPATCH_NOT_ASSIGNED_TO_YOU');
  });
});

describe('0297 — DVIR الذاتي', () => {
  it('السائق يفحص مركبة رحلته فقط', () => {
    expect(M).toContain('FUNCTION public.record_my_vehicle_inspection');
    expect(M).toContain('driver_owns_vehicle');
  });

  it('نفس تحققات 0296 محفوظة', () => {
    expect(M).toContain('INVALID_DEFECT_ENTRY');
    expect(M).toContain('INVALID_INSPECTION_TYPE');
    expect(M).toContain('ODOMETER_CANNOT_DECREASE');
  });

  it('العيب الحرج يوقف المركبة', () => {
    expect(M).toContain("SET status = 'out_of_service'");
  });

  it('🔴 السائق لا يرفع إيقاف مركبته — تضارب مصالح', () => {
    expect(M).toContain('تضارب مصالح');
    expect(M).toContain('drivers must not clear their own defects');
  });

  it('السجل يميّز مصدر الفحص', () => {
    expect(M).toContain("'source', 'driver_app'");
  });

  it('قراءة الفحوصات مقصورة على رحلته', () => {
    expect(M).toContain('FUNCTION public.get_my_vehicle_inspections');
  });
});

describe('0297 — 🔴 HOS التلقائي مع دورة الرحلة', () => {
  it('يشرح المشكلة: ساعات صفر مهما قاد', () => {
    expect(M).toContain('ساعات القيادة تبقى صفراً');
    expect(M).toContain('لن يتذكّر ضغط زرَّين');
  });

  it('الانطلاق يفتح فترة قيادة', () => {
    expect(M).toContain('[تلقائي: انطلاق الرحلة]');
  });

  it('الوصول يُغلق القيادة ويفتح on_duty', () => {
    expect(M).toContain('[تلقائي: الوصول للوجهة]');
    expect(M).toMatch(/AND duty_status = 'driving'/);
  });

  it('الإكمال يُغلق كل الفترات — لا تتضخّم', () => {
    expect(M).toMatch(/ELSIF p_status = 'completed' THEN[\s\S]{0,400}ended_at IS NULL/);
  });

  it('الانطلاق يتطلب رصيد ساعات', () => {
    expect(M).toContain('لا يمكن بدء الرحلة');
  });

  it('السجل يوثّق التسجيل التلقائي', () => {
    expect(M).toContain("'hos_auto_logged', true");
  });

  it('نسخة واحدة من update_my_trip_status — درس 0294', () => {
    expect(M).toContain('overloads');
  });

  it('القواعد السابقة محفوظة', () => {
    expect(M).toContain('EPOD_REQUIRED_BEFORE_COMPLETION');
    expect(M).toContain('DRIVER_CANNOT_SET_STATUS');
    expect(M).toContain('INVALID_STATUS_TRANSITION');
  });
});

describe('0297 — الأمان', () => {
  it('anon محروم من الجميع', () => {
    expect(M).toContain('0297 failed: anon can execute');
    expect((M.match(/FROM PUBLIC, anon/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('دوال القراءة STABLE', () => {
    expect(M).toMatch(/get_my_hos_summary[\s\S]{0,700}?LANGUAGE plpgsql STABLE/);
    expect(M).toMatch(/driver_owns_vehicle[\s\S]{0,300}?LANGUAGE sql STABLE/);
  });
});

describe('SDK — الامتثال الذاتي', () => {
  it('يستدعي RPCs 0297', () => {
    for (const rpc of ['get_my_hos_summary', 'start_my_duty_period',
      'end_my_duty_period', 'record_my_vehicle_inspection',
      'get_my_vehicle_inspections']) {
      expect(SDK).toContain(`'${rpc}'`);
    }
  });

  it('يُصدّر أنواع الامتثال', () => {
    expect(SDK).toContain('export interface MyHosSummary');
    expect(SDK).toContain('export interface DriverInspectionResult');
    expect(SDK).toContain('DRIVER_DUTY_LABELS');
  });

  it('يوثّق أن القيادة قد تُرفض والراحة لا', () => {
    expect(SDK).toContain('الراحة وخروج الخدمة مسموحان دائماً');
  });

  it('يوثّق أن السائق لا يرفع الإيقاف', () => {
    expect(SDK).toContain('تضارب مصالح');
  });

  it('بلا as any', () => {
    expect(SDK).not.toContain('as any');
    expect(INSP).not.toContain('as any');
  });
});

describe('واجهة السائق — شريط الساعات', () => {
  it('يعرض الرصيد المتبقّي لا الإجمالي وحده', () => {
    expect(TRIPS).toContain('driving_minutes_left');
    expect(TRIPS).toContain('تبقّى');
  });

  it('شريط تقدّم يتلوّن بحسب القرب من الحد', () => {
    expect(TRIPS).toContain('driving_limit_exceeded');
    expect(TRIPS).toContain('bg-rose-500');
    expect(TRIPS).toContain('bg-amber-500');
  });

  it('أزرار تبديل الحالة كبيرة للاستعمال الميداني', () => {
    expect(TRIPS).toContain('switchDuty');
    expect(TRIPS).toContain('min-h-[44px]');
  });

  it('يُفصح أن القيادة تُسجَّل تلقائياً', () => {
    expect(TRIPS).toContain('تُسجَّل تلقائياً عند بدء الرحلة');
  });

  it('فشل قراءة الساعات لا يُسقط الصفحة', () => {
    expect(TRIPS).toContain('getMyHosSummary().catch(() => null)');
  });

  it('رابط فحص المركبة موجود', () => {
    expect(TRIPS).toContain('/app/movement/driver/inspection/');
  });
});

describe('شاشة فحص السائق (D03)', () => {
  it('الملف موجود ومسجَّل', () => {
    expect(existsSync(resolve(process.cwd(),
      'src/pages/app/movement/driver/DriverInspectionPage.tsx'))).toBe(true);
    expect(ROUTER).toContain('DriverInspectionPage');
    expect(ROUTER).toContain('path="driver/inspection/:dispatchId"');
  });

  it('تشرح لماذا السائق هو من يفحص', () => {
    expect(INSP).toContain('من يقود المركبة هو من يوثّق');
  });

  it('تستعمل قائمة الفحص الموحَّدة لا نسخة ثانية', () => {
    expect(INSP).toContain('DVIR_CHECKLIST');
    expect(INSP).toContain('MovementSafetyComplianceService');
  });

  it('تأكيد قبل الإبلاغ عن عيب حرج', () => {
    expect(INSP).toContain('confirmCritical');
    expect(INSP).toContain('يوقف المركبة فوراً');
  });

  it('تُفصح أن السائق لا يرفع الإيقاف', () => {
    expect(INSP).toContain('لا تستطيع رفع الإيقاف بنفسك');
  });

  it('البند بلا تحديد يُعدّ سليماً', () => {
    expect(INSP).toContain('يُعدّ سليماً');
  });

  it('أزرار بحجم ميداني', () => {
    expect(INSP).toContain('min-h-[44px]');
    expect(INSP).toContain('min-h-[54px]');
  });

  it('بلا confirm/prompt في الكود', () => {
    const code = INSP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?:window\.)?\bconfirm\s*\(/);
    expect(code).not.toMatch(/(?:window\.)?\bprompt\s*\(/);
  });

  it('لا تلمس supabase مباشرة', () => {
    expect(INSP).not.toMatch(/supabase\.(from|rpc)\(/);
    expect(TRIPS).not.toMatch(/supabase\.(from|rpc)\(/);
  });
});
