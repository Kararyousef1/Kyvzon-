#!/usr/bin/env python3
# ============================================================================
# _invert_0372.py — عكسُ كلّ إصلاحٍ في 0372 وإثبات أنّ الاختبار يسقط.
#
#   ★★★★ درس 0370: «غياب الفشل» ليس نجاحاً — نشترط رسالة النجاح الصريحة.
#   ★★ ودرس `IF NOT EXISTS`: الاسترجاع يحتاج DDL صريحاً قبل reapply.
#
#   PGPORT=5515 python3 tools/dev/_invert_0372.py
# ============================================================================
import os, re, subprocess, sys

PGSOCK = os.environ.get("PGSOCK", "/home/user/.pgtest/sock")
PGPORT = os.environ.get("PGPORT", "5515")
ROOT   = "/home/user/Kyvzon"
MIG    = f"{ROOT}/supabase/migrations/0372_leave_policy_and_scope_guard.sql"
VER    = f"{ROOT}/tools/dev/verify-leave-policy-0372.sql"
RLS    = f"{ROOT}/tools/dev/verify-leave-policy-0372-rls.sh"

PSQL = ["psql", "-h", PGSOCK, "-p", PGPORT, "-U", "postgres", "-q", "-A", "-t"]
OK_LINE = "✅ verify-leave-policy-0372: كل التأكيدات ناجحة"
OK_RLS  = "✅ verify-leave-policy-0372-rls: كل الفحوص ناجحة"


def sql(text):
    return subprocess.run(PSQL + ["-c", text], capture_output=True,
                          text=True, errors="replace")


def run_verify():
    r = subprocess.run(PSQL[:-2] + ["-f", VER], capture_output=True,
                       text=True, errors="replace", cwd=ROOT)
    out = r.stdout + r.stderr
    failed = re.findall(r"^\s*(.+?)\s*\|\s*❌\s*\|", out, re.M)
    ok = (OK_LINE in out and "VERIFY_0372_FAILED" not in out and "❌" not in out)
    if not ok and not failed:
        aborted = [l for l in out.splitlines()
                   if "ERROR" in l and "current transaction is aborted" not in l]
        failed = [f"المعاملة أُجهضت: {aborted[0][:90]}"] if aborted else ["لم تُطبع نتائج"]
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


# ★★★ استرجاعٌ صريحٌ: الحرّاس `IF NOT EXISTS` لا يُصلحون تعريفاً خاطئاً
#   يحمل الاسمَ الصحيح. والدوالُ المحقونة تحتاج إعادةَ تعريفٍ من الأصل.
DDL_RESTORE = """
ALTER TABLE public.leave_policies DROP CONSTRAINT IF EXISTS chk_leave_policy_sane;
ALTER TABLE public.leave_policies DROP CONSTRAINT IF EXISTS fk_leave_policy_tenant;
REVOKE EXECUTE ON FUNCTION public.can_use_request_scope(TEXT,TEXT) FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.leave_policies TO authenticated;
"""


UNDO = f"{ROOT}/tools/dev/_undo_0372_inversion.sql"


def reapply():
    # ★★★★ دالّةٌ عُكس حقنُها بـ`IF FALSE` تحتفظ بالعلامة نصّياً،
    #   والحقنُ مشروطٌ بغيابها ⇒ إعادةُ التطبيق تتخطّاها ويبقى العكسُ
    #   سارياً. هذا ما أفسد الاسترجاع في أوّل تشغيل.
    subprocess.run(PSQL[:-2] + ["-f", UNDO], capture_output=True,
                   text=True, errors="replace", cwd=ROOT)
    subprocess.run(PSQL + ["-c", DDL_RESTORE], capture_output=True,
                   text=True, errors="replace")
    r = subprocess.run(PSQL[:-2] + ["-v", "ON_ERROR_STOP=1", "-f", MIG],
                       capture_output=True, text=True, errors="replace", cwd=ROOT)
    if r.returncode != 0:
        print("‼ فشل إعادة تطبيق المايجريشن:\n", r.stderr[-1200:])
        sys.exit(2)


def fnpatch(fn, sig, old, new):
    return f"""
DO $inv$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef('public.{fn}({sig})'::regprocedure) INTO d;
  d := replace(d, {old}, {new});
  EXECUTE d;
END $inv$;
"""


INVERSIONS = [
    # ═══ العطل ①: الرصيد ═══
    ("INV1 · ★★★★ الاستحقاق يعود صفراً (العطل ①)",
     fnpatch("leave_entitlement", "UUID,INTEGER",
             "'RETURN QUERY SELECT'", "'RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC; RETURN; SELECT'"),
     False),

    ("INV2 · ★★★★ المحفّز لا يفتح رصيد الموظف الجديد",
     "DROP TRIGGER trg_seed_leave_balance ON public.employees;", True),

    ("INV3 · ★★★★ محفّزُ سياسة المنشأة الجديدة يسقط",
     "DROP TRIGGER trg_seed_leave_policy ON public.tenants;", True),

    ("INV4 · ensure_leave_balance تهبط بالرصيد بدل GREATEST",
     fnpatch("ensure_leave_balance", "UUID,INTEGER",
             "'GREATEST(public.leave_balance.annual_total, EXCLUDED.annual_total)'",
             "'0::NUMERIC'"), False),

    ("INV5 · الأقدميّة بلا حدٍّ أقصى",
     fnpatch("leave_entitlement", "UUID,INTEGER",
             "'v_annual := LEAST('", "'v_annual := GREATEST('"), False),

    ("INV6 · التناسب في سنة الالتحاق يسقط",
     fnpatch("leave_entitlement", "UUID,INTEGER",
             "'IF v_pol.prorate_first_year'", "'IF FALSE AND v_pol.prorate_first_year'"),
     False),

    ("INV7 · منشأةٌ بلا سياسةٍ تسقط إلى صفر",
     fnpatch("leave_entitlement", "UUID,INTEGER",
             "'v_pol.annual_days          := 21;'", "'v_pol.annual_days := 0;'"),
     False),

    # ═══ العطل ②: حارس النطاق ═══
    ("INV8 · ★★★★ can_use_request_scope تسمح بكلّ شيء",
     fnpatch("can_use_request_scope", "TEXT,TEXT",
             "'IF p_scope = ''all'' THEN'", "'IF FALSE THEN'"), True),

    ("INV9 · ★★★ الصندوق مفتوحٌ لمن لا خطوةَ له",
     fnpatch("can_use_request_scope", "TEXT,TEXT",
             "'IF p_scope = ''inbox'' THEN'", "'IF FALSE THEN'"), False),

    ("INV10 · ★★★ الصندوق لا يميّز نوع الطلب",
     fnpatch("can_use_request_scope", "TEXT,TEXT",
             "'AND (p_request_type IS NULL OR r.request_type = p_request_type)'", "'AND TRUE'"),
     False),

    ("INV11 · ★★★★ حارسُ النطاق يسقط من leave_requests_view",
     fnpatch("leave_requests_view", "TEXT,TEXT,INTEGER,INTEGER",
             "'IF NOT public.can_use_request_scope(p_scope, ''leave'') THEN'",
             "'IF FALSE THEN'"), True),

    ("INV12 · ★★★★ ومن permission_requests_view",
     fnpatch("permission_requests_view", "TEXT,TEXT,INTEGER,INTEGER",
             "'IF NOT public.can_use_request_scope(p_scope, ''permission'') THEN'",
             "'IF FALSE THEN'"), False),

    # ═══ القيود ═══
    ("INV13 · إسقاط قيد السياسة العاقل",
     "ALTER TABLE public.leave_policies DROP CONSTRAINT chk_leave_policy_sane;", False),

    # ═══ الجدار ═══
    ("INV14 · السماح للموظف بتعديل السياسة",
     """
DROP POLICY kyvzon_leave_policies_update ON public.leave_policies;
CREATE POLICY kyvzon_leave_policies_update ON public.leave_policies
  FOR UPDATE USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
""", True),

    ("INV15 · إسقاط حارس الدور من leave_policy_update",
     fnpatch("leave_policy_update", "NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN",
             "'IF NOT public.current_user_is_staff() THEN'", "'IF FALSE THEN'"), True),

    ("INV16 · إسقاط حارس الدور من leave_policy_board",
     fnpatch("leave_policy_board", "",
             "'IF NOT public.current_user_is_staff() THEN'", "'IF FALSE THEN'"), True),

    ("INV17 · البوّابة الهجينة PERMISSIVE",
     """
DROP POLICY hybrid_gate_leave_policies ON public.leave_policies;
CREATE POLICY hybrid_gate_leave_policies ON public.leave_policies
  FOR ALL USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));
""", False),

    ("INV18 · منح anon حقّ التنفيذ",
     "GRANT EXECUTE ON FUNCTION public.can_use_request_scope(TEXT,TEXT) TO anon;",
     False),

    ("INV19 · leave_policy_update يمسّ كلّ المستأجرين",
     fnpatch("leave_policy_update", "NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN",
             "'WHERE e.tenant_id = v_tenant'", "'WHERE TRUE'"), False),
]


def main():
    print("═" * 70)
    print(" _invert_0372 — عكسُ كلّ إصلاحٍ وإثباتُ سقوط الاختبار")
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
            print(f"  ⚠ {name}: فشل تطبيق العكس — {r.stderr.strip()[:140]}")
            reapply()
            survived.append((name, "لم يُطبَّق العكس"))
            continue

        ok2, n2, failed = run_rls() if is_rls else run_verify()

        if ok2:
            print(f"  ❌ {name}\n       ★ نجا! لا تأكيدَ يمسكه — شرطٌ غير مُختبَر.")
            survived.append((name, "نجا"))
        else:
            print(f"  ✅ {name}\n       سقط {n2} · أوّلها: {failed[0][:64] if failed else '?'}")
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
