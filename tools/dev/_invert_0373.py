#!/usr/bin/env python3
# ============================================================================
# _invert_0373.py — عكسُ كلّ إصلاحٍ في 0373 وإثبات أنّ الاختبار يسقط.
#
#   ★★★★ درس 0370: «غياب الفشل» ليس نجاحاً — نشترط رسالة النجاح الصريحة.
#   ★★ ودرس 0371/INV17: لا استبدالَ بسلسلةٍ فارغة (يكسر SQL نحوياً).
#
#   PGPORT=5521 python3 tools/dev/_invert_0373.py
# ============================================================================
import os
import re
import subprocess
import sys

PGSOCK = os.environ.get("PGSOCK", "/home/user/.pgtest/sock")
PGPORT = os.environ.get("PGPORT", "5521")
ROOT = "/home/user/Kyvzon"
MIG = f"{ROOT}/supabase/migrations/0373_portal_scan_gaps.sql"
VER = f"{ROOT}/tools/dev/verify-portal-gaps-0373.sql"
RLS = f"{ROOT}/tools/dev/verify-portal-gaps-0373-rls.sh"

PSQL = ["psql", "-h", PGSOCK, "-p", PGPORT, "-U", "postgres", "-q", "-A", "-t"]
OK_SQL = "✅ verify-portal-gaps-0373: كل التأكيدات ناجحة"
OK_RLS = "✅ verify-portal-gaps-0373-rls: كل الفحوص ناجحة"


def sql(text):
    return subprocess.run(PSQL + ["-c", text], capture_output=True,
                          text=True, errors="replace")


def run_verify():
    r = subprocess.run(PSQL[:-2] + ["-f", VER], capture_output=True,
                       text=True, errors="replace", cwd=ROOT)
    out = r.stdout + r.stderr
    failed = re.findall(r"^\s*(.+?)\s*\|\s*❌\s*\|", out, re.M)
    ok = (OK_SQL in out and "VERIFY_0373_FAILED" not in out and "❌" not in out)
    if not ok and not failed:
        aborted = [l for l in out.splitlines()
                   if "ERROR" in l and "current transaction is aborted" not in l]
        failed = [f"أُجهضت: {aborted[0][:88]}"] if aborted else ["لم تُطبع نتائج"]
    return ok, len(failed), failed


def run_rls():
    r = subprocess.run(["bash", RLS], capture_output=True, text=True,
                       errors="replace", cwd=ROOT,
                       env={**os.environ, "PGPORT": PGPORT})
    out = r.stdout + r.stderr
    failed = re.findall(r"^\s*❌ (.+)$", out, re.M)
    ok = (r.returncode == 0 and OK_RLS in out)
    if not ok and not failed:
        failed = ["السكربت لم يُكمل"]
    return ok, len(failed), failed


def reapply():
    r = subprocess.run(PSQL[:-2] + ["-v", "ON_ERROR_STOP=1", "-f", MIG],
                       capture_output=True, text=True, errors="replace", cwd=ROOT)
    if r.returncode != 0:
        print("‼ فشل إعادة تطبيق المايجريشن:\n", r.stderr[-1000:])
        sys.exit(2)


def drop_gate(table: str) -> str:
    return f"DROP POLICY hybrid_gate_{table} ON public.{table};"


def permissive_gate(table: str) -> str:
    return f"""
DROP POLICY hybrid_gate_{table} ON public.{table};
CREATE POLICY hybrid_gate_{table} ON public.{table}
  FOR ALL USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));
"""


INVERSIONS = [
    # ═══ العطل ①: بوّابات الاشتراك ═══
    ("INV1 · ★★★★ إسقاط بوّابة permissions_request (العطل الأصليّ)",
     drop_gate("permissions_request"), True),

    ("INV2 · ★★★★ إسقاط بوّابة wellness_entries (البيان الأحسّ)",
     drop_gate("wellness_entries"), True),

    ("INV3 · ★★★ إسقاط بوّابة leave_balance",
     drop_gate("leave_balance"), True),

    ("INV4 · ★★★ إسقاط بوّابة permissions",
     drop_gate("permissions"), False),

    ("INV5 · ★★★ إسقاط بوّابة hr_approval_requests",
     drop_gate("hr_approval_requests"), True),

    ("INV6 · ★★★ إسقاط بوّابة hr_approval_steps",
     drop_gate("hr_approval_steps"), True),

    # ★★★★ الجوهر: PERMISSIVE بدل RESTRICTIVE لا تحجب شيئاً
    ("INV7 · ★★★★ البوّابة PERMISSIVE بدل RESTRICTIVE (wellness)",
     permissive_gate("wellness_entries"), True),

    ("INV8 · ★★★★ والبوّابة PERMISSIVE على permissions_request",
     permissive_gate("permissions_request"), True),

    # ★ بوّابةٌ على وحدةٍ خاطئة تمرّ دائماً
    ("INV9 · ★★★ البوّابة على وحدة finance لا hr",
     """
DROP POLICY hybrid_gate_wellness_entries ON public.wellness_entries;
CREATE POLICY hybrid_gate_wellness_entries ON public.wellness_entries
  AS RESTRICTIVE FOR ALL
  USING (public.hybrid_allows_module('finance'))
  WITH CHECK (public.hybrid_allows_module('finance'));
""", False),

    # ═══ العطل ②: منح anon ═══
    ("INV10 · ★★★★ إعادةُ منح anon على hr_analytics_overview",
     "GRANT EXECUTE ON FUNCTION public.hr_analytics_overview(DATE,DATE) TO anon;",
     True),

    ("INV11 · ★★★ ومنحُ PUBLIC (الوراثةُ الخفيّة)",
     "GRANT EXECUTE ON FUNCTION public.hr_analytics_departments(DATE,DATE) TO PUBLIC;",
     False),

    ("INV12 · ★★★ ومنحُ anon على leave_balance_bucket",
     "GRANT EXECUTE ON FUNCTION public.leave_balance_bucket(TEXT) TO anon;",
     False),

    # ═══ ③ دالّةُ التدقيق نفسُها ═══
    ("INV13 · ★★★★ التدقيق يعمى عن البوّابات المفقودة",
     """
DO $inv$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_module_gate_audit()'::regprocedure) INTO d;
  d := replace(d, 'بلا بوّابة هجينة RESTRICTIVE'::TEXT, 'معطَّل'::TEXT);
  d := replace(d, 'AND NOT EXISTS (
       SELECT 1 FROM pg_policy p
        WHERE p.polrelid = c.oid AND NOT p.polpermissive
          AND p.polname LIKE ''hybrid\\_gate%'')', 'AND FALSE');
  EXECUTE d;
END $inv$;
""", False),

    ("INV14 · ★★★★ التدقيق يعمى عن منح anon",
     """
DO $inv$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_module_gate_audit()'::regprocedure) INTO d;
  d := replace(d, 'AND has_function_privilege(''anon'', p.oid, ''EXECUTE'')',
                  'AND FALSE');
  EXECUTE d;
END $inv$;
""", False),

    ("INV15 · ★★★ قائمةُ جداول الوحدة تُفرَّغ",
     """
DO $inv$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hr_module_tables()'::regprocedure) INTO d;
  d := regexp_replace(d, 'SELECT ARRAY\\[[\\s\\S]*?\\]::TEXT\\[\\];',
                      'SELECT ARRAY[''zzz_none'']::TEXT[];');
  EXECUTE d;
END $inv$;
""", False),

    ("INV16 · ★★★ منحُ anon على دالّة التدقيق نفسها",
     "GRANT EXECUTE ON FUNCTION public.hr_module_gate_audit() TO anon;", True),
]


def main():
    print("═" * 70)
    print(" _invert_0373 — عكسُ كلّ إصلاحٍ وإثباتُ سقوط الاختبار")
    print("═" * 70)

    reapply()
    ok, nf, f = run_verify()
    if not ok:
        print(f"‼ الخطُّ الأساس ليس أخضر ({nf}): {f[:2]}")
        sys.exit(2)
    okr, nfr, fr = run_rls()
    if not okr:
        print(f"‼ خطُّ RLS الأساس ليس أخضر ({nfr}): {fr[:2]}")
        sys.exit(2)
    print("✔ الخطُّ الأساس أخضر (SQL + RLS)\n")

    survived, caught = [], []
    for name, ddl, is_rls in INVERSIONS:
        r = sql(ddl)
        if r.returncode != 0:
            print(f"  ⚠ {name}: فشل تطبيق العكس — {r.stderr.strip()[:130]}")
            reapply()
            survived.append((name, "لم يُطبَّق العكس"))
            continue

        ok2, n2, failed = run_rls() if is_rls else run_verify()

        if ok2:
            print(f"  ❌ {name}\n       ★ نجا! لا تأكيدَ يمسكه — شرطٌ غير مُختبَر.")
            survived.append((name, "نجا"))
        else:
            head = failed[0][:62] if failed else "?"
            print(f"  ✅ {name}\n       سقط {n2} · أوّلها: {head}")
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
