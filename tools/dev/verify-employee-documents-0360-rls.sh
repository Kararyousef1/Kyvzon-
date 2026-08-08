#!/usr/bin/env bash
# ============================================================================
# verify-employee-documents-0360-rls.sh
#
# مستندات الموظفين عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ①: الموظف لا يقرأ وثيقته **السرّية** — عبر RLS لا عبر الدالة.
#     ② الوثائق لا تُقرأ عبر المستأجرين.
#     ③ الموظف لا يقرأ وثيقة زميله.
#     ④ العطل ⑦: محفّز منع الحذف يعمل بدور authenticated أيضاً.
#     ⑤ العطلان ②/③/④: القيود تحرس الكتابة المباشرة من المتصفّح.
#     ⑥ العطل ⑧: المحفّز يملأ uploaded_by بدور authenticated.
#     ⑦ anon محجوب.
#
#   PGPORT=5485 bash tools/dev/verify-employee-documents-0360-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5485}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3600000-0000-0000-0000-00000000000a
TB=b3600000-0000-0000-0000-00000000000b
E1=11600001-0000-0000-0000-000000000001
E2=22600002-0000-0000-0000-000000000002
HRA=33600003-0000-0000-0000-000000000003
MGRA=44600004-0000-0000-0000-000000000004
EB=66600006-0000-0000-0000-000000000006
HRB=77600007-0000-0000-0000-000000000007

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.employee_documents DISABLE TRIGGER trg_block_employee_document_delete;
DELETE FROM public.employee_documents WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.employee_documents ENABLE TRIGGER trg_block_employee_document_delete;
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$E1','$E2','$HRA','$MGRA','$EB','$HRB');
DELETE FROM auth.users      WHERE id IN ('$E1','$E2','$HRA','$MGRA','$EB','$HRB');
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
  ('$TA','A','شركة أ','a360-docs'), ('$TB','B','شركة ب','b360-docs');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a360'),('$E2','n@a360'),('$HRA','hr@a360'),
  ('$MGRA','m@a360'),('$EB','e@b360'),('$HRB','hr@b360');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$MGRA','$TA','مدير أ','manager','المالية');
INSERT INTO public.departments(tenant_id,name_ar,manager_id) VALUES
  ('$TA','المالية','$MGRA');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HRA','$TA','موارد أ','hr','الموارد'),
  ('$E1','$TA','سالم أ','employee','المالية'),
  ('$E2','$TA','ناصر أ','employee','المالية'),
  ('$HRB','$TB','موارد ب','hr','الموارد'),
  ('$EB','$TB','موظف ب','employee','المالية');
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ"; exit 1
fi

# سالم: عقد (عام) + طبّي (سرّيّ تلقائياً) · ناصر: شهادة · باء: عقد
$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.document_upload('$EMP1'::UUID,'contract','عقد سالم','http://x/c1.pdf');
SELECT public.document_upload('$EMP1'::UUID,'medical','تقرير سالم','http://x/m1.pdf');
SELECT public.document_upload('$EMP2'::UUID,'certificate','شهادة ناصر','http://x/s1.pdf');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.document_upload('$EMPB'::UUID,'contract','عقد باء','http://x/b1.pdf');
RESET request.jwt.claim.sub;
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.employee_documents WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT وثيقة (متوقَّع 4) ──"
[ "$TOT" = "4" ] || { echo "❌ العيّنة ناقصة"; exit 1; }

D_CONTRACT=$($PSQL -c "SELECT id FROM public.employee_documents WHERE title='عقد سالم';")
D_MED=$($PSQL -c "SELECT id FROM public.employee_documents WHERE title='تقرير سالم';")
D_B=$($PSQL -c "SELECT id FROM public.employee_documents WHERE title='عقد باء';")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ★★★ ① العطل ①: السرّية عبر RLS لا عبر الدالة ═══"

N=$(as_user "$E1" "SELECT count(*) FROM public.employee_documents;")
[ "$N" = "1" ] && ok "سالم يرى العقد وحده (الطبّي محجوب بـRLS)" \
                || bad "★ سالم رأى «$N» — متوقَّع 1"

N=$(as_user "$E1" "SELECT count(*) FROM public.employee_documents WHERE id='$D_MED';")
[ "$N" = "0" ] && ok "الطبّي غير مرئيّ لصاحبه" || bad "★★★ تسريب طبّي: $N"

# ★★ والصفّ موجود فعلاً (وإلا فالاختبار بلا معنى — درس التغطية)
N=$($PSQL -c "SELECT count(*) FROM public.employee_documents WHERE id='$D_MED';")
[ "$N" = "1" ] && ok "الصفّ الطبّي موجود في الجدول" || bad "الصفّ الطبّي مفقود: $N"

# ★★ ورفع السرّية عن العقد يحجبه فوراً
$PSQL >/dev/null <<SQL
SET request.jwt.claim.sub = '$HRA';
SELECT public.document_set_confidential('$D_CONTRACT'::UUID, TRUE);
SQL
N=$(as_user "$E1" "SELECT count(*) FROM public.employee_documents;")
[ "$N" = "0" ] && ok "بعد رفع السرّية سالم لا يرى شيئاً" || bad "★ سالم رأى «$N»"
$PSQL >/dev/null <<SQL
SET request.jwt.claim.sub = '$HRA';
SELECT public.document_set_confidential('$D_CONTRACT'::UUID, FALSE);
SQL

echo ""
echo "═══ ② عزل المستأجر والزملاء ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.employee_documents;")
[ "$N" = "3" ] && ok "HR/أ يرى ثلاث وثائق شركته (لا 4)" || bad "HR/أ رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_documents;")
[ "$N" = "1" ] && ok "HR/ب يرى واحدة" || bad "HR/ب رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_documents WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: $N"

N=$(as_user "$E1" "SELECT count(*) FROM public.employee_documents WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى وثيقة ناصر" || bad "★ تسريب بين الزملاء: $N"

N=$(as_user "$MGRA" "SELECT count(*) FROM public.employee_documents;")
[ "$N" = "0" ] && ok "المدير (ليس staff) لا يرى وثائق غيره" || bad "المدير رأى «$N»"

echo ""
echo "═══ ★★★ ③ العطل ⑦: الحذف ممنوع بدور authenticated ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.employee_documents WHERE id='$D_CONTRACT';")
echo "$OUT" | grep -q "DOCUMENT_DELETE_BLOCKED" \
  && ok "الحذف يرمي DOCUMENT_DELETE_BLOCKED" || bad "الحذف: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.employee_documents WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "4" ] && ok "لا صفّ فُقد" || bad "بقي $N من 4"

echo ""
echo "═══ ★★★ ④ القيود تحرس الكتابة المباشرة من المتصفّح ═══"

OUT=$(as_user "$HRA" "UPDATE public.employee_documents SET document_type='مخترع' WHERE id='$D_CONTRACT';")
echo "$OUT" | grep -q "employee_documents_type_chk" \
  && ok "النوع المخترع مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "INSERT INTO public.employee_documents(tenant_id,employee_id,document_type,title,file_url)
                      VALUES ('$TA','ffffffff-ffff-ffff-ffff-ffffffffffff','contract','ع','http://x/z.pdf');")
echo "$OUT" | grep -q "employee_documents_employee_tenant_fkey" \
  && ok "موظف معدوم مرفوض بـFK" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

# ★★★ موظف موجود لكن في مستأجر آخر — الفخّ الحقيقيّ
OUT=$(as_user "$HRA" "INSERT INTO public.employee_documents(tenant_id,employee_id,document_type,title,file_url)
                      VALUES ('$TA','$EMPB','contract','عابرة','http://x/z.pdf');")
echo "$OUT" | grep -q "employee_documents_employee_tenant_fkey" \
  && ok "موظف مستأجر آخر مرفوض بـFK المركَّب" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_documents SET title='  ' WHERE id='$D_CONTRACT';")
echo "$OUT" | grep -q "employee_documents_title_chk" \
  && ok "العنوان الفارغ مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_documents SET file_size=99999999 WHERE id='$D_CONTRACT';")
echo "$OUT" | grep -q "employee_documents_size_chk" \
  && ok "الحجم فوق 25MB مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.employee_documents WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "4" ] && ok "لا صفّ دخل مع الحرّاس الخمسة" || bad "صار $N من 4"

echo ""
echo "═══ ★★ ⑤ العطل ⑧: uploaded_by بدور authenticated ═══"

as_user "$HRA" "INSERT INTO public.employee_documents(tenant_id,employee_id,document_type,title,file_url)
                VALUES ('$TA','$EMP1','cv','سيرة سالم','http://x/cv.pdf');" >/dev/null
N=$($PSQL -c "SELECT uploaded_by FROM public.employee_documents WHERE title='سيرة سالم';")
[ "$N" = "$HRA" ] && ok "المحفّز ملأ uploaded_by = HR/أ" || bad "uploaded_by = «$N»"

# ★★ والعميل لا يستطيع انتحال رافعٍ آخر
as_user "$HRA" "INSERT INTO public.employee_documents(tenant_id,employee_id,document_type,title,file_url,uploaded_by)
                VALUES ('$TA','$EMP1','other','منتحلة','http://x/f.pdf','$MGRA');" >/dev/null
N=$($PSQL -c "SELECT uploaded_by FROM public.employee_documents WHERE title='منتحلة';")
[ "$N" = "$HRA" ] && ok "انتحال الرافع مُبطَل (HR/أ لا المدير)" || bad "★ انتُحل: «$N»"

# ★★ والطبّي يُرفع سرّياً حتى بالإدراج المباشر
as_user "$HRA" "INSERT INTO public.employee_documents(tenant_id,employee_id,document_type,title,file_url,is_confidential)
                VALUES ('$TA','$EMP1','medical','طبّي مباشر','http://x/m2.pdf',FALSE);" >/dev/null
N=$($PSQL -c "SELECT is_confidential FROM public.employee_documents WHERE title='طبّي مباشر';")
[ "$N" = "t" ] && ok "الطبّي سرّيّ رغم FALSE صريحة" || bad "★ is_confidential = «$N»"

echo ""
echo "═══ ⑥ الدوال بدور authenticated ═══"

# أ الآن: عقد · طبّي · شهادة · سيرة · منتحلة · طبّي مباشر = 6
N=$(as_user "$HRA" "SELECT out_total FROM public.employee_documents_summary();")
[ "$N" = "6" ] && ok "summary/أ = 6" || bad "summary/أ = «$N»"

N=$(as_user "$HRB" "SELECT out_total FROM public.employee_documents_summary();")
[ "$N" = "1" ] && ok "summary/ب = 1 (لم يتلوّث)" || bad "summary/ب = «$N»"

# السرّي في أ: طبّي + طبّي مباشر = 2
N=$(as_user "$HRA" "SELECT out_confidential FROM public.employee_documents_summary();")
[ "$N" = "2" ] && ok "السرّي في أ = 2 (محسوب يدوياً)" || bad "السرّي = «$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.employee_documents_board(NULL,FALSE);")
[ "$N" = "6" ] && ok "board/أ = 6" || bad "board/أ = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_documents_board(NULL,FALSE)
                     WHERE out_employee_id = '$EMP1';")
[ "$N" = "0" ] && ok "اللوح لا يُسرّب موظفي أ" || bad "★ تسريب لوح: $N"

# ★★★ سالم عبر الدالة: عقد + سيرة + منتحلة = 3 (الطبّيان محجوبان)
N=$(as_user "$E1" "SELECT count(*) FROM public.employee_documents_board(NULL,FALSE);")
[ "$N" = "3" ] && ok "سالم يرى 3 من 5 وثائقه (الطبّيان محجوبان)" || bad "سالم رأى «$N»"

echo ""
echo "═══ ⑦ حرّاس الدور ═══"

OUT=$(as_user "$E1" "SELECT out_total FROM public.employee_documents_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن summary" || bad "★ الموظف: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.document_upload('$EMP1'::UUID,'contract','ع','http://x/z.pdf');")
echo "$OUT" | grep -q "DOCUMENT_NOT_AUTHORIZED" \
  && ok "الموظف لا يرفع مستنداً" || bad "★ الموظف رفع: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT public.document_upload('$EMP1'::UUID,'contract','ع','http://x/z.pdf');")
echo "$OUT" | grep -q "DOCUMENT_NOT_AUTHORIZED" \
  && ok "المدير لا يرفع مستنداً (ليس staff)" || bad "★ المدير رفع: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.document_set_confidential('$D_CONTRACT'::UUID, TRUE);")
echo "$OUT" | grep -q "DOCUMENT_NOT_AUTHORIZED" \
  && ok "الموظف لا يضبط السرّية" || bad "★ ضبطها: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.employee_documents WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "7" ] && ok "لا صفّ دخل من الحرّاس الثلاثة" || bad "صار $N من 7"

echo ""
echo "═══ ⑧ anon محجوب ═══"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.employee_documents;
SQL
)
echo "$OUT" | grep -qE "permission denied|^0$" \
  && ok "anon لا يقرأ الوثائق" || bad "★★★ anon قرأ: «$(echo "$OUT"|head -1)»"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.employee_documents_board(NULL,FALSE);
SQL
)
echo "$OUT" | grep -q "permission denied" \
  && ok "anon محجوب عن اللوح" || bad "★★★ anon نفّذ اللوح: «$(echo "$OUT"|head -1)»"

echo ""
if [ "$FAIL" = "0" ]; then
  echo "════════════ كل فحوص RLS لـ0360 نجحت ════════════"; exit 0
else
  echo "════════════ ❌ $FAIL فحصاً فشل ════════════"; exit 1
fi
