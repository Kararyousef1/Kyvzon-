#!/usr/bin/env bash
# ============================================================================
# verify-leave-policy-0372-rls.sh
#
# سياسة الإجازات وحارس النطاق عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS.
# ★★★ `SET x = '…'` على مستوى الجلسة لا `set_config(…, true)` (درس 0370).
#
#   ما يحرسه هنا خصوصاً:
#     ① بلاغ المستخدم: الموظف يرى «سجلّ الشركة» — يُمنع بدورٍ حقيقيّ.
#     ② «أمورٌ لا تُحفظ»: طلبُ الإجازة ينجح بدورٍ حقيقيّ.
#     ③ الموظف لا يُعدّل سياسة الإجازات.
#     ④ العزل بين المستأجرين.
#     ⑤ anon محجوب.
#
#   PGPORT=5515 bash tools/dev/verify-leave-policy-0372-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5515}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3740000-0000-0000-0000-00000000000a
TB=b3740000-0000-0000-0000-00000000000b
HRA=13740001-0000-0000-0000-000000000001
E1=23740002-0000-0000-0000-000000000002
E2=33740003-0000-0000-0000-000000000003
HRB=43740004-0000-0000-0000-000000000004
EB=53740005-0000-0000-0000-000000000005

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.hr_approval_steps    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_requests WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leaves               WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.permissions_request  WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leave_balance        WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leave_policies       WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees            WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.tenants WHERE id IN ('$TA','$TB');")
[ "${LEFT:-1}" = "0" ] || { echo "❌ التنظيف فشل — بقي $LEFT مستأجر."; exit 1; }

$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

echo "════════ تهيئة ════════"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 ('$TA','R0372A','مستأجر ألف','r-0372-a'), ('$TB','R0372B','مستأجر باء','r-0372-b');
INSERT INTO auth.users(id,email) VALUES
 ('$HRA','hra@r372.l'),('$E1','e1@r372.l'),('$E2','e2@r372.l'),
 ('$HRB','hrb@r372.l'),('$EB','eb@r372.l');
INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 ('$HRA','$TA','مدير الموارد ألف','hra@r372.l','hr'),
 ('$E1','$TA','سالم','e1@r372.l','employee'),
 ('$E2','$TA','ريم','e2@r372.l','employee'),
 ('$HRB','$TB','مدير الموارد باء','hrb@r372.l','hr'),
 ('$EB','$TB','موظف باء','eb@r372.l','employee');
UPDATE public.employees SET hire_date = (CURRENT_DATE - INTERVAL '3 years')::DATE
 WHERE tenant_id IN ('$TA','$TB');
SQL
echo "  تمّت."

as_user() { # \$1=uid  \$2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① ★★★★ محفّزُ المنشأة الجديدة فتح السياسة ════════"
N=$($PSQL -c "SELECT count(*) FROM public.leave_policies WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "2" ] && ok "منشأتان جديدتان ⇒ سياستان تلقائياً" \
               || bad "عدد السياسات $N — توقّعنا 2"

echo ""
echo "════════ ② ★★★★ «أمورٌ لا تُحفظ»: الطلب ينجح بدورٍ حقيقيّ ════════"
N=$($PSQL -c "SELECT annual_total FROM public.leave_balance b JOIN public.employees e ON e.id=b.employee_id WHERE e.user_id='$E1';")
if [ -n "$N" ] && [ "$N" != "0.000" ]; then
  ok "رصيدُ سالم = $N (كان صفراً فيُرفض كلُّ طلب)"
else
  bad "رصيدُ سالم = ${N:-<لا صفّ>}"
fi

OUT=$(as_user "$E1" "SELECT public.submit_leave_request('سنوية', CURRENT_DATE+30, CURRENT_DATE+32, 'اختبار', NULL);")
if echo "$OUT" | grep -qi "LEAVE_INSUFFICIENT_BALANCE"; then
  bad "★★★★ الطلب ما زال يُرفض للرصيد — العطل قائم"
elif echo "$OUT" | grep -qiE "ERROR"; then
  bad "الطلب فشل لسببٍ آخر: $(echo "$OUT" | grep ERROR | head -1)"
else
  ok "★★★★ طلبُ الإجازة نجح بدور employee حقيقيّ"
fi

N=$($PSQL -c "SELECT count(*) FROM public.leaves WHERE tenant_id='$TA';")
[ "$N" = "1" ] && ok "والطلب محفوظٌ في القاعدة" || bad "عدد الطلبات $N"

echo ""
echo "════════ ③ ★★★★ بلاغ المستخدم: «سجلّ الشركة» يُمنع ════════"
OUT=$(as_user "$E1" "SELECT count(*) FROM public.leave_requests_view('all', NULL, 50, 0);")
echo "$OUT" | grep -q "LEAVE_SCOPE_FORBIDDEN" \
  && ok "الموظف على «سجلّ الشركة» ⇒ منعٌ صريح" \
  || bad "الموظف قرأ سجلّ الشركة — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.leave_requests_view('inbox', NULL, 50, 0);")
echo "$OUT" | grep -q "LEAVE_SCOPE_FORBIDDEN" \
  && ok "و«بانتظار قراري» ممنوعٌ لمن لا قرارَ له" \
  || bad "الموظف فتح صندوق القرارات — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.permission_requests_view('all', NULL, 50, 0);")
echo "$OUT" | grep -q "PERM_SCOPE_FORBIDDEN" \
  && ok "والزمنيات كذلك" \
  || bad "الموظف قرأ سجلّ الزمنيات — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

# ★★★★ والحقُّ المشروع محفوظ
OUT=$(as_user "$E1" "SELECT count(*) FROM public.leave_requests_view('mine', NULL, 50, 0);")
N=$(echo "$OUT" | tail -1)
[ "$N" = "1" ] && ok "★★★★ ومع ذلك يرى «طلباتي» — الحقُّ محفوظ" \
               || bad "الموظف لا يرى طلباته! ($N)"

echo ""
echo "════════ ④ الموارد البشرية تقرأ الكلّ ════════"
OUT=$(as_user "$HRA" "SELECT count(*) FROM public.leave_requests_view('all', NULL, 50, 0);")
N=$(echo "$OUT" | tail -1)
[ "$N" = "1" ] && ok "hr ألف يقرأ سجلّ الشركة (طلبٌ واحد)" || bad "hr رأى $N"

OUT=$(as_user "$HRB" "SELECT count(*) FROM public.leave_requests_view('all', NULL, 50, 0);")
N=$(echo "$OUT" | tail -1)
[ "$N" = "0" ] && ok "★★★ وhr باء لا يرى طلبات ألف (عزلُ المستأجر)" \
               || bad "hr باء رأى $N من طلبات ألف"

echo ""
echo "════════ ⑤ سياسة الإجازات: القراءة للجميع والتعديل للموارد ════════"
OUT=$(as_user "$E1" "SELECT annual_days FROM public.leave_policies;")
echo "$OUT" | tail -1 | grep -q "21" \
  && ok "الموظف يقرأ سياسة منشأته (شفافيّة الرصيد)" \
  || bad "الموظف لا يقرأ السياسة: $(echo "$OUT" | tail -1)"

# ★★★★ طبقتان تحرسان التعديل: سياسةُ RLS ودالّةُ `leave_policy_update`.
#   الفحصُ بالقيمة وحدها كان يمرّ لأنّ الفحص التالي (عبر الدالة) يمسك
#   الحالة — «حارسٌ سابق يمسك الحالة». نقيس **عدد الصفوف المتأثّرة**
#   فتُختبَر سياسةُ RLS وحدها.
# ★★★★ القيمة 22 لا 60: القيمة 60 تتجاوز `annual_days_max` فيرفضها
#   `chk_leave_policy_sane` **قبل** RLS ⇒ يبدو المنعُ ناجحاً وسياسةُ
#   RLS غيرُ مُختبَرة («حارسٌ سابق يمسك الحالة» — أنجى INV14).
OUT=$(as_user "$E1" "UPDATE public.leave_policies SET annual_days = 22 WHERE tenant_id='$TA' RETURNING 1;")
ROWS=$(echo "$OUT" | grep -c "^1$")
N=$($PSQL -c "SELECT annual_days FROM public.leave_policies WHERE tenant_id='$TA';")
if [ "${ROWS:-1}" = "0" ] && [ "$N" = "21.000" ]; then
  ok "★★★★ والموظف لا يُعدّلها: صفرُ صفٍّ تأثّر (RLS وحدها)"
else
  bad "الموظف عدّل السياسة — صفوفٌ متأثّرة=${ROWS:-?} · القيمة=$N"
fi

OUT=$(as_user "$E1" "SELECT public.leave_policy_update(60,30,2,4,90,TRUE);")
echo "$OUT" | grep -q "LEAVE_POLICY_FORBIDDEN" \
  && ok "★★★ ولا عبر الدالة" \
  || bad "الموظف عدّل السياسة عبر الدالة — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$HRA" "SELECT public.leave_policy_update(25,30,2,4,40,TRUE);")
if echo "$OUT" | tail -1 | grep -qE "^[0-9]+$"; then
  ok "والموارد البشرية تُعدّلها ($(echo "$OUT" | tail -1) رصيداً حُدِّث)"
else
  bad "hr فشل في التعديل — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

N=$($PSQL -c "SELECT annual_days FROM public.leave_policies WHERE tenant_id='$TB';")
[ "$N" = "21.000" ] && ok "★★★ وسياسةُ باء لم تتأثّر" || bad "سياسةُ باء صارت $N"

echo ""
echo "════════ ⑥ لوح السياسة ════════"
OUT=$(as_user "$E1" "SELECT count(*) FROM public.leave_policy_board();")
echo "$OUT" | grep -q "LEAVE_POLICY_FORBIDDEN" \
  && ok "الموظف ممنوعٌ من لوح السياسة" \
  || bad "الموظف قرأ اللوح — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$HRA" "SELECT employees_zero FROM public.leave_policy_board();")
N=$(echo "$OUT" | tail -1)
[ "$N" = "0" ] && ok "★★★★ واللوح يؤكّد: صفرُ موظفٍ برصيدٍ صفر" \
               || bad "ما زال $N موظفاً برصيدٍ صفر"

echo ""
echo "════════ ⑦ anon محجوب ════════"
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.leave_policies;
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon: permission denied على leave_policies" \
  || bad "anon قرأ السياسات — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.can_use_request_scope('all','leave');
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon: permission denied على can_use_request_scope" \
  || bad "anon نفّذ الحارس — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-leave-policy-0372-rls: كل الفحوص ناجحة"
  exit 0
else
  echo "❌ verify-leave-policy-0372-rls: $FAIL فحصاً فاشلاً"
  exit 1
fi
