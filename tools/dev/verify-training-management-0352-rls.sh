#!/usr/bin/env bash
# ============================================================================
# verify-training-management-0352-rls.sh
#
# إدارة التدريب والشهادات عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب ملف الـSQL؟
#   ملف الـSQL يعمل بدور postgres وهو BYPASSRLS. والدوال الأربع
#   `SECURITY DEFINER` أي أنها **تتجاوز RLS عمداً** — فالحارس الوحيد هو
#   `current_user_is_staff()` والترشيح الداخلي. وسجلّ الشهادات يكشف
#   مؤهّلات الأفراد وصلاحياتها، وإنشاء الدورات تعديلٌ على بيانات المؤسسة.
#
#   PGPORT=5463 bash tools/dev/verify-training-management-0352-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5463}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa520000-0000-0000-0000-0000000000aa
TB=bb520000-0000-0000-0000-0000000000bb
HRA=11520000-0000-0000-0000-0000000000aa
EMPA=12520000-0000-0000-0000-0000000000aa
MGRA=14520000-0000-0000-0000-0000000000aa
HRB=11520000-0000-0000-0000-0000000000bb
EMPB=12520000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.employee_certifications WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.course_progress         WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.courses                 WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees               WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$EMPA','$MGRA','$HRB','$EMPB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$EMPA','$MGRA','$HRB','$EMPB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}

cleanup

# ★ حارس التنظيف — تراكم صفوف يُفسد كل قياس تالٍ صامتاً
LEFT=$($PSQL -c "SELECT count(*) FROM public.employee_certifications WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقيت $LEFT شهادة. أوقف."
  exit 1
fi

$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','أ','a52-x'), ('$TB','B','ب','b52-x');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','hr52a@x.co'), ('$EMPA','emp52a@x.co'), ('$MGRA','mgr52a@x.co'),
  ('$HRB','hr52b@x.co'), ('$EMPB','emp52b@x.co');
INSERT INTO public.profiles(id,tenant_id,full_name,role,status) VALUES
  ('$HRA', '$TA','مدير أ','hr','active'),
  ('$EMPA','$TA','موظف أ','employee','active'),
  ('$MGRA','$TA','مدير قسم','manager','active'),
  ('$HRB', '$TB','مدير ب','hr','active'),
  ('$EMPB','$TB','موظف ب','employee','active');

-- شهادة سرّية للمستأجر أ (منتهية) وأخرى للمستأجر ب
INSERT INTO public.employee_certifications(tenant_id,employee_id,certification_name,issued_by,issue_date,expiry_date)
SELECT '$TA',e.id,'شهادة سرّية للشركة أ','هيئة', CURRENT_DATE-400, CURRENT_DATE-30
  FROM public.employees e WHERE e.tenant_id='$TA' AND e.user_id='$EMPA';
INSERT INTO public.employee_certifications(tenant_id,employee_id,certification_name,issued_by,issue_date,expiry_date)
SELECT '$TB',e.id,'شهادة الشركة ب','جهة', CURRENT_DATE, CURRENT_DATE+365
  FROM public.employees e WHERE e.tenant_id='$TB' AND e.user_id='$EMPB';
SQL

echo "════════════════════════════════════════════════════════"
echo "  0352 — إدارة التدريب عبر RLS حقيقي"
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
echo "── ① إنشاء الدورة ينجح أخيراً (العطل ①) ──"
# ★★★ كان يفشل بـ column "active" does not exist

OUT=$(as_user "$HRA" "SELECT out_title||'|'||out_status FROM public.training_course_upsert(NULL,'دورة اختبار',NULL,NULL,NULL,'عام','مبتدئ','ساعة',10,true,'مدرب','{}','{}','active');" 2>&1)
V=$(echo "$OUT" | tail -1)
if [ "$V" = "دورة اختبار|active" ]; then ok "hr(أ) أنشأ دورة — والحالة active"
else bad "الإنشاء فشل أو أعاد '${V:-<فشل>}'"; fi

CID=$($PSQL -c "SELECT id FROM public.courses WHERE tenant_id='$TA' AND title='دورة اختبار';")
if [ -n "${CID:-}" ]; then ok "الدورة موجودة في القاعدة"
else bad "★★★ الدورة لم تُكتب"; fi

V=$(as_user "$HRA" "SELECT out_status FROM public.training_course_upsert('$CID','دورة اختبار',NULL,NULL,NULL,'عام','متقدم',NULL,20,false,NULL,'{}','{}','inactive');" 2>/dev/null | tail -1)
if [ "$V" = "inactive" ]; then ok "التعديل نجح — والحالة inactive"
else bad "التعديل أعاد '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ② الشهادات بأعمدتها الحقيقية (العطل ②+④) ──"

V=$(as_user "$HRA" "SELECT out_certification_name FROM public.training_certifications();" 2>/dev/null | tail -1)
if [ "$V" = "شهادة سرّية للشركة أ" ]; then ok "اسم الشهادة يظهر (certification_name)"
elif [ -z "$V" ]; then bad "★★★ اسم الشهادة فارغ — عاد العطل ②"
else bad "الاسم = '$V'"; fi

V=$(as_user "$HRA" "SELECT out_validity FROM public.training_certifications();" 2>/dev/null | tail -1)
if [ "$V" = "منتهية" ]; then ok "الصلاحية محسوبة = «منتهية»"
elif [ "$V" = "سارية" ]; then bad "★★★ شهادة منتهية تظهر سارية — عاد العطل ④"
else bad "الصلاحية = '${V:-<فشل>}'"; fi

V=$(as_user "$HRA" "SELECT out_days_to_expiry FROM public.training_certifications();" 2>/dev/null | tail -1)
if [ "$V" = "-30" ]; then ok "أيام الانتهاء = -30 (محسوبة)"
else bad "أيام الانتهاء = '${V:-<فشل>}' والمتوقَّع -30"; fi

# ★ الاسم من السلسلة الاحتياطية — full_name_ar فارغ
V=$(as_user "$HRA" "SELECT out_employee_name FROM public.training_certifications();" 2>/dev/null | tail -1)
if [ "$V" = "موظف أ" ]; then ok "اسم الموظف من السلسلة الاحتياطية"
elif [ "$V" = "موظف بلا اسم" ]; then bad "★★★ السلسلة الاحتياطية فشلت — عاد العطل ⑤"
else bad "الاسم = '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ③ المؤشّرات محسوبة لا ثوابت (العطل ③) ──"

V=$(as_user "$HRA" "SELECT out_valid_certs||'/'||out_total_certs FROM public.training_management_summary();" 2>/dev/null | tail -1)
if [ "$V" = "0/1" ]; then ok "السارية 0 من 1 — لا «معتمدة» ثابتة"
elif [ "$V" = "1/1" ]; then bad "★★★ السارية = الكلّي — عاد الثابت approved:true"
else bad "النتيجة = '${V:-<فشل>}' والمتوقَّع 0/1"; fi

V=$(as_user "$HRA" "SELECT out_expired_certs FROM public.training_management_summary();" 2>/dev/null | tail -1)
if [ "$V" = "1" ]; then ok "المنتهية = 1"
else bad "المنتهية = '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ④ العزل بين المستأجرين ──"

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_certifications();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "1" ]; then ok "hr(ب) يرى شهادة واحدة (شهادته)"
elif [ "${V:-9}" = "2" ]; then bad "★★★ تسريب! hr(ب) يرى شهادتَي المستأجرين"
else bad "hr(ب) يرى '${V:-<فشل>}'"; fi

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_certifications() WHERE out_certification_name LIKE '%سرّية%';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "hr(ب) لا يرى الشهادة السرّية للشركة أ"
else bad "★★★ تسريب! hr(ب) يرى الشهادة السرّية"; fi

OUT=$(as_user "$HRB" "SELECT public.training_course_upsert('$CID','اختراق');" 2>&1)
if echo "$OUT" | grep -q "لا تخصّ مستأجرك"; then ok "hr(ب) لا يعدّل دورة الشركة أ"
else bad "★★★ hr(ب) عدّل دورة الشركة أ!"; fi

EIDA=$($PSQL -c "SELECT id FROM public.employees WHERE tenant_id='$TA' AND user_id='$EMPA';")
OUT=$(as_user "$HRB" "SELECT public.training_certification_upsert(NULL,'$EIDA','اختراق','جهة',CURRENT_DATE,CURRENT_DATE+10);" 2>&1)
if echo "$OUT" | grep -q "لا يخصّ مستأجرك"; then ok "hr(ب) لا ينسب شهادة لموظف الشركة أ"
else bad "★★★ hr(ب) نسب شهادة لموظف أجنبي!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑤ الأدوار غير المخوَّلة ──"
# ★ current_user_is_staff() = admin·hr·developer·it_admin فقط

for pair in "$EMPA:employee" "$MGRA:manager"; do
  uid="${pair%%:*}"; role="${pair##*:}"
  OUT=$(as_user "$uid" "SELECT count(*) FROM public.training_certifications();" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "$role مرفوض من الشهادات"
  else bad "$role قرأ الشهادات!"; fi

  OUT=$(as_user "$uid" "SELECT public.training_course_upsert(NULL,'دورة $role');" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "$role مرفوض من إنشاء الدورات"
  else bad "$role أنشأ دورة!"; fi
done

OUT=$(as_user "$EMPA" "SELECT count(*) FROM public.training_management_summary();" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "employee مرفوض من المؤشّرات"
else bad "employee قرأ المؤشّرات!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑥ القراءة المباشرة ما زالت محكومة بـRLS ──"

V=$(as_user "$EMPB" "SELECT count(*) FROM public.employee_certifications WHERE tenant_id='$TA';" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "موظف(ب) لا يرى شهادات المستأجر أ"
else bad "★★★ موظف(ب) يرى $V من شهادات أ"; fi

cleanup

echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 0352 RLS — كل التأكيدات نجحت"
else
  echo "  ❌ 0352 RLS — $FAIL فشلاً"
fi
echo "════════════════════════════════════════════════════════"
exit "$FAIL"
