/**
 * ════════════════════════════════════════════════════════════════
 *  sopComplianceContract.test.ts
 *
 *  عقد «إجراءات التشغيل: القراءة والاعتماد والامتثال» (migration 0343).
 *  المرحلة 2 — إتمام آخر صفحة كبيرة في بوابة الموظف.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-sop-compliance-0343.sql       68 تأكيداً
 *      tools/dev/verify-sop-compliance-0343-rls.sh    27 تأكيداً (RLS حقيقي)
 *      عكس 31 إصلاحاً ⇒ 28 على القاعدة المطبَّقة + 3 بنيوية على قاعدة
 *      نظيفة (IF NOT EXISTS يمنع إعادة الإنشاء على المطبَّقة).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0343_sop_reading_compliance.sql');
const VERIFY = read('tools/dev/verify-sop-compliance-0343.sql');
const RLS = read('tools/dev/verify-sop-compliance-0343-rls.sh');
const SVC = read('src/services/sdk/SopService.ts');
const PAGE = read('src/pages/employee/SOPsPage.tsx');
const BOUNDARY = read('scripts/check-sdk-boundary.mjs');

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

const PAGE_CODE = codeOnly(PAGE);
const SVC_CODE = codeOnly(SVC);

// ════════════════════════════════════════════════════════════════
describe('0343 — بنية المايجريشن', () => {
  it('كل دالة تُسبَق بـDROP صريح', () => {
    for (const fn of ['sop_reading_touch', 'sop_reading_approve',
      'my_sops', 'sop_compliance_overview']) {
      const drop = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}(`);
      const create = M.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(drop, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(create, `${fn}: DROP بعد CREATE`).toBeGreaterThan(drop);
    }
  });

  it('★ anon لا يُمنح EXECUTE على أي دالة', () => {
    for (const fn of ['sop_reading_touch', 'sop_reading_approve',
      'my_sops', 'sop_compliance_overview']) {
      expect(M, `${fn}: لا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(codeOnly(M), `${fn}: مُنح لـanon`)
        .not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO anon`));
    }
  });

  it('★★ الكاتبتان VOLATILE — الكتابة مستحيلة في STABLE', () => {
    expect(fnBody('sop_reading_touch')).toMatch(/\nVOLATILE\n/);
    expect(fnBody('sop_reading_approve')).toMatch(/\nVOLATILE\n/);
  });

  it('★★★ القارئتان SECURITY INVOKER — تحترمان RLS', () => {
    for (const fn of ['my_sops', 'sop_compliance_overview']) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست INVOKER`).toMatch(/SECURITY INVOKER/);
      expect(body, `${fn}: صارت DEFINER`).not.toMatch(/SECURITY DEFINER/);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ① — تتبّع القراءة يُكتب في القاعدة', () => {
  const body = fnBody('sop_reading_touch');

  it('★★★ تُنشئ سجلّ القراءة عند أول لمسة', () => {
    expect(body).toMatch(/INSERT INTO public\.sop_readings \(/);
    expect(body).toMatch(/started_at, last_read_at/);
  });

  it('★★ السياق كلّه من الجلسة — لا معرّفات من المتصفح', () => {
    const sig = M.slice(M.indexOf('CREATE FUNCTION public.sop_reading_touch('),
      M.indexOf('RETURNS TABLE ('));
    expect(sig).not.toMatch(/p_tenant/);
    expect(sig).not.toMatch(/p_employee/);
    expect(body).toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
    expect(body).toMatch(/v_emp\s+UUID := public\.current_user_employee_id\(\)/);
    expect(body).toMatch(/SOP_NO_EMPLOYEE/);
  });

  /**
   * ★★ الوقت كان `setInterval` في المتصفح — قابل للتلاعب ويضيع عند
   *   إغلاق التبويب. الآن من فارق `last_read_at`.
   */
  it('★★★ الوقت من فارق الطوابع بسقف 15 دقيقة للنبضة', () => {
    expect(body).toMatch(/EXTRACT\(EPOCH FROM \(NOW\(\) - v_row\.last_read_at\)\)::INT/);
    expect(body).toMatch(/LEAST\(\s*\n?\s*GREATEST\([\s\S]{0,120}?900\)/);
  });

  it('★★★ تلميح الواجهة يُؤخذ منه الأصغر — لا يُصدَّق التضخيم', () => {
    expect(body).toMatch(/v_add := LEAST\(v_add, p_elapsed_secs\)/);
    expect(body).not.toMatch(/v_add := GREATEST\(v_add, p_elapsed_secs\)/);
  });

  it('★ ترفض إجراءً غير موجود أو من مستأجر آخر', () => {
    expect(body).toMatch(/WHERE id = p_sop_id AND tenant_id = v_tenant[\s\S]{0,120}?SOP_NOT_FOUND/);
  });

  it('★ عدّ القراءات يتزايد', () => {
    expect(body).toMatch(/read_count\s+= COALESCE\(read_count, 0\) \+ 1/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ② — الاعتماد وسياسة المالك', () => {
  it('★★★ سياسة تحديث المالك — قراءة وكتابة لصاحب السجلّ', () => {
    expect(M).toMatch(/CREATE POLICY kyvzon_sop_readings_update_owner ON public\.sop_readings/);
    const pol = M.slice(M.indexOf('CREATE POLICY kyvzon_sop_readings_update_owner'),
      M.indexOf('COMMENT ON POLICY kyvzon_sop_readings_update_owner'));
    expect(pol).toMatch(/FOR UPDATE/);
    expect(pol).toMatch(/employee_id = public\.current_user_employee_id\(\)/);
    expect(pol).toMatch(/tenant_id = public\.current_user_tenant_id\(\)/);
    // ★ WITH CHECK أيضاً وإلا نقل الصفّ لمستأجر آخر
    expect(pol).toMatch(/WITH CHECK/);
  });

  it('★★ الاعتماد يضبط الحقول الأربعة', () => {
    const body = fnBody('sop_reading_approve');
    expect(body).toMatch(/approved\s+= TRUE/);
    expect(body).toMatch(/completed\s+= TRUE/);
    expect(body).toMatch(/approval_status = 'approved'/);
    expect(body).toMatch(/approved_at\s+= NOW\(\)/);
  });

  it('★ اعتماد بلا بدء مرفوض · واعتماد المعتمَد يُعيد FALSE', () => {
    const body = fnBody('sop_reading_approve');
    expect(body).toMatch(/SOP_NOT_STARTED/);
    expect(body).toMatch(/IF COALESCE\(v_row\.approved, FALSE\) THEN RETURN FALSE; END IF;/);
  });

  it('★★★ الحارس: الاعتماد لا يُسحب · الوقت لا ينقص · الانتماء ثابت', () => {
    const trg = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.tg_guard_sop_reading()'),
      M.indexOf('COMMENT ON FUNCTION public.tg_guard_sop_reading()'));
    expect(trg).toMatch(/SOP_APPROVAL_FINAL/);
    expect(trg).toMatch(/SOP_TIME_MONOTONIC/);
    expect(trg).toMatch(/SOP_READING_IMMUTABLE_LINK/);
    // ★ والموارد البشرية مستثناة للتصحيح الإداري
    expect(trg).toMatch(/IF public\.current_user_is_staff\(\) THEN RETURN NEW; END IF;/);
    expect(M).toMatch(/BEFORE UPDATE ON public\.sop_readings/);
  });

  it('★ القيد الفريد يشمل المستأجر', () => {
    expect(M).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_reading_tenant_emp_sop\s*\n\s*ON public\.sop_readings \(tenant_id, employee_id, sop_id\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ③ — الانتماء بالمعرّف لا بالنصّ', () => {
  it('★★ عمود department_id بمرجع إلى departments', () => {
    expect(M).toMatch(/ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public\.departments\(id\) ON DELETE SET NULL/);
  });

  it('★ ربط أثري بمطابقة الاسم مرّة واحدة', () => {
    const blk = M.slice(M.indexOf('DO $$\nDECLARE v_n INT;'), M.indexOf('COMMENT ON COLUMN public.sops.department_id'));
    expect(blk).toMatch(/SET department_id = d\.id/);
    expect(blk).toMatch(/btrim\(d\.name_ar\) = btrim\(s\.department\)/);
    expect(blk).not.toMatch(/DELETE FROM/);
  });

  it('★★★ الكتالوج يُرشّح بالمعرّف أوّلاً مع احتياط نصّي', () => {
    const body = fnBody('my_sops');
    expect(body).toMatch(/s\.department_id IS NOT DISTINCT FROM v_dept/);
    expect(body).toMatch(/s\.department = 'general'/);
  });

  it('★★ واسم القسم المعروض من departments الحيّ', () => {
    expect(fnBody('my_sops'))
      .toMatch(/COALESCE\(NULLIF\(btrim\(d\.name_ar\), ''\), s\.department, '—'\)/);
  });

  it('★ فهرس جزئي على (tenant, department_id) للنشط', () => {
    expect(M).toMatch(/idx_sops_dept_active[\s\S]{0,120}?ON public\.sops \(tenant_id, department_id\)[\s\S]{0,60}?WHERE status = 'active'/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ④ — الكتالوج والامتثال', () => {
  const cat = fnBody('my_sops');
  const comp = fnBody('sop_compliance_overview');

  it('★★ الكتالوج: الترشيح والبحث والترقيم في القاعدة', () => {
    expect(cat).toMatch(/p_category IS NULL OR s\.category = p_category/);
    expect(cat).toMatch(/s\.title\s+ILIKE '%' \|\| v_q \|\| '%'/);
    expect(cat).toMatch(/count\(\*\) OVER \(\) AS out_total/);
    expect(cat).toMatch(/LIMIT v_lim OFFSET v_off/);
  });

  it('★ ترشيح الحالة الثلاثي', () => {
    expect(cat).toMatch(/p_status = 'completed'\s+AND COALESCE\(r\.approved, FALSE\)/);
    expect(cat).toMatch(/p_status = 'in_progress' AND r\.id IS NOT NULL/);
    expect(cat).toMatch(/p_status = 'not_started' AND r\.id IS NULL/);
  });

  it('★★ الإلزامي غير المعتمَد أوّلاً — هو ما يحتاجه الموظف فعلاً', () => {
    expect(cat).toMatch(/ORDER BY \(f\.f_mand AND NOT f\.f_appr\) DESC/);
  });

  it('★ المؤرشف مستبعَد من الكتالوج والامتثال', () => {
    expect(cat).toMatch(/WHERE s\.status = 'active'/);
    expect(comp).toMatch(/WHERE s\.status = 'active'/);
  });

  it('★★ الجمهور المستهدَف: القسم أو الكل للإجراء العام', () => {
    expect(comp).toMatch(/s\.department_id IS NULL OR e\.department_id = s\.department_id/);
  });

  it('★★ عزل المستأجر في الامتثال', () => {
    expect(comp).toMatch(/AND s\.tenant_id = v_tenant/);
    expect(comp).toMatch(/e\.tenant_id = s\.tenant_id/);
  });

  /**
   * ★★ تصحيح موثَّق: كتبتُ أن `avg()` ينحرف بمضاعفة الوصل، وأثبت
   *   التشغيل العكس — المضاعفة منتظمة فلا ينحرف. وُثّق في المايجريشن
   *   بدل ادّعاء حراسة غير قائمة.
   */
  it('★★ متوسّط الوقت باستعلام فرعي — مع توثيق التصحيح', () => {
    expect(comp).toMatch(/SELECT COALESCE\(sum\(r2\.time_spent\), 0\)::NUMERIC/);
    expect(M).toMatch(/تصحيح ادّعاء أوّلي كتبتُه هنا/);
    expect(M).toMatch(/المتوسّط لا ينحرف \*\*رياضياً\*\*/);
  });

  it('★ نسبة الامتثال تُحسب من المستهدَفين', () => {
    expect(comp).toMatch(/100\.0 \* count\(DISTINCT r\.employee_id\)[\s\S]{0,80}?count\(DISTINCT t\.emp_id\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ⑤ — طبقة SDK', () => {
  it('★★★ RPC فقط — لا لمس مباشر للجدول', () => {
    expect(SVC_CODE).not.toMatch(/supabase\s*\.\s*from\(/);
    for (const rpc of ['my_sops', 'sop_reading_touch',
      'sop_reading_approve', 'sop_compliance_overview']) {
      expect(SVC).toContain(`'${rpc}'`);
    }
  });

  it('★★ touch لا تستقبل معرّفات — تشتقّها القاعدة', () => {
    expect(SVC).toMatch(/async touch\(sopId: string, elapsedSecs\?: number\)/);
    expect(SVC_CODE).not.toMatch(/p_tenant/);
    expect(SVC_CODE).not.toMatch(/p_employee_id/);
  });

  it('★ صفحة بإجمالي للترقيم', () => {
    expect(SVC).toMatch(/total: raw\.length > 0 \? Number\(raw\[0\]\.out_total \?\? 0\) : 0/);
  });

  it('★ خريطة أخطاء عربية', () => {
    expect(SVC).toMatch(/export function sopErrorMessage/);
    for (const code of ['SOP_NO_EMPLOYEE', 'SOP_NOT_STARTED',
      'SOP_APPROVAL_FINAL', 'SOP_TIME_MONOTONIC']) {
      expect(SVC, `${code} غير مُترجَم`).toContain(code);
    }
  });

  it('★ لا as any ولا confirm/prompt/alert', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(SVC_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ⑥ — الصفحة', () => {
  it('★★★ لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/services\/supabase\/supabase/);
    expect(PAGE_CODE).not.toMatch(/\.from\('sops'\)/);
    expect(PAGE_CODE).not.toMatch(/supabase/);
  });

  it('★★★ التتبّع في القاعدة لا في useState', () => {
    expect(PAGE_CODE).toMatch(/sopService\.touch\(/);
    expect(PAGE_CODE).toMatch(/sopService\.approve\(/);
    // ★ خريطة القراءات المحلّية اختفت
    expect(PAGE_CODE).not.toMatch(/setReadings\(/);
    expect(PAGE_CODE).not.toMatch(/const \[readings, setReadings\]/);
    expect(PAGE_CODE).not.toMatch(/SOPReading/);
  });

  it('★★ الترشيح في القاعدة لا في المتصفح', () => {
    expect(PAGE_CODE).toMatch(/sopService\.myCatalog\(/);
    // ★ لم يعد يُرشّح بمطابقة نصّية على القسم
    expect(PAGE_CODE).not.toMatch(/sop\.department !== userDept/);
    expect(PAGE_CODE).not.toMatch(/manufacturingDept/);
  });

  it('★★ نبضة دورية إلى القاعدة أثناء القراءة', () => {
    expect(PAGE_CODE).toMatch(/pulseRef/);
    expect(PAGE_CODE).toMatch(/void sopService\.touch\(id, 30\)/);
  });

  it('★ الممنوعات', () => {
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
  });

  it('★★ مدخل SOPsPage أُزيل من allowlist حدود SDK', () => {
    expect(BOUNDARY).not.toMatch(/employee\/SOPsPage\.tsx'/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0343 ⑦ — الاختبارات نفسها', () => {
  it('اختبار السلوك يرجع كل شيء', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION 'ROLLBACK_VERIFY_0343'/);
    expect(VERIFY).toMatch(/IF SQLERRM <> 'ROLLBACK_VERIFY_0343' THEN RAISE/);
  });

  it('★★ يلتقط سجلّ الموظف من محفّز 0317 ولا يُدرج ثانياً', () => {
    expect(VERIFY).toMatch(/SELECT id INTO v_eEmp FROM public\.employees WHERE user_id=v_uEmp/);
    expect(VERIFY).not.toMatch(/INSERT INTO public\.employees/);
  });

  /**
   * ★★★ سبع ثغرات تغطية أُصلحت في هذه الجولة. أهمّها ثلاث من عائلة
   *   «المقارنة لا تُميّز» تكرّرت للمرة الثامنة.
   */
  it('★★★ يقيس الزيادة لكل لمسة لا الفرق بين لمستين', () => {
    expect(VERIFY).toMatch(/تلميح 99999 أضاف/);
    expect(VERIFY).toMatch(/تلميح 0 أضاف/);
  });

  it('★★★ ويُباعد العمودين النصّيين لكشف الترشيح النصّي', () => {
    expect(VERIFY).toMatch(/UPDATE public\.profiles\s+SET department='الإنتاج والتصنيع'/);
    expect(VERIFY).toMatch(/تجهيز باطل: العمودان النصّيان ما زالا متطابقَين/);
  });

  it('★★★ ويستعمل قارئاً من خارج الجمهور لكشف مضاعفة الوصل', () => {
    expect(VERIFY).toMatch(/قارئاً \*\*من خارج\*\* الجمهور/);
    expect(VERIFY).toMatch(/7\.8d/);
  });

  it('★★ وفحوصاً بنيوية من كتالوج النظام لا مجرّد الوجود', () => {
    expect(VERIFY).toMatch(/بلا مرجع إلى departments/);
    expect(VERIFY).toMatch(/indisunique/);
    expect(VERIFY).toMatch(/لا يشمل \(tenant_id, employee_id, sop_id\)/);
  });

  it('★★ ويوثّق أن سياسة UPDATE تُقاس في RLS لا هنا', () => {
    expect(VERIFY).toMatch(/لا تُقاس هنا — postgres يتجاوز RLS/);
  });

  it('★★★ سكربت RLS يقيس عطل سياسة المالك — جوهر الجولة', () => {
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/الموظف يُحدّث سجلّ قراءته \(كان 0 صفوف\)/);
    expect(RLS).toMatch(/سجلّ زميلته محميّ/);
    expect(RLS).toMatch(/SET ROLE anon/);
  });

  it('الملفات موجودة', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-sop-compliance-0343.sql'))).toBe(true);
    expect(existsSync(resolve(root, 'tools/dev/verify-sop-compliance-0343-rls.sh'))).toBe(true);
  });
});
