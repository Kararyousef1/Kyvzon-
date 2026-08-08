#!/usr/bin/env python3
# ============================================================================
# _invert_0371.py — عكسُ كلّ إصلاحٍ في 0371 وإثبات أنّ الاختبار يسقط.
#
#   شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.
#
#   ★★★★ درس 0370: «غياب الفشل» ليس نجاحاً — نشترط رسالة النجاح
#     الصريحة، فالمعاملة قد تُجهَض قبل طباعة أيّ نتيجة.
#   ★★ ودرس `IF NOT EXISTS`: الاسترجاع يحتاج DDL صريحاً قبل reapply.
#
#   PGPORT=5512 python3 tools/dev/_invert_0371.py
# ============================================================================
import os, re, subprocess, sys

PGSOCK = os.environ.get("PGSOCK", "/home/user/.pgtest/sock")
PGPORT = os.environ.get("PGPORT", "5512")
ROOT   = "/home/user/Kyvzon"
MIG    = f"{ROOT}/supabase/migrations/0371_hr_communication_integrity.sql"
VER    = f"{ROOT}/tools/dev/verify-hr-communication-0371.sql"
RLS    = f"{ROOT}/tools/dev/verify-hr-communication-0371-rls.sh"

PSQL = ["psql", "-h", PGSOCK, "-p", PGPORT, "-U", "postgres", "-q", "-A", "-t"]

OK_LINE = "✅ verify-hr-communication-0371: كل التأكيدات ناجحة"


def sql(text):
    # ★ errors="replace": عكسٌ يقصّ نصّاً عربيّاً في منتصف بايت يُسقط السكربت كلّه
    return subprocess.run(PSQL + ["-c", text], capture_output=True,
                          text=True, errors="replace")


def run_verify():
    r = subprocess.run(PSQL[:-2] + ["-f", VER], capture_output=True,
                       text=True, errors="replace", cwd=ROOT)
    out = r.stdout + r.stderr
    failed = re.findall(r"^\s*(.+?)\s*\|\s*❌\s*\|", out, re.M)
    ok = (OK_LINE in out and "VERIFY_0371_FAILED" not in out and "❌" not in out)
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
    ok = (r.returncode == 0
          and "✅ verify-hr-communication-0371-rls: كل الفحوص ناجحة" in out)
    if not ok and not failed:
        failed = ["السكربت لم يُكمل"]
    return ok, len(failed), failed


# ★★★ استرجاعٌ صريحٌ قبل إعادة التطبيق (درس 0370/INV8):
#   الحرّاس `IF NOT EXISTS` يجدون الاسمَ موجوداً بتعريفٍ خاطئ فلا يُصلحونه.
DDL_RESTORE = """
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS fk_hr_message_employee_tenant;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS fk_hr_message_sender_tenant;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS fk_hr_message_replier_tenant;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS fk_hr_message_case_tenant;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS fk_hr_message_archiver_tenant;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS fk_hr_message_closer_tenant;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS chk_hr_message_text_present;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS chk_hr_message_reply_complete;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS chk_hr_message_closed_complete;
ALTER TABLE public.hr_messages DROP CONSTRAINT IF EXISTS chk_hr_message_archive_complete;
REVOKE EXECUTE ON FUNCTION public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_message_reply(UUID,TEXT) FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_messages TO authenticated;
REVOKE DELETE ON public.hr_messages FROM authenticated;
"""


def reapply():
    subprocess.run(PSQL + ["-c", DDL_RESTORE], capture_output=True, text=True)
    r = subprocess.run(PSQL[:-2] + ["-v", "ON_ERROR_STOP=1", "-f", MIG],
                       capture_output=True, text=True, errors="replace", cwd=ROOT)
    if r.returncode != 0:
        print("‼ فشل إعادة تطبيق المايجريشن:\n", r.stderr[-1500:])
        sys.exit(2)


def fnpatch(fn, sig, old, new):
    """يستبدل نصّاً داخل تعريف دالةٍ ويُعيد إنشاءها."""
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
    # ① العطل ①: الاسم من profiles
    ("INV1 · إعادة الاسم إلى سلسلةٍ فارغة (العطل ①)",
     fnpatch("hr_message_board", "TEXT,TEXT,TEXT,BOOLEAN,INTEGER",
             "'NULLIF(btrim(sp.full_name), '''')'", "''''''"), False),

    ("INV2 · إسقاط FK المُرسِل إلى profiles",
     "ALTER TABLE public.hr_messages DROP CONSTRAINT fk_hr_message_sender_tenant;", False),

    # ② العطل ③: اتّساق الردّ
    ("INV3 · إسقاط قيد اتّساق الردّ",
     "ALTER TABLE public.hr_messages DROP CONSTRAINT chk_hr_message_reply_complete;", False),

    # ③ العطل ⑤: منع الحذف
    ("INV4 · إسقاط محفّز منع الحذف",
     "DROP TRIGGER trg_block_hr_message_delete ON public.hr_messages;", False),

    ("INV5 · إعادة صلاحية الحذف لـauthenticated",
     "GRANT DELETE ON public.hr_messages TO authenticated;", True),

    ("INV6 · إسقاط قيد اتّساق الأرشفة",
     "ALTER TABLE public.hr_messages DROP CONSTRAINT chk_hr_message_archive_complete;", False),

    ("INV7 · الأرشفة تقبل سبباً فارغاً",
     fnpatch("hr_message_archive", "UUID,TEXT",
             "'IF v_txt = '''' THEN'", "'IF FALSE THEN'"), False),

    # ④ العطل ⑥
    ("INV8 · إسقاط قيد النصّ غير الفارغ",
     "ALTER TABLE public.hr_messages DROP CONSTRAINT chk_hr_message_text_present;", False),

    # ⑤ العطلان ④/⑦: العبور
    ("INV9 · FK الموظف مفردٌ لا مركَّب",
     """
ALTER TABLE public.hr_messages DROP CONSTRAINT fk_hr_message_employee_tenant;
ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_employee_tenant
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
""", False),

    ("INV10 · FK الرادّ مفردٌ لا مركَّب",
     """
ALTER TABLE public.hr_messages DROP CONSTRAINT fk_hr_message_replier_tenant;
ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_replier_tenant
  FOREIGN KEY (replied_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
""", False),

    ("INV11 · FK الحالة مفردٌ لا مركَّب",
     """
ALTER TABLE public.hr_messages DROP CONSTRAINT fk_hr_message_case_tenant;
ALTER TABLE public.hr_messages ADD CONSTRAINT fk_hr_message_case_tenant
  FOREIGN KEY (case_id) REFERENCES public.hr_cases(id) ON DELETE SET NULL;
""", False),

    # ⑥ العطل ⑪: الردّ يصل الحالة
    ("INV12 · ★★★★ الردّ لا يُحدّث الحالة (العطل ⑪)",
     fnpatch("hr_message_reply", "UUID,TEXT",
             "'IF v_case IS NOT NULL THEN'", "'IF FALSE THEN'"), False),

    # ⑦ حرّاس الأدوار
    ("INV13 · إسقاط حارس الدور من الردّ",
     fnpatch("hr_message_reply", "UUID,TEXT",
             "'IF NOT public.current_user_is_staff() THEN'", "'IF FALSE THEN'"), True),

    ("INV14 · إسقاط حارس الدور من اللوح",
     fnpatch("hr_message_board", "TEXT,TEXT,TEXT,BOOLEAN,INTEGER",
             "'IF NOT public.current_user_is_staff() THEN'", "'IF FALSE THEN'"), True),

    ("INV15 · إسقاط حارس الدور من الأرشفة",
     fnpatch("hr_message_archive", "UUID,TEXT",
             "'IF NOT public.current_user_is_staff() THEN'", "'IF FALSE THEN'"), True),

    ("INV16 · إسقاط حارس الدور من الملخّص",
     fnpatch("hr_message_summary", "",
             "'IF NOT public.current_user_is_staff() THEN'", "'IF FALSE THEN'"), True),

    # ⑧ الإغلاق قبل الردّ
    ("INV17 · الإغلاق يقبل رسالةً بلا ردّ",
     fnpatch("hr_message_close", "UUID",
             "'AND status = ''replied'''", "'AND TRUE'"), False),

    # ⑨ الفتح يُنزل حالةً متقدّمة
    ("INV18 · الفتح يُنزل «مغلقة» إلى «مقروءة»",
     fnpatch("hr_message_mark_read", "UUID",
             "'AND status = ''new'' AND archived_at IS NULL'",
             "'AND archived_at IS NULL'"), False),

    # ⑩ رصد التأخّر
    ("INV19 · حدُّ التأخّر واحدٌ للعاجل والعاديّ",
     fnpatch("hr_message_board", "TEXT,TEXT,TEXT,BOOLEAN,INTEGER",
             "'(CASE WHEN m.priority = ''urgent'' THEN INTERVAL ''24 hours''\n                ELSE INTERVAL ''72 hours'' END)'",
             "'INTERVAL ''72 hours'''"), False),

    # ⑪ الترتيب المذيَّل
    ("INV20 · إسقاط تذييل الترتيب بـid",
     fnpatch("hr_message_board", "TEXT,TEXT,TEXT,BOOLEAN,INTEGER",
             "'ORDER BY m.created_at DESC, m.id'", "'ORDER BY m.created_at DESC'"), False),

    # ⑫ البوّابة الهجينة
    ("INV21 · البوّابة الهجينة PERMISSIVE",
     """
DROP POLICY hybrid_gate_hr_messages ON public.hr_messages;
CREATE POLICY hybrid_gate_hr_messages ON public.hr_messages
  FOR ALL USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));
""", False),

    # ⑬ صلاحية anon
    ("INV22 · منح anon حقّ التنفيذ على اللوح",
     "GRANT EXECUTE ON FUNCTION public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) TO anon;",
     False),

    # ⑭ SECURITY INVOKER
    ("INV23 · تحويل اللوح إلى SECURITY DEFINER",
     "ALTER FUNCTION public.hr_message_board(TEXT,TEXT,TEXT,BOOLEAN,INTEGER) SECURITY DEFINER;",
     True),

    # ⑮ سياسة UPDATE
    ("INV24 · السماح للموظف بتحديث رسالته",
     """
DROP POLICY kyvzon_hr_messages_update ON public.hr_messages;
CREATE POLICY kyvzon_hr_messages_update ON public.hr_messages
  FOR UPDATE USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
""", True),

    # ⑯ العطل ⑨
    ("INV25 · tenant_id يقبل NULL ثانيةً",
     "ALTER TABLE public.hr_messages ALTER COLUMN tenant_id DROP NOT NULL;", False),
]


def main():
    print("═" * 70)
    print(" _invert_0371 — عكسُ كلّ إصلاحٍ وإثباتُ سقوط الاختبار")
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
            print(f"  ⚠ {name}: فشل تطبيق العكس — {r.stderr.strip()[:150]}")
            reapply()
            survived.append((name, "لم يُطبَّق العكس"))
            continue

        ok2, n2, failed = run_rls() if is_rls else run_verify()

        if ok2:
            print(f"  ❌ {name}\n       ★ نجا! لا تأكيدَ يمسكه — شرطٌ غير مُختبَر.")
            survived.append((name, "نجا"))
        else:
            print(f"  ✅ {name}\n       سقط {n2} · أوّلها: {failed[0][:66] if failed else '?'}")
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
