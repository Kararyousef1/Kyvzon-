#!/usr/bin/env bash
# ============================================================================
# verify-loans-lifecycle-0355-rls.sh
#
# دورة حياة السلف عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يستطيع إثبات منطق
#   الدوال ولا يستطيع إثبات أن الجدار قائم. هذا السكربت يُثبته.
#
#   ما يحرسه هنا خصوصاً:
#     ① `loan_repayments` — صفوف التسديد لا تُقرأ عبر المستأجرين ولا
#        بين الزملاء، ولا تُكتب من المتصفّح إطلاقاً.
#     ② `authenticated` لا يملك INSERT/UPDATE/DELETE عليها رغم أن
#        ALTER DEFAULT PRIVILEGES يمنحها لكل جدول جديد (0268).
#     ③ الدوال SECURITY DEFINER تُرشِّح بالمستأجر حتى بدور authenticated.
#
#   PGPORT=5473 bash tools/dev/verify-loans-lifecycle-0355-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5473}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a5550000-0000-0000-0000-00000000000a
TB=b5550000-0000-0000-0000-00000000000b
HRA=15550001-0000-0000-0000-000000000001
EMPA=25550002-0000-0000-0000-000000000002
EMP2A=35550003-0000-0000-0000-000000000003
MGRA=45550004-0000-0000-0000-000000000004
HRB=55550005-0000-0000-0000-000000000005
EMPB=65550006-0000-0000-0000-000000000006

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
-- ★ سجلّ التسديد محميّ بمحفّز ضدّ الحذف (وهو المقصود). التنظيف
--   التقنيّ للعيّنة يُعطّله مؤقتاً بدور المالك ثم يُعيده.
ALTER TABLE public.loan_repayments DISABLE TRIGGER trg_block_loan_repayment_delete;
DELETE FROM public.loan_repayments  WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.loan_repayments ENABLE TRIGGER trg_block_loan_repayment_delete;
DELETE FROM public.hr_approval_steps
  WHERE request_id IN (SELECT id FROM public.hr_approval_requests
                        WHERE tenant_id IN ('$TA','$TB'));
DELETE FROM public.hr_approval_requests WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_loans   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.approval_rules   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.payroll_records  WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.payroll_periods  WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees        WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments      WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$EMPA','$EMP2A','$MGRA','$HRB','$EMPB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$EMPA','$EMP2A','$MGRA','$HRB','$EMPB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.profiles WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ. أوقف."
  exit 1
fi

# ══════════════════════ العيّنة ══════════════════════
$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','شركة أ','a555-loans'), ('$TB','B','شركة ب','b555-loans');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','hr@a555'),('$EMPA','e1@a555'),('$EMP2A','e2@a555'),
  ('$MGRA','m@a555'),('$HRB','hr@b555'),('$EMPB','e@b555');

-- المدير أولاً (departments.manager_id → profiles)
INSERT INTO public.profiles(id,tenant_id,full_name,role,department,salary) VALUES
  ('$MGRA','$TA','مدير أ','manager','المالية',3000000);
INSERT INTO public.departments(tenant_id,name_ar,manager_id) VALUES
  ('$TA','المالية','$MGRA');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department,salary) VALUES
  ('$HRA','$TA','موارد أ','hr','الموارد',1500000),
  ('$EMPA','$TA','سالم أ','employee','المالية',1000000),
  ('$EMP2A','$TA','ناصر أ','employee','المالية',1200000),
  ('$HRB','$TB','موارد ب','hr','الموارد',1500000),
  ('$EMPB','$TB','موظف ب','employee','المالية',1000000);
SQL

E1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EMPA';")
E2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EMP2A';")
EB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EMPB';")

if [ -z "$E1" ] || [ -z "$E2" ] || [ -z "$EB" ]; then
  echo "❌ صفوف employees لم تُنشأ (E1=$E1 E2=$E2 EB=$EB)"; exit 1
fi

# سلفة لكل من سالم وناصر في أ، وواحدة في ب — كلّها معتمَدة بتسديد واحد.
$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.loan_create('$E1'::UUID, 1200000, 12, 'سلفة سالم', DATE '2026-01-01');
SELECT public.loan_create('$E2'::UUID,  600000,  6, 'سلفة ناصر', DATE '2026-01-01');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.loan_create('$EB'::UUID,  900000,  9, 'سلفة ب',    DATE '2026-01-01');
RESET request.jwt.claim.sub;
SQL

# الاعتماد والتسديد بدور postgres (المدير في السلسلة)
$PSQL <<SQL >/dev/null
SET kyvzon.approval_sync = 'true';
UPDATE public.employee_loans SET status='approved', remaining_amount=amount;
SET kyvzon.approval_sync = 'false';
UPDATE public.hr_approval_steps SET status='approved' WHERE status IN ('pending','active');
SET request.jwt.claim.sub = '$HRA';
SELECT public.loan_apply_repayment(
  (SELECT id FROM public.employee_loans WHERE employee_id='$E1'), NULL, NULL, 'manual');
SELECT public.loan_apply_repayment(
  (SELECT id FROM public.employee_loans WHERE employee_id='$E2'), NULL, NULL, 'manual');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.loan_apply_repayment(
  (SELECT id FROM public.employee_loans WHERE employee_id='$EB'), NULL, NULL, 'manual');
RESET request.jwt.claim.sub;
SQL

TOTAL_REPAY=$($PSQL -c "SELECT count(*) FROM public.loan_repayments;")
echo "── العيّنة: $TOTAL_REPAY صفّ تسديد (متوقَّع 3) ──"
[ "$TOTAL_REPAY" = "3" ] || { echo "❌ العيّنة ناقصة"; exit 1; }

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① loan_repayments — القراءة عبر RLS ═══"

# HR في أ يرى تسديدَي شركته لا تسديد ب
N=$(as_user "$HRA" "SELECT count(*) FROM public.loan_repayments;")
[ "$N" = "2" ] && ok "HR/أ يرى صفّين (لا 3)" || bad "HR/أ رأى «$N» — متوقَّع 2"

N=$(as_user "$HRB" "SELECT count(*) FROM public.loan_repayments;")
[ "$N" = "1" ] && ok "HR/ب يرى صفّاً واحداً" || bad "HR/ب رأى «$N» — متوقَّع 1"

# ★★★ التسريب عبر المستأجرين: صفر مطلق
N=$(as_user "$HRB" "SELECT count(*) FROM public.loan_repayments WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: HR/ب رأى $N صفّاً من أ"

# الموظف يرى تسديده هو وحده
N=$(as_user "$EMPA" "SELECT count(*) FROM public.loan_repayments;")
[ "$N" = "1" ] && ok "سالم يرى تسديده وحده" || bad "سالم رأى «$N» — متوقَّع 1"

N=$(as_user "$EMPA" "SELECT count(*) FROM public.loan_repayments WHERE employee_id='$E2';")
[ "$N" = "0" ] && ok "سالم لا يرى تسديد ناصر" || bad "★ تسريب بين الزملاء: $N"

# المدير ليس staff — يرى تسديده هو (ولا سلفة له ⇒ صفر)
N=$(as_user "$MGRA" "SELECT count(*) FROM public.loan_repayments;")
[ "$N" = "0" ] && ok "المدير (ليس staff) لا يرى تسديدات غيره" || bad "المدير رأى «$N»"

echo ""
echo "═══ ② الكتابة من المتصفّح — ممنوعة بطبقتين ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.loan_repayments
  (tenant_id,loan_id,employee_id,amount,installment_no,remaining_after)
  SELECT '$TA', id, '$E1', 999, 99, 0 FROM public.employee_loans
   WHERE employee_id='$E1';")
echo "$OUT" | grep -qi "permission denied" \
  && ok "INSERT مرفوض بالصلاحية (لا بـRLS وحدها)" \
  || bad "INSERT: «$(echo "$OUT" | head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.loan_repayments SET amount = 1;")
echo "$OUT" | grep -qi "permission denied" \
  && ok "UPDATE مرفوض" || bad "UPDATE: «$(echo "$OUT" | head -1)»"

OUT=$(as_user "$HRA" "DELETE FROM public.loan_repayments;")
echo "$OUT" | grep -qi "permission denied" \
  && ok "DELETE مرفوض بالصلاحية" || bad "DELETE: «$(echo "$OUT" | head -1)»"

# ★ ولو مُنحت الصلاحية، المحفّز يحرس الحذف
OUT=$($PSQL -c "DELETE FROM public.loan_repayments WHERE tenant_id='$TA';" 2>&1)
echo "$OUT" | grep -q "LOAN_REPAYMENT_IMMUTABLE" \
  && ok "المحفّز يمنع الحذف حتى بدور postgres" \
  || bad "الحذف بدور postgres: «$(echo "$OUT" | head -1)»"

echo ""
echo "═══ ③ الدوال بدور authenticated ═══"

N=$(as_user "$HRA" "SELECT out_total FROM public.loan_summary();")
[ "$N" = "2" ] && ok "loan_summary/أ = 2" || bad "loan_summary/أ = «$N»"

N=$(as_user "$HRB" "SELECT out_total FROM public.loan_summary();")
[ "$N" = "1" ] && ok "loan_summary/ب = 1" || bad "loan_summary/ب = «$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.loan_board(NULL,500);")
[ "$N" = "2" ] && ok "loan_board/أ = 2" || bad "loan_board/أ = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.loan_board(NULL,500)
                     WHERE out_employee_id = '$E1';")
[ "$N" = "0" ] && ok "loan_board لا يُسرّب موظفي أ إلى ب" || bad "★ تسريب لوحة: $N"

OUT=$(as_user "$EMPA" "SELECT out_total FROM public.loan_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يستدعي loan_summary" || bad "الموظف: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$EMPA" "SELECT count(*) FROM public.loan_board(NULL,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يستدعي loan_board" || bad "الموظف/board: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$EMPA" "SELECT public.loan_create('$E1'::UUID,50000,5,'ذاتيّ');")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يُنشئ سلفة لنفسه" || bad "★ الموظف أنشأ: «$(echo "$OUT"|head -1)»"

L1=$($PSQL -c "SELECT id FROM public.employee_loans WHERE employee_id='$E1';")
OUT=$(as_user "$HRB" "SELECT public.loan_decide('$L1'::UUID,'approved');")
echo "$OUT" | grep -q "غير موجودة في هذا المستأجر" \
  && ok "HR/ب لا يبتّ في سلفة أ" || bad "★ بتّ عبر الحدود: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRB" "SELECT public.loan_apply_repayment('$L1'::UUID,NULL,NULL,'manual');")
echo "$OUT" | grep -q "غير موجودة في هذا المستأجر" \
  && ok "HR/ب لا يُسدّد سلفة أ" || bad "★ تسديد عبر الحدود: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ④ سجلّ سلفة واحدة ═══"

N=$(as_user "$EMPA" "SELECT count(*) FROM public.loan_repayment_history('$L1'::UUID);")
[ "$N" = "1" ] && ok "سالم يرى سجلّ سلفته" || bad "سالم/history = «$N»"

OUT=$(as_user "$EMP2A" "SELECT count(*) FROM public.loan_repayment_history('$L1'::UUID);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "ناصر لا يرى سجلّ سالم" || bad "★ تسريب سجلّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRB" "SELECT count(*) FROM public.loan_repayment_history('$L1'::UUID);")
echo "$OUT" | grep -q "غير موجودة في هذا المستأجر" \
  && ok "HR/ب لا يرى سجلّ سلفة أ" || bad "★ تسريب سجلّ عبر الحدود: «$(echo "$OUT"|head -1)»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.loan_repayment_history('$L1'::UUID);")
[ "$N" = "1" ] && ok "HR/أ يرى سجلّ موظفيه" || bad "HR/أ/history = «$N»"

echo ""
echo "═══ ⑤ anon ═══"

anon_q() { $PSQL <<SQL 2>&1
SET ROLE anon;
$1
SQL
}

OUT=$(anon_q "SELECT count(*) FROM public.loan_repayments;")
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon لا يقرأ loan_repayments" || bad "★ anon قرأ: «$(echo "$OUT"|head -1)»"

for f in "public.loan_summary()" "public.loan_board(NULL,10)" \
         "public.loan_create('$E1'::UUID,1,1,'x')" \
         "public.loan_decide('$L1'::UUID,'approved')" \
         "public.loan_apply_repayment('$L1'::UUID,NULL,NULL,'manual')" \
         "public.loan_repayment_history('$L1'::UUID)"; do
  OUT=$(anon_q "SELECT * FROM $f;")
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon محجوب عن ${f%%(*}" \
    || bad "★ anon نفّذ ${f%%(*}: «$(echo "$OUT"|head -1)»"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 0355 RLS — كل الفحوص مرّت"
else
  echo "❌ 0355 RLS — $FAIL فشلاً"
fi
exit "$FAIL"
