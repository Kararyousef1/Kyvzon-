#!/usr/bin/env bash
# ============================================================================
# verify-gatekeeper-analytics-0350-rls.sh
#
# عزل البوابة عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ لماذا هذا السكربت هو الأهمّ في الجولة؟
#   العطل ① كان **تسريب بيانات بين المستأجرين**، وملف الـSQL يعمل بدور
#   postgres وهو BYPASSRLS — فلا يمكنه إثبات التسريب ولا إثبات سدّه.
#   الإثبات الوحيد المعتبر هو دور `authenticated` حقيقي. وقد أُثبت
#   التسريب قبل الإصلاح بهذا النمط بالضبط:
#     INSERT … (visitor_name, check_in_time)   -- بلا tenant_id كما تفعل الخدمة
#     SET request.jwt.claim.sub = '<مدير المستأجر ب>';
#     SET ROLE authenticated;
#     SELECT count(*) … ⇒ 1     ← قرأ زوّار المستأجر أ
#
#   PGPORT=5458 bash tools/dev/verify-gatekeeper-analytics-0350-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5458}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa500000-0000-0000-0000-0000000000aa
TB=bb500000-0000-0000-0000-0000000000bb
HRA=11500000-0000-0000-0000-0000000000aa
EMPA=12500000-0000-0000-0000-0000000000aa
GKA=13500000-0000-0000-0000-0000000000aa
HRB=11500000-0000-0000-0000-0000000000bb
SA=51500000-0000-0000-0000-0000000000aa
SB=51500000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.gatekeeper_visitor_logs WHERE tenant_id IN ('$TA','$TB') OR tenant_id IS NULL;
DELETE FROM public.movements_log           WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.gatekeeper_sessions     WHERE tenant_id IN ('$TA','$TB') OR tenant_id IS NULL;
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles  WHERE id IN ('$HRA','$EMPA','$GKA','$HRB');
DELETE FROM auth.users       WHERE id IN ('$HRA','$EMPA','$GKA','$HRB');
DELETE FROM public.tenants   WHERE id IN ('$TA','$TB');
SQL
}

cleanup

# ★ حارس التنظيف — تراكم صفوف يُفسد كل قياس تالٍ صامتاً
LEFT=$($PSQL -c "SELECT count(*) FROM public.gatekeeper_visitor_logs WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ. أوقف."
  exit 1
fi

$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','أ','a50-x'), ('$TB','B','ب','b50-x');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','hr50a@x.co'), ('$EMPA','emp50a@x.co'),
  ('$GKA','gk50a@x.co'), ('$HRB','hr50b@x.co');
INSERT INTO public.profiles(id,tenant_id,full_name,role,status) VALUES
  ('$HRA', '$TA','مدير أ','hr','active'),
  ('$EMPA','$TA','موظف أ','employee','active'),
  ('$GKA', '$TA','حارس أ','gatekeeper','active'),
  ('$HRB', '$TB','مدير ب','hr','active');

INSERT INTO public.gatekeeper_sessions(id,tenant_id,gatekeeper_id,started_at,ended_at,is_active)
 VALUES ('$SA','$TA','$GKA', now()-interval '5 hours', now()-interval '1 hour', false),
        ('$SB','$TB','$HRB', now()-interval '5 hours', now()-interval '1 hour', false);

INSERT INTO public.gatekeeper_visitor_logs(tenant_id,session_id,visitor_name,visitor_phone,id_number,check_in_time)
 VALUES ('$TA','$SA','زائر سرّي للشركة أ','07701234567','ID-SECRET', now()-interval '3 hours'),
        ('$TB','$SB','زائر الشركة ب','07709999999','ID-B', now()-interval '3 hours');

INSERT INTO public.movements_log(tenant_id,employee_id,departure_at,destination,route_violation)
 VALUES ('$TA','$EMPA', now()-interval '3 hours','البنك', true);
SQL

echo "════════════════════════════════════════════════════════"
echo "  0350 — عزل البوابة عبر RLS حقيقي"
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
echo "── ① ★★★ الثغرة الأصلية: صفّ بلا مستأجر ──"
# قبل 0350 كان هذا الإدراج ينجح ثم يراه الجميع.

OUT=$($PSQL -c "INSERT INTO public.gatekeeper_visitor_logs(tenant_id,visitor_name,check_in_time) VALUES (NULL,'يتيم', now());" 2>&1)
if echo "$OUT" | grep -q "null value in column"; then
  ok "الإدراج بـtenant_id=NULL مرفوض من القاعدة (NOT NULL)"
else
  bad "قُبل صفّ بلا مستأجر! الناتج: $(echo "$OUT" | head -1)"
fi

# ولا سياسة تسمح بمرور NULL بعد الآن
N=$($PSQL -c "SELECT count(*) FROM pg_policy WHERE polrelid IN ('gatekeeper_sessions'::regclass,'gatekeeper_visitor_logs'::regclass) AND pg_get_expr(polqual,polrelid) LIKE '%tenant_id IS NULL%';")
if [ "${N:-9}" = "0" ]; then ok "لا سياسة تسمح بمرور tenant_id IS NULL"
else bad "★★★ $N سياسة ما زالت تسمح بمرور NULL"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ② العزل في القراءة المباشرة ──"

V=$(as_user "$HRB" "SELECT count(*) FROM public.gatekeeper_visitor_logs WHERE visitor_name='زائر سرّي للشركة أ';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "مدير ب لا يرى زائر الشركة أ"
else bad "★★★ تسريب! مدير ب يرى $V من زوّار أ"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.gatekeeper_visitor_logs;" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "مدير ب يرى سجلّاً واحداً (سجلّه)"
else bad "مدير ب يرى $V سجلّاً والمتوقَّع 1"; fi

V=$(as_user "$HRA" "SELECT count(*) FROM public.gatekeeper_sessions;" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "مدير أ يرى وردية واحدة (ورديته)"
else bad "مدير أ يرى $V وردية والمتوقَّع 1"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ③ العزل عبر الدوال (SECURITY DEFINER تتجاوز RLS) ──"
# ★ الدوال DEFINER ⇒ الترشيح الداخلي هو الحارس الوحيد.

V=$(as_user "$HRB" "SELECT count(*) FROM public.gatekeeper_visitor_analytics(now()-interval '1 day', now());" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "دالة الزوّار: مدير ب يرى سجلّه وحده"
elif [ "${V:-9}" = "2" ]; then bad "★★★ تسريب عبر الدالة! مدير ب يرى سجلّي المستأجرين"
else bad "دالة الزوّار أرجعت '${V:-<فشل>}' والمتوقَّع 1"; fi

V=$(as_user "$HRB" "SELECT out_visitor_name FROM public.gatekeeper_visitor_analytics(now()-interval '1 day', now());" 2>/dev/null | tail -1)
if [ "$V" = "زائر الشركة ب" ]; then ok "مدير ب يرى اسم زائره فقط"
else bad "مدير ب يرى '${V:-<فشل>}'"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.gatekeeper_movement_analytics(now()-interval '1 day', now());" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "دالة الحركة: مدير ب لا يرى حركة أ"
else bad "★★★ مدير ب يرى $V حركة من أ"; fi

V=$(as_user "$HRA" "SELECT count(*) FROM public.gatekeeper_movement_analytics(now()-interval '1 day', now());" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "مدير أ يرى حركته"
else bad "مدير أ يرى $V حركة والمتوقَّع 1"; fi

# ★★★ وردية أجنبية تُرفض بالاسم لا تُرجع فراغاً
OUT=$(as_user "$HRB" "SELECT count(*) FROM public.gatekeeper_shift_movements('$SA');" 2>&1)
if echo "$OUT" | grep -q "لا تخصّ مستأجرك"; then
  ok "تصدير وردية أجنبية مرفوض صراحةً"
else
  bad "قُبلت وردية أجنبية! الناتج: $(echo "$OUT" | tail -1)"
fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ④ الأدوار غير المخوَّلة ──"
# سجلّ الزوّار يحوي أرقام هوية وهواتف — ليس لكل موظف.

for pair in "$EMPA:employee" "$GKA:gatekeeper"; do
  uid="${pair%%:*}"; role="${pair##*:}"
  OUT=$(as_user "$uid" "SELECT count(*) FROM public.gatekeeper_visitor_analytics(now()-interval '1 day', now());" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "$role مرفوض من دالة الزوّار"
  else bad "$role نفذ دالة الزوّار!"; fi
done

OUT=$(as_user "$EMPA" "SELECT count(*) FROM public.gatekeeper_session_archive();" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "employee مرفوض من الأرشيف"
else bad "employee نفذ الأرشيف!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑤ الكتابة تُسند المستأجر تلقائياً ──"
# ★ DEFAULT current_user_tenant_id() يمنع عودة الصفوف اليتيمة.

as_user "$GKA" "INSERT INTO public.gatekeeper_visitor_logs(visitor_name,check_in_time) VALUES ('زائر جديد', now());" >/dev/null 2>&1
V=$($PSQL -c "SELECT COALESCE(tenant_id::text,'NULL') FROM public.gatekeeper_visitor_logs WHERE visitor_name='زائر جديد';")
if [ "$V" = "$TA" ]; then ok "الإدراج بلا tenant_id أخذ مستأجر الكاتب تلقائياً"
elif [ "$V" = "NULL" ]; then bad "★★★ عاد الصفّ اليتيم"
else bad "المستأجر المُسنَد = '${V:-<لا صفّ>}'"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.gatekeeper_visitor_logs WHERE visitor_name='زائر جديد';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "الصفّ الجديد غير مرئيّ للمستأجر الآخر"
else bad "★★★ الصفّ الجديد مرئيّ لمستأجر آخر"; fi

cleanup

echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 0350 RLS — كل التأكيدات نجحت"
else
  echo "  ❌ 0350 RLS — $FAIL فشلاً"
fi
echo "════════════════════════════════════════════════════════"
exit "$FAIL"
