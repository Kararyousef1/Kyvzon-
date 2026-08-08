/**
 * ════════════════════════════════════════════════════════════════
 *  employeeDashboardContract.test.ts
 *
 *  عقد لوحة الموظف وحلّ معرّف الموظف (migration 0335).
 *  المرحلة 2 من خطة البوابتين.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-employee-dashboard-0335.sql   38 تأكيداً
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0335_employee_dashboard_summary.sql');
const VERIFY = read('tools/dev/verify-employee-dashboard-0335.sql');
const HOOK = read('src/shared/hooks/useEmployeeId.ts');
const SVC = read('src/services/sdk/EmployeeDashboardService.ts');
const DASH = read('src/pages/employee/EmployeeDashboard.tsx');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

function fnBody(name: string): string {
  const s = M.indexOf(`CREATE FUNCTION public.${name}(`);
  const e = M.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  expect(s, `${name}: لا تعريف`).toBeGreaterThan(-1);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(s);
  return M.slice(s, e);
}

describe('0335 — الدوال الثلاث', () => {
  it.each(['my_employee_id', 'my_dashboard_summary', 'my_leave_balance'])(
    '%s مُعرَّفة وموثَّقة',
    (fn) => {
      expect(M).toContain(`CREATE FUNCTION public.${fn}(`);
      expect(M).toContain(`COMMENT ON FUNCTION public.${fn}(`);
    },
  );

  it('★★ الملخّص يستعمل current_user_employee_id لا auth.uid', () => {
    const body = fnBody('my_dashboard_summary');
    expect(body).toMatch(/v_emp\s+UUID := public\.current_user_employee_id\(\)/);
    // auth.uid() مسموح لكن لـuser_id في incidents فقط
    expect(body).not.toMatch(/v_emp\s+UUID := auth\.uid\(\)/);
  });

  it.each(['my_dashboard_summary', 'my_leave_balance'])(
    '%s SECURITY INVOKER — تحترم RLS',
    (fn) => {
      const body = fnBody(fn);
      expect(body).toMatch(/SECURITY INVOKER/);
      expect(body).not.toMatch(/SECURITY DEFINER/);
    },
  );

  it('★ my_employee_id تبقى DEFINER — تقرأ employees لتحلّ المعرّف', () => {
    const s = M.indexOf('CREATE FUNCTION public.my_employee_id');
    const body = M.slice(s, M.indexOf('COMMENT ON FUNCTION public.my_employee_id'));
    expect(body).toMatch(/SECURITY DEFINER/);
  });

  it.each(['my_dashboard_summary', 'my_leave_balance'])(
    '%s مقيّدة بالمستأجر',
    (fn) => {
      const body = fnBody(fn);
      expect(body).toMatch(/v_tenant UUID\s+:= public\.current_user_tenant_id\(\)/);
      expect(body).toMatch(/IF v_tenant IS NULL/);
    },
  );

  /**
   * ★★★ هذا أهم تأكيد بنيوي: كل استعلام فرعي في الملخّص يجب أن
   *   يُرشّح بـ`tenant_id`. أُثبت أن إهماله **يسرّب** صفّاً بنفس
   *   `employee_id` تحت مستأجر آخر — و`employee_id` بلا مفتاح أجنبي
   *   يربطه بمستأجره في `attendance_summary`.
   */
  it('★★★ كل مصدر في الملخّص يُرشّح بالمستأجر', () => {
    const body = fnBody('my_dashboard_summary');
    for (const t of ['i.tenant_id = v_tenant', 'a.tenant_id = v_tenant',
                     'g.tenant_id = v_tenant', 'e.tenant_id = v_tenant',
                     'l.tenant_id = v_tenant']) {
      expect(body, `مفقود: ${t}`).toContain(t);
    }
  });

  it('★ incidents يقبل employee_id أو user_id (بلاغات قديمة)', () => {
    const body = fnBody('my_dashboard_summary');
    expect(body).toMatch(/i\.employee_id = v_emp OR i\.user_id = v_uid/);
  });

  it('★★ الأهداف النشطة وحدها في المتوسط', () => {
    const body = fnBody('my_dashboard_summary');
    expect(body).toMatch(/g\.status = 'active'/);
    expect(body).not.toMatch(/g\.status IN \('active','completed'\)/);
  });

  it('★ لا قسمة على صفر في نسبة الحضور', () => {
    const body = fnBody('my_dashboard_summary');
    expect(body).toMatch(/CASE WHEN count\(\*\) = 0 THEN 0/);
  });

  /**
   * ★★ صفّ أصفار لا «لا شيء» حين لا سجلّ موظف: الواجهة تحتاج التمييز
   *   بين «لا بيانات» و«لا سجلّ موظف» — الثانية تحتاج رسالة مختلفة.
   */
  it('★★ الملخّص يُرجع صفّ أصفار لمن بلا سجلّ موظف', () => {
    const body = fnBody('my_dashboard_summary');
    expect(body).toMatch(/IF v_emp IS NULL THEN\s*\n\s*RETURN QUERY SELECT NULL::UUID/);
  });
});

describe('0335 — رصيد الإجازات', () => {
  const body = fnBody('my_leave_balance');

  /**
   * ★★ الأنواع NUMERIC لا INTEGER — مُحقَّق من information_schema:
   *   annual_* :: numeric(6,3) · sick_* :: numeric(5,1)
   *   نصف يوم إجازة قيمة مشروعة، وتقريبها يُفقد رصيداً.
   */
  it('★★ الأنواع NUMERIC — نصف يوم قيمة مشروعة', () => {
    expect(body).toMatch(/out_annual_total\s+NUMERIC/);
    expect(body).toMatch(/out_annual_left\s+NUMERIC/);
    expect(body).toMatch(/out_sick_left\s+NUMERIC/);
    expect(body).not.toMatch(/out_annual_left\s+INTEGER/);
  });

  it('★★ المتبقّي يطرح المعلّق — الطلب قيد الاعتماد يحجز الرصيد', () => {
    expect(body).toMatch(/b\.annual_total - b\.annual_used - b\.annual_pending/);
    expect(body).toMatch(/b\.sick_total - b\.sick_used - b\.sick_pending/);
  });

  it('★ لا رصيد سالب', () => {
    expect(body).toMatch(/GREATEST\(0::NUMERIC,/);
  });
});

describe('0335 — القيد الفريد على سجلّ الموظف', () => {
  it('★★ الفهرس الفريد يُنشأ', () => {
    expect(M).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_per_user_tenant');
  });

  /**
   * ★ جزئي: `user_id` يقبل NULL (موظف بلا حساب دخول — حالة مشروعة)،
   *   وUNIQUE عادي يعامل كل NULL كقيمة مميزة فيسمح بصفوف بلا حدّ.
   */
  it('★★ جزئي — لا يخنق الموظفين بلا حساب دخول', () => {
    const i = M.indexOf('uq_employee_per_user_tenant');
    expect(M.slice(i, i + 200)).toMatch(/WHERE user_id IS NOT NULL/);
  });

  it('★★ لا يُطبَّق قسراً إن وُجد تكرار — تحذير لا إسقاط', () => {
    expect(M).toMatch(/RAISE WARNING/);
    expect(M).toMatch(/الدمج لا الحذف/);
  });
});

describe('0335 — الفهارس والصلاحيات', () => {
  it.each([
    'idx_wellness_employee_date',
    'idx_att_summary_employee_date',
    'idx_goals_employee_active',
    'idx_leave_balance_employee_year',
    'idx_employees_user_tenant',
  ])('%s موجود وقابل لإعادة التشغيل', (idx) => {
    expect(M).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
  });

  it('★ فهرس الأهداف النشطة جزئي', () => {
    const i = M.indexOf('idx_goals_employee_active');
    expect(M.slice(i, i + 160)).toMatch(/WHERE status = 'active'/);
  });

  it.each([
    'my_employee_id()',
    'my_dashboard_summary()',
    'my_leave_balance(INTEGER)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('★ DROP قبل CREATE (درس 0320)', () => {
    for (const fn of ['my_employee_id', 'my_dashboard_summary', 'my_leave_balance']) {
      const d = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}`);
      const c = M.indexOf(`CREATE FUNCTION public.${fn}`);
      expect(d, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(d, `${fn}: DROP بعد CREATE`).toBeLessThan(c);
    }
  });
});

describe('0335 — الهوك المشترك', () => {
  it('موجود ويستعمل user_id لحلّ المعرّف', () => {
    expect(existsSync(resolve(root, 'src/shared/hooks/useEmployeeId.ts'))).toBe(true);
    expect(HOOK).toMatch(/filters: \{ user_id: user\.id \}/);
  });

  it('★★ يُميّز linkMissing عن loading', () => {
    expect(HOOK).toMatch(/linkMissing: boolean/);
    expect(HOOK).toMatch(/setLinkMissing\(true\)/);
  });

  it('★★ فشل الشبكة لا يُعلن linkMissing كذباً', () => {
    const cat = HOOK.slice(HOOK.indexOf('catch (err)'));
    expect(cat).toMatch(/setLinkMissing\(false\)/);
  });

  it('★ يُلغى عند تفكيك المكوّن (لا setState على مفكَّك)', () => {
    expect(HOOK).toMatch(/let cancelled = false/);
    expect(HOOK).toMatch(/return \(\) => \{ cancelled = true; \}/);
  });

  it('★ بلا as any', () => {
    expect(codeOnly(HOOK)).not.toMatch(/\bas any\b/);
  });
});

describe('0335 — الخدمة', () => {
  it.each(['my_employee_id', 'my_dashboard_summary', 'my_leave_balance'])(
    'تستدعي %s عبر RPC',
    (fn) => {
      expect(SVC).toContain(`rpc('${fn}'`);
    },
  );

  it('★ لا تلمس جدولاً مباشرة', () => {
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('★ بلا as any', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
  });

  it('★ employeeId يبقى null لمن بلا سجلّ (لا سلسلة فارغة)', () => {
    expect(SVC).toMatch(/employeeId: string \| null/);
  });
});

describe('★★ الصفحات الأربع المصابة — لا user.id كـemployee_id', () => {
  const FIXED = [
    'src/pages/employee/EmployeeDashboard.tsx',
    'src/pages/employee/ContactPage.tsx',
    'src/pages/employee/MyGoalsPage.tsx',
    'src/pages/employee/SurveyPage.tsx',
  ];

  it.each(FIXED)('%s لا يمرّر user.id حيث يُنتظر employee_id', (page) => {
    const code = codeOnly(read(page));
    expect(code).not.toMatch(/employee_id:\s*user\.id/);
    expect(code).not.toMatch(/findByEmployee\(user\.id\)/);
    expect(code).not.toMatch(/findByUser\(user\.id/);
  });

  it.each(FIXED)('%s يستعمل useEmployeeId', (page) => {
    expect(read(page)).toMatch(/useEmployeeId/);
  });

  /**
   * ★★ لا `employeeId ?? ''` — هذا بالضبط عطل 0333:
   *   `employee_id=eq.` يردّه Postgres بـ400
   *   «invalid input syntax for type uuid».
   */
  it.each(FIXED)('%s لا يُمرّر سلسلة فارغة بدل المعرّف', (page) => {
    expect(codeOnly(read(page))).not.toMatch(/employeeId \?\? ''/);
  });
});

describe('★ لوحة الموظف — الواجهة', () => {
  it('★★ تعرض حالة «حساب بلا سجلّ موظف» بدل أصفار صامتة', () => {
    expect(DASH).toMatch(/if \(linkMissing\)/);
    expect(DASH).toMatch(/حسابك غير مرتبط بسجلّ موظف/);
  });

  it('★ الإجماليات من القاعدة لا من عدّ المصفوفات', () => {
    expect(DASH).toMatch(/summaryRow\.totalProblems/);
    expect(DASH).toMatch(/summaryRow\.attendanceRate/);
    expect(DASH).toMatch(/summaryRow\.activeGoals/);
  });

  it('★ تستدعي الخدمة الجديدة', () => {
    expect(DASH).toMatch(/employeeDashboardService\.summary\(\)/);
  });

  it('★ لا تجلب حين لا سجلّ موظف', () => {
    expect(DASH).toMatch(/if \(!employeeId\) \{ setLoading\(false\); return; \}/);
  });
});

describe('0335 — الاختبار السلوكي', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-employee-dashboard-0335.sql'))).toBe(true);
  });

  it('★★ يفحص أن المعرّفين مختلفان (وإلا لا يقيس العطل)', () => {
    expect(VERIFY).toMatch(/employees\.id = profiles\.id ⇒ الاختبار لا يقيس العطل/);
  });

  it('★★ يفحص القيد الفريد بمحاولة تكرار حقيقية', () => {
    expect(VERIFY).toMatch(/unique_violation/);
    expect(VERIFY).toMatch(/القيد صوري/);
  });

  it('★ ويفحص أن القيد لا يخنق الموظفين بلا حساب', () => {
    expect(VERIFY).toMatch(/NOUSER-1/);
    expect(VERIFY).toMatch(/NOUSER-2/);
  });

  it('★★★ يوثّق التصحيح الذاتي لتأكيد العزل', () => {
    expect(VERIFY).toMatch(/تصحيح ذاتي مُوثَّق/);
    // النصّ مقسوم على سطرين في الملف — نطابق شطراً واحداً
    expect(VERIFY).toMatch(/UUID فريد عالمياً/);
  });

  it('★ يوثّق البنية المُحقَّقة لا المُخمَّنة', () => {
    expect(VERIFY).toMatch(/mood نصّ/);
    expect(VERIFY).toMatch(/numeric\(6,3\)/);
  });
});
