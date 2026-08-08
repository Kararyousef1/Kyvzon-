#!/usr/bin/env bash
# ============================================================================
# verify-expense-lifecycle-0363-rls.sh
#
# دورة حياة النفقات عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ⑰: الموظف يُقدّم نفقته رغم أن سياسة INSERT تشترط staff.
#     ② الموظف يرى نفقاته وحدها ولا يرى نفقات زميله.
#     ③ العطلان ③/④: FK المركَّب يحرس الكتابة المباشرة.
#     ④ العطلان ⑧/⑨: القيود تمنع رفضاً بلا سبب ومعتمَداً بلا معتمِد.
#     ⑤ العطل ⑩: expense_mark_paid يعمل بدور حقيقيّ.
#     ⑥ العطل ⑫: منع الحذف بدور authenticated.
#     ⑦ العطل ①: expense_chain_state يكشف المجمَّد.
#     ⑧ anon محجوب.
#
#   PGPORT=5494 bash tools/dev/verify-expense-lifecycle-0363-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5494}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3630000-0000-0000-0000-00000000000a
TB=b3630000-0000-0000-0000-00000000000b
E1=11630001-0000-0000-0000-000000000001
E2=22630002-0000-0000-0000-000000000002
HRA=33630003-0000-0000-0000-000000000003
MGRA=44630004-0000-0000-0000-000000000004
EB=66630006-0000-0000-0000-000000000006
HRB=77630007-0000-0000-0000-000000000007

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.expense_requests DISABLE TRIGGER trg_block_expense_delete;
DELETE FROM public.hr_approval_steps s USING public.hr_approval_requests r
 WHERE r.id = s.request_id AND r.tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_requests WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.expense_requests WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.expense_requests ENABLE TRIGGER trg_block_expense_delete;
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
  ('$TA','A','شركة أ','a363-exp'), ('$TB','B','شركة ب','b363-exp');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a363'),('$E2','n@a363'),('$HRA','hr@a363'),
  ('$MGRA','m@a363'),('$EB','e@b363'),('$HRB','hr@b363');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$MGRA','$TA','منير المدير','manager','المالية');
INSERT INTO public.departments(tenant_id,name_ar,manager_id) VALUES
  ('$TA','المالية','$MGRA');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HRA','$TA','موارد أ','hr','الموارد'),
  ('$E1','$TA','سالم الأول','employee','المالية'),
  ('$E2','$TA','ناصر الثاني','employee','المالية'),
  ('$HRB','$TB','موارد ب','hr','الموارد'),
  ('$EB','$TB','موظف ب','employee','المالية');
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ"; exit 1
fi

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ★★★ ① العطل ⑰: الموظف يُقدّم نفقته بدور authenticated ═══"

# ★★★ سياسة INSERT: tenant AND current_user_is_staff() ⇒ الإدراج
#   المباشر من الموظف ممنوع. والدالة SECURITY DEFINER تتجاوزها.
OUT=$(as_user "$E1" "INSERT INTO public.expense_requests(tenant_id,employee_id,title,description,amount)
                     VALUES ('$TA','$EMP1','مباشر','وصف',1000);")
echo "$OUT" | grep -qiE "policy|denied" \
  && ok "الإدراج المباشر من الموظف مرفوض بالسياسة" \
  || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.expense_submit('سفر بغداد','مهمة',500000,'travel',NULL,'http://x/r.pdf');")
echo "$OUT" | grep -qE "^[0-9a-f-]{36}$" \
  && ok "★★★ لكن expense_submit تنجح (SECURITY DEFINER)" \
  || bad "★★★ فشلت: «$(echo "$OUT"|head -1)»"

X1=$($PSQL -c "SELECT id FROM public.expense_requests WHERE title='سفر بغداد';")
[ -n "$X1" ] && ok "والصفّ موجود فعلاً" || bad "لم يُنشأ"

N=$($PSQL -c "SELECT employee_id FROM public.expense_requests WHERE id='$X1';")
[ "$N" = "$EMP1" ] && ok "ومنسوبٌ لسالم لا لغيره" || bad "منسوبٌ لـ«$N»"

OUT=$(as_user "$E1" "SELECT public.expense_submit('باسم ناصر','وصف',1000,'general',NULL,NULL,'$EMP2');")
echo "$OUT" | grep -q "EXPENSE_NOT_AUTHORIZED" \
  && ok "ولا يُقدّم باسم زميله" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

# staff يُقدّم نيابةً
$PSQL >/dev/null <<SQL
SET request.jwt.claim.sub = '$HRA';
SELECT public.expense_submit('وجبات','ضيافة',75000,'meals',NULL,NULL,'$EMP2');
SQL
X2=$($PSQL -c "SELECT id FROM public.expense_requests WHERE title='وجبات';")
[ -n "$X2" ] && ok "و staff يُقدّم نيابةً" || bad "فشل"

echo ""
echo "═══ ② الرؤية عبر RLS ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.expense_requests;")
[ "$N" = "2" ] && ok "HR/أ يرى النفقتين" || bad "HR/أ رأى «$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.expense_requests;")
[ "$N" = "1" ] && ok "سالم يرى نفقته وحدها" || bad "سالم رأى «$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.expense_requests WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "ولا يرى نفقة ناصر" || bad "★ تسريب بين الزملاء: $N"

N=$(as_user "$MGRA" "SELECT count(*) FROM public.expense_requests;")
[ "$N" = "0" ] && ok "المدير (ليس staff) لا يرى شيئاً" || bad "المدير رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.expense_requests;")
[ "$N" = "0" ] && ok "HR/ب لا يرى نفقات أ" || bad "★ تسريب: $N"

echo ""
echo "═══ ★★★ ③ العطلان ③/④: FK المركَّب بدور authenticated ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.expense_requests(tenant_id,employee_id,title,description,amount)
                      VALUES ('$TA','ffffffff-ffff-ffff-ffff-ffffffffffff','معدوم','و',1000);")
echo "$OUT" | grep -q "expense_requests_employee_tenant_fkey" \
  && ok "موظفٌ معدوم مرفوض بـFK" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "INSERT INTO public.expense_requests(tenant_id,employee_id,title,description,amount)
                      VALUES ('$TA','$EMPB','عابرة','و',1000);")
echo "$OUT" | grep -q "expense_requests_employee_tenant_fkey" \
  && ok "موظفٌ من مستأجر آخر مرفوض بـFK المركَّب" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.expense_submit('عابرة2','و',1000,'general',NULL,NULL,'$EMPB');")
echo "$OUT" | grep -q "EXPENSE_EMPLOYEE_NOT_FOUND" \
  && ok "والدالة ترمي رمز الحارس لا رسالة FK" || bad "★ «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★ ④ القيود تحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "UPDATE public.expense_requests SET amount=-5 WHERE id='$X1';")
echo "$OUT" | grep -q "expense_requests_amount_chk" \
  && ok "المبلغ السالب مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.expense_requests SET category='مخترعة' WHERE id='$X1';")
echo "$OUT" | grep -q "expense_requests_category_chk" \
  && ok "الفئة المختلقة مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

# ★★★ العطل ⑧: رفضٌ بلا سبب
OUT=$(as_user "$HRA" "UPDATE public.expense_requests SET status='rejected' WHERE id='$X1';")
echo "$OUT" | grep -q "expense_requests_rejection_chk" \
  && ok "★ الرفض بلا سبب مرفوض بنيوياً" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT status FROM public.expense_requests WHERE id='$X1';")
[ "$N" = "pending" ] && ok "والحالة لم تتغيّر" || bad "صارت «$N»"

echo ""
echo "═══ ★★★ ⑤ العطل ⑨: المحفّز يملأ المعتمِد والوقت ═══"

OUT=$(as_user "$HRA" "SELECT public.expense_decide('$X1'::UUID,'approved');")
echo "$OUT" | grep -q "approved" && ok "الاعتماد نجح" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT approved_by FROM public.expense_requests WHERE id='$X1';")
[ "$N" = "$HRA" ] && ok "approved_by = HR/أ (كان فارغاً دائماً)" || bad "«$N»"

N=$($PSQL -c "SELECT (approved_at IS NOT NULL) FROM public.expense_requests WHERE id='$X1';")
[ "$N" = "t" ] && ok "وapproved_at امتلأ" || bad "فارغ"

echo ""
echo "═══ ★★★ ⑥ العطل ⑩: الصرف الذي لم يكن موجوداً ═══"

OUT=$(as_user "$HRA" "SELECT public.expense_mark_paid('$X2'::UUID);")
echo "$OUT" | grep -q "EXPENSE_NOT_APPROVED" \
  && ok "لا صرفَ لغير المعتمَد" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.expense_mark_paid('$X1'::UUID);")
echo "$OUT" | grep -q "paid" && ok "الصرف نجح" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT (paid_at IS NOT NULL) FROM public.expense_requests WHERE id='$X1';")
[ "$N" = "t" ] && ok "paid_at امتلأ (كان عموداً ميتاً)" || bad "فارغ"

OUT=$(as_user "$HRA" "SELECT public.expense_decide('$X1'::UUID,'rejected','تراجع');")
echo "$OUT" | grep -q "EXPENSE_ALREADY_PAID" \
  && ok "والمدفوع لا يُنقَض" || bad "★ «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★★ ⑦ العطل ⑫: الحذف ممنوع ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.expense_requests WHERE id='$X1';")
echo "$OUT" | grep -q "EXPENSE_DELETE_BLOCKED" \
  && ok "الحذف يرمي EXPENSE_DELETE_BLOCKED" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.expense_requests WHERE tenant_id='$TA';")
[ "$N" = "2" ] && ok "لا صفّ فُقد" || bad "بقي $N من 2"

echo ""
echo "═══ ★★★ ⑧ العطل ①: كشف الطلب المجمَّد ═══"

# ★★★ ناصر بلا قسم ⇒ لا قواعد ولا مسار احتياطيّ ⇒ صفر خطوة
$PSQL >/dev/null <<SQL
UPDATE public.employees SET department_id=NULL WHERE id='$EMP2';
SET request.jwt.claim.sub = '$HRA';
SELECT public.create_financial_request_approval('expense','$X2'::UUID,'$EMP2'::UUID,75000);
SQL

N=$(as_user "$HRA" "SELECT out_total_steps FROM public.expense_chain_state('$X2'::UUID);")
[ "$N" = "0" ] && ok "طلبٌ بصفر خطوة (موظفٌ بلا قسم)" || bad "«$N» خطوة"

N=$(as_user "$HRA" "SELECT out_is_stalled FROM public.expense_chain_state('$X2'::UUID);")
[ "$N" = "t" ] && ok "★★★ مُكتشَفٌ كمجمَّد" || bad "is_stalled = «$N»"

N=$(as_user "$HRA" "SELECT out_stalled FROM public.expense_summary();")
[ "$N" = "1" ] && ok "والملخّص يعدّه" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_is_stalled FROM public.expense_board(NULL,NULL,500) WHERE out_id='$X2';")
[ "$N" = "t" ] && ok "واللوح يكشفه" || bad "«$N»"

# ★★★ تصحيحٌ لتوقّعي: ظننتُ `expense_requests_approved_chk` سيمنع
#   `UPDATE status='approved'` المباشر. **خطأ**: محفّزي `tg_expense_stamp`
#   يملأ `approved_by/at` **قبل** فحص القيد فيُرضيه — وهذا سلوكٌ مقصود
#   (العطل ⑨ يُصلَح بالملء لا بالمنع). الحارس القديم صامتٌ كذلك (صفر
#   خطوة). ⇒ المسار المباشر يبقى مفتوحاً على مستوى SQL الخام،
#   والحماية الحقيقية أن **الصفحة والطبقة لا تستعملانه إطلاقاً**
#   (يحرسه اختبار العقد) وأن `expense_decide` هي المدخل الوحيد.
OUT=$(as_user "$HRA" "UPDATE public.expense_requests SET status='approved' WHERE id='$X2';")
if echo "$OUT" | grep -qE "ERROR"; then
  bad "UPDATE المباشر رمى بخلاف المتوقَّع: «$(echo "$OUT"|head -1)»"
else
  ok "★ UPDATE المباشر يمرّ — لكن المحفّز يملأ المعتمِد فلا يضيع الأثر"
  N=$($PSQL -c "SELECT approved_by FROM public.expense_requests WHERE id='$X2';")
  [ "$N" = "$HRA" ] && ok "★★ approved_by سُجّل رغم الكتابة الخام" \
                    || bad "★★★ ضاع المعتمِد: «$N»"
fi
# استرجاع للفحوص التالية
$PSQL >/dev/null <<SQL
UPDATE public.expense_requests SET status='pending', approved_by=NULL, approved_at=NULL
 WHERE id='$X2';
SQL

echo ""
echo "═══ ⑨ اللوح والملخّص وحرّاس الدور ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.expense_board(NULL,NULL,500);")
[ "$N" = "2" ] && ok "board/أ = 2" || bad "«$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.expense_board(NULL,NULL,500);")
[ "$N" = "1" ] && ok "وسالم يرى نفقته وحدها في اللوح" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_employee_name FROM public.expense_board(NULL,NULL,500) WHERE out_id='$X1';")
[ "$N" = "سالم الأول" ] && ok "الاسم من الاحتياطيّ (full_name_ar فارغ)" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_approver_name FROM public.expense_board(NULL,NULL,500) WHERE out_id='$X1';")
[ "$N" = "موارد أ" ] && ok "واسم المعتمِد" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_amt_paid FROM public.expense_summary();")
[ "$N" = "500000.00" ] && ok "مبلغ المدفوع = 500000.00 (محسوب يدوياً)" || bad "«$N»"

N=$(as_user "$HRB" "SELECT out_total FROM public.expense_summary();")
[ "$N" = "0" ] && ok "ملخّص ب = 0 (لم يتلوّث)" || bad "«$N»"

OUT=$(as_user "$E1" "SELECT out_total FROM public.expense_summary();")
echo "$OUT" | grep -q "غير مصرَّح" && ok "الموظف محجوب عن الملخّص" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.expense_decide('$X2'::UUID,'approved');")
echo "$OUT" | grep -q "EXPENSE_NOT_AUTHORIZED" \
  && ok "الموظف لا يعتمد" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT public.expense_mark_paid('$X2'::UUID);")
echo "$OUT" | grep -q "EXPENSE_NOT_AUTHORIZED" \
  && ok "والمدير لا يصرف (ليس staff)" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRB" "SELECT public.expense_decide('$X2'::UUID,'rejected','عابر');")
echo "$OUT" | grep -q "EXPENSE_NOT_FOUND" \
  && ok "HR/ب لا يبتّ في نفقة أ" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT status FROM public.expense_requests WHERE id='$X2';")
[ "$N" = "pending" ] && ok "وحالتها لم تتغيّر" || bad "صارت «$N»"

echo ""
echo "═══ ⑩ anon محجوب ═══"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.expense_requests;
SQL
)
echo "$OUT" | grep -qE "permission denied|^0$" \
  && ok "anon لا يقرأ النفقات" || bad "★★★ anon قرأ: «$(echo "$OUT"|head -1)»"

for f in "public.expense_summary()" \
         "public.expense_board(NULL,NULL,10)" \
         "public.expense_chain_state('$X1'::UUID)" \
         "public.expense_submit('x','y',100,'general')" \
         "public.expense_decide('$X2'::UUID,'approved')" \
         "public.expense_mark_paid('$X2'::UUID)"; do
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
  echo "════════════ كل فحوص RLS لـ0363 نجحت ════════════"; exit 0
else
  echo "════════════ ❌ $FAIL فحصاً فشل ════════════"; exit 1
fi
