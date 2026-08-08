#!/usr/bin/env bash
# ============================================================================
# verify-hr-service-center-0367-rls.sh
#
# مركز خدمات الموارد البشرية عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم. وأخطر أعطال هذه الجولة **في الجدار نفسه**.
#
#   ما يحرسه هنا خصوصاً:
#     ① ★★★★ العطل ①: الموظف كان يُصدر شهادة راتبه ويعتمدها ويُسلّمها.
#        (السياسة القديمة `kyvzon_letter_requests_write` كانت polcmd='*')
#     ② ★★★ العطل ②: الموظف كان يُغلق شكواه ويكتب «تم الحل».
#     ③ ★★★ العطل ③: الموظف كان يُسنِد الطلب لنفسه.
#     ④ ★★★ العطل ④: الموظف كان يحذف طلب خطابه نهائياً.
#     ⑤ العزل بين المستأجرين وبين الزملاء.
#     ⑥ الموظف **ما زال** يُنشئ ويقرأ — الإصلاح لم يسلبه حقّه.
#     ⑦ anon محجوب.
#
#   PGPORT=5503 bash tools/dev/verify-hr-service-center-0367-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5503}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3670000-0000-0000-0000-00000000000a
TB=b3670000-0000-0000-0000-00000000000b
HRA=13670001-0000-0000-0000-000000000001
E1=23670002-0000-0000-0000-000000000002
E2=33670003-0000-0000-0000-000000000003
HRB=43670004-0000-0000-0000-000000000004
EB=53670005-0000-0000-0000-000000000005

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.hr_cases DISABLE TRIGGER trg_block_hr_case_delete;
ALTER TABLE public.employee_letter_requests DISABLE TRIGGER trg_block_letter_delete;
DELETE FROM public.hr_cases WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_letter_requests WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.hr_cases ENABLE TRIGGER trg_block_hr_case_delete;
ALTER TABLE public.employee_letter_requests ENABLE TRIGGER trg_block_letter_delete;
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.profiles WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ. أوقف."; exit 1
fi

# ══════════════════════ العيّنة ══════════════════════
$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','شركة ألف','a367-svc'), ('$TB','B','شركة باء','b367-svc');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','huda@a367'),('$E1','salem@a367'),('$E2','noor@a367'),
  ('$HRB','laila@b367'),('$EB','badr@b367');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HRA','$TA','هدى الموارد','hr','الموارد'),
  ('$E1','$TA','سالم الأول','employee','الإنتاج'),
  ('$E2','$TA','نور الثانية','employee','الإنتاج'),
  ('$HRB','$TB','ليلى الموارد','hr','الموارد'),
  ('$EB','$TB','بدر الباء','employee','الإنتاج');
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")

if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ — المحفّز tg_ensure_employee_row لم يعمل."; exit 1
fi
# ★★★ إثباتٌ أن العيّنة تحوي صفّاً أجنبياً فعلاً — وإلّا كان عزل
#   المستأجر شرطاً «لا بيانات تخالفه» أي غير مُختبَر.
if [ "$EMPB" = "$EMP1" ]; then echo "❌ موظف باء = موظف ألف"; exit 1; fi

$PSQL <<SQL >/dev/null
INSERT INTO public.hr_cases
  (id,tenant_id,employee_id,case_type,subject,description,priority,status) VALUES
  ('c3670001-0000-0000-0000-000000000001','$TA','$EMP1','payroll',
   'خصمٌ غير مفهوم','راتبي ناقص','urgent','open'),
  ('c3670002-0000-0000-0000-000000000002','$TA','$EMP2','benefits',
   'تأمينٌ صحّي','لم يُفعَّل','normal','open'),
  ('c3670003-0000-0000-0000-000000000003','$TB','$EMPB','payroll',
   'طلبُ باء','x','normal','open');
INSERT INTO public.employee_letter_requests
  (id,tenant_id,employee_id,letter_type,purpose,status) VALUES
  ('e3670001-0000-0000-0000-000000000001','$TA','$EMP1','salary_certificate',
   'قرضٌ مصرفيّ','submitted'),
  ('e3670002-0000-0000-0000-000000000002','$TB','$EMPB','other','خطابُ باء','submitted');
SQL

$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① العزل بدور authenticated حقيقيّ ════════"

N=$(as_user "$E1" "SELECT count(*) FROM public.hr_cases;")
[ "$N" = "1" ] && ok "سالم يرى طلبه وحده" || bad "سالم يرى [$N] بدل 1"

N=$(as_user "$E1" "SELECT count(*) FROM public.hr_cases WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى طلب زميلته نور" || bad "تسرّبٌ بين الزملاء [$N]"

N=$(as_user "$HRA" "SELECT count(*) FROM public.hr_cases;")
[ "$N" = "2" ] && ok "هدى (HR ألف) ترى طلبَي مستأجرها" || bad "هدى ترى [$N] بدل 2"

# ★★★ صفُّ باء موجودٌ فعلاً ⇒ التأكيد ليس فراغاً
N=$(as_user "$HRA" "SELECT count(*) FROM public.hr_cases WHERE tenant_id='$TB';")
[ "$N" = "0" ] && ok "هدى لا ترى مستأجر باء (وفيه صفٌّ فعلاً)" || bad "تسرّبٌ بين المستأجرين [$N]"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_letter_requests;")
[ "$N" = "1" ] && ok "ليلى (HR باء) ترى خطاب باء وحده" || bad "ليلى ترى [$N] بدل 1"

echo ""
echo "════════ ② ★★★★ العطل ① — إصدار شهادة الراتب ════════"

# قبل 0367: الموظف حدّث الصفّ فعلاً (أُثبت في المسبار).
OUT=$(as_user "$E1" "UPDATE public.employee_letter_requests
  SET status='delivered', document_url='http://fake/شهادة-مزوّرة.pdf',
      reviewed_by='$E1', reviewed_at=now()
  WHERE id='e3670001-0000-0000-0000-000000000001';
 SELECT count(*) FROM public.employee_letter_requests
  WHERE id='e3670001-0000-0000-0000-000000000001' AND status='delivered';")
if echo "$OUT" | tail -1 | grep -q "^0$"; then
  ok "UPDATE المباشر محجوبٌ عن الموظف (كان ينجح قبل 0367)"
else
  bad "★★★★ الموظف ما زال يُصدر شهادة راتبه: $OUT"
fi

ST=$($PSQL -c "SELECT status||'/'||COALESCE(document_url,'-')
                FROM public.employee_letter_requests
                WHERE id='e3670001-0000-0000-0000-000000000001';")
[ "$ST" = "submitted/-" ] && ok "الصفّ لم يتغيّر بحرف" || bad "الصفّ تغيّر [$ST]"

OUT=$(as_user "$E1" "SELECT public.letter_request_issue(
        'e3670001-0000-0000-0000-000000000001','http://fake/x.pdf');")
echo "$OUT" | grep -q "LETTER_NOT_STAFF" && ok "والدالة تمنعه أيضاً (LETTER_NOT_STAFF)" || bad "الدالة سمحت: $OUT"

OUT=$(as_user "$E1" "SELECT public.letter_request_deliver('e3670001-0000-0000-0000-000000000001');")
echo "$OUT" | grep -q "LETTER_NOT_STAFF" && ok "ولا يُسلّمها" || bad "الموظف سلّم: $OUT"

OUT=$(as_user "$E1" "SELECT public.letter_request_reject(
        'e3670001-0000-0000-0000-000000000001','لا أريده');")
echo "$OUT" | grep -q "LETTER_NOT_STAFF" && ok "ولا يرفضها" || bad "الموظف رفض: $OUT"

echo ""
echo "════════ ③ ★★★ العطلان ②/③ — إغلاق الشكوى وإسنادها ════════"

OUT=$(as_user "$E1" "UPDATE public.hr_cases
  SET status='resolved', resolution_summary='حللتُه بنفسي'
  WHERE id='c3670001-0000-0000-0000-000000000001';
 SELECT count(*) FROM public.hr_cases
  WHERE id='c3670001-0000-0000-0000-000000000001' AND status='resolved';")
if echo "$OUT" | tail -1 | grep -q "^0$"; then
  ok "الموظف لا يُغلق شكواه بـUPDATE (كان يُغلقها قبل 0367)"
else
  bad "★★★ الموظف ما زال يُغلق شكواه: $OUT"
fi

OUT=$(as_user "$E1" "SELECT public.hr_case_set_status(
        'c3670001-0000-0000-0000-000000000001','resolved','حللتُه');")
echo "$OUT" | grep -q "CASE_NOT_STAFF" && ok "والدالة تمنعه (CASE_NOT_STAFF)" || bad "الدالة سمحت: $OUT"

OUT=$(as_user "$E2" "UPDATE public.hr_cases SET assigned_to='$E2'
  WHERE id='c3670002-0000-0000-0000-000000000002';
 SELECT count(*) FROM public.hr_cases
  WHERE id='c3670002-0000-0000-0000-000000000002' AND assigned_to IS NOT NULL;")
if echo "$OUT" | tail -1 | grep -q "^0$"; then
  ok "الموظف لا يُسنِد الطلب لنفسه"
else
  bad "★★★ الإسناد الذاتيّ ما زال ممكناً: $OUT"
fi

OUT=$(as_user "$E2" "SELECT public.hr_case_assign('c3670002-0000-0000-0000-000000000002','$E2');")
echo "$OUT" | grep -q "CASE_NOT_STAFF" && ok "ودالة الإسناد تمنعه" || bad "الدالة سمحت: $OUT"

echo ""
echo "════════ ④ ★★★ العطل ④ — الحذف النهائيّ ════════"

OUT=$(as_user "$E1" "DELETE FROM public.employee_letter_requests
  WHERE id='e3670001-0000-0000-0000-000000000001';")
if echo "$OUT" | grep -q "SERVICE_CENTER_DELETE_BLOCKED"; then
  ok "الموظف يصطدم بمحفّز المنع"
elif echo "$OUT" | grep -qi "denied\|policy"; then
  ok "الموظف محجوبٌ بالسياسة قبل المحفّز"
else
  N=$($PSQL -c "SELECT count(*) FROM public.employee_letter_requests
                 WHERE id='e3670001-0000-0000-0000-000000000001';")
  [ "$N" = "1" ] && ok "الصفّ باقٍ (الحذف لم يقع)" || bad "★★★ الموظف حذف طلبه: $OUT"
fi

OUT=$(as_user "$HRA" "DELETE FROM public.hr_cases
  WHERE id='c3670002-0000-0000-0000-000000000002';")
if echo "$OUT" | grep -q "SERVICE_CENTER_DELETE_BLOCKED"; then
  ok "و HR كذلك محجوبةٌ عن الحذف النهائيّ"
else
  N=$($PSQL -c "SELECT count(*) FROM public.hr_cases
                 WHERE id='c3670002-0000-0000-0000-000000000002';")
  [ "$N" = "1" ] && ok "الصفّ باقٍ (لا سياسة DELETE على hr_cases)" || bad "HR حذفت: $OUT"
fi

echo ""
echo "════════ ⑤ ★ الموظف ما زال يملك حقّه — الإصلاح لم يسلبه ════════"

OUT=$(as_user "$E1" "SELECT public.hr_case_open(NULL,'attendance',
        'بصمةٌ ناقصة','لم تُسجَّل بصمة الخروج','normal');")
if echo "$OUT" | grep -qE '^[0-9a-f]{8}-'; then
  ok "الموظف يفتح طلباً لنفسه (الحقّ محفوظ)"
else
  bad "الموظف لم يعد يفتح طلباً: $OUT"
fi

OUT=$(as_user "$E1" "SELECT public.letter_request_open(NULL,'employment_verification','سفارة');")
if echo "$OUT" | grep -qE '^[0-9a-f]{8}-'; then
  ok "والموظف يطلب خطاباً لنفسه"
else
  bad "الموظف لم يعد يطلب خطاباً: $OUT"
fi

# ★★★ ولا يفتح باسم زميله
OUT=$(as_user "$E1" "SELECT public.hr_case_open('$EMP2','payroll','باسم نور','x');")
echo "$OUT" | grep -q "CASE_NOT_OWNER" && ok "ولا يفتح باسم زميلته" || bad "فتح باسم غيره: $OUT"

# ★★★ ولا يصل مستأجر باء عبر الدوال
OUT=$(as_user "$HRB" "SELECT public.hr_case_set_status(
        'c3670001-0000-0000-0000-000000000001','closed','من باء');")
echo "$OUT" | grep -q "CASE_NOT_FOUND" && ok "HR باء لا تُغلق طلبَ ألف (ترشيح المستأجر)" || bad "HR باء أغلقت: $OUT"

echo ""
echo "════════ ⑥ HR تُنجز الدورة كاملةً بدور حقيقيّ ════════"

OUT=$(as_user "$HRA" "SELECT public.hr_case_assign('c3670001-0000-0000-0000-000000000001',NULL);")
echo "$OUT" | grep -q "^t$" && ok "هدى تُسنِد الطلب" || bad "الإسناد فشل: $OUT"

ST=$($PSQL -c "SELECT status FROM public.hr_cases WHERE id='c3670001-0000-0000-0000-000000000001';")
[ "$ST" = "in_review" ] && ok "الحالة انتقلت open ← in_review" || bad "الحالة [$ST]"

OUT=$(as_user "$HRA" "SELECT public.hr_case_set_status(
        'c3670001-0000-0000-0000-000000000001','resolved',NULL);")
echo "$OUT" | grep -q "CASE_SUMMARY_REQUIRED" && ok "لا إغلاق بلا ملخّص" || bad "أُغلق بلا ملخّص: $OUT"

OUT=$(as_user "$HRA" "SELECT public.hr_case_set_status(
        'c3670001-0000-0000-0000-000000000001','resolved','صُرف الفرق');")
echo "$OUT" | grep -q "^resolved$" && ok "والإغلاق بملخّصٍ ينجح" || bad "الإغلاق فشل: $OUT"

OUT=$(as_user "$HRA" "SELECT public.letter_request_issue(
        'e3670001-0000-0000-0000-000000000001','https://docs/salary.pdf');")
echo "$OUT" | grep -q "^t$" && ok "هدى تُصدر الخطاب" || bad "الإصدار فشل: $OUT"

OUT=$(as_user "$HRA" "SELECT public.letter_request_deliver('e3670001-0000-0000-0000-000000000001');")
echo "$OUT" | grep -q "^t$" && ok "ثم تُسلّمه" || bad "التسليم فشل: $OUT"

ST=$($PSQL -c "SELECT status||'/'||COALESCE(reviewed_by::TEXT,'-')
                FROM public.employee_letter_requests
                WHERE id='e3670001-0000-0000-0000-000000000001';")
[ "$ST" = "delivered/$HRA" ] && ok "المُراجِع هو هدى لا الموظف" || bad "المُراجِع [$ST]"

echo ""
echo "════════ ⑦ اللوح والملخّص بدور حقيقيّ ════════"

# سالم: خصمٌ غير مفهوم + بصمةٌ ناقصة = 2
N=$(as_user "$E1" "SELECT count(*) FROM public.hr_case_board();")
[ "$N" = "2" ] && ok "اللوح بسياق سالم = 2 (RLS سارية على SECURITY INVOKER)" || bad "اللوح [$N] بدل 2"

N=$(as_user "$HRA" "SELECT count(*) FROM public.hr_case_board();")
[ "$N" = "3" ] && ok "اللوح بسياق هدى = 3" || bad "اللوح [$N] بدل 3"

T=$(as_user "$HRA" "SELECT cases_total FROM public.service_center_summary();")
[ "$T" = "3" ] && ok "الملخّص بسياق هدى = 3 (لا 4)" || bad "الملخّص [$T] بدل 3"

T=$(as_user "$HRB" "SELECT cases_total FROM public.service_center_summary();")
[ "$T" = "1" ] && ok "الملخّص بسياق ليلى = 1" || bad "الملخّص [$T] بدل 1"

# ★ الموظف يرى ملخّصه هو
T=$(as_user "$E1" "SELECT cases_total FROM public.service_center_summary();")
[ "$T" = "2" ] && ok "الملخّص بسياق سالم = 2 (طلباه)" || bad "الملخّص [$T] بدل 2"

echo ""
echo "════════ ⑧ anon محجوب ════════"

$PSQL -c "GRANT USAGE ON SCHEMA public TO anon;" >/dev/null 2>&1
for expr in "SELECT count(*) FROM public.hr_cases" \
            "SELECT public.hr_case_board()" \
            "SELECT public.letter_request_issue('e3670001-0000-0000-0000-000000000001','x')"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
$expr;
SQL
)
  if echo "$OUT" | grep -qi "denied"; then
    ok "anon محجوبٌ عن: ${expr:0:52}"
  else
    bad "anon يصل: $expr ⇒ $OUT"
  fi
done

echo ""
if [ "$FAIL" = "0" ]; then
  echo "════════════════════════════════════════"
  echo "  ✅ verify-hr-service-center-0367-rls.sh — كل التأكيدات نجحت"
  echo "════════════════════════════════════════"
  exit 0
else
  echo "❌ فشل $FAIL تأكيداً"
  exit 1
fi
