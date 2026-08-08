#!/usr/bin/env bash
# ============================================================================
# verify-hr-daily-attendance-0346-rls.sh
#
# لوحة الحضور اليومي عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-hr-daily-attendance-0346.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال ولا يقيس
#   السياسات. والدالتان SECURITY INVOKER — أي أن **RLS وحده** هو ما يمنع
#   موظفاً عادياً من قراءة حضور الشركة كلها ووجهات استراحات زملائه.
#   بدور postgres كل صفّ مرئيّ فتبدو الأرقام صحيحة دوماً.
#
#   PGPORT=5449 bash tools/dev/verify-hr-daily-attendance-0346-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5449}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa460000-0000-0000-0000-0000000000aa
TB=bb460000-0000-0000-0000-0000000000bb
HR=11460000-0000-0000-0000-0000000000aa
EMP=12460000-0000-0000-0000-0000000000aa
OTH=13460000-0000-0000-0000-0000000000aa
HRB=11460000-0000-0000-0000-0000000000bb
DA=21460000-0000-0000-0000-0000000000aa
DBB=21460000-0000-0000-0000-0000000000bb
EH=31460000-0000-0000-0000-0000000000aa
EE=32460000-0000-0000-0000-0000000000aa
EO=33460000-0000-0000-0000-0000000000aa
EHB=31460000-0000-0000-0000-0000000000bb

DAY='2026-03-17'
FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.attendance_logs WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_breaks WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees       WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
       direct_manager_id=NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$EMP','$OTH','$HRB');
DELETE FROM auth.users      WHERE id IN ('$HR','$EMP','$OTH','$HRB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

# ★★ حارس ضدّ التنظيف الفاشل الصامت (درس 0345): بقاء صفٍّ واحد يعني
#   أن كل عدّ لاحق باطل.
LEFT=$($PSQL -c "SELECT count(*) FROM public.attendance_logs WHERE tenant_id IN ('$TA','$TB');")
if [[ "$LEFT" != "0" ]]; then
  echo "  ❌ التنظيف فشل: بقي $LEFT سجلّ — كل الأرقام بعده باطلة"
  exit 1
fi

echo "── تهيئة: شركتان · موارد+موظفان في أ · موارد في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','at46a'),('$TB','B','شركة ب','at46b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@a46.io'),('$EMP','emp@a46.io'),('$OTH','oth@a46.io'),('$HRB','hrb@a46.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','الإنتاج'),('$DBB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr'),
  ('$EMP','$TA','سعد الموظف','employee'),
  ('$OTH','$TA','ليلى الزميلة','employee'),
  ('$HRB','$TB','موارد ب','hr');
UPDATE public.employees SET id='$EH' , department_id='$DA' , employee_code='A46H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EE' , department_id='$DA' , employee_code='A46E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO' , department_id='$DA' , employee_code='A46O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EHB', department_id='$DBB', employee_code='A46B'
 WHERE user_id='$HRB' AND tenant_id='$TB';

-- المستأجر أ: ثلاثة موظفين · سعد وليلى بصما · هالة غائبة
INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date) VALUES
 ('$TA','$EE','$DAY 08:00:00+03','$DAY'),
 ('$TA','$EE','$DAY 16:00:00+03','$DAY'),
 ('$TA','$EO','$DAY 09:00:00+03','$DAY');
-- ★ وجهة ليلى — بيانات حسّاسة: أين ذهب الزميل؟
INSERT INTO public.employee_breaks
  (tenant_id,employee_id,destination,duration_minutes,status,out_time,created_at)
 VALUES ('$TA','$EO','العيادة النفسية',20,'active','$DAY 11:00:00+03','$DAY 11:00:00+03');

-- المستأجر ب: موظف واحد بصم
INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date)
 VALUES ('$TB','$EHB','$DAY 07:30:00+03','$DAY');
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
echo "── ① الموارد في أ يرى شركته كاملة ──"
V=$(as_user "$HR" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,NULL,NULL,200);" 2>&1 | tail -1)
[[ "$V" == "3" ]] && ok "صفوف لوحة الموارد = $V" \
  || bad "★★★ الموارد يرى $V صفّاً (متوقَّع 3)"

V=$(as_user "$HR" "SELECT out_total||'/'||out_present||'/'||out_absent||'/'||out_on_break FROM public.hr_daily_attendance_summary('$DAY',NULL);" 2>&1 | tail -1)
[[ "$V" == "3/2/1/1" ]] && ok "ملخّص الموارد: $V" \
  || bad "★★★ ملخّص الموارد = $V (متوقَّع 3/2/1/1)"

echo
echo "── ② ★★★ ولا يرى موظف المستأجر ب ──"
V=$(as_user "$HR" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,NULL,'A46B',200);" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "موظف ب محجوب عن موارد أ" || bad "★★★ تسريب: $V"

echo
echo "── ③ ★★★ وموارد ب يرى شركته وحدها ──"
V=$(as_user "$HRB" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,NULL,NULL,200);" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "صفوف موارد ب = $V (مختلفة عن أ)" \
  || bad "★★★ موارد ب يرى $V (متوقَّع 1)"

V=$(as_user "$HRB" "SELECT out_total||'/'||out_present FROM public.hr_daily_attendance_summary('$DAY',NULL);" 2>&1 | tail -1)
[[ "$V" == "1/1" ]] && ok "ملخّص ب: $V" || bad "★★★ ملخّص ب = $V (متوقَّع 1/1)"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ④ ★★★ موظف عادي: هل يرى حضور زملائه؟ ──"
#
# ★ سياسة attendance_logs للموظف:
#     (tenant_id = …) AND (current_user_is_staff()
#                          OR employee_id = current_user_employee_id())
#   وسعد ليس staff ⇒ يرى بصماته وحدها. الصفوف تظهر كلها (employees
#   مرئيّ للجميع) لكن **أعمدة الحضور** تنكمش — وهذا هو المقصود.
V=$(as_user "$EMP" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,'مداوم',NULL,200);" 2>&1 | tail -1)
V2=$(as_user "$EMP" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,'غائب',NULL,200);" 2>&1 | tail -1)
if [[ "$V2" == "2" ]]; then
  ok "سعد يرى زميليه «غائبَين» ($V2) — بصماتهما محجوبة عنه"
else
  bad "★★★ سعد يرى $V2 غائباً (متوقَّع 2 — ليلى وهالة محجوبتان)"
fi

echo
echo "── ⑤ ★★★★ وجهة استراحة الزميلة — أخطر تسريب ──"
# «العيادة النفسية» بيانات صحّية حسّاسة. سعد يجب ألّا يراها إطلاقاً.
V=$(as_user "$EMP" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,NULL,NULL,200) WHERE out_destination = 'العيادة النفسية';" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "وجهة ليلى محجوبة عن سعد" \
  || bad "★★★★ سعد يرى وجهة استراحة زميلته «العيادة النفسية» — تسريب صحّي"

# ★ والموارد **يجب** أن يراها (مسؤوليته التشغيلية) — تأكيد موجب مقابل
V=$(as_user "$HR" "SELECT COALESCE(max(out_destination),'—') FROM public.hr_daily_attendance('$DAY',NULL,NULL,NULL,200);" 2>&1 | tail -1)
[[ "$V" == "العيادة النفسية" ]] && ok "والموارد يراها (مسؤوليته)" \
  || bad "★★ الموارد لا يرى الوجهة: $V"

echo
echo "── ⑥ ★★★ ولا يرى بيانات مستأجر آخر بأي حال ──"
V=$(as_user "$EMP" "SELECT count(*) FROM public.hr_daily_attendance('$DAY',NULL,NULL,'A46B',200);" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "موظف ب محجوب عن سعد" || bad "★★★ تسريب: $V"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑦ ★★★ الموظف لا يستطيع تزوير بصمة ──"
N=$(as_user "$EMP" "WITH i AS (INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date) VALUES('$TA','$EE','$DAY 06:00:00+03','$DAY') RETURNING 1) SELECT count(*) FROM i;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "إدراج البصمة مصدود ($N)"
else
  bad "★★★ الموظف أدرج بصمة لنفسه ($N) — تزوير حضور"
fi

echo
echo "── ⑧ ★★★ ولا يعدّل بصمة قائمة ولا يحذفها ──"
N=$(as_user "$EMP" "WITH u AS (UPDATE public.attendance_logs SET punch_time='$DAY 07:00:00+03' WHERE employee_id='$EE' RETURNING 1) SELECT count(*) FROM u;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "تعديل البصمة مصدود ($N)"
else
  bad "★★★ الموظف عدّل $N بصمة — تزوير وقت الحضور"
fi
N=$(as_user "$EMP" "WITH d AS (DELETE FROM public.attendance_logs WHERE employee_id='$EE' RETURNING 1) SELECT count(*) FROM d;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "حذف البصمة مصدود ($N)"
else
  bad "★★★ الموظف حذف $N بصمة — محو سجلّ تأخيره"
fi

echo
echo "── ⑨ ★★★ ولا يُصدر تصريح استراحة لنفسه ──"
N=$(as_user "$EMP" "WITH i AS (INSERT INTO public.employee_breaks(tenant_id,employee_id,destination,duration_minutes,status) VALUES('$TA','$EE','الخارج',120,'active') RETURNING 1) SELECT count(*) FROM i;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "إصدار التصريح الذاتي مصدود ($N)"
else
  bad "★★★ الموظف أصدر تصريح استراحة لنفسه ($N)"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑩ الترشيح بالتاريخ يعمل بجلسة حقيقية ──"
V=$(as_user "$HR" "SELECT out_absent FROM public.hr_daily_attendance_summary('$DAY'::date - 1,NULL);" 2>&1 | tail -1)
[[ "$V" == "3" ]] && ok "الأمس: الجميع غائبون ($V)" \
  || bad "★★ الأمس: غائبون = $V (متوقَّع 3)"

echo
echo "── ⑪ anon محروم من الدالتين ──"
for fn in hr_daily_attendance hr_daily_attendance_summary; do
  N=$($PSQL -c "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee='anon' AND routine_name='$fn';")
  [[ "$N" == "0" ]] && ok "anon محروم من $fn" || bad "★★★ anon يملك EXECUTE على $fn"
done

echo
echo "── ⑫ ★★★ anon لا يقرأ الجداول ──"
for tbl in attendance_logs employee_breaks; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.$tbl;
SQL
)
  LAST=$(echo "$OUT" | tail -1)
  if [[ "$LAST" == "0" ]] || echo "$OUT" | grep -qi "permission denied\|policy"; then
    ok "anon محجوب عن $tbl"
  else
    bad "★★★ anon قرأ $LAST صفّاً من $tbl"
  fi
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "✅ verify-hr-daily-attendance-0346-rls: كل التأكيدات ناجحة"
else
  echo "❌ $FAIL إخفاقاً"
fi
exit $FAIL
