#!/usr/bin/env python3
# ============================================================================
# _invert_0370.py — عكسُ كلّ إصلاحٍ في 0370 وإثبات أنّ الاختبار يسقط.
#
#   شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.
#   ⇒ لكلّ إصلاحٍ: نعكسه على القاعدة، نُشغّل التحقق، ونشترط سقوطه.
#     ثمّ نُعيد المايجريشن كاملاً ونشترط عودة الأخضر.
#
#   PGPORT=5510 python3 tools/dev/_invert_0370.py
# ============================================================================
import os, re, subprocess, sys

PGSOCK = os.environ.get("PGSOCK", "/home/user/.pgtest/sock")
PGPORT = os.environ.get("PGPORT", "5510")
ROOT   = "/home/user/Kyvzon"
MIG    = f"{ROOT}/supabase/migrations/0370_hr_reports_integrity.sql"
VER    = f"{ROOT}/tools/dev/verify-hr-reports-0370.sql"
RLS    = f"{ROOT}/tools/dev/verify-hr-reports-0370-rls.sh"

PSQL = ["psql", "-h", PGSOCK, "-p", PGPORT, "-U", "postgres", "-q", "-A", "-t"]


def sql(text):
    return subprocess.run(PSQL + ["-c", text], capture_output=True, text=True)


def run_verify():
    """يُعيد (نجح, عدد الفاشل, نصّ التأكيدات الفاشلة)"""
    r = subprocess.run(PSQL[:-2] + ["-f", VER], capture_output=True, text=True, cwd=ROOT)
    out = r.stdout + r.stderr
    failed = re.findall(r"^\s*(.+?)\s*\|\s*❌\s*\|", out, re.M)
    # ★★★★ نشترط رسالة النجاح الصريحة، لا مجرّد غياب ❌:
    #   حين تُجهَض المعاملة مبكّراً لا تُطبع أيّ نتيجة إطلاقاً —
    #   فيبدو الملفّ «نظيفاً» وهو لم يُنفَّذ. أنجى INV11 مرّتين.
    ok = ("✅ verify-hr-reports-0370: كل التأكيدات ناجحة" in out
          and "VERIFY_0370_FAILED" not in out and "❌" not in out)
    if not ok and not failed:
        aborted = [l for l in out.splitlines()
                   if "ERROR" in l and "current transaction is aborted" not in l]
        failed = [f"المعاملة أُجهضت: {aborted[0][:90]}"] if aborted else ["لم تُطبع نتائج"]
    return ok, len(failed), failed


def run_rls():
    r = subprocess.run(["bash", RLS], capture_output=True, text=True, cwd=ROOT,
                       env={**os.environ, "PGPORT": PGPORT})
    out = r.stdout + r.stderr
    failed = re.findall(r"^\s*❌ (.+)$", out, re.M)
    return r.returncode == 0, len(failed), failed


# ★★★ استرجاعٌ صريحٌ قبل إعادة التطبيق.
#   `IF NOT EXISTS` / `ADD CONSTRAINT` المحروسة لا تُعيد إنشاء ما بقي
#   موجوداً باسمٍ صحيحٍ وتعريفٍ خاطئ (كـFK مفردٍ محلَّ مركَّب).
#   بدون هذا بقي INV8 مكسوراً فتلوّثت كلُّ الانعكاسات بعده.
DDL_RESTORE = """
ALTER TABLE public.hr_report_runs DROP CONSTRAINT IF EXISTS fk_hr_report_run_actor_tenant;
ALTER TABLE public.hr_report_runs DROP CONSTRAINT IF EXISTS fk_hr_report_run_code;
ALTER TABLE public.hr_report_runs DROP CONSTRAINT IF EXISTS chk_hr_report_run_counts;
ALTER TABLE public.hr_report_runs DROP CONSTRAINT IF EXISTS chk_hr_report_run_range;
ALTER TABLE public.hr_report_runs DROP CONSTRAINT IF EXISTS fk_hr_report_run_tenant;
REVOKE EXECUTE ON FUNCTION public.hr_report_execute(TEXT,DATE,DATE,INTEGER) FROM anon;
ALTER FUNCTION public.hr_report_execute(TEXT,DATE,DATE,INTEGER) SECURITY INVOKER;
"""


def reapply():
    subprocess.run(PSQL + ["-c", DDL_RESTORE], capture_output=True, text=True)
    r = subprocess.run(PSQL[:-2] + ["-v", "ON_ERROR_STOP=1", "-f", MIG],
                       capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        print("‼ فشل إعادة تطبيق المايجريشن:\n", r.stderr[-1500:])
        sys.exit(2)


# ── الانعكاسات: (اسم، DDL العكس، هل RLS) ────────────────────────────────
# ★★ `IF NOT EXISTS` يمنع إعادة الإنشاء ⇒ العكس DDL صريح والاسترجاع
#    بإعادة تطبيق المايجريشن كاملاً.
INVERSIONS = [
    # ① العطل ②: إخفاء المُبلِّغ المجهول
    ("INV1 · كشفُ اسم المُبلِّغ المجهول في التقرير",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d,
    '(CASE WHEN i.is_anonymous THEN ''مُبلِّغ مجهول''
                   ELSE COALESCE(NULLIF(btrim(i.employee_name),''''), ''غير محدَّد'')
              END)::TEXT',
    'COALESCE(NULLIF(btrim(i.employee_name),''''), ''غير محدَّد'')::TEXT');
  EXECUTE d;
END $$;
""", False),

    # ② العطل ③: حدُّ الإخفاء k = 3
    ("INV2 · إلغاء حدِّ الإخفاء k=3 في الصحة النفسية",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d, 'CASE WHEN cnt.n >= 3 THEN cnt.dept ELSE ''أقسام أخرى'' END',
                  'cnt.dept');
  EXECUTE d;
END $$;
""", True),

    # ③ العطل ⑤: حارس الدور
    ("INV3 · إسقاط حارس الدور من المنفّذ",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d,
   'IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION ''HR_REPORT_FORBIDDEN: تقارير الموارد البشرية للموارد البشرية والإدارة فقط'';
  END IF;',
   'IF FALSE THEN RAISE EXCEPTION ''x''; END IF;');
  EXECUTE d;
END $$;
""", True),

    # ④ العطل ④: الأثر التدقيقيّ
    ("INV4 · إسقاط كتابة الأثر التدقيقيّ",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d, 'INSERT INTO public.hr_report_runs', 'INSERT INTO public.hr_report_runs_void');
  d := replace(d, 'VALUES (v_tenant, p_code, auth.uid(), v_from, v_to,
          v_rows, v_total, v_total > v_rows);', 'SELECT 1 WHERE FALSE;');
  EXECUTE d;
END $$;
""", True),

    # ⑤ العطل ⑦: النطاق
    ("INV5 · إلغاء رفض النطاق المعكوس والواسع",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d, 'IF v_from > v_to THEN', 'IF FALSE THEN');
  d := replace(d, 'IF (v_to - v_from) > 366 THEN', 'IF FALSE THEN');
  EXECUTE d;
END $$;
""", False),

    # ⑥ العطل ⑦: كشف الاقتطاع
    ("INV6 · إخفاء الاقتطاع (was_truncated = FALSE دائماً)",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d, 'v_rows, v_total, v_total > v_rows);', 'v_rows, v_rows, FALSE);');
  EXECUTE d;
END $$;
""", False),

    # ⑦ قيدُ الاتساق
    ("INV7 · إسقاط chk_hr_report_run_counts",
     "ALTER TABLE public.hr_report_runs DROP CONSTRAINT chk_hr_report_run_counts;",
     False),

    # ⑧ FK المركَّب
    ("INV8 · استبدال FK المركَّب بمفردٍ (يسمح بالعبور)",
     r"""
ALTER TABLE public.hr_report_runs DROP CONSTRAINT fk_hr_report_run_actor_tenant;
ALTER TABLE public.hr_report_runs ADD CONSTRAINT fk_hr_report_run_actor_tenant
  FOREIGN KEY (executed_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
""", False),

    # ⑨ FK رمز التقرير
    ("INV9 · إسقاط FK رمز التقرير",
     "ALTER TABLE public.hr_report_runs DROP CONSTRAINT fk_hr_report_run_code;",
     False),

    # ⑩ قيد النطاق في السجلّ
    ("INV10 · إسقاط chk_hr_report_run_range",
     "ALTER TABLE public.hr_report_runs DROP CONSTRAINT chk_hr_report_run_range;",
     False),

    # ⑪ محفّز عدم التغيير
    ("INV11 · إسقاط محفّز منع تعديل/حذف السجلّ",
     "DROP TRIGGER trg_block_hr_report_run_change ON public.hr_report_runs;",
     False),

    # ⑫ سياسة الإدراج باسم النفس
    ("INV12 · السماح بتسجيل تصديرٍ باسم غيرك",
     r"""
DROP POLICY kyvzon_hr_report_runs_insert ON public.hr_report_runs;
CREATE POLICY kyvzon_hr_report_runs_insert ON public.hr_report_runs
  FOR INSERT WITH CHECK (public.current_user_is_staff());
""", True),

    # ⑬ البوّابة الهجينة RESTRICTIVE
    ("INV13 · جعل البوّابة الهجينة PERMISSIVE",
     r"""
DROP POLICY hybrid_gate_hr_report_runs ON public.hr_report_runs;
CREATE POLICY hybrid_gate_hr_report_runs ON public.hr_report_runs
  FOR ALL USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));
""", False),

    # ⑭ SECURITY INVOKER — لو صارت DEFINER لتجاوزت RLS
    ("INV14 · تحويل المنفّذ إلى SECURITY DEFINER",
     "ALTER FUNCTION public.hr_report_execute(TEXT,DATE,DATE,INTEGER) SECURITY DEFINER;",
     True),

    # ⑮ صلاحية anon
    ("INV15 · منح anon حقّ التنفيذ",
     "GRANT EXECUTE ON FUNCTION public.hr_report_execute(TEXT,DATE,DATE,INTEGER) TO anon;",
     False),

    # ⑯ حارس الدور في اللوح
    ("INV16 · إسقاط حارس الدور من hr_report_run_board",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_run_board(INTEGER)'::regprocedure) INTO d;
  d := replace(d,
   'IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION ''HR_REPORT_FORBIDDEN: سجلّ التصديرات للموارد البشرية والإدارة فقط'';
  END IF;',
   'IF FALSE THEN RAISE EXCEPTION ''x''; END IF;');
  EXECUTE d;
END $$;
""", True),

    # ⑰ رفض الرمز المجهول
    ("INV17 · قبول رمزٍ مجهولٍ بدل رفضه",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_execute(TEXT,DATE,DATE,INTEGER)'::regprocedure) INTO d;
  d := replace(d,
   'RAISE EXCEPTION ''HR_REPORT_UNKNOWN: لا تقريرَ بالرمز %'', p_code;',
   'RETURN;');
  EXECUTE d;
END $$;
""", False),

    # ⑱ الترتيب المذيَّل بـ code
    ("INV18 · إسقاط تذييل الترتيب بـcode من الكتالوج",
     r"""
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_report_catalog()'::regprocedure) INTO d;
  d := replace(d, 'ORDER BY d.sort_order, d.code;', 'ORDER BY d.category, d.code;');
  EXECUTE d;
END $$;
""", False),
]


def main():
    print("═" * 70)
    print(" _invert_0370 — عكسُ كلّ إصلاحٍ وإثباتُ سقوط الاختبار")
    print("═" * 70)

    reapply()
    ok, nf, _ = run_verify()
    if not ok:
        print(f"‼ الخطُّ الأساس ليس أخضر ({nf} فاشلاً) — أوقف.")
        sys.exit(2)
    okr, nfr, _ = run_rls()
    if not okr:
        print(f"‼ خطُّ RLS الأساس ليس أخضر ({nfr} فاشلاً) — أوقف.")
        sys.exit(2)
    print("✔ الخطُّ الأساس أخضر (SQL + RLS)\n")

    survived, caught = [], []
    for name, ddl, is_rls in INVERSIONS:
        r = sql(ddl)
        if r.returncode != 0:
            print(f"  ⚠ {name}: فشل تطبيق العكس — {r.stderr.strip()[:160]}")
            reapply()
            survived.append((name, "لم يُطبَّق العكس"))
            continue

        if is_rls:
            ok2, n2, failed = run_rls()
        else:
            ok2, n2, failed = run_verify()

        if ok2:
            print(f"  ❌ {name}\n       ★ نجا! لا تأكيدَ يمسكه — شرطٌ غير مُختبَر.")
            survived.append((name, "نجا"))
        else:
            head = failed[0][:70] if failed else "?"
            print(f"  ✅ {name}\n       سقط {n2} تأكيداً · أوّلها: {head}")
            caught.append(name)

        reapply()

    print("\n" + "═" * 70)
    ok, nf, _ = run_verify()
    okr, nfr, _ = run_rls()
    print(f"الاسترجاع: SQL={'أخضر' if ok else f'{nf} فاشلاً'} · "
          f"RLS={'أخضر' if okr else f'{nfr} فاشلاً'}")
    print(f"مُمسَك: {len(caught)}/{len(INVERSIONS)} · ناجٍ: {len(survived)}")
    for n, why in survived:
        print(f"   ★ ناجٍ: {n} ({why})")
    print("═" * 70)
    sys.exit(0 if (not survived and ok and okr) else 1)


if __name__ == "__main__":
    main()
