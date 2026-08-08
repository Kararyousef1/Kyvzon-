/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0346 — لوحة الحضور اليومي
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج (درس 0344): لا نقارن الدالة بنفسها. الأعطال ①②⑥ كلها
 *   **تعارض بين ما تكتبه الشيفرة وما يُصرّح به المخطط**، فالحارس
 *   الحقيقي هو مقارنة مصدرين مستقلّين.
 *
 *   السلوك مُختبَر على Postgres في
 *   `tools/dev/verify-hr-daily-attendance-0346.sql` (85 تأكيداً)
 *   وعبر RLS في `-rls.sh` (كل التأكيدات).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG    = read('supabase/migrations/0346_hr_daily_attendance_board.sql');
const SCHEMA = read('supabase/migrations/0002_employee_features.sql');
const MIG317 = read('supabase/migrations/0317_fix_department_membership_and_hr_requester.sql');
const SERVICE = read('src/services/sdk/HrAttendanceBoardService.ts');
const PAGE    = read('src/pages/hr/AttendancePage.tsx');
const KIOSK   = read('src/pages/hr/KioskPage.tsx');
const BASE    = read('src/services/sdk/BaseService.ts');

/** يزيل تعليقات TS — نحرس الشيفرة لا الشرح */
const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** يزيل تعليقات SQL */
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
/** ويزيل السلاسل النصّية أيضاً (نصوص COMMENT تقتبس العطل عمداً) */
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* check_in */ const x=1;')).not.toMatch(/check_in/);
    expect(codeTs("const y='check_in';")).toMatch(/check_in/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'punch_type=check_in خطأ';")).not.toMatch(/check_in/);
    expect(stmtSql("SELECT a.punch_type FROM x;")).toMatch(/punch_type/);
  });
});

const MIG_CODE  = codeSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

// ═══════════════════════════════════════════════════════════════════
describe('0346 — العطل ①: شرطة لا شرطة سفلية', () => {
  /**
   * ★★★ القيم المسموحة تُستخرَج من **المخطط** لا من افتراض.
   */
  const allowed = (() => {
    const m = SCHEMA.match(/punch_type TEXT NOT NULL DEFAULT '([^']+)'\s*CHECK \(punch_type IN \(([^)]*)\)\)/);
    expect(m, 'قيد punch_type غير موجود في 0002').toBeTruthy();
    return {
      def: m![1],
      vals: [...m![2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    };
  })();

  it('★★★ القيم المسموحة بشرطة لا شرطة سفلية', () => {
    expect(allowed.vals.sort()).toEqual(['check-in', 'check-out', 'in', 'out']);
    expect(allowed.vals).not.toContain('check_in');
    expect(allowed.vals).not.toContain('check_out');
  });

  it('★★★ ولا ذكر لـcheck_in/check_out في الشيفرة الجديدة', () => {
    expect(PAGE_CODE.includes("'check_in'"), 'الصفحة تستعمل check_in').toBe(false);
    expect(PAGE_CODE.includes("'check_out'")).toBe(false);
    /**
     * ★ الفحص على **قيمة punch_type** لا على أي ذكر: `out_check_in`
     *   اسم عمود إخراج مشروع، والتأكيد الأول كان يسقط بسببه — فحصٌ
     *   فضفاض يُنذر خطأً تماماً كما يمرّ خطأً.
     */
    expect(
      /'check_in'|'check_out'/.test(stmtSql(MIG)),
      'المايجريشن يستعمل قيمة punch_type بشرطة سفلية',
    ).toBe(false);
  });

  it('★★ والمايجريشن يستعمل القيم الصحيحة حين يميّز النوع', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/punch_type IN \('out', 'check-out'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — العطل ②: لا بصمة خروج في النظام', () => {
  /**
   * ★★★ تحديث 0347: هذا التأكيد كان يوثّق أن `KioskPage` لا تمرّر
   *   `punch_type` — وهو ما اضطرّ 0346 لاشتقاق الخروج من **ترتيب**
   *   البصمات. الآن أُصلح المصدر: الصفحة تمرّ عبر `kiosk_punch` التي
   *   تكتب النوع صراحةً.
   *
   *   ★ والاشتقاق الزمني في 0346 **يبقى ضرورياً** رغم ذلك: البيانات
   *     التاريخية كلها بـ'check-in' (مُثبَت: بصمات الخروج = 0 قبل
   *     0347)، وأجهزة ADMS قد ترسل بلا نوع. الاشتقاق يعالج القديم
   *     والنوع الصريح يُقدَّم عليه حين يوجد.
   */
  it('★★★ KioskPage صارت تمرّ عبر kiosk_punch (0347)', () => {
    const code = codeTs(KIOSK);
    expect(code).not.toMatch(/attendanceService\.create/);
    expect(code).toMatch(/kioskService\.punch\(/);
  });

  it('★★ والاشتقاق الزمني باقٍ للبيانات التاريخية', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/min\(a\.punch_time\) AS first_punch/);
    // ★ مع تقديم النوع الصريح حين يوجد
    expect(b).toMatch(/WHEN p\.explicit_out IS NOT NULL THEN p\.explicit_out/);
  });

  it('★★★ والافتراضي check-in ⇒ كل بصمة «دخول»', () => {
    const m = SCHEMA.match(/punch_type TEXT NOT NULL DEFAULT '([^']+)'/);
    expect(m![1]).toBe('check-in');
  });

  it('★★★ لذلك الدخول من أول بصمة زمنياً', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/min\(a\.punch_time\) AS first_punch/);
  });

  it('★★★ والخروج من آخر بصمة **إن تعدّدت** فقط', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/WHEN p\.punch_count > 1\s+THEN p\.last_punch/);
    expect(b).toMatch(/ELSE NULL/);
  });

  it('★★ مع احترام بصمة الخروج الصريحة حين تُرسَل', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/WHEN p\.explicit_out IS NOT NULL THEN p\.explicit_out/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — العطل ③: الترشيح بمساواة لحظية', () => {
  it('★★★ BaseService يحوّل كل مُرشِّح إلى .eq()', () => {
    expect(codeTs(BASE)).toMatch(/query = query\.eq\(key, value\)/);
  });

  it('★★★ والصفحة لم تعد تمرّر punch_time كمُرشِّح', () => {
    expect(PAGE_CODE).not.toMatch(/punch_time:/);
    expect(PAGE_CODE).not.toMatch(/attendanceService\.findAll/);
  });

  it('★★ والمايجريشن يرشّح بـshift_date', () => {
    expect(fnBody('hr_daily_attendance')).toMatch(/a\.shift_date = v_day/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — العطل ⑥: full_name_ar فارغ لكل موظف', () => {
  it('★★★ محفّز 0317 لا يملأ full_name_ar', () => {
    const m = MIG317.match(/INSERT INTO public\.employees\s*\n?\s*\(([^)]*)\)/);
    expect(m, 'إدراج employees غير موجود في 0317').toBeTruthy();
    const cols = m![1];
    expect(cols).toMatch(/first_name/);
    expect(cols).toMatch(/last_name/);
    expect(
      cols.includes('full_name_ar'),
      'المحفّز صار يملأ full_name_ar — راجع منطق اشتقاق الاسم',
    ).toBe(false);
  });

  it('★★★ لذلك الاسم يُشتقّ بأولوية من ثلاثة مصادر', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/concat_ws\(' ', NULLIF\(btrim\(e\.first_name\)/);
    expect(b).toMatch(/NULLIF\(btrim\(pr\.full_name\), ''\)/);
  });

  it('★★ والبحث يشمل المصادر الثلاثة', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/e\.first_name\s+ILIKE/);
    expect(b).toMatch(/e\.last_name\s+ILIKE/);
    expect(b).toMatch(/pr\.full_name\s+ILIKE/);
    expect(b).toMatch(/e\.employee_code ILIKE/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — الاستراحات (العطل ④)', () => {
  const b = fnBody('hr_daily_attendance');

  it('★★★ المدة الفعلية حين تتوفّر الطوابع', () => {
    expect(b).toMatch(/b\.return_time - b\.out_time/);
    expect(b).toMatch(/ELSE b\.duration_minutes/);
  });

  it('★★★ on_break يشترط غياب return_time', () => {
    expect(b).toMatch(/bool_or\(b\.status = 'active' AND b\.return_time IS NULL\)/);
  });

  it('★★★ والوجهة للاستراحة النشطة وحدها', () => {
    expect(b).toMatch(/FILTER \(WHERE b\.status = 'active' AND b\.return_time IS NULL\)/);
  });

  it('★★ ومقيّدة باليوم', () => {
    expect(b).toMatch(/b\.created_at >= v_day::TIMESTAMPTZ/);
    expect(b).toMatch(/b\.created_at <\s+\(v_day \+ 1\)::TIMESTAMPTZ/);
  });

  it('★★★ «في استراحة» تسبق «منصرف» في الحالة', () => {
    const onBreak = b.indexOf("THEN 'في استراحة'");
    const left    = b.indexOf("THEN 'منصرف'");
    expect(onBreak).toBeGreaterThan(-1);
    expect(left).toBeGreaterThan(-1);
    expect(
      onBreak,
      'تصريح مفتوح يجب أن يظهر قبل الانصراف — يحتاج إغلاقاً إدارياً',
    ).toBeLessThan(left);
  });

  it('★★ ودقائق العمل تخصم الاستراحات', () => {
    expect(b).toMatch(/- b\.break_minutes/);
    expect(b).toMatch(/GREATEST\(/);
  });

  it('★★★ ويوم ماضٍ بلا انصراف لا تُخترَع له ساعات', () => {
    expect(b).toMatch(/CASE WHEN v_day = current_date THEN now\(\) ELSE b\.first_punch END/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — الترشيحات والملخّص (العطل ⑤)', () => {
  const b = fnBody('hr_daily_attendance');
  const s = fnBody('hr_daily_attendance_summary');

  it('★★★ ترشيح بالقسم والحالة والبحث', () => {
    expect(b).toMatch(/p_department_id IS NULL OR e\.department_id = p_department_id/);
    expect(b).toMatch(/p_status IS NULL OR s\.status_label = p_status/);
    expect(b).toMatch(/v_q IS NULL/);
  });

  it('★★ والبحث بمسافات يُعامَل كلا بحث', () => {
    expect(b).toMatch(/NULLIF\(btrim\(COALESCE\(p_search, ''\)\), ''\)/);
  });

  it('★★ is_active لا status (درس 0345)', () => {
    expect(b).toMatch(/AND e\.is_active/);
    expect(b).not.toMatch(/e\.status/);
  });

  it('★★★ الغائبون يُؤخَّرون في الترتيب', () => {
    expect(b).toMatch(/ORDER BY \(s\.first_punch IS NULL\), s\.first_punch/);
  });

  it('★★★ «حاضر» يشمل من في استراحة', () => {
    expect(s).toMatch(/out_status IN \('مداوم','في استراحة','منصرف'\)/);
  });

  it('★★★ والمتوسط على الحاضرين وحدهم', () => {
    expect(s).toMatch(/avg\(out_worked_minutes\) FILTER \(WHERE out_status <> 'غائب'\)/);
  });

  it('★★ الملخّص يمرّر التاريخ والقسم', () => {
    expect(s).toMatch(/p_date, p_department_id, NULL, NULL, 1000/);
  });

  it('★★ وصفّ أصفار بلا مستأجر (لا NaN)', () => {
    expect(s).toMatch(/RETURN QUERY SELECT 0,0,0,0,0,0, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;/);
  });

  it('★ الحدود تُقصّ', () => {
    expect(b).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 200\), 1\), 1000\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — الصفحة', () => {
  it('★★★ تمرّ عبر hrAttendanceBoardService', () => {
    expect(PAGE_CODE).toMatch(/hrAttendanceBoardService\.board\(/);
    expect(PAGE_CODE).toMatch(/hrAttendanceBoardService\.summary\(/);
  });

  it('★★★ ولم تعد تُجمّع في المتصفح', () => {
    expect(PAGE_CODE).not.toMatch(/employeeService\.findAll/);
    expect(PAGE_CODE).not.toMatch(/empLogs\.find/);
    expect(PAGE_CODE).not.toMatch(/deptMap/);
  });

  it('★★★ «تصدير PDF» صار CSV حقيقياً لا window.print()', () => {
    expect(PAGE_CODE).not.toMatch(/window\.print\(\)/);
    expect(PAGE_CODE).toMatch(/text\/csv/);
    // ★ BOM لازم كي تفتح Excel العربية بترميز صحيح
    expect(PAGE_CODE).toMatch(/\\uFEFF/);
  });

  it('★★ وحقول CSV مُهرَّبة', () => {
    expect(PAGE_CODE).toMatch(/replace\(\/"\/g, '""'\)/);
  });

  it('★★★ منتقي تاريخ وبحث وترشيحان', () => {
    expect(PAGE_CODE).toMatch(/type="date"/);
    expect(PAGE_CODE).toMatch(/type="search"/);
    expect(PAGE_CODE).toMatch(/setDeptId/);
    expect(PAGE_CODE).toMatch(/setStatus/);
  });

  it('★★ وبطاقات ملخّص', () => {
    expect(PAGE_CODE).toMatch(/summary\?\.present/);
    expect(PAGE_CODE).toMatch(/summary\?\.absent/);
    expect(PAGE_CODE).toMatch(/summary\?\.onBreak/);
  });

  it('★★★ والملخّص لا يتأثّر بالبحث ولا بترشيح الحالة', () => {
    // hrAttendanceBoardService.summary(day, deptId || null) — معاملان فقط
    expect(PAGE_CODE).toMatch(/summary\(day, deptId \|\| null\)/);
  });

  it('★★ والحالات الأربع لها ألوان', () => {
    for (const s of ['مداوم', 'في استراحة', 'منصرف', 'غائب']) {
      expect(PAGE_CODE).toContain(`'${s}'`);
    }
  });

  it('★ لا confirm/alert/prompt · لا as any · لا لمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/\.from\('[a-z_]+'\)/);
  });

  it('★★ والخدمة لا تحوّل الوجهة null إلى نصّ فارغ', () => {
    expect(SVC_CODE).toMatch(/destination:\s+r\.out_destination,/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0346 — الأمان', () => {
  const FNS = [
    'hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER)',
    'hr_daily_attendance_summary(DATE,UUID)',
  ];

  it.each(FNS)('★★ anon محروم من %s', (sig) => {
    expect(MIG).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM anon;`);
  });

  it.each(FNS)('★ authenticated ممنوح %s', (sig) => {
    expect(MIG).toContain(`GRANT EXECUTE ON FUNCTION public.${sig}`);
  });

  it('★★★ كلتاهما INVOKER — RLS هو الحارس', () => {
    expect((MIG_CODE.match(/SECURITY DEFINER/g) || []).length).toBe(0);
    expect((MIG_CODE.match(/SECURITY INVOKER/g) || []).length).toBe(2);
  });

  it('★★ search_path مثبَّت', () => {
    expect((MIG_CODE.match(/SET search_path = public/g) || []).length).toBe(2);
  });

  it('★★ مقيّدتان بالمستأجر', () => {
    const b = fnBody('hr_daily_attendance');
    expect(b).toMatch(/a\.tenant_id = v_tenant/);
    expect(b).toMatch(/b\.tenant_id = v_tenant/);
    expect(b).toMatch(/e\.tenant_id = v_tenant/);
  });

  it('★ الفهارس الثلاثة', () => {
    for (const ix of [
      'idx_att_logs_tenant_shift_date',
      'idx_emp_breaks_tenant_created',
      'idx_emp_breaks_employee',
    ]) {
      expect(MIG).toContain(ix);
    }
  });
});
