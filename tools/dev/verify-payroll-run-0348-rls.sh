#!/usr/bin/env bash
# ============================================================================
# verify-payroll-run-0348-rls.sh
#
# نظام الرواتب عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-payroll-run-0348.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال. والرواتب
#   أخطر بيانات المنصّة: راتب الزميل · القرض · الخصم. سياسة SELECT على
#   payroll_records تُظهر للموظف **سجلّه وحده** — وهذا لا يُقاس هناك
#   إطلاقاً لأن كل صفّ مرئيّ بدور postgres.
#
#   PGPORT=5454 bash tools/dev/verify-payroll-run-0348-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5454}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa480000-0000-0000-0000-0000000000aa
TB=bb480000-0000-0000-0000-0000000000bb
HR=11480000-0000-0000-0000-0000000000aa
MGR=14480000-0000-0000-0000-0000000000aa
EMP=12480000-0000-0000-0000-0000000000aa
OTH=13480000-0000-0000-0000-0000000000aa
HRB=11480000-0000-0000-0000-0000000000bb
EH=31480000-0000-0000-0000-0000000000aa
EM=34480000-0000-0000-0000-0000000000aa
EE=32480000-0000-0000-0000-0000000000aa
EO=33480000-0000-0000-0000-0000000000aa
EHB=31480000-0000-0000-0000-0000000000bb
PA=41480000-0000-0000-0000-0000000000aa
PB=41480000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.payroll_records    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.payroll_periods    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_loans     WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_contracts WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.attendance_summary WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$MGR','$EMP','$OTH','$HRB');
DELETE FROM auth.users      WHERE id IN ('$HR','$MGR','$EMP','$OTH','$HRB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

# ★★ حارس التنظيف (درس 0345)
LEFT=$($PSQL -c "SELECT count(*) FROM public.payroll_records WHERE tenant_id IN ('$TA','$TB');")
if [[ "$LEFT" != "0" ]]; then
  echo "  ❌ التنظيف فشل: بقي $LEFT سجلّ — كل الأرقام بعده باطلة"; exit 1
fi

echo "── تهيئة: شركتان · موارد+مدير+موظفان في أ · موارد في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','pr48a'),('$TB','B','شركة ب','pr48b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@p48.io'),('$MGR','mgr@p48.io'),('$EMP','emp@p48.io'),
  ('$OTH','oth@p48.io'),('$HRB','hrb@p48.io');
-- ★★★ رواتب **مميِّزة**: كل رقم فريد كي يُكشف أي تسريب بعينه
INSERT INTO public.profiles(id,tenant_id,full_name,role,salary) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr'      , 1500000),
  ('$MGR','$TA','مازن المدير','manager'  , 1300000),
  ('$EMP','$TA','سعد الموظف','employee'  ,  700000),
  ('$OTH','$TA','ليلى الزميلة','employee',  950000),
  ('$HRB','$TB','موارد ب','hr'           ,  400000);
UPDATE public.employees SET id='$EH' , employee_code='P48H' WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EM' , employee_code='P48M' WHERE user_id='$MGR' AND tenant_id='$TA';
UPDATE public.employees SET id='$EE' , employee_code='P48E' WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO' , employee_code='P48O' WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EHB', employee_code='P48B' WHERE user_id='$HRB' AND tenant_id='$TB';
INSERT INTO public.payroll_periods(id,tenant_id,name,frequency,start_date,end_date,status)
  VALUES ('$PA','$TA','مارس أ','monthly','2026-03-01','2026-03-31','draft'),
         ('$PB','$TB','مارس ب','monthly','2026-03-01','2026-03-31','draft');
UPDATE public.payroll_settings
   SET tax_rate=0, social_security_rate=0, absence_penalty_per_day=0,
       working_days_per_month=26, default_basic_salary=0
 WHERE id=1;
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ① ★★★ الموارد يُشغّل الرواتب (والإدراج المباشر مصدود للمدير) ──"
OUT=$(as_user "$MGR" "INSERT INTO public.payroll_records(tenant_id,period_id,employee_id,basic_salary,net_salary,working_days,present_days,absent_days,leave_days,overtime_hours) VALUES('$TA','$PA','$EE',1,1,26,26,0,0,0);" 2>&1)
if echo "$OUT" | grep -qi "row-level security\|policy"; then
  ok "الإدراج المباشر بدور المدير مصدود — التشخيص صحيح"
else
  bad "★★★ الإدراج المباشر نجح: $OUT"
fi

V=$(as_user "$HR" "SELECT out_employees||'/'||out_net FROM public.payroll_run('$PA');" 2>&1 | tail -1)
[[ "$V" == "4/4450000.00" ]] && ok "تشغيل الرواتب: $V (4 موظفين · 4,450,000)" \
  || bad "★★★ التشغيل = $V (متوقَّع 4/4450000.00)"

echo
echo "── ② ★★★ والمدير لا يُشغّل الرواتب (الدور أضيق) ──"
OUT=$(as_user "$MGR" "SELECT public.payroll_run('$PA');" 2>&1)
if echo "$OUT" | grep -q "غير مصرَّح"; then
  ok "المدير مرفوض صراحةً"
else
  bad "★★★ المدير شغّل الرواتب: $OUT"
fi

echo
echo "── ③ ★★★★ الموظف يرى **راتبه وحده** — أخطر تسريب ──"
# ★ سعد 700,000 · ليلى 950,000 · هالة 1,500,000 · مازن 1,300,000
V=$(as_user "$EMP" "SELECT count(*) FROM public.payroll_records WHERE period_id='$PA';" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "سعد يرى صفّاً واحداً (لا 4)" \
  || bad "★★★★ سعد يرى $V صفّاً — تسريب رواتب الزملاء"

V=$(as_user "$EMP" "SELECT basic_salary FROM public.payroll_records WHERE period_id='$PA';" 2>&1 | tail -1)
[[ "$V" == "700000.00" ]] && ok "وهو راتبه هو (700,000)" \
  || bad "★★★★ سعد يرى راتباً غير راتبه: $V"

V=$(as_user "$EMP" "SELECT count(*) FROM public.payroll_records WHERE basic_salary = 1500000;" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "راتب مديرة الموارد (1,500,000) محجوب عنه" \
  || bad "★★★★ سعد يرى راتب مديرة الموارد"

echo
echo "── ④ ★★★ والموارد يرى الجميع (مسؤوليته) ──"
V=$(as_user "$HR" "SELECT count(*) FROM public.payroll_records WHERE period_id='$PA';" 2>&1 | tail -1)
[[ "$V" == "4" ]] && ok "الموارد يرى 4 صفوف" || bad "★★ الموارد يرى $V (متوقَّع 4)"

echo
echo "── ⑤ ★★★ الموظف لا يعدّل راتبه ولا يحذف سجلّه ──"
N=$(as_user "$EMP" "WITH u AS (UPDATE public.payroll_records SET basic_salary=9999999, net_salary=9999999 WHERE employee_id='$EE' RETURNING 1) SELECT count(*) FROM u;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "تعديل الراتب مصدود ($N)"
else
  bad "★★★★ الموظف رفع راتبه — $N صفّاً"
fi
N=$(as_user "$EMP" "WITH d AS (DELETE FROM public.payroll_records WHERE employee_id='$EE' RETURNING 1) SELECT count(*) FROM d;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "حذف السجلّ مصدود ($N)"
else
  bad "★★★ الموظف حذف $N سجلّاً"
fi

echo
echo "── ⑥ ★★★ ولا يعتمد الرواتب ──"
OUT=$(as_user "$EMP" "SELECT public.payroll_approve('$PA');" 2>&1)
if echo "$OUT" | grep -q "غير مصرَّح"; then
  ok "الموظف مرفوض من الاعتماد"
else
  bad "★★★ الموظف اعتمد الرواتب: $OUT"
fi

echo
echo "── ⑦ الموارد يعتمد — بأثر تدقيق ──"
V=$(as_user "$HR" "SELECT public.payroll_approve('$PA');" 2>&1 | tail -1)
[[ "$V" == "4" ]] && ok "اعتماد 4 سجلّات" || bad "★★ الاعتماد أعاد: $V"
V=$($PSQL -c "SELECT (approved_by='$HR')::text||'/'||(approved_at IS NOT NULL)::text FROM public.payroll_periods WHERE id='$PA';")
[[ "$V" == "true/true" ]] && ok "أثر التدقيق مُسجَّل ($V)" \
  || bad "★★★ أثر التدقيق ناقص: $V"

echo
echo "── ⑧ ★★★ والتشغيل على فترة معتمَدة مرفوض ──"
OUT=$(as_user "$HR" "SELECT public.payroll_run('$PA');" 2>&1)
if echo "$OUT" | grep -q "لا يمكن إعادة تشغيل"; then
  ok "الكتابة فوق فترة معتمَدة مرفوضة"
else
  bad "★★★ التشغيل على فترة معتمَدة قُبل: $OUT"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑨ ★★★ عزل المستأجرين ──"
V=$(as_user "$HRB" "SELECT count(*) FROM public.payroll_records;" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "موارد ب لا يرى سجلّات أ" \
  || bad "★★★★ موارد ب يرى $V سجلّاً من المستأجر أ"

OUT=$(as_user "$HRB" "SELECT public.payroll_run('$PA');" 2>&1)
if echo "$OUT" | grep -q "غير موجودة في هذا المستأجر"; then
  ok "موارد ب لا يُشغّل فترة أ"
else
  bad "★★★ موارد ب شغّل فترة المستأجر أ: $OUT"
fi

V=$(as_user "$HRB" "SELECT out_records FROM public.payroll_period_summary('$PA');" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "وملخّص فترة أ يعود صفراً له" \
  || bad "★★★ موارد ب يرى ملخّص فترة أ: $V"

echo
echo "── ⑩ ★★ والملخّص بجلسة الموظف يعكس ما يراه هو ──"
# ★ سعد يرى سجلّه وحده ⇒ الملخّص يُظهر صفّاً واحداً بصافيه هو
V=$(as_user "$EMP" "SELECT out_records||'/'||out_net FROM public.payroll_period_summary('$PA');" 2>&1 | tail -1)
if [[ "$V" == "1/700000.00" ]]; then
  ok "ملخّص سعد يعكس سجلّه وحده ($V)"
elif [[ "$V" == 4/* ]]; then
  bad "★★★★ ملخّص سعد يُظهر 4 سجلّات — تسريب إجمالي الرواتب"
else
  bad "قيمة غير متوقَّعة: $V"
fi

echo
echo "── ⑪ anon محروم من كل الدوال ──"
for fn in payroll_run payroll_approve payroll_period_summary employee_monthly_salary; do
  N=$($PSQL -c "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee='anon' AND routine_name='$fn';")
  [[ "$N" == "0" ]] && ok "anon محروم من $fn" || bad "★★★ anon يملك EXECUTE على $fn"
done

echo
echo "── ⑫ ★★★ anon لا يقرأ جداول الرواتب ──"
for tbl in payroll_records payroll_periods employee_loans; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.$tbl;
SQL
)
  LAST=$(echo "$OUT" | tail -1)
  if [[ "$LAST" == "0" ]] || echo "$OUT" | grep -qi "permission denied\|policy"; then
    ok "anon محجوب عن $tbl"
  else
    bad "★★★★ anon قرأ $LAST صفّاً من $tbl"
  fi
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "✅ verify-payroll-run-0348-rls: كل التأكيدات ناجحة"
else
  echo "❌ $FAIL إخفاقاً"
fi
exit $FAIL
