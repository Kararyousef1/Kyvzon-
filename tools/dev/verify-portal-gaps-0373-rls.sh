#!/usr/bin/env bash
# ============================================================================
# verify-portal-gaps-0373-rls.sh
#
# ثغرةُ الاشتراك عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS، فلا يُثبت الحجب.
# ★★★ `SET x = '…'` على مستوى الجلسة لا `set_config(…, true)` (درس 0370).
#
#   جوهرُ ما يحرسه:
#     منشأةٌ ألغت اشتراك الموارد البشرية كانت تقرأ زمنيّات موظفيها
#     وبياناتِ صحّتهم النفسية — بينما إجازاتُهم محجوبة.
#
#   PGPORT=5521 bash tools/dev/verify-portal-gaps-0373-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5521}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TS=a3750000-0000-0000-0000-0000000000aa   # مستأجرٌ مشترِك
TN=c3750000-0000-0000-0000-0000000000cc   # مستأجرٌ ألغى اشتراك HR
HRS=13750001-0000-0000-0000-0000000000a1
HRN=c3750001-0000-0000-0000-0000000000c1

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.hr_approval_steps    WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.hr_approval_requests WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.wellness_entries     WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.permissions_request  WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.permissions          WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.leaves               WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.leave_balance        WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.leave_policies       WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.employees            WHERE tenant_id IN ('$TS','$TN');
DELETE FROM public.profiles WHERE id IN ('$HRS','$HRN');
DELETE FROM auth.users      WHERE id IN ('$HRS','$HRN');
DELETE FROM public.tenants  WHERE id IN ('$TS','$TN');
SQL
}
trap cleanup EXIT
cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.tenants WHERE id IN ('$TS','$TN');")
[ "${LEFT:-1}" = "0" ] || { echo "❌ التنظيف فشل — بقي $LEFT مستأجر."; exit 1; }

$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

echo "════════ تهيئة: منشأةٌ مشترِكة وأخرى ألغت اشتراك HR ════════"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 ('$TS','Sub','منشأةٌ مشترِكة','sub-0373');
INSERT INTO public.tenants(id,name,name_ar,slug,module_enforcement_mode,enabled_modules)
VALUES ('$TN','NoHR','منشأةٌ ألغت الاشتراك','nohr-0373','enforce', ARRAY['finance']);
INSERT INTO auth.users(id,email) VALUES ('$HRS','hrs@g373.l'),('$HRN','hrn@g373.l');
INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 ('$HRS','$TS','موارد المشترِكة','hrs@g373.l','hr'),
 ('$HRN','$TN','موارد الملغاة','hrn@g373.l','hr');
-- بياناتٌ في كلتيهما
DO \$\$
DECLARE vs UUID; vn UUID;
BEGIN
  SELECT id INTO vs FROM public.employees WHERE user_id='$HRS';
  SELECT id INTO vn FROM public.employees WHERE user_id='$HRN';
  INSERT INTO public.permissions_request
    (tenant_id,employee_id,permission_type,date,expected_out_time,reason,status)
  VALUES ('$TS',vs,'عادية',CURRENT_DATE+1,'09:00','ظرف','انتظار'),
         ('$TN',vn,'عادية',CURRENT_DATE+1,'09:00','ظرف','انتظار');
  INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,notes)
  VALUES ('$TS',vs,CURRENT_DATE,50,'good','عاديّ'),
         ('$TN',vn,CURRENT_DATE,20,'terrible','بيانٌ نفسيٌّ حسّاس');
  INSERT INTO public.leaves
    (tenant_id,employee_id,leave_type,date_from,date_to,working_days_count,status)
  VALUES ('$TS',vs,'سنوية',CURRENT_DATE+3,CURRENT_DATE+4,2,'انتظار'),
         ('$TN',vn,'سنوية',CURRENT_DATE+3,CURRENT_DATE+4,2,'انتظار');
END \$\$;
SQL
echo "  تمّت."

as_user() { # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① ★★★★ المنشأةُ الملغاة: كلُّ بيانات HR محجوبة ════════"
N=$(as_user "$HRN" "SELECT public.hybrid_allows_module('hr')::text;" | tail -1)
[ "$N" = "false" ] && ok "الوحدة hr ممنوعةٌ لها" || bad "hybrid_allows_module = $N"

for spec in "leaves:الإجازات" "permissions_request:الزمنيات" \
            "wellness_entries:الصحة النفسية" "leave_balance:أرصدة الإجازات"; do
  t="${spec%%:*}"; label="${spec##*:}"
  N=$(as_user "$HRN" "SELECT count(*) FROM public.$t;" | tail -1)
  if [ "$N" = "0" ]; then
    ok "$label ($t) محجوبة"
  else
    bad "★★★★ $label ($t) مكشوفةٌ لمنشأةٍ ألغت الاشتراك — $N صفّاً"
  fi
done

# ★★★★ الأخطر: الملاحظة النفسية نصّاً
OUT=$(as_user "$HRN" "SELECT notes FROM public.wellness_entries;")
if echo "$OUT" | grep -q "حسّاس"; then
  bad "★★★★ تسرَّب نصُّ الملاحظة النفسية"
else
  ok "★★★★ ولا نصَّ ملاحظةٍ نفسيةٍ يتسرّب"
fi

echo ""
echo "════════ ② والمنشأةُ المشترِكة تعمل بلا مساس ════════"
for spec in "leaves:الإجازات" "permissions_request:الزمنيات" \
            "wellness_entries:الصحة النفسية"; do
  t="${spec%%:*}"; label="${spec##*:}"
  N=$(as_user "$HRS" "SELECT count(*) FROM public.$t;" | tail -1)
  [ "$N" = "1" ] && ok "$label تُقرأ ($N صفّ)" \
                 || bad "★★★ $label لا تُقرأ للمشترِكة — $N (توقّعنا 1)"
done

# ★★★ والكتابةُ تعمل للمشترِكة وتُمنع للملغاة
OUT=$(as_user "$HRS" "INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood)
 SELECT '$TS',e.id,CURRENT_DATE-1,60,'good' FROM public.employees e WHERE e.user_id='$HRS' RETURNING 1;")
echo "$OUT" | grep -q "^1$" && ok "★★★ والكتابةُ تعمل للمشترِكة" \
                            || bad "الكتابة فشلت للمشترِكة: $(echo "$OUT"|tail -1)"

OUT=$(as_user "$HRN" "INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood)
 SELECT '$TN',e.id,CURRENT_DATE-1,60,'good' FROM public.employees e WHERE e.user_id='$HRN' RETURNING 1;")
if echo "$OUT" | grep -qiE "row-level security|violates"; then
  ok "★★★★ والكتابةُ محجوبةٌ عن الملغاة"
else
  N=$($PSQL -c "SELECT count(*) FROM public.wellness_entries WHERE tenant_id='$TN';")
  [ "$N" = "1" ] && ok "★★★ لم يُكتب صفٌّ جديدٌ للملغاة" \
                 || bad "★★★★ كُتب صفٌّ لمنشأةٍ ألغت الاشتراك ($N)"
fi

echo ""
echo "════════ ③ ★★★ anon محرومٌ من دوال التحليلات ════════"
for fn in "hr_analytics_overview()" "hr_analytics_departments()" \
          "leave_balance_bucket('سنوية')"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT * FROM public.$fn;
SQL
)
  if echo "$OUT" | grep -qi "permission denied"; then
    ok "anon: permission denied على ${fn%%(*}"
  else
    bad "★★★ anon نفّذ ${fn%%(*} — $(echo "$OUT" | tail -1 | cut -c1-60)"
  fi
done

echo ""
echo "════════ ④ ★★★★ دالّةُ التدقيق بدورٍ حقيقيّ ════════"
OUT=$(as_user "$HRS" "SELECT count(*) FROM public.hr_module_gate_audit();")
N=$(echo "$OUT" | tail -1)
[ "$N" = "0" ] && ok "التدقيق يُعيد صفر ثغرة بدور hr" \
               || bad "التدقيق كشف $N ثغرة: $(as_user "$HRS" "SELECT object_name||'/'||issue FROM public.hr_module_gate_audit();" | tail -3 | tr '\n' ' ')"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.hr_module_gate_audit();
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "★★★ وanon محرومٌ من التدقيق نفسه" \
  || bad "anon قرأ التدقيق — $(echo "$OUT" | tail -1)"

echo ""
echo "════════ ⑤ سلسلةُ الاعتماد محجوبةٌ كذلك ════════"
$PSQL >/dev/null 2>&1 <<SQL
INSERT INTO public.hr_approval_requests(id,tenant_id,request_type,related_id,employee_id,status)
SELECT 'dd750000-0000-0000-0000-0000000000d1','$TN','leave',l.id,l.employee_id,'pending'
FROM public.leaves l WHERE l.tenant_id='$TN' LIMIT 1;
INSERT INTO public.hr_approval_steps(request_id,tenant_id,step_order,approver_role,approver_id,status)
VALUES ('dd750000-0000-0000-0000-0000000000d1','$TN',1,'hr','$HRN','active');
SQL
N=$(as_user "$HRN" "SELECT count(*) FROM public.hr_approval_requests;" | tail -1)
[ "$N" = "0" ] && ok "★★★ طلبات الاعتماد محجوبةٌ عن الملغاة" \
               || bad "★★★ الملغاة ترى $N طلب اعتماد"

N=$(as_user "$HRN" "SELECT count(*) FROM public.hr_approval_steps;" | tail -1)
[ "$N" = "0" ] && ok "★★★ وخطواتُها كذلك" || bad "الملغاة ترى $N خطوة"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-portal-gaps-0373-rls: كل الفحوص ناجحة"
  exit 0
else
  echo "❌ verify-portal-gaps-0373-rls: $FAIL فحصاً فاشلاً"
  exit 1
fi
