#!/usr/bin/env bash
# ============================================================================
# verify-kiosk-punch-0347-rls.sh
#
# بوابة الحارس عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-kiosk-punch-0347.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال. وجوهر
#   الإصلاح هنا **سياسة INSERT**:
#     kyvzon_attendance_logs_insert WITH CHECK
#       ((tenant_id = current_user_tenant_id()) AND current_user_is_staff())
#   و current_user_is_staff() = admin·hr·developer·it_admin **فقط**
#   ⇒ حارسٌ بدور supervisor/gatekeeper كان الإدراج المباشر ليُصدّه.
#   لهذا kiosk_punch تعمل SECURITY DEFINER وتفحص الصلاحية بنفسها —
#   وهذا لا يظهر إطلاقاً في ملف الـSQL.
#
#   PGPORT=5451 bash tools/dev/verify-kiosk-punch-0347-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5451}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa470000-0000-0000-0000-0000000000aa
TB=bb470000-0000-0000-0000-0000000000bb
HR=11470000-0000-0000-0000-0000000000aa
SUP=14470000-0000-0000-0000-0000000000aa
EMP=12470000-0000-0000-0000-0000000000aa
OTH=13470000-0000-0000-0000-0000000000aa
HRB=11470000-0000-0000-0000-0000000000bb
DA=21470000-0000-0000-0000-0000000000aa
DBB=21470000-0000-0000-0000-0000000000bb
EH=31470000-0000-0000-0000-0000000000aa
ES=34470000-0000-0000-0000-0000000000aa
EE=32470000-0000-0000-0000-0000000000aa
EO=33470000-0000-0000-0000-0000000000aa
EHB=31470000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.attendance_logs    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.attendance_summary WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees          WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
       direct_manager_id=NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$SUP','$EMP','$OTH','$HRB');
DELETE FROM auth.users      WHERE id IN ('$HR','$SUP','$EMP','$OTH','$HRB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

# ★★ حارس التنظيف (درس 0345): بقاء صفٍّ يُبطل كل عدّ لاحق
LEFT=$($PSQL -c "SELECT count(*) FROM public.attendance_logs WHERE tenant_id IN ('$TA','$TB');")
if [[ "$LEFT" != "0" ]]; then
  echo "  ❌ التنظيف فشل: بقي $LEFT سجلّ — كل الأرقام بعده باطلة"
  exit 1
fi

echo "── تهيئة: شركتان · موارد+مشرف+موظفان في أ · موارد في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','ki47a'),('$TB','B','شركة ب','ki47b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@k47.io'),('$SUP','sup@k47.io'),('$EMP','emp@k47.io'),
  ('$OTH','oth@k47.io'),('$HRB','hrb@k47.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','الإنتاج'),('$DBB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr'),
  ('$SUP','$TA','مازن المشرف','supervisor'),
  ('$EMP','$TA','سعد الموظف','employee'),
  ('$OTH','$TA','ليلى الزميلة','employee'),
  ('$HRB','$TB','موارد ب','hr');
UPDATE public.employees SET id='$EH' , department_id='$DA' , employee_code='K47H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$ES' , department_id='$DA' , employee_code='K47S'
 WHERE user_id='$SUP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EE' , department_id='$DA' , employee_code='K47E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO' , department_id='$DA' , employee_code='K47O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EHB', department_id='$DBB', employee_code='K47B'
 WHERE user_id='$HRB' AND tenant_id='$TB';
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
echo "── ① ★★★ جوهر الإصلاح: المشرف ليس staff — الإدراج المباشر مصدود ──"
# ★ نُثبت أولاً أن السياسة **فعلاً** تصدّه. لو مرّ لكان التشخيص خاطئاً.
OUT=$(as_user "$SUP" "INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,shift_date) VALUES('$TA','$EE',NOW(),CURRENT_DATE);" 2>&1)
if echo "$OUT" | grep -qi "row-level security\|policy"; then
  ok "الإدراج المباشر بدور المشرف مصدود — التشخيص صحيح"
else
  bad "★★★ الإدراج المباشر نجح — راجع السياسة: $OUT"
fi

echo
echo "── ② ★★★ والدالة DEFINER تنجح حيث فشل الإدراج المباشر ──"
V=$(as_user "$SUP" "SELECT out_punch_type FROM public.kiosk_punch('$EE','finger','KIOSK-1');" 2>&1 | tail -1)
[[ "$V" == "check-in" ]] && ok "المشرف سجّل بصمة دخول عبر الدالة" \
  || bad "★★★ الدالة فشلت بدور المشرف: $V"

echo
echo "── ③ ★★★ والمحفّز بنى الملخّص فوراً ──"
V=$($PSQL -c "SELECT count(*) FROM public.attendance_summary WHERE tenant_id='$TA' AND employee_id='$EE';")
[[ "$V" == "1" ]] && ok "صفّ الملخّص أُنشئ ($V) — كان 0 أبداً" \
  || bad "★★★ صفوف الملخّص = $V (متوقَّع 1) — المحفّز لا يعمل"

V=$($PSQL -c "SELECT status FROM public.attendance_summary WHERE tenant_id='$TA' AND employee_id='$EE';")
if [[ "$V" == "حضور_بوقت" || "$V" == "متأخر" ]]; then
  ok "حالة الملخّص: $V"
else
  bad "★★ حالة غير متوقَّعة: $V"
fi

echo
echo "── ④ ★★★ وبصمة النوع مكتوبة (كانت check-in أبداً) ──"
V=$($PSQL -c "SELECT punch_type||'/'||COALESCE(shift_type,'NULL') FROM public.attendance_logs WHERE tenant_id='$TA' AND employee_id='$EE';")
if [[ "$V" == check-in/* && "$V" != */NULL ]]; then
  ok "البصمة: $V (النوع والوردية مكتوبان)"
else
  bad "★★★ البصمة = $V — shift_type مفقود أو النوع خاطئ"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑤ ★★★ الموظف العادي لا يبصم لنفسه ولا لزميله ──"
OUT=$(as_user "$EMP" "SELECT public.kiosk_punch('$EE','finger',NULL);" 2>&1)
if echo "$OUT" | grep -q "غير مصرَّح"; then
  ok "الموظف مرفوض صراحةً (بصمة ذاتية)"
else
  bad "★★★ الموظف بصم لنفسه: $OUT"
fi
OUT=$(as_user "$EMP" "SELECT public.kiosk_punch('$EO','finger',NULL);" 2>&1)
if echo "$OUT" | grep -q "غير مصرَّح"; then
  ok "والموظف مرفوض (بصمة لزميلته)"
else
  bad "★★★ الموظف بصم لزميلته — تزوير حضور: $OUT"
fi

echo
echo "── ⑥ ★★★ وحارس المستأجر أ لا يبصم لموظف المستأجر ب ──"
OUT=$(as_user "$HR" "SELECT public.kiosk_punch('$EHB','finger',NULL);" 2>&1)
if echo "$OUT" | grep -q "غير موجود أو غير نشط"; then
  ok "عبور المستأجرات مرفوض صراحةً"
else
  bad "★★★ اخترق المستأجر: $OUT"
fi
V=$($PSQL -c "SELECT count(*) FROM public.attendance_logs WHERE tenant_id='$TB';")
[[ "$V" == "0" ]] && ok "لا بصمة في المستأجر ب" || bad "★★★ أُنشئت $V بصمة في ب"

echo
echo "── ⑦ ★★★ ولا يبصم لموظف غير نشط ──"
$PSQL >/dev/null -c "UPDATE public.employees SET is_active=FALSE WHERE id='$EO';"
OUT=$(as_user "$HR" "SELECT public.kiosk_punch('$EO','finger',NULL);" 2>&1)
if echo "$OUT" | grep -q "غير موجود أو غير نشط"; then
  ok "بصمة الموظف المفصول مرفوضة"
else
  bad "★★★ بصمة سُجّلت لموظف غير نشط: $OUT"
fi
$PSQL >/dev/null -c "UPDATE public.employees SET is_active=TRUE WHERE id='$EO';"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑧ الموارد يرى لوحة شركته ──"
V=$(as_user "$HR" "SELECT count(*) FROM public.kiosk_board(NULL,300);" 2>&1 | tail -1)
[[ "$V" == "4" ]] && ok "صفوف اللوحة = $V" || bad "★★★ اللوحة = $V (متوقَّع 4)"

V=$(as_user "$HR" "SELECT out_total||'/'||out_present||'/'||out_absent FROM public.kiosk_stats();" 2>&1 | tail -1)
[[ "$V" == "4/1/3" ]] && ok "الإحصائيات: $V" \
  || bad "★★★ الإحصائيات = $V (متوقَّع 4/1/3)"

echo
echo "── ⑨ ★★★ وموارد ب يرى شركته وحدها ──"
V=$(as_user "$HRB" "SELECT count(*) FROM public.kiosk_board(NULL,300);" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "صفوف موارد ب = $V (مختلفة)" \
  || bad "★★★ موارد ب يرى $V (متوقَّع 1)"

echo
echo "── ⑩ ★★★ الموظف لا يزوّر بصمة بالإدراج المباشر ──"
OUT=$(as_user "$EMP" "INSERT INTO public.attendance_logs(tenant_id,employee_id,punch_time,punch_type,shift_date) VALUES('$TA','$EE',NOW() - INTERVAL '3 hours','check-in',CURRENT_DATE);" 2>&1)
if echo "$OUT" | grep -qi "row-level security\|policy"; then
  ok "الإدراج المباشر مصدود"
else
  bad "★★★ الموظف أدرج بصمة بوقت سابق — تزوير: $OUT"
fi

echo
echo "── ⑪ ★★★ ولا يعدّل الملخّص ليُخفي تأخيره ──"
N=$(as_user "$EMP" "WITH u AS (UPDATE public.attendance_summary SET late_minutes=0, status='حضور_بوقت' WHERE employee_id='$EE' RETURNING 1) SELECT count(*) FROM u;" 2>&1 | tail -1)
if [[ "$N" == "0" ]] || echo "$N" | grep -qi "row-level\|policy"; then
  ok "تعديل الملخّص مصدود ($N)"
else
  bad "★★★ الموظف عدّل $N صفّاً في ملخّصه — محو التأخير"
fi

echo
echo "── ⑫ anon محروم من كل الدوال ──"
for fn in kiosk_punch kiosk_board kiosk_stats refresh_attendance_summary; do
  N=$($PSQL -c "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee='anon' AND routine_name='$fn';")
  [[ "$N" == "0" ]] && ok "anon محروم من $fn" || bad "★★★ anon يملك EXECUTE على $fn"
done

echo
echo "── ⑬ ★★★ anon لا يقرأ الجداول ──"
for tbl in attendance_logs attendance_summary; do
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
  echo "✅ verify-kiosk-punch-0347-rls: كل التأكيدات ناجحة"
else
  echo "❌ $FAIL إخفاقاً"
fi
exit $FAIL
