#!/usr/bin/env bash
# ============================================================================
# verify-recruitment-0362-rls.sh
#
# التوظيف عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① الإعلانات والطلبات لا تُقرأ عبر المستأجرين — والموظف محجوب.
#     ② العطلان ⑨/⑩: FK المركَّب و RESTRICT بدور authenticated.
#     ③ العطل ⑪: الفهرس الفريد على البريد المُطبَّع.
#     ④ العطل ②: قيد الحالة يحرس الكتابة المباشرة.
#     ⑤ العطل ⑬: application_hire يُنشئ موظفاً بدور حقيقيّ.
#     ⑥ العطل ①: recruitment_applications تعمل (كانت ترمي).
#     ⑦ anon محجوب.
#
#   PGPORT=5492 bash tools/dev/verify-recruitment-0362-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5492}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3620000-0000-0000-0000-00000000000a
TB=b3620000-0000-0000-0000-00000000000b
E1=11620001-0000-0000-0000-000000000001
HRA=33620003-0000-0000-0000-000000000003
MGRA=44620004-0000-0000-0000-000000000004
HRB=77620007-0000-0000-0000-000000000007

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.job_applications DISABLE TRIGGER trg_block_job_application_delete;
ALTER TABLE public.job_postings     DISABLE TRIGGER trg_block_job_posting_delete;
DELETE FROM public.job_applications WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.job_postings     WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.job_applications ENABLE TRIGGER trg_block_job_application_delete;
ALTER TABLE public.job_postings     ENABLE TRIGGER trg_block_job_posting_delete;
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$E1','$HRA','$MGRA','$HRB');
DELETE FROM auth.users      WHERE id IN ('$E1','$HRA','$MGRA','$HRB');
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
  ('$TA','A','شركة أ','a362-recr'), ('$TB','B','شركة ب','b362-recr');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a362'),('$HRA','hr@a362'),('$MGRA','m@a362'),('$HRB','hr@b362');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$MGRA','$TA','منير المدير','manager','المالية');
INSERT INTO public.departments(tenant_id,name_ar,manager_id) VALUES
  ('$TA','المالية','$MGRA');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HRA','$TA','موارد أ','hr','الموارد'),
  ('$E1','$TA','سالم الأول','employee','المالية'),
  ('$HRB','$TB','موارد ب','hr','الموارد');
SQL

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.job_posting_upsert(NULL,'محاسب أول','قيود','محاسب',NULL,
  'full_time',800000,1200000,1,NULL,NULL,'open');
SELECT public.job_posting_upsert(NULL,'سائق','نقل','سائق',NULL,
  'part_time',NULL,NULL,1,NULL,NULL,'open');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.job_posting_upsert(NULL,'إعلان باء','وصف',NULL,NULL,
  'full_time',NULL,NULL,1,NULL,NULL,'open');
RESET request.jwt.claim.sub;
SQL

P1=$($PSQL -c "SELECT id FROM public.job_postings WHERE title='محاسب أول';")
P2=$($PSQL -c "SELECT id FROM public.job_postings WHERE title='سائق';")
PB=$($PSQL -c "SELECT id FROM public.job_postings WHERE title='إعلان باء';")

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.application_submit('$P1'::UUID,'سالم المتقدّم','Salem@Example.COM','0770','http://x/cv.pdf');
SELECT public.application_submit('$P1'::UUID,'ناصر المتقدّم','nasser@example.com');
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.job_postings WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT إعلان (متوقَّع 3) ──"
[ "$TOT" = "3" ] || { echo "❌ العيّنة ناقصة"; exit 1; }
A1=$($PSQL -c "SELECT id FROM public.job_applications WHERE email='salem@example.com';")
A2=$($PSQL -c "SELECT id FROM public.job_applications WHERE email='nasser@example.com';")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① عزل المستأجر عبر RLS ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.job_postings;")
[ "$N" = "2" ] && ok "HR/أ يرى إعلانَي شركته (لا 3)" || bad "HR/أ رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.job_postings;")
[ "$N" = "1" ] && ok "HR/ب يرى واحداً" || bad "HR/ب رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.job_applications;")
[ "$N" = "0" ] && ok "HR/ب لا يرى متقدمي أ" || bad "★ تسريب: $N"

# ★★★ الموظف والمدير ليسا staff ⇒ لا يريان شيئاً
N=$(as_user "$E1" "SELECT count(*) FROM public.job_postings;")
[ "$N" = "0" ] && ok "الموظف لا يرى الإعلانات (السياسة staff فقط)" || bad "★ رأى «$N»"

N=$(as_user "$MGRA" "SELECT count(*) FROM public.job_applications;")
[ "$N" = "0" ] && ok "المدير لا يرى المتقدمين" || bad "★ رأى «$N»"

echo ""
echo "═══ ★★★ ② العطلان ⑨/⑩: FK المركَّب بدور authenticated ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.job_applications(tenant_id,posting_id,applicant_name,email)
                      VALUES ('$TA','$PB','عابر','x@y.zz');")
echo "$OUT" | grep -q "job_applications_posting_tenant_fkey" \
  && ok "طلبٌ على إعلان مستأجرٍ آخر مرفوض بـFK المركَّب" \
  || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.application_submit('$PB'::UUID,'عابر','x2@y.zz');")
echo "$OUT" | grep -q "RECRUITMENT_POSTING_NOT_FOUND" \
  && ok "والدالة ترمي رمز الحارس لا رسالة FK" || bad "★ «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★ ③ العطل ⑪: الفرادة على البريد المُطبَّع ═══"

OUT=$(as_user "$HRA" "SELECT public.application_submit('$P1'::UUID,'مكرَّر','SALEM@EXAMPLE.COM');")
echo "$OUT" | grep -q "RECRUITMENT_DUPLICATE_APPLICATION" \
  && ok "التكرار بحرفٍ كبير مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "INSERT INTO public.job_applications(tenant_id,posting_id,applicant_name,email)
                      VALUES ('$TA','$P1','مكرَّر','Salem@example.com');")
echo "$OUT" | grep -q "uq_job_applications_posting_email" \
  && ok "والفهرس الفريد يحرس المباشر" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.job_applications WHERE posting_id='$P1';")
[ "$N" = "2" ] && ok "المتقدمان اثنان لا أربعة" || bad "صاروا $N"

echo ""
echo "═══ ★★ ④ القيود تحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "UPDATE public.job_applications SET status='submitted' WHERE id='$A1';")
echo "$OUT" | grep -q "job_applications_status_chk" \
  && ok "المفردة القديمة «submitted» مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.job_postings SET status='ThIsIsGaRbAgE' WHERE id='$P1';")
echo "$OUT" | grep -q "job_postings_status_chk" \
  && ok "حالة إعلانٍ مختلقة مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.job_postings SET vacancy_count=0 WHERE id='$P1';")
echo "$OUT" | grep -q "job_postings_vacancy_chk" \
  && ok "صفر شاغر مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.job_applications SET email='ليس بريدا' WHERE id='$A1';")
echo "$OUT" | grep -q "job_applications_email_chk" \
  && ok "بريدٌ غير صالح مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★★ ⑤ العطل ①: قائمة المتقدمين تعمل بدور حقيقيّ ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.recruitment_applications('$P1'::UUID,NULL);")
[ "$N" = "2" ] && ok "القائمة تُعيد 2 (كانت ترمي: column job_id does not exist)" \
                || bad "★★★ «$N»"

N=$(as_user "$HRA" "SELECT out_email FROM public.recruitment_applications('$P1'::UUID,NULL) WHERE out_name='سالم المتقدّم';")
[ "$N" = "salem@example.com" ] && ok "والبريد مقروء (كان applicant_email معدوماً)" || bad "«$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.recruitment_applications('$P1'::UUID,NULL);")
[ "$N" = "0" ] && ok "وباء لا يقرأ متقدمي أ" || bad "★ تسريب: $N"

echo ""
echo "═══ ★★★ ⑥ العطل ⑬: التوظيف يُنشئ موظفاً بدور حقيقيّ ═══"

OUT=$(as_user "$HRA" "SELECT out_posting_status FROM public.application_hire('$A1'::UUID,'EMP-RLS-362');")
echo "$OUT" | grep -q "filled" \
  && ok "التوظيف نجح والإعلان صار filled (شاغرٌ واحد)" || bad "★ «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.employees WHERE employee_code='EMP-RLS-362';")
[ "$N" = "1" ] && ok "صفّ employees أُنشئ فعلاً" || bad "★★★ لم يُنشأ: $N"

N=$($PSQL -c "SELECT email FROM public.employees WHERE employee_code='EMP-RLS-362';")
[ "$N" = "salem@example.com" ] && ok "والبريد نُقل (employees.email كان NULL دائماً)" || bad "«$N»"

N=$($PSQL -c "SELECT status FROM public.job_postings WHERE id='$P1';")
[ "$N" = "filled" ] && ok "والإعلان أُغلق تلقائياً" || bad "الحالة «$N»"

# ★★ ولا توظيفَ فوق الشواغر
$PSQL >/dev/null 2>&1 <<SQL
UPDATE public.job_postings SET status='open' WHERE id='$P1';
SQL
OUT=$(as_user "$HRA" "SELECT out_employee_id FROM public.application_hire('$A2'::UUID,'EMP-RLS-B');")
echo "$OUT" | grep -q "RECRUITMENT_NO_VACANCY_LEFT" \
  && ok "لا توظيفَ فوق عدد الشواغر" || bad "★ «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.employees WHERE employee_code LIKE 'EMP-RLS-%';")
[ "$N" = "1" ] && ok "ولا موظّف ثانٍ أُنشئ" || bad "صاروا $N"

echo ""
echo "═══ ★★★ ⑦ الحذف ممنوع بدور authenticated ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.job_applications WHERE id='$A2';")
echo "$OUT" | grep -q "RECRUITMENT_DELETE_BLOCKED" \
  && ok "حذف الطلب يرمي" || bad "«$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "DELETE FROM public.job_postings WHERE id='$P1';")
echo "$OUT" | grep -q "RECRUITMENT_DELETE_BLOCKED" \
  && ok "حذف الإعلان يرمي" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.job_applications WHERE tenant_id='$TA';")
[ "$N" = "2" ] && ok "لا صفّ فُقد" || bad "بقي $N من 2"

echo ""
echo "═══ ⑧ الدوال وحرّاس الدور ═══"

N=$(as_user "$HRA" "SELECT out_open FROM public.recruitment_summary();")
[ "$N" = "2" ] && ok "summary/أ: مفتوحان" || bad "«$N»"

N=$(as_user "$HRB" "SELECT out_open FROM public.recruitment_summary();")
[ "$N" = "1" ] && ok "summary/ب: واحد (لم يتلوّث)" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_apps_hired FROM public.recruitment_summary();")
[ "$N" = "1" ] && ok "الموظَّفون = 1" || bad "«$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.recruitment_board(NULL,NULL,500);")
[ "$N" = "2" ] && ok "board/أ = 2" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_apps_total FROM public.recruitment_board(NULL,NULL,500) WHERE out_title='محاسب أول';")
[ "$N" = "2" ] && ok "عدّاد المتقدمين = 2 (لم يكن موجوداً)" || bad "«$N»"

OUT=$(as_user "$E1" "SELECT out_open FROM public.recruitment_summary();")
echo "$OUT" | grep -q "غير مصرَّح" && ok "الموظف محجوب عن الملخّص" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.recruitment_applications('$P1'::UUID,NULL);")
echo "$OUT" | grep -q "غير مصرَّح" && ok "الموظف محجوب عن المتقدمين" || bad "★ «$(echo "$OUT"|head -1)»"

# ★★★ كشف العكسُ INV24 أن حارس الدور في **اللوح** لم يكن مُختبَراً:
#   صنّفتُه RLS_CHECK لكن السكربت كان يفحص الملخّص والمتقدمين فقط.
OUT=$(as_user "$E1" "SELECT count(*) FROM public.recruitment_board(NULL,NULL,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن اللوح" || bad "★★★ الموظف رأى اللوح: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT count(*) FROM public.recruitment_board(NULL,NULL,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "والمدير محجوب عنه (ليس staff)" || bad "★★★ المدير رأى: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT public.job_posting_upsert(NULL,'منصبي','وصف');")
echo "$OUT" | grep -q "RECRUITMENT_NOT_AUTHORIZED" \
  && ok "المدير لا يُنشئ إعلاناً (ليس staff)" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT out_employee_id FROM public.application_hire('$A2'::UUID);")
echo "$OUT" | grep -q "RECRUITMENT_NOT_AUTHORIZED" \
  && ok "المدير لا يُوظِّف" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.job_posting_upsert('$PB'::UUID,'مُختطَف','وصف');")
echo "$OUT" | grep -q "RECRUITMENT_POSTING_NOT_FOUND" \
  && ok "HR/أ لا يُعدّل إعلان باء" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT title FROM public.job_postings WHERE id='$PB';")
[ "$N" = "إعلان باء" ] && ok "عنوان إعلان باء لم يتغيّر" || bad "صار «$N»"

echo ""
echo "═══ ⑨ anon محجوب ═══"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.job_postings;
SQL
)
echo "$OUT" | grep -qE "permission denied|^0$" \
  && ok "anon لا يقرأ الإعلانات" || bad "★★★ anon قرأ: «$(echo "$OUT"|head -1)»"

for f in "public.recruitment_summary()" \
         "public.recruitment_board(NULL,NULL,10)" \
         "public.recruitment_applications('$P1'::UUID,NULL)" \
         "public.job_posting_upsert(NULL,'x','y')" \
         "public.application_submit('$P1'::UUID,'x','a@b.cc')" \
         "public.application_hire('$A2'::UUID)"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT * FROM $f;
SQL
)
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon محجوب عن ${f%%(*}" \
    || bad "★★★ anon نفّذ ${f%%(*}: «$(echo "$OUT"|head -1)»"
done

echo ""
if [ "$FAIL" = "0" ]; then
  echo "════════════ كل فحوص RLS لـ0362 نجحت ════════════"; exit 0
else
  echo "════════════ ❌ $FAIL فحصاً فشل ════════════"; exit 1
fi
