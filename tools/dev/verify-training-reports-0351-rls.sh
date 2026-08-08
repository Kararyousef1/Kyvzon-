#!/usr/bin/env bash
# ============================================================================
# verify-training-reports-0351-rls.sh
#
# تقارير التدريب عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب ملف الـSQL؟
#   ملف الـSQL يعمل بدور postgres وهو BYPASSRLS — فيقيس منطق الدوال لا
#   الحماية. والدوال الخمس `SECURITY DEFINER` أي أنها **تتجاوز RLS عمداً**،
#   فالحارس الوحيد هو `current_user_is_staff()` والترشيح الداخلي.
#   وسجلّ التدريب يكشف: من رسب، من لم يلتحق، ودرجات تقدّم الأفراد.
#
#   PGPORT=5460 bash tools/dev/verify-training-reports-0351-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5460}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa510000-0000-0000-0000-0000000000aa
TB=bb510000-0000-0000-0000-0000000000bb
DA=dd510000-0000-0000-0000-0000000000aa
DB=dd510000-0000-0000-0000-0000000000bb
HRA=11510000-0000-0000-0000-0000000000aa
EMPA=12510000-0000-0000-0000-0000000000aa
MGRA=14510000-0000-0000-0000-0000000000aa
HRB=11510000-0000-0000-0000-0000000000bb
EMPB=12510000-0000-0000-0000-0000000000bb
CA=51510000-0000-0000-0000-0000000000aa
CB=51510000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.course_progress WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.courses         WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees       WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments     WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$EMPA','$MGRA','$HRB','$EMPB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$EMPA','$MGRA','$HRB','$EMPB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}

cleanup

# ★ حارس التنظيف — تراكم صفوف يُفسد كل قياس تالٍ صامتاً
LEFT=$($PSQL -c "SELECT count(*) FROM public.courses WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقيت $LEFT دورة. أوقف."
  exit 1
fi

$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','أ','a51-x'), ('$TB','B','ب','b51-x');
INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
  ('$DA','$TA','الهندسة'), ('$DB','$TB','قسم ب');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','hr51a@x.co'), ('$EMPA','emp51a@x.co'), ('$MGRA','mgr51a@x.co'),
  ('$HRB','hr51b@x.co'), ('$EMPB','emp51b@x.co');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department,status) VALUES
  ('$HRA', '$TA','مدير أ','hr',      'الهندسة','active'),
  ('$EMPA','$TA','موظف أ','employee','الهندسة','active'),
  ('$MGRA','$TA','مدير قسم','manager','الهندسة','active'),
  ('$HRB', '$TB','مدير ب','hr',      'قسم ب','active'),
  ('$EMPB','$TB','موظف ب','employee','قسم ب','active');

INSERT INTO public.courses(id,tenant_id,title,description,category,level,status,mandatory) VALUES
  ('$CA','$TA','دورة سرّية للشركة أ','د','أمان','مبتدئ','active',true),
  ('$CB','$TB','دورة الشركة ب','د','عام','مبتدئ','active',false);

INSERT INTO public.course_progress(tenant_id,course_id,employee_id,progress,completed)
SELECT '$TA','$CA',e.id,100,true FROM public.employees e
 WHERE e.tenant_id='$TA' AND e.user_id='$EMPA';
INSERT INTO public.course_progress(tenant_id,course_id,employee_id,progress,completed)
SELECT '$TB','$CB',e.id,25,false FROM public.employees e
 WHERE e.tenant_id='$TB' AND e.user_id='$EMPB';
SQL

echo "════════════════════════════════════════════════════════"
echo "  0351 — تقارير التدريب عبر RLS حقيقي"
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
echo "── ① الدور المخوَّل يرى بياناته ──"

V=$(as_user "$HRA" "SELECT count(*) FROM public.training_course_stats();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "hr(أ) يرى دورة واحدة (دورته)"
else bad "hr(أ) يرى '${V:-<فشل>}' والمتوقَّع 1"; fi

V=$(as_user "$HRA" "SELECT out_avg_progress FROM public.training_course_stats();" 2>/dev/null | tail -1)
if [ "$V" = "100.0" ]; then ok "متوسط التقدّم = 100.0 (من عمود progress الحقيقي)"
elif [ "$V" = "0" ] || [ "$V" = "0.0" ]; then bad "★★★ التقدّم صفر — عاد العطل ① (progress_percent المعدوم)"
else bad "متوسط التقدّم = '${V:-<فشل>}' والمتوقَّع 100.0"; fi

V=$(as_user "$HRA" "SELECT out_status FROM public.training_course_stats();" 2>/dev/null | tail -1)
if [ "$V" = "active" ]; then ok "الحالة تُقرأ من status لا من active المعدوم"
else bad "الحالة = '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ② العزل بين المستأجرين ──"
# ★ الدوال DEFINER ⇒ الترشيح الداخلي هو الحارس الوحيد.

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_course_stats();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "hr(ب) يرى دورة واحدة لا دورتين"
elif [ "${V:-9}" = "2" ]; then bad "★★★ تسريب! hr(ب) يرى دورتي المستأجرين"
else bad "hr(ب) يرى '${V:-<فشل>}'"; fi

V=$(as_user "$HRB" "SELECT out_title FROM public.training_course_stats();" 2>/dev/null | tail -1)
if [ "$V" = "دورة الشركة ب" ]; then ok "hr(ب) يرى عنوان دورته فقط"
else bad "hr(ب) يرى '${V:-<فشل>}'"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_course_stats() WHERE out_title LIKE '%سرّية%';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "hr(ب) لا يرى الدورة السرّية للشركة أ"
else bad "★★★ تسريب! hr(ب) يرى الدورة السرّية"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_participants() WHERE out_employee_name LIKE '%موظف أ%';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "hr(ب) لا يرى موظفي الشركة أ"
else bad "★★★ تسريب! hr(ب) يرى $V من موظفي أ"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_department_stats();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "hr(ب) يرى قسماً واحداً"
else bad "hr(ب) يرى '${V:-<فشل>}' قسماً والمتوقَّع 1"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ③ الأدوار غير المخوَّلة ──"
# ★ current_user_is_staff() = admin·hr·developer·it_admin فقط.
#   المدير ليس staff — وتقرير التدريب يكشف من رسب ومن لم يلتحق.

for pair in "$EMPA:employee" "$MGRA:manager"; do
  uid="${pair%%:*}"; role="${pair##*:}"
  OUT=$(as_user "$uid" "SELECT count(*) FROM public.training_course_stats();" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "$role مرفوض من إحصاءات الدورات"
  else bad "$role نفذ إحصاءات الدورات!"; fi

  OUT=$(as_user "$uid" "SELECT count(*) FROM public.training_participants();" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "$role مرفوض من قائمة المشاركين"
  else bad "$role نفذ قائمة المشاركين!"; fi
done

OUT=$(as_user "$EMPA" "SELECT public.training_course_set_status('$CA','archived');" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "employee مرفوض من الأرشفة"
else bad "employee أرشف دورة!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ④ الأرشفة تحفظ سجلّات التقدّم ──"
# ★★★ الحذف القديم كان يمحوها بـCASCADE.

BEFORE=$($PSQL -c "SELECT count(*) FROM public.course_progress WHERE course_id='$CA';")
as_user "$HRA" "SELECT public.training_course_set_status('$CA','archived');" >/dev/null 2>&1
AFTER=$($PSQL -c "SELECT count(*) FROM public.course_progress WHERE course_id='$CA';")
STATUS=$($PSQL -c "SELECT status FROM public.courses WHERE id='$CA';")

if [ "$STATUS" = "archived" ]; then ok "الحالة صارت archived"
else bad "الحالة = '${STATUS:-<فشل>}'"; fi

if [ "$BEFORE" = "$AFTER" ] && [ "${AFTER:-0}" != "0" ]; then
  ok "سجلّات التقدّم محفوظة ($BEFORE ⇒ $AFTER) — لا CASCADE"
else
  bad "★★★ ضاعت سجلّات التقدّم: $BEFORE ⇒ $AFTER"
fi

# دورة أجنبية مرفوضة
OUT=$(as_user "$HRB" "SELECT public.training_course_set_status('$CA','active');" 2>&1)
if echo "$OUT" | grep -q "لا تخصّ مستأجرك"; then ok "أرشفة دورة أجنبية مرفوضة صراحةً"
else bad "hr(ب) عدّل دورة الشركة أ!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑤ القراءة المباشرة ما زالت محكومة بـRLS ──"

V=$(as_user "$EMPB" "SELECT count(*) FROM public.courses WHERE tenant_id='$TA';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "موظف(ب) لا يرى دورات المستأجر أ مباشرةً"
else bad "★★★ موظف(ب) يرى $V من دورات أ"; fi

V=$(as_user "$EMPB" "SELECT count(*) FROM public.course_progress WHERE tenant_id='$TA';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "موظف(ب) لا يرى تقدّم موظفي أ"
else bad "★★★ موظف(ب) يرى $V من سجلّات أ"; fi

cleanup

echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 0351 RLS — كل التأكيدات نجحت"
else
  echo "  ❌ 0351 RLS — $FAIL فشلاً"
fi
echo "════════════════════════════════════════════════════════"
exit "$FAIL"
