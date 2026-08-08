/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0356 — سلامة تقييم الأداء
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-performance-review-0356.sql`
 *   · العزل مُثبَت في `…-0356-rls.sh` بدور `authenticated` حقيقيّ
 *   · التغطية مُثبتة في `_invert_0356.py` — **50/50** عكساً أسقط
 *     الاختبار (+3 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: عمودٌ وهميّ ·
 *   سُلَّمان متناقضان · حذفٌ نهائيّ · Supabase من الصفحة · `any`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0356_performance_review_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/PerformanceReviewService.ts');
const PAGE    = read('src/pages/hr/PerformancePage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة: مُجرِّدٌ معطوب = حارسٌ كاذب ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs('/* overall_score */ const x=1;')).not.toMatch(/overall_score/);
    expect(codeTs('// overall_score\nconst y=1;')).not.toMatch(/overall_score/);
    expect(codeTs('const s = r.overall_score;')).toMatch(/overall_score/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'overall_score مذكور';")).not.toMatch(/overall_score/);
    expect(stmtSql("  AND r.status = 'draft'")).toMatch(/r\.status/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/**
 * ★ درس 0355: `fnBody` يجب أن يعمل على النصّ **المُجرَّد** من
 *   التعليقات — وإلا التقط التوثيق الذي يذكر العطل بنصّه.
 */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = [
  'performance_summary', 'performance_cycles_board', 'performance_reviews_board',
  'performance_cycle_create', 'performance_cycle_set_status',
  'performance_review_create', 'performance_review_set_status',
  'performance_review_archive',
];

// ═══════════════════════════════════════════════════════════════
describe('0356 — بنية المايجريشن', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, MIG_PATH))).toBe(true);
  });

  it('★★★ الأعمدة الناقصة تُضاف كلها', () => {
    for (const c of ['score', 'strengths', 'improvements', 'completed_at',
                     'archived_at', 'archive_reason', 'updated_at']) {
      expect(MIG_CODE, c).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`));
    }
  });

  it('★★★ updated_at بـNOT NULL DEFAULT — المحفّز القديم يحتاجه', () => {
    expect(MIG_CODE).toMatch(
      /ADD COLUMN IF NOT EXISTS updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  });

  it('★ المحفّز المعطوب لا يُسقَط — إضافة العمود تُصلحه', () => {
    expect(MIG_STMT).not.toMatch(
      /DROP TRIGGER IF EXISTS update_performance_reviews_updated_at/);
  });

  it('كل دالة تُسقَط قبل إنشائها (نوع الإرجاع لا يتغيّر بـOR REPLACE)', () => {
    for (const f of NEW_FNS) {
      expect(MIG_CODE, f).toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\(`));
    }
  });

  it('كل دالة SECURITY DEFINER مع search_path مثبَّت', () => {
    for (const f of NEW_FNS) {
      const b = fnBody(f);
      expect(b, `${f}: SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(b, `${f}: search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل دالة تُنزع من PUBLIC و anon وتُمنح لـauthenticated', () => {
    for (const f of NEW_FNS) {
      expect(MIG_CODE, `${f}: PUBLIC`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*FROM PUBLIC`));
      expect(MIG_CODE, `${f}: anon`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*FROM anon`));
      expect(MIG_CODE, `${f}: authenticated`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*TO authenticated`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ① — لا عمود وهميّ في أي طبقة', () => {
  const GHOSTS = ['overall_score', 'goals_summary'];

  it('المايجريشن لا يكتب عموداً وهمياً', () => {
    for (const g of GHOSTS) {
      expect(MIG_STMT, g).not.toMatch(new RegExp(`\\b${g}\\b`));
    }
  });

  it('★★★ الخدمة لا تُرسل عموداً وهمياً', () => {
    for (const g of GHOSTS) {
      expect(SVC_CODE, g).not.toMatch(new RegExp(`\\b${g}\\b`));
    }
  });

  it('★★★ الصفحة لا تقرأ عموداً وهمياً', () => {
    for (const g of GHOSTS) {
      expect(PAGE_CODE, g).not.toMatch(new RegExp(`\\b${g}\\b`));
    }
  });

  it('الصفحة لا تستعمل خدمات الأداء القديمة المعطوبة', () => {
    expect(PAGE_CODE).not.toMatch(/performanceReviewService/);
    expect(PAGE_CODE).not.toMatch(/performanceCycleService/);
    expect(PAGE_CODE).not.toMatch(/updateReviewStatus/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ③ — سُلَّم واحد', () => {
  it('rating يُشتقّ من score في محفّز', () => {
    const b = fnBody('tg_perf_review_derive');
    expect(b).toMatch(/NEW\.rating := GREATEST\(1, LEAST\(5, CEIL\(NEW\.score \/ 20\.0\)/);
  });

  it('★★ GREATEST(1,…) موجود — score=0 يعطي 0 ويخالف CHECK(1..5)', () => {
    expect(fnBody('tg_perf_review_derive')).toMatch(/GREATEST\(1,/);
  });

  it('الاتجاه العكسيّ لصفوف rating وحده', () => {
    expect(fnBody('tg_perf_review_derive'))
      .toMatch(/NEW\.score := \(NEW\.rating \* 20\) - 10/);
  });

  it('المحفّز مربوط بالجدول قبل INSERT و UPDATE', () => {
    expect(MIG_CODE).toMatch(/CREATE TRIGGER trg_perf_review_derive/);
    expect(MIG_CODE).toMatch(
      /BEFORE INSERT OR UPDATE ON public\.performance_reviews/);
  });

  it('قيد الدرجة 0..100', () => {
    expect(MIG_CODE).toMatch(/performance_reviews_score_chk/);
    expect(MIG_CODE).toMatch(/score >= 0 AND score <= 100/);
  });

  it('★★ الصفحة تحسب اللون من score لا من rating', () => {
    expect(PAGE_CODE).toMatch(/function scoreTone\(score: number \| null\)/);
    expect(PAGE_CODE).toMatch(/score >= 85/);
    expect(PAGE_CODE).toMatch(/tone\.text/);
  });

  it('★ الصفحة تعرض score كنسبة و rating كتقدير من 5', () => {
    expect(PAGE_CODE).toMatch(/review\.score === null \? '—' : `\$\{review\.score\}%`/);
    expect(PAGE_CODE).toMatch(/\$\{review\.rating\}\/5/);
  });

  it('الخدمة تُعلن الدرجة والتقدير معاً', () => {
    expect(SVC_CODE).toMatch(/score:\s*number \| null/);
    expect(SVC_CODE).toMatch(/rating:\s*number \| null/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ④/⑤ — المفردات والقيود', () => {
  it('قيد مفردات حالة التقييم الخمس', () => {
    expect(MIG_CODE).toMatch(/performance_reviews_status_chk/);
    expect(MIG_CODE).toMatch(
      /CHECK \(status IN \('draft','submitted','under_review','completed','cancelled'\)\)/);
  });

  it('الخدمة تُصدّر المفردات الخمس ولا سادسة', () => {
    const m = SVC_CODE.match(/export const REVIEW_STATUSES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(
      ['cancelled', 'completed', 'draft', 'submitted', 'under_review']);
  });

  it('لكل مفردة تسمية عربية ولون — لا undefined في الشارة', () => {
    for (const s of ['draft', 'submitted', 'under_review', 'completed', 'cancelled']) {
      expect(SVC_CODE, `REVIEW_STATUS_AR.${s}`).toMatch(
        new RegExp(`${s}:\\s*'[^']+'`));
    }
    const tone = SVC_CODE.slice(SVC_CODE.indexOf('REVIEW_STATUS_TONE'));
    for (const s of ['draft', 'submitted', 'under_review', 'completed', 'cancelled']) {
      expect(tone, `REVIEW_STATUS_TONE.${s}`).toMatch(new RegExp(`${s}:`));
    }
  });

  it('قيود الدورة الثلاثة', () => {
    for (const c of ['performance_cycles_status_chk',
                     'performance_cycles_period_chk',
                     'performance_cycles_range_chk']) {
      expect(MIG_CODE, c).toMatch(new RegExp(c));
    }
    expect(MIG_CODE).toMatch(/CHECK \(end_date >= start_date\)/);
  });

  it('الخدمة تُصدّر مفردات الدورة والفترات', () => {
    expect(SVC_CODE).toMatch(/CYCLE_STATUSES = \[\s*\n?\s*'draft', 'active', 'closed', 'cancelled',/);
    expect(SVC_CODE).toMatch(/CYCLE_PERIODS = \[\s*\n?\s*'monthly', 'quarterly', 'semi_annual', 'annual',/);
  });

  it('★ الصفحة تشتقّ الأزرار من الثوابت لا من قائمة مكتوبة', () => {
    expect(PAGE_CODE).toMatch(/REVIEW_STATUSES\.map/);
    expect(PAGE_CODE).toMatch(/CYCLE_PERIODS\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑥/⑦/⑧ — الفرادة والتقييم الذاتيّ و FK', () => {
  it('الفهرس الفريد (مستأجر، دورة، موظف)', () => {
    expect(MIG_CODE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_employee_cycle/);
    expect(MIG_CODE).toMatch(/\(tenant_id, cycle_id, employee_id\)/);
    // ★ جزئيّ: الملغاة والمؤرشفة خارجه — إعادة التقييم مشروعة
    expect(MIG_CODE).toMatch(/WHERE cycle_id IS NOT NULL/);
    expect(MIG_CODE).toMatch(/status <> 'cancelled'/);
  });

  it('حارس التكرار برسالة مفهومة قبل الفهرس', () => {
    expect(fnBody('performance_review_create')).toMatch(/REVIEW_DUPLICATE/);
  });

  it('★★ منع التقييم الذاتيّ عبر employees.user_id (المفتاحان مختلفان)', () => {
    const b = fnBody('tg_perf_review_derive');
    expect(b).toMatch(/SELECT e\.user_id INTO v_reviewer_emp/);
    expect(b).toMatch(/v_reviewer_emp = NEW\.reviewer_id/);
    expect(b).toMatch(/REVIEW_SELF_NOT_ALLOWED/);
  });

  it('★ ولا مقارنة employee_id بـreviewer_id مباشرةً (خطأ شائع)', () => {
    expect(fnBody('tg_perf_review_derive'))
      .not.toMatch(/NEW\.employee_id\s*=\s*NEW\.reviewer_id/);
  });

  it('FK على cycle_id', () => {
    expect(MIG_CODE).toMatch(/performance_reviews_cycle_id_fkey/);
    expect(MIG_CODE).toMatch(
      /FOREIGN KEY \(cycle_id\) REFERENCES public\.performance_cycles\(id\)/);
  });

  it('★ الصفحة تُميّز الموظف المُقيَّم بتسمية صريحة', () => {
    expect(PAGE_CODE).toMatch(/الموظف المُقيَّم/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑨ — الأرشفة بدل الحذف', () => {
  it('محفّزان يمنعان الحذف', () => {
    expect(MIG_CODE).toMatch(/CREATE TRIGGER trg_block_perf_review_delete/);
    expect(MIG_CODE).toMatch(/CREATE TRIGGER trg_block_perf_cycle_delete/);
    expect(MIG_CODE).toMatch(/REVIEW_IMMUTABLE/);
    expect(MIG_CODE).toMatch(/CYCLE_IMMUTABLE/);
  });

  it('دالة أرشفة بسبب إلزاميّ', () => {
    expect(fnBody('performance_review_archive')).toMatch(/REVIEW_NO_REASON/);
    expect(fnBody('performance_review_archive')).toMatch(/archived_at = NOW\(\)/);
  });

  it('المؤرشف لا يُعدَّل', () => {
    expect(fnBody('performance_review_set_status')).toMatch(/REVIEW_ARCHIVED/);
  });

  it('★★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE).not.toMatch(/\.delete\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
    expect(SVC_CODE).toMatch(/archiveReview/);
    expect(PAGE_CODE).toMatch(/archiveReview\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ انتقالات الحالة', () => {
  it('جدول انتقالات التقييم في القاعدة', () => {
    const b = fnBody('performance_review_set_status');
    expect(b).toMatch(/WHEN 'draft'\s*THEN p_status IN \('submitted','cancelled'\)/);
    expect(b).toMatch(/ELSE FALSE/);
    expect(b).toMatch(/REVIEW_BAD_TRANSITION/);
  });

  it('جدول الواجهة نسخة مطابِقة من جدول القاعدة', () => {
    const m = SVC_CODE.match(
      /REVIEW_TRANSITIONS: Record<ReviewDbStatus, ReviewDbStatus\[\]> = \{([\s\S]*?)\};/);
    expect(m).toBeTruthy();
    const t = (m as RegExpMatchArray)[1];
    expect(t).toMatch(/draft:\s*\['submitted', 'cancelled'\]/);
    expect(t).toMatch(/completed:\s*\[\]/);
    expect(t).toMatch(/cancelled:\s*\[\]/);
  });

  it('نهائية الدورة المغلقة', () => {
    expect(fnBody('performance_cycle_set_status')).toMatch(/CYCLE_FINAL/);
  });

  it('★★ إغلاق الدورة يُلغي تقييماتها المعلَّقة', () => {
    const b = fnBody('performance_cycle_set_status');
    expect(b).toMatch(/IF p_status = 'closed' THEN[\s\S]{0,400}status = 'cancelled'/);
    expect(b).toMatch(/status IN \('draft','submitted','under_review'\)/);
  });

  it('★ الصفحة تعرض الانتقالات المسموحة فقط', () => {
    expect(PAGE_CODE).toMatch(/REVIEW_TRANSITIONS\[review\.status\]/);
    expect(PAGE_CODE).toMatch(/CYCLE_TRANSITIONS\[cycle\.status\]/);
  });

  it('★ لا تقييم في دورة مغلقة — قاعدةً وواجهةً', () => {
    expect(fnBody('performance_review_create')).toMatch(/CYCLE_NOT_OPEN/);
    // الصفحة لا تعرض المغلقة في قائمة الاختيار أصلاً
    expect(PAGE_CODE).toMatch(/openCycles/);
    expect(PAGE_CODE).toMatch(/status === 'draft' \|\| c\.status === 'active'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العزل والأدوار', () => {
  it('كل دالة تفحص المستأجر', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: v_tenant`)
        .toMatch(/v_tenant\s+UUID\s*:=\s*public\.current_user_tenant_id\(\)/);
      expect(fnBody(f), `${f}: حارس NULL`).toMatch(/IF v_tenant IS NULL THEN/);
    }
  });

  it('القراءة محصورة بالطاقم', () => {
    for (const f of ['performance_summary', 'performance_cycles_board',
                     'performance_reviews_board']) {
      expect(fnBody(f), f).toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
    }
  });

  it('الكتابة محصورة بـadmin و hr', () => {
    for (const f of ['performance_cycle_create', 'performance_cycle_set_status',
                     'performance_review_create', 'performance_review_set_status',
                     'performance_review_archive']) {
      expect(fnBody(f), f).toMatch(/v_role NOT IN \('admin','hr'\)/);
    }
  });

  it('كل استعلام يُرشِّح بالمستأجر', () => {
    // ★ تصحيح حارسي: `performance_cycle_create` **تُدرج** صفّاً ولا
    //   تقرأ شيئاً، فتكتب المستأجر بـ`VALUES (v_tenant, …)` لا
    //   بـ`WHERE tenant_id = v_tenant`. الحارس المفرط أسقطها ظلماً.
    const READERS = NEW_FNS.filter((f) => f !== 'performance_cycle_create');
    for (const f of READERS) {
      expect(fnBody(f), `${f}: ترشيح`).toMatch(/tenant_id = v_tenant/);
    }
    // ★ والمُدرِجة تكتب المستأجر من السياق — لا من المستخدم
    const b = fnBody('performance_cycle_create');
    expect(b, 'الإدراج يكتب v_tenant').toMatch(/VALUES \(v_tenant,/);
    expect(b, 'لا مُعامل tenant من المستخدم').not.toMatch(/p_tenant/);
  });

  it('إنشاء التقييم يتحقّق أن الموظف من المستأجر نفسه', () => {
    expect(fnBody('performance_review_create'))
      .toMatch(/FROM public\.employees e[\s\S]{0,140}e\.tenant_id = v_tenant/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑩ — لا نقل جداول إلى المتصفّح', () => {
  it('اللوحتان لهما حدّ أعلى', () => {
    expect(fnBody('performance_reviews_board'))
      .toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 200\), 1\)/);
    expect(fnBody('performance_cycles_board'))
      .toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 100\), 1\)/);
  });

  it('الصفحة تمرّر حدوداً صريحة', () => {
    expect(PAGE_CODE).toMatch(/cycles\(includeArchived,\s*\d+\)/);
    expect(PAGE_CODE).toMatch(/limit:\s*\d+/);
  });

  it('★★ لا ربط بخرائط في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/new Map<string, EmployeeSummary>/);
    expect(PAGE_CODE).not.toMatch(/new Map<string, PerformanceCycleSummary>/);
    expect(PAGE_CODE).not.toMatch(/WithEmployeeAndCycle/);
  });

  it('★ employeeService لا يُستدعى إلا داخل EmployeePicker المستورَد', () => {
    // EmployeePicker يأتي من LoansPage — لا استدعاء مباشر هنا
    expect(PAGE_CODE).not.toMatch(/employeeService\.findAll/);
  });

  it('الاسم والقسم والمقيّم من القاعدة', () => {
    expect(SVC_CODE).toMatch(/employeeName/);
    expect(SVC_CODE).toMatch(/reviewerName/);
    expect(SVC_CODE).toMatch(/department/);
  });

  it('سلسلة الاحتياط للاسم (full_name_ar فارغ لكل موظف)', () => {
    const b = fnBody('performance_reviews_board');
    expect(b).toMatch(/COALESCE\(NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/'موظف ' \|\| COALESCE\(e\.employee_code/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ NULL ≠ صفر (درس 0353)', () => {
  it('الخدمة تُعلن المتوسّط nullable', () => {
    expect(SVC_CODE).toMatch(/avgScore:\s*number \| null/);
    expect(SVC_CODE).toMatch(/coverage:\s*number \| null/);
  });

  it('★ numOrNull لا يحوّل NULL إلى صفر', () => {
    expect(SVC_CODE).toMatch(/const numOrNull[\s\S]{0,200}return null/);
    expect(SVC_CODE).toMatch(/avgScore:\s*numOrNull\(/);
  });

  it('★★ الصفحة تعرض نصّاً صريحاً لا صفراً', () => {
    expect(PAGE_CODE).toMatch(/avgScore === null \? 'لم يُقيَّم بعد'/);
    expect(PAGE_CODE).toMatch(/avgScore === null \? 'لا متوسّط'/);
  });

  it('القاعدة لا تُحوّل المتوسّط إلى صفر', () => {
    const b = fnBody('performance_summary');
    expect(b).not.toMatch(/COALESCE\(avg\(/);
    expect(b).toMatch(/round\(avg\(r\.score\) FILTER/);
  });

  it('الملغاة خارج المتوسّط', () => {
    expect(fnBody('performance_summary'))
      .toMatch(/avg\(r\.score\) FILTER \([\s\S]{0,90}status <> 'cancelled'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ سياسة المنصة — محظورات', () => {
  it('لا confirm/prompt/alert في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('★★ لا as any ولا : any في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
    // ★ العطل ⑪: كان `EmptyState({ icon }: { icon: any })`
    expect(PAGE_CODE).not.toMatch(/:\s*any\b/);
    expect(SVC_CODE).not.toMatch(/:\s*any\b/);
  });

  it('★★ الصفحة لا تلمس Supabase مباشرةً', () => {
    expect(PAGE_CODE).not.toMatch(/from ['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★ لا setMonth في الصفحة (يقفز 31 يناير إلى 3 مارس)', () => {
    expect(PAGE_CODE).not.toMatch(/setMonth/);
    expect(PAGE_CODE).toMatch(/function addMonthsSafe/);
  });

  it('★ اليوم بتوقيت بغداد لا بتوقيت المتصفّح', () => {
    expect(PAGE_CODE).toMatch(/timeZone:\s*'Asia\/Baghdad'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ التسجيل والترابط', () => {
  it('الخدمة مُصدَّرة من فهرس SDK', () => {
    expect(INDEX).toMatch(
      /export \{[\s\S]{0,400}performanceReviewSdk[\s\S]{0,400}\} from '\.\/PerformanceReviewService'/);
    expect(INDEX).toMatch(/REVIEW_STATUSES/);
    expect(INDEX).toMatch(/CYCLE_PERIODS/);
  });

  it('الصفحة تستورد من الفهرس لا من الملف مباشرةً', () => {
    expect(PAGE_CODE).toMatch(/from '\.\.\/\.\.\/services\/sdk'/);
    expect(PAGE_CODE).not.toMatch(/from '.*sdk\/PerformanceReviewService'/);
  });

  it('★ المكوّنات المشتركة تُستورَد من LoansPage لا تُكرَّر', () => {
    expect(PAGE_CODE).toMatch(
      /import \{ Modal, FormField, ModalActions, EmployeePicker \} from '\.\/LoansPage'/);
    for (const c of ['Modal', 'FormField', 'ModalActions', 'EmployeePicker']) {
      expect(PAGE_CODE, `${c} مكرَّر`).not.toMatch(
        new RegExp(`function ${c}\\s*\\(`));
    }
  });

  it('أدوات التحقق الثلاث موجودة', () => {
    for (const p of [
      'tools/dev/verify-performance-review-0356.sql',
      'tools/dev/verify-performance-review-0356-rls.sh',
      'tools/dev/_invert_0356.py',
    ]) {
      expect(existsSync(resolve(root, p)), p).toBe(true);
    }
  });
});
