#!/usr/bin/env bash
# ============================================================================
# verify-attendance-vocabulary-0344-rls.sh
#
# مفردات الحضور وربط الإجازة عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-attendance-vocabulary-0344.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال ولا يقيس
#   السياسات. وجوهر عطل ④ **سياسة INSERT**: 
#     kyvzon_attendance_summary_insert WITH CHECK
#       ((tenant_id = current_user_tenant_id()) AND current_user_is_staff())
#   و current_user_is_staff() = admin·hr·developer·it_admin **فقط**
#   (مُحقَّق من pg_get_functiondef). ⇒ **المدير الذي يعتمد الإجازة ليس
#   staff**، فإدراج صفّ 'مجاز' كان ليُصدّ حتى لو مُرّر tenant_id صحيحاً.
#   هذا لا يظهر إطلاقاً في ملف الـSQL.
#
#   PGPORT=5444 bash tools/dev/verify-attendance-vocabulary-0344-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5444}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa440000-0000-0000-0000-0000000000aa
TB=bb440000-0000-0000-0000-0000000000bb
HR=11440000-0000-0000-0000-0000000000aa
MGR=14440000-0000-0000-0000-0000000000aa
EMP=12440000-0000-0000-0000-0000000000aa
OTH=13440000-0000-0000-0000-0000000000aa
EMB=12440000-0000-0000-0000-0000000000bb
DA=21440000-0000-0000-0000-0000000000aa
DB=21440000-0000-0000-0000-0000000000bb
EH=31440000-0000-0000-0000-0000000000aa
EM=34440000-0000-0000-0000-0000000000aa
EE=32440000-0000-0000-0000-0000000000aa
EO=33440000-0000-0000-0000-0000000000aa
EB=31440000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  # ★★★ انحدارٌ كشفه 0367: محفّز `trg_block_hr_case_delete` يمنع الحذف،
  #   و`|| true` كان يبتلع الخطأ صامتاً ⇒ صفوف hr_cases تبقى مُثبَّتة
  #   وتُفسد أيَّ ملفٍّ لاحقٍ يعدّ الجدول. نُعطّل المحفّز مؤقتاً للتنظيف.
  $PSQL >/dev/null 2>&1 <<SQL || true
ALTER TABLE public.hr_cases DISABLE TRIGGER trg_block_hr_case_delete;
SQL
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.attendance_summary WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.attendance_logs    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_cases           WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.holidays           WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees          WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
       direct_manager_id=NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$MGR','$EMP','$OTH','$EMB');
DELETE FROM auth.users      WHERE id IN ('$HR','$MGR','$EMP','$OTH','$EMB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
  $PSQL >/dev/null 2>&1 <<SQL || true
ALTER TABLE public.hr_cases ENABLE TRIGGER trg_block_hr_case_delete;
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان · موارد+مدير+موظفان في أ · موظف في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','at44rls-a'),('$TB','B','شركة ب','at44rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@a44.io'),('$MGR','mgr@a44.io'),('$EMP','emp@a44.io'),
  ('$OTH','oth@a44.io'),('$EMB','emb@a44.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','الإنتاج'),('$DB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr','الإنتاج'),
  ('$MGR','$TA','مازن المدير','manager','الإنتاج'),
  ('$EMP','$TA','سعد الموظف','employee','الإنتاج'),
  ('$OTH','$TA','ليلى','employee','الإنتاج'),
  ('$EMB','$TB','موظف ب','employee','قسم ب');
UPDATE public.employees SET id='$EH', department_id='$DA', employee_code='A44H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EM', department_id='$DA', employee_code='A44M'
 WHERE user_id='$MGR' AND tenant_id='$TA';
UPDATE public.employees SET id='$EE', department_id='$DA', employee_code='A44E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='A44O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='A44B'
 WHERE user_id='$EMB' AND tenant_id='$TB';
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
echo "── ① ★★★ جوهر العطل: المدير ليس staff — السياسة كانت تصدّه ──"
# ★ نُثبت أولاً أن السياسة **فعلاً** تصدّ المدير بالإدراج المباشر.
#   لو مرّ هذا لكان تشخيصنا كلّه خاطئاً.
N=$(as_user "$MGR" "WITH i AS (INSERT INTO public.attendance_summary(tenant_id,employee_id,shift_date,status) VALUES('$TA','$EE','2026-06-01','مجاز') RETURNING 1) SELECT count(*) FROM i;" 2>&1 | tail -1)
if [[ "$N" == "0" || "$N" == *"row-level security"* || "$N" == *"policy"* ]]; then
  ok "الإدراج المباشر بدور المدير مصدود — التشخيص صحيح ($N)"
else
  bad "★★★ الإدراج المباشر نجح ($N) — التشخيص خاطئ، راجع السياسة"
fi

echo
echo "── ② ★★★ والدالة DEFINER تنجح حيث فشل الإدراج المباشر ──"
N=$(as_user "$MGR" "SELECT public.apply_leave_to_attendance('$EE','2026-06-01','2026-06-03');" 2>&1 | tail -1)
[[ "$N" == "3" ]] && ok "المدير طبّق 3 أيام إجازة عبر الدالة" \
                 || bad "★★★ الدالة فشلت بدور المدير: $N"

N=$($PSQL -c "SELECT count(*) FROM public.attendance_summary WHERE tenant_id='$TA' AND employee_id='$EE' AND status='مجاز' AND shift_date BETWEEN '2026-06-01' AND '2026-06-03';")
[[ "$N" == "3" ]] && ok "الصفوف الثلاثة في القاعدة فعلاً" \
                 || bad "★★★ الصفوف = $N (متوقَّع 3)"

echo
echo "── ③ ★★★ والموظف لا يطبّق إجازته على حضوره ──"
OUT=$(as_user "$EMP" "SELECT public.apply_leave_to_attendance('$EE','2026-06-08','2026-06-10');" 2>&1)
if echo "$OUT" | grep -q "غير مصرَّح"; then
  ok "الموظف مرفوض صراحةً"
else
  bad "★★★ الموظف طبّق إجازته: $OUT"
fi

echo
echo "── ④ ★★★ ومدير المستأجر أ لا يمسّ موظف المستأجر ب ──"
OUT=$(as_user "$MGR" "SELECT public.apply_leave_to_attendance('$EB','2026-06-01','2026-06-01');" 2>&1)
if echo "$OUT" | grep -q "ليس ضمن هذا المستأجر"; then
  ok "عبور المستأجرات مرفوض صراحةً"
else
  bad "★★★ اخترق المستأجر: $OUT"
fi
N=$($PSQL -c "SELECT count(*) FROM public.attendance_summary WHERE tenant_id='$TB';")
[[ "$N" == "0" ]] && ok "لا صفّ في المستأجر ب" || bad "★★★ أُنشئ $N صفّاً في ب"

echo
echo "── ⑤ ★★★ الموارد (staff) يطبّق أيضاً ──"
N=$(as_user "$HR" "SELECT public.apply_leave_to_attendance('$EO','2026-06-01','2026-06-02');" 2>&1 | tail -1)
[[ "$N" == "2" ]] && ok "الموارد طبّق يومين" || bad "الموارد فشل: $N"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑥ ★★★ التراجع لا يحذف — الصفوف تبقى بحالة «غائب» ──"
N=$(as_user "$MGR" "SELECT public.revert_leave_from_attendance('$EE','2026-06-01','2026-06-03');" 2>&1 | tail -1)
[[ "$N" == "3" ]] && ok "3 أيام متراجَعة" || bad "التراجع أعاد: $N"
N=$($PSQL -c "SELECT count(*) FROM public.attendance_summary WHERE tenant_id='$TA' AND employee_id='$EE' AND shift_date BETWEEN '2026-06-01' AND '2026-06-03';")
[[ "$N" == "3" ]] && ok "★★★ الصفوف باقية (لا حذف نهائي)" \
                 || bad "★★★ الصفوف بعد التراجع = $N — حدث حذف"
N=$($PSQL -c "SELECT count(*) FROM public.attendance_summary WHERE tenant_id='$TA' AND employee_id='$EE' AND status='غائب' AND shift_date BETWEEN '2026-06-01' AND '2026-06-03';")
[[ "$N" == "3" ]] && ok "الحالة صارت «غائب»" || bad "صفوف «غائب» = $N"

echo
echo "── ⑦ ★★★ والموظف لا يستطيع حذف سجلّ حضوره (تجميل السجلّ) ──"
N=$(as_user "$EMP" "WITH d AS (DELETE FROM public.attendance_summary WHERE employee_id='$EE' RETURNING 1) SELECT count(*) FROM d;" 2>&1 | tail -1)
if [[ "$N" == "0" || "$N" == *"policy"* || "$N" == *"row-level"* ]]; then
  ok "الحذف مصدود ($N)"
else
  bad "★★★ الموظف حذف $N صفّاً من سجلّ حضوره"
fi

echo
echo "── ⑧ ★★★ ولا يستطيع تعديل حالته إلى «حضور_بوقت» ──"
N=$(as_user "$EMP" "WITH u AS (UPDATE public.attendance_summary SET status='حضور_بوقت' WHERE employee_id='$EE' AND status='غائب' RETURNING 1) SELECT count(*) FROM u;" 2>&1 | tail -1)
if [[ "$N" == "0" || "$N" == *"policy"* || "$N" == *"row-level"* ]]; then
  ok "تعديل الحالة مصدود ($N)"
else
  bad "★★★ الموظف حوّل $N يوم غياب إلى حضور"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑨ الإحصاءات بجلسة الموظف: يرى بياناته وحدها ──"
$PSQL >/dev/null <<SQL
UPDATE public.attendance_summary SET status='حضور_بوقت', total_hours=8
 WHERE tenant_id='$TA' AND employee_id='$EE' AND shift_date='2026-06-01';
UPDATE public.attendance_summary SET status='متأخر', total_hours=7, late_minutes=20
 WHERE tenant_id='$TA' AND employee_id='$EE' AND shift_date='2026-06-02';
-- زميلة بساعات مختلفة تماماً
UPDATE public.attendance_summary SET status='حضور_بوقت', total_hours=12
 WHERE tenant_id='$TA' AND employee_id='$EO';
SQL
# سعد: 8 + 7 + (3/6 غائب 0) ⇒ total=3 present=2 hours=15.00 avg=7.50
V=$(as_user "$EMP" "SELECT out_total||'/'||out_present||'/'||out_total_hours||'/'||out_avg_hours FROM public.my_attendance_month_stats(2026,6);" 2>&1 | tail -1)
[[ "$V" == "3/2/15.00/7.50" ]] && ok "إحصاءات سعد: $V" \
  || bad "★★★ إحصاءات سعد = $V (متوقَّع 3/2/15.00/7.50 — 24.00 ساعة يعني تسرّب ليلى)"

# ليلى: يومان × 12 ⇒ 2/2/24.00/12.00 — قيم **مختلفة تماماً**
V=$(as_user "$OTH" "SELECT out_total||'/'||out_present||'/'||out_total_hours||'/'||out_avg_hours FROM public.my_attendance_month_stats(2026,6);" 2>&1 | tail -1)
[[ "$V" == "2/2/24.00/12.00" ]] && ok "إحصاءات ليلى: $V (مختلفة عن سعد)" \
  || bad "★★★ إحصاءات ليلى = $V (متوقَّع 2/2/24.00/12.00)"

echo
echo "── ⑩ ★★★ وموظف المستأجر ب يرى أصفاراً لا بيانات أ ──"
V=$(as_user "$EMB" "SELECT out_total||'/'||out_total_hours FROM public.my_attendance_month_stats(2026,6);" 2>&1 | tail -1)
[[ "$V" == "0/0" ]] && ok "موظف ب يرى أصفاراً: $V" \
  || bad "★★★ موظف ب يرى $V — تسريب عبر المستأجرين"

echo
echo "── ⑪ التتابع معزول أيضاً ──"
V=$(as_user "$EMP" "SELECT out_current_streak||'/'||out_longest_streak FROM public.my_attendance_streak();" 2>&1 | tail -1)
# سعد من الأحدث: 6/3 غائب · 6/2 present · 6/1 present ⇒ current=0 longest=2
[[ "$V" == "0/2" ]] && ok "تتابع سعد: $V" || bad "تتابع سعد = $V (متوقَّع 0/2)"
V=$(as_user "$OTH" "SELECT out_current_streak||'/'||out_longest_streak FROM public.my_attendance_streak();" 2>&1 | tail -1)
# ليلى: يومان حضور بلا غياب ⇒ current=2 longest=2
[[ "$V" == "2/2" ]] && ok "تتابع ليلى: $V (مختلف عن سعد)" \
  || bad "تتابع ليلى = $V (متوقَّع 2/2)"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑫ طلبات التصحيح: الموظف يرى طلبه وحده ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.hr_cases(tenant_id,employee_id,case_type,subject,description,
                            priority,status,channel) VALUES
 ('$TA','$EE','attendance_correction','تصحيح سعد','نسيت البصمة','normal','open','employee_portal'),
 ('$TA','$EO','attendance_correction','تصحيح ليلى','بصمة ليلى','normal','open','employee_portal'),
 ('$TA','$EE','general_inquiry','سؤال سعد','متى الراتب','normal','open','employee_portal'),
 ('$TB','$EB','attendance_correction','تصحيح ب','بصمة ب','normal','open','employee_portal');
SQL
V=$(as_user "$EMP" "SELECT count(*)||'|'||COALESCE(string_agg(out_subject,','),'') FROM public.my_attendance_corrections(20);" 2>&1 | tail -1)
[[ "$V" == "1|تصحيح سعد" ]] && ok "سعد يرى طلبه وحده: $V" \
  || bad "★★★ سعد يرى: $V (متوقَّع 1|تصحيح سعد)"

V=$(as_user "$OTH" "SELECT count(*)||'|'||COALESCE(string_agg(out_subject,','),'') FROM public.my_attendance_corrections(20);" 2>&1 | tail -1)
[[ "$V" == "1|تصحيح ليلى" ]] && ok "ليلى ترى طلبها وحده: $V" \
  || bad "★★★ ليلى ترى: $V"

echo
echo "── ⑬ ★★★ والموارد (staff) — RLS تسمح له برؤية الكلّ، والدالة تقصره على نفسه ──"
# ★ الدالة INVOKER: سياسة hr_cases تسمح لـstaff برؤية كل قضايا المستأجر،
#   لكن شرط (employee_id = v_emp OR = v_uid) داخل الدالة يقصره على قضاياه.
#   ⇒ صفر — وهذا **مقصود**: هذه شاشة «طلباتي» لا صندوق الوارد.
V=$(as_user "$HR" "SELECT count(*) FROM public.my_attendance_corrections(20);" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "الموارد يرى 0 في «طلباتي» (الدالة تقصره على نفسه)" \
  || bad "الموارد يرى $V — الدالة لا تُرشّح بالموظف"

echo
echo "── ⑭ ★★★ ولا طلب من مستأجر آخر رغم employee_id المشترك ──"
$PSQL >/dev/null -c "INSERT INTO public.hr_cases(tenant_id,employee_id,case_type,subject,description,priority,status,channel) VALUES ('$TB','$EE','attendance_correction','تسريب المستأجر','x','normal','open','employee_portal');"
V=$(as_user "$EMP" "SELECT count(*) FROM public.my_attendance_corrections(20);" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "سعد ما زال يرى 1 (طلب المستأجر ب محجوب)" \
  || bad "★★★ سعد يرى $V — تسريب عبر المستأجرين بنفس employee_id"

echo
echo "── ⑮ anon محروم من كل دوال 0344 ──"
for fn in my_attendance_month_stats my_attendance_streak my_attendance_corrections \
          apply_leave_to_attendance revert_leave_from_attendance; do
  N=$($PSQL -c "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee='anon' AND routine_name='$fn';")
  [[ "$N" == "0" ]] && ok "anon محروم من $fn" || bad "★★★ anon يملك EXECUTE على $fn"
done

echo
echo "── ⑯ ★★★ anon لا يقرأ attendance_summary إطلاقاً ──"
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.attendance_summary;
SQL
)
LAST=$(echo "$OUT" | tail -1)
if [[ "$LAST" == "0" ]] || echo "$OUT" | grep -qi "permission denied\|policy"; then
  ok "anon محجوب عن الجدول ($LAST)"
else
  bad "★★★ anon قرأ $LAST صفّاً"
fi

echo
if [[ $FAIL -eq 0 ]]; then
  echo "✅ verify-attendance-vocabulary-0344-rls: كل التأكيدات ناجحة"
else
  echo "❌ $FAIL إخفاقاً"
fi
exit $FAIL
