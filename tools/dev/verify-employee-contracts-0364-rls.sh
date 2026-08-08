#!/usr/bin/env bash
# ============================================================================
# verify-employee-contracts-0364-rls.sh
#
# عقود الموظفين عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ①: الموظف يرى عقده عبر current_user_employee_id
#        **بعد** إسقاط الشرط الميّت `employee_id = auth.uid()`.
#     ② العقود لا تُقرأ عبر المستأجرين ولا بين الزملاء.
#     ③ العطلان ②/③: FK المركَّب يحرس الكتابة المباشرة.
#     ④ العطل ⑤: الفهرس الفريد يمنع عقدَين نشطَين.
#     ⑤ العطلان ④/⑥/⑧/⑨/⑫: القيود تحرس الكتابة المباشرة.
#     ⑥ العطل ⑩: منع الحذف بدور authenticated.
#     ⑦ العطلان ⑦/⑪: الترحيل والتجديد بدور حقيقيّ.
#     ⑧ anon محجوب.
#
#   PGPORT=5497 bash tools/dev/verify-employee-contracts-0364-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5497}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3640000-0000-0000-0000-00000000000a
TB=b3640000-0000-0000-0000-00000000000b
E1=11640001-0000-0000-0000-000000000001
E2=22640002-0000-0000-0000-000000000002
HRA=33640003-0000-0000-0000-000000000003
MGRA=44640004-0000-0000-0000-000000000004
EB=66640006-0000-0000-0000-000000000006
HRB=77640007-0000-0000-0000-000000000007

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.employee_contracts DISABLE TRIGGER trg_block_employee_contract_delete;
DELETE FROM public.employee_contracts WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.employee_contracts ENABLE TRIGGER trg_block_employee_contract_delete;
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
  ('$TA','A','شركة أ','a364-ctr'), ('$TB','B','شركة ب','b364-ctr');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a364'),('$E2','n@a364'),('$HRA','hr@a364'),
  ('$MGRA','m@a364'),('$EB','e@b364'),('$HRB','hr@b364');
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

TODAY=$($PSQL -c "SELECT (now() AT TIME ZONE 'Asia/Baghdad')::DATE;")

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.contract_upsert(NULL,'$EMP1'::UUID,'permanent','CT-A1','مهندس',
  (DATE '$TODAY' - 100), NULL, 30, 1500000, 'IQD');
SELECT public.contract_upsert(NULL,'$EMP2'::UUID,'fixed_term','CT-A2','محاسب',
  (DATE '$TODAY' - 300), (DATE '$TODAY' + 20), 30, 900000, 'IQD');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.contract_upsert(NULL,'$EMPB'::UUID,'permanent','CT-B1');
RESET request.jwt.claim.sub;
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.employee_contracts WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT عقد (متوقَّع 3) ──"
[ "$TOT" = "3" ] || { echo "❌ العيّنة ناقصة"; exit 1; }
C1=$($PSQL -c "SELECT id FROM public.employee_contracts WHERE contract_number='CT-A1';")
C2=$($PSQL -c "SELECT id FROM public.employee_contracts WHERE contract_number='CT-A2';")
CB=$($PSQL -c "SELECT id FROM public.employee_contracts WHERE contract_number='CT-B1';")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ★★★ ① العطل ①: الموظف يرى عقده رغم إسقاط الشرط الميّت ═══"

# ★★★ الشرط المُسقَط `employee_id = auth.uid()` كان ميّتاً — والشرط
#   الباقي `current_user_employee_id()` هو الذي يعمل فعلاً.
N=$(as_user "$E1" "SELECT count(*) FROM public.employee_contracts;")
[ "$N" = "1" ] && ok "★ سالم يرى عقده (current_user_employee_id يعمل)" \
                || bad "★★★ سالم رأى «$N» — الشرط الباقي معطوب!"

N=$(as_user "$E1" "SELECT contract_number FROM public.employee_contracts;")
[ "$N" = "CT-A1" ] && ok "وهو عقده هو" || bad "«$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.employee_contracts WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "ولا يرى عقد ناصر" || bad "★ تسريب بين الزملاء: $N"

# ★★ وإثبات أن الشرط المُسقَط كان ميّتاً: auth.uid() لا يطابق employees.id
N=$($PSQL -c "SELECT count(*) FROM public.employees WHERE id = user_id;")
[ "$N" = "0" ] && ok "★★ صفر صفّ حيث employees.id = user_id" || bad "«$N»"

echo ""
echo "═══ ② عزل المستأجر ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.employee_contracts;")
[ "$N" = "2" ] && ok "HR/أ يرى عقدَي شركته (لا 3)" || bad "HR/أ رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_contracts;")
[ "$N" = "1" ] && ok "HR/ب يرى واحداً" || bad "HR/ب رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_contracts WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: $N"

N=$(as_user "$MGRA" "SELECT count(*) FROM public.employee_contracts;")
[ "$N" = "0" ] && ok "المدير (ليس staff ولا صاحب عقد) لا يرى" || bad "المدير رأى «$N»"

echo ""
echo "═══ ★★★ ③ العطلان ②/③: FK المركَّب بدور authenticated ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.employee_contracts(tenant_id,employee_id,contract_type,start_date)
                      VALUES ('$TA','ffffffff-ffff-ffff-ffff-ffffffffffff','permanent',CURRENT_DATE);")
echo "$OUT" | grep -q "employee_contracts_employee_tenant_fkey" \
  && ok "موظفٌ معدوم مرفوض بـFK" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "INSERT INTO public.employee_contracts(tenant_id,employee_id,contract_type,start_date)
                      VALUES ('$TA','$EMPB','permanent',CURRENT_DATE);")
echo "$OUT" | grep -q "employee_contracts_employee_tenant_fkey" \
  && ok "موظفٌ من مستأجر آخر مرفوض بـFK المركَّب" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.contract_upsert(NULL,'$EMPB'::UUID,'permanent');")
echo "$OUT" | grep -q "CONTRACT_EMPLOYEE_NOT_FOUND" \
  && ok "والدالة ترمي رمز الحارس لا رسالة FK" || bad "★ «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★★ ④ العطل ⑤: عقدٌ نشطٌ واحد لكل موظف ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.employee_contracts(tenant_id,employee_id,contract_type,start_date,status)
                      VALUES ('$TA','$EMP1','consultant',CURRENT_DATE,'active');")
echo "$OUT" | grep -q "uq_employee_contracts_one_active" \
  && ok "الفهرس الفريد يمنع عقدَين نشطَين" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.contract_upsert(NULL,'$EMP1'::UUID,'consultant',NULL,NULL,CURRENT_DATE,CURRENT_DATE+100);")
echo "$OUT" | grep -q "CONTRACT_ACTIVE_EXISTS" \
  && ok "والدالة ترمي رمزاً مفهوماً قبله" || bad "★ «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★ ⑤ القيود تحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "UPDATE public.employee_contracts SET end_date=start_date-10 WHERE id='$C2';")
echo "$OUT" | grep -q "employee_contracts_dates_chk" \
  && ok "نهايةٌ قبل بداية مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_contracts SET end_date=NULL WHERE id='$C2';")
echo "$OUT" | grep -q "employee_contracts_term_chk" \
  && ok "محدد المدة بلا نهاية مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_contracts SET renewal_notice_days=0 WHERE id='$C1';")
echo "$OUT" | grep -q "employee_contracts_notice_chk" \
  && ok "تنبيهٌ صفرٌ مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_contracts SET salary_amount=-1 WHERE id='$C1';")
echo "$OUT" | grep -q "employee_contracts_salary_chk" \
  && ok "راتبٌ سالب مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_contracts SET salary_currency='XYZ' WHERE id='$C1';")
echo "$OUT" | grep -q "employee_contracts_currency_chk" \
  && ok "عملةٌ مختلقة مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

# ★★★ العطل ⑫: الإنهاء بلا سبب
OUT=$(as_user "$HRA" "UPDATE public.employee_contracts SET status='terminated' WHERE id='$C1';")
echo "$OUT" | grep -q "employee_contracts_termination_chk" \
  && ok "★ إنهاءٌ بلا سبب مرفوض بنيوياً" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT status FROM public.employee_contracts WHERE id='$C1';")
[ "$N" = "active" ] && ok "والحالة لم تتغيّر" || bad "صارت «$N»"

echo ""
echo "═══ ★★★ ⑥ العطل ⑩: الحذف ممنوع ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.employee_contracts WHERE id='$C1';")
echo "$OUT" | grep -q "CONTRACT_DELETE_BLOCKED" \
  && ok "الحذف يرمي CONTRACT_DELETE_BLOCKED" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.employee_contracts WHERE tenant_id='$TA';")
[ "$N" = "2" ] && ok "لا صفّ فُقد" || bad "بقي $N من 2"

echo ""
echo "═══ ★★★ ⑦ العطلان ⑦/⑪: الترحيل والتجديد بدور حقيقيّ ═══"

# ★ المحفّز يملأ created_by
N=$($PSQL -c "SELECT created_by FROM public.employee_contracts WHERE id='$C1';")
[ "$N" = "$HRA" ] && ok "created_by = HR/أ (لم يكن يُملأ)" || bad "«$N»"

# ★★★ التجديد يُنشئ عقداً جديداً ويحفظ السلسلة
OUT=$(as_user "$HRA" "SELECT public.contract_renew('$C2'::UUID, (DATE '$TODAY' + 400), 1100000, 'CT-A2-R1');")
echo "$OUT" | grep -qE "^[0-9a-f-]{36}$" && ok "التجديد نجح" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT status FROM public.employee_contracts WHERE id='$C2';")
[ "$N" = "renewed" ] && ok "القديم صار renewed لا مكتوباً فوقه" || bad "«$N»"

N=$($PSQL -c "SELECT renewal_count FROM public.employee_contracts WHERE contract_number='CT-A2-R1';")
[ "$N" = "1" ] && ok "والجديد renewal_count = 1" || bad "«$N»"

N=$($PSQL -c "SELECT (renewed_from = '$C2') FROM public.employee_contracts WHERE contract_number='CT-A2-R1';")
[ "$N" = "t" ] && ok "و renewed_from يشير للقديم" || bad "«$N»"

N=$($PSQL -c "SELECT count(*) FROM public.employee_contracts WHERE employee_id='$EMP2' AND status='active';")
[ "$N" = "1" ] && ok "وعقدٌ نشطٌ واحد لناصر" || bad "«$N»"

# ★★★ الترحيل: عقدٌ «نشط» انتهى
$PSQL >/dev/null <<SQL
UPDATE public.employee_contracts SET status='draft' WHERE contract_number='CT-A2-R1';
INSERT INTO public.employee_contracts
  (tenant_id,employee_id,contract_type,contract_number,start_date,end_date,status)
VALUES ('$TA','$EMP2','fixed_term','CT-OLD',
        (DATE '$TODAY' - 800),(DATE '$TODAY' - 400),'active');
SQL

N=$(as_user "$HRA" "SELECT out_stale FROM public.contract_summary();")
[ "$N" = "1" ] && ok "الملخّص يكشف «نشطاً» انتهى" || bad "«$N»"

OUT=$(as_user "$HRA" "SELECT public.contract_expire_due();")
echo "$OUT" | grep -q "^1$" && ok "الترحيل رحّل عقداً واحداً" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT status FROM public.employee_contracts WHERE contract_number='CT-OLD';")
[ "$N" = "expired" ] && ok "وصار expired" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_stale FROM public.contract_summary();")
[ "$N" = "0" ] && ok "ولم يعد متناقضاً" || bad "«$N»"

echo ""
echo "═══ ⑧ اللوح والملخّص وحرّاس الدور ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.contract_board(NULL,NULL,500);")
[ "$N" = "4" ] && ok "board/أ = 4" || bad "«$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.contract_board(NULL,NULL,500);")
[ "$N" = "1" ] && ok "وسالم يرى عقده وحده في اللوح" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_employee_name FROM public.contract_board(NULL,NULL,500) WHERE out_id='$C1';")
[ "$N" = "سالم الأول" ] && ok "الاسم من الاحتياطيّ (full_name_ar فارغ)" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_creator_name FROM public.contract_board(NULL,NULL,500) WHERE out_id='$C1';")
[ "$N" = "موارد أ" ] && ok "واسم المنشئ" || bad "«$N»"

# ★ العقد الدائم بلا نهاية: NULL لا صفر
N=$(as_user "$HRA" "SELECT out_days_left FROM public.contract_board(NULL,NULL,500) WHERE out_id='$C1';")
[ -z "$N" ] && ok "بلا نهاية: days_left = NULL لا صفر" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_expiry_state FROM public.contract_board(NULL,NULL,500) WHERE out_id='$C1';")
[ "$N" = "open_ended" ] && ok "والحالة open_ended" || bad "«$N»"

N=$(as_user "$HRB" "SELECT out_total FROM public.contract_summary();")
[ "$N" = "1" ] && ok "ملخّص ب = 1 (لم يتلوّث)" || bad "«$N»"

OUT=$(as_user "$E1" "SELECT out_total FROM public.contract_summary();")
echo "$OUT" | grep -q "غير مصرَّح" && ok "الموظف محجوب عن الملخّص" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.contract_expire_due();")
echo "$OUT" | grep -q "غير مصرَّح" && ok "ولا يُرحّل الحالات" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT public.contract_upsert(NULL,'$EMP1'::UUID,'permanent');")
echo "$OUT" | grep -q "CONTRACT_NOT_AUTHORIZED" \
  && ok "المدير لا يُنشئ عقداً (ليس staff)" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.contract_terminate('$CB'::UUID,'إنهاءٌ عابر');")
echo "$OUT" | grep -q "CONTRACT_NOT_FOUND" \
  && ok "HR/أ لا يُنهي عقد باء" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT status FROM public.employee_contracts WHERE id='$CB';")
[ "$N" = "active" ] && ok "وحالته لم تتغيّر" || bad "صارت «$N»"

echo ""
echo "═══ ⑨ anon محجوب ═══"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.employee_contracts;
SQL
)
echo "$OUT" | grep -qE "permission denied|^0$" \
  && ok "anon لا يقرأ العقود" || bad "★★★ anon قرأ: «$(echo "$OUT"|head -1)»"

for f in "public.contract_summary()" \
         "public.contract_board(NULL,NULL,10)" \
         "public.contract_expire_due()" \
         "public.contract_upsert(NULL,'$EMP1'::UUID,'permanent')" \
         "public.contract_renew('$C1'::UUID, CURRENT_DATE+100)" \
         "public.contract_terminate('$C1'::UUID,'x')"; do
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
  echo "════════════ كل فحوص RLS لـ0364 نجحت ════════════"; exit 0
else
  echo "════════════ ❌ $FAIL فحصاً فشل ════════════"; exit 1
fi
