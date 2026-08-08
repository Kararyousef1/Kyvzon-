#!/usr/bin/env bash
# ============================================================================
# verify-talent-market-0354-rls.sh
#
# خصوصية سجل المؤهلات عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ هذا السكربت هو الإثبات الحاسم للجولة.
#   العطل ① كان: أيّ موظف يقرأ السيرة الذاتية الكاملة لزملائه — بما فيها
#   ملخّصها وتوقّعات الراتب ورقم الهاتف. وملف الـSQL يعمل بدور postgres
#   (BYPASSRLS) فلا يستطيع إثبات التسريب ولا إثبات سدّه.
#
#   التسريب أُثبت قبل الإصلاح بهذا النمط بالضبط:
#     SET request.jwt.claim.sub = '<موظف عادي>';
#     SET ROLE authenticated;
#     SELECT … FROM public.hr_talent_profiles();
#       ⇒ المدير التنفيذي | هاتف=0779999999 |
#         سيرة={"summary":"سيرة سرّية","salary_expectation":"سرّي"}
#
#   PGPORT=5470 bash tools/dev/verify-talent-market-0354-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5470}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa550000-0000-0000-0000-0000000000aa
TB=bb550000-0000-0000-0000-0000000000bb
HRA=11550000-0000-0000-0000-0000000000aa
EMPA=12550000-0000-0000-0000-0000000000aa
CEO=13550000-0000-0000-0000-0000000000aa
MGRA=14550000-0000-0000-0000-0000000000aa
HRB=11550000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles  WHERE id IN ('$HRA','$EMPA','$CEO','$MGRA','$HRB');
DELETE FROM auth.users       WHERE id IN ('$HRA','$EMPA','$CEO','$MGRA','$HRB');
DELETE FROM public.tenants   WHERE id IN ('$TA','$TB');
SQL
}

cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.profiles WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ. أوقف."
  exit 1
fi

$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','أ','a55-x'), ('$TB','B','ب','b55-x');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','hr55a@x.co'),('$EMPA','emp55a@x.co'),('$CEO','ceo55@x.co'),
  ('$MGRA','mgr55a@x.co'),('$HRB','hr55b@x.co');
INSERT INTO public.profiles(id,tenant_id,full_name,role,status,phone,position,cv_data) VALUES
  ('$HRA', '$TA','مدير الموارد','hr','active','0770','مدير موارد','{}'),
  ('$EMPA','$TA','موظف عادي','employee','active','0771','فني',
    '{"skills":[{"name":"صيانة"}],"summary":"ملخّص الفني"}'),
  ('$MGRA','$TA','مدير قسم','manager','active','0774','مدير قسم','{}'),
  ('$CEO', '$TA','المدير التنفيذي','admin','active','0779999999','CEO',
    '{"skills":[{"name":"تفاوض"}],"summary":"سيرة سرّية","salary_expectation":"سرّي"}'),
  ('$HRB', '$TB','مدير ب','hr','active','0999','مدير','{"summary":"سيرة الشركة ب"}');
SQL

echo "════════════════════════════════════════════════════════"
echo "  0354 — خصوصية سجل المؤهلات عبر RLS حقيقي"
echo "════════════════════════════════════════════════════════"

as_user() {
  local uid="$1"; shift
  $PSQL <<SQL
SET request.jwt.claim.sub = '$uid';
SET ROLE authenticated;
$*
SQL
}

# ───────────────────────────────────────────────────────────────────────────
echo "── ① ★★★ الثغرة الأصلية: موظف عادي يقرأ سِيَر الجميع ──"

OUT=$(as_user "$EMPA" "SELECT count(*) FROM public.hr_talent_profiles();" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then
  ok "موظف عادي مرفوض من سجل المؤهلات"
else
  bad "★★★ موظف عادي قرأ السجل! الناتج: $(echo "$OUT" | tail -1)"
fi

OUT=$(as_user "$MGRA" "SELECT count(*) FROM public.hr_talent_profiles();" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then
  ok "مدير القسم مرفوض (ليس staff)"
else
  bad "★★★ مدير القسم قرأ السجل!"
fi

OUT=$(as_user "$EMPA" "SELECT count(*) FROM public.hr_talent_skill_stats();" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "موظف عادي مرفوض من الإحصاءات"
else bad "★★★ موظف عادي قرأ الإحصاءات!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ② ★★★ السيرة السرّية لم تعد تتسرّب ──"

OUT=$(as_user "$EMPA" "SELECT out_cv_data::text FROM public.hr_talent_profile_detail('$CEO');" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then
  ok "موظف عادي مرفوض من سيرة المدير التنفيذي"
elif echo "$OUT" | grep -q "سرّي"; then
  bad "★★★ تسريب! موظف عادي قرأ «توقّعات الراتب» للمدير التنفيذي"
else
  bad "الناتج غير متوقَّع: $(echo "$OUT" | tail -1)"
fi

V=$(as_user "$EMPA" "SELECT out_cv_data ->> 'summary' FROM public.hr_talent_profile_detail('$EMPA');" 2>/dev/null | tail -1)
if [ "$V" = "ملخّص الفني" ]; then ok "الموظف يرى سيرته هو"
else bad "الموظف لا يرى سيرته: '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ③ الدور المخوَّل يعمل ──"

V=$(as_user "$HRA" "SELECT count(*) FROM public.hr_talent_profiles();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "4" ]; then ok "hr يرى أربعة صفوف (مستأجره)"
else bad "hr يرى '${V:-<فشل>}' والمتوقَّع 4"; fi

V=$(as_user "$HRA" "SELECT out_cv_data ->> 'salary_expectation' FROM public.hr_talent_profile_detail('$CEO');" 2>/dev/null | tail -1)
if [ "$V" = "سرّي" ]; then ok "hr يرى التفاصيل بصلاحيته"
else bad "hr لا يرى التفاصيل: '${V:-<فشل>}'"; fi

# ★★★ القائمة نفسها لا تحمل السيرة الكاملة حتى لـhr
OUT=$(as_user "$HRA" "SELECT count(*) FROM public.hr_talent_profiles();" 2>&1)
if echo "$OUT" | grep -q "سرّي"; then
  bad "★★★ القائمة تُسرّب توقّعات الراتب"
else
  ok "القائمة لا تحمل cv_data — التفاصيل بطلب منفصل"
fi

V=$(as_user "$HRA" "SELECT count(*) FROM public.hr_talent_profiles('تفاوض');" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "البحث بالمهارة يعمل في القاعدة"
else bad "البحث أعاد '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ④ العزل بين المستأجرين ──"

V=$(as_user "$HRB" "SELECT count(*) FROM public.hr_talent_profiles();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "hr(ب) يرى صفّه وحده"
elif [ "${V:-9}" = "5" ]; then bad "★★★ تسريب! hr(ب) يرى كل المستأجرين"
else bad "hr(ب) يرى '${V:-<فشل>}'"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.hr_talent_profiles() WHERE out_full_name LIKE '%التنفيذي%';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "hr(ب) لا يرى المدير التنفيذي للشركة أ"
else bad "★★★ تسريب عابر للمستأجرين"; fi

OUT=$(as_user "$HRB" "SELECT out_cv_data::text FROM public.hr_talent_profile_detail('$CEO');" 2>&1)
if echo "$OUT" | grep -q "سرّي"; then
  bad "★★★ hr(ب) قرأ سيرة المدير التنفيذي للشركة أ!"
else
  ok "hr(ب) لا يقرأ تفاصيل موظف الشركة أ"
fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑤ anon مرفوض تماماً ──"

for fn in "hr_talent_profiles()" "hr_talent_skill_stats()"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.$fn;
SQL
)
  if echo "$OUT" | grep -qi "permission denied\|ليس له صلاحية"; then
    ok "anon مرفوض من $fn"
  else
    bad "★★★ anon نفّذ $fn! الناتج: $(echo "$OUT" | tail -1)"
  fi
done

cleanup

echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 0354 RLS — كل التأكيدات نجحت"
else
  echo "  ❌ 0354 RLS — $FAIL فشلاً"
fi
echo "════════════════════════════════════════════════════════"
exit "$FAIL"
