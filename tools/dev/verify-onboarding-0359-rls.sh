#!/usr/bin/env bash
# ============================================================================
# verify-onboarding-0359-rls.sh
#
# التعريف وإنهاء الخدمة عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① صفوف التعريف والإنهاء لا تُقرأ عبر المستأجرين.
#     ② الموظف يرى مهامّ تعريفه هو (سياسة SELECT تسمح) ولا يرى غيره.
#     ③ محفّز منع الحذف والقيود تعمل بدور authenticated.
#     ④ ★★★ إنهاء الخدمة **ذرّيّ**: التعطيل يقع مع السجلّ.
#     ⑤ anon محجوب.
#
#   PGPORT=5483 bash tools/dev/verify-onboarding-0359-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5483}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a9590000-0000-0000-0000-00000000000a
TB=b9590000-0000-0000-0000-00000000000b
E1=19590001-0000-0000-0000-000000000001
E2=29590002-0000-0000-0000-000000000002
HRA=39590003-0000-0000-0000-000000000003
MGRA=49590004-0000-0000-0000-000000000004
EB=59590005-0000-0000-0000-000000000005
HRB=69590006-0000-0000-0000-000000000006

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.offboarding_records DISABLE TRIGGER trg_block_offboarding_delete;
DELETE FROM public.offboarding_records WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.offboarding_records ENABLE TRIGGER trg_block_offboarding_delete;
DELETE FROM public.employee_onboarding WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.onboarding_tasks    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees           WHERE tenant_id IN ('$TA','$TB');
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
  ('$TA','A','شركة أ','a959-onb'), ('$TB','B','شركة ب','b959-onb');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a959'),('$E2','n@a959'),('$HRA','hr@a959'),
  ('$MGRA','m@a959'),('$EB','e@b959'),('$HRB','hr@b959');
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

INSERT INTO public.onboarding_tasks
  (tenant_id,title,task_type,sort_order,is_mandatory,is_active) VALUES
  ('$TA','عقد أ','document',1,TRUE,TRUE),
  ('$TA','حاسوب أ','equipment',2,TRUE,TRUE),
  ('$TB','مهمة ب','general',1,TRUE,TRUE);
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ"; exit 1
fi

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.onboarding_start('$EMP1'::UUID);
SELECT public.onboarding_start('$EMP2'::UUID);
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.onboarding_start('$EMPB'::UUID);
RESET request.jwt.claim.sub;
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.employee_onboarding WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT صفّ تعريف (متوقَّع 5 = 2+2+1) ──"
[ "$TOT" = "5" ] || { echo "❌ العيّنة ناقصة"; exit 1; }

REC1=$($PSQL -c "SELECT id FROM public.employee_onboarding WHERE employee_id='$EMP1' LIMIT 1;")
RECB=$($PSQL -c "SELECT id FROM public.employee_onboarding WHERE employee_id='$EMPB' LIMIT 1;")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① القراءة عبر RLS ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.employee_onboarding;")
[ "$N" = "4" ] && ok "HR/أ يرى أربعة صفوف (لا 5)" || bad "HR/أ رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_onboarding;")
[ "$N" = "1" ] && ok "HR/ب يرى صفّاً واحداً" || bad "HR/ب رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.employee_onboarding WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: $N"

# ★ سياسة SELECT تسمح للموظف برؤية مهامّه هو
N=$(as_user "$E1" "SELECT count(*) FROM public.employee_onboarding;")
[ "$N" = "2" ] && ok "سالم يرى مهامّه هو (سياسة الملكية)" || bad "سالم رأى «$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.employee_onboarding WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى مهامّ ناصر" || bad "★ تسريب بين الزملاء: $N"

N=$(as_user "$HRA" "SELECT count(*) FROM public.onboarding_tasks;")
[ "$N" = "2" ] && ok "HR/أ يرى مهامّ شركته" || bad "HR/أ رأى «$N» مهمة"

echo ""
echo "═══ ★★★ ② القيود تحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.employee_onboarding
  (tenant_id, employee_id, task_id, status)
  SELECT '$TA','$EMP1', task_id, 'pending' FROM public.employee_onboarding
   WHERE employee_id='$EMP1' LIMIT 1;")
echo "$OUT" | grep -q "uq_onboarding_emp_task" \
  && ok "التكرار مرفوض بالفهرس الفريد" || bad "★ تكرار مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.employee_onboarding SET status='مخترعة'
                       WHERE id='$REC1';")
echo "$OUT" | grep -q "employee_onboarding_status_chk" \
  && ok "الحالة المخترعة مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★★ ③ إنهاء الخدمة ذرّيّ ═══"

BEFORE=$($PSQL -c "SELECT is_active FROM public.employees WHERE id='$EMP2';")
[ "$BEFORE" = "t" ] && ok "ناصر نشط قبل الإنهاء" || bad "ناصر = «$BEFORE»"

OUT=$(as_user "$HRA" "SELECT public.offboarding_execute('$EMP2'::UUID,
        DATE '2026-08-31','استقالة','voluntary');")
echo "$OUT" | grep -qE "^[0-9a-f-]{36}$" \
  && ok "الإنهاء ينجح بدور authenticated" || bad "الإنهاء: «$(echo "$OUT"|head -1)»"

AFTER=$($PSQL -c "SELECT is_active FROM public.employees WHERE id='$EMP2';")
[ "$AFTER" = "f" ] && ok "★★★ التعطيل وقع مع السجلّ (كان يفشل)" \
                    || bad "★ ناصر ما زال «$AFTER» — سجلٌّ يتيم"

N=$($PSQL -c "SELECT count(*) FROM public.offboarding_records WHERE employee_id='$EMP2';")
[ "$N" = "1" ] && ok "سجلّ واحد" || bad "سجلّات = «$N»"

# ★ ولا سجلّ ثانٍ
OUT=$(as_user "$HRA" "SELECT public.offboarding_execute('$EMP2'::UUID,
        DATE '2026-09-30','مرّة ثانية');")
echo "$OUT" | grep -q "OFFBOARDING_DUPLICATE" \
  && ok "لا سجلّ إنهاء ثانٍ" || bad "★ ثانٍ مرّ: «$(echo "$OUT"|head -1)»"

OFF=$($PSQL -c "SELECT id FROM public.offboarding_records WHERE employee_id='$EMP2';")
OUT=$(as_user "$HRA" "DELETE FROM public.offboarding_records WHERE id='$OFF';")
echo "$OUT" | grep -q "OFFBOARDING_IMMUTABLE" \
  && ok "الحذف يرمي OFFBOARDING_IMMUTABLE" || bad "الحذف: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ④ الدوال بدور authenticated ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.onboarding_board(NULL,100);")
[ "$N" = "2" ] && ok "board/أ = 2 موظفين" || bad "board/أ = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.onboarding_board(NULL,100);")
[ "$N" = "1" ] && ok "board/ب = 1" || bad "board/ب = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.onboarding_board(NULL,100)
                     WHERE out_employee_id = '$EMP1';")
[ "$N" = "0" ] && ok "اللوحة لا تُسرّب موظفي أ" || bad "★ تسريب لوحة: $N"

N=$(as_user "$HRA" "SELECT out_tasks_active FROM public.onboarding_summary();")
[ "$N" = "2" ] && ok "مهامّ أ = 2 (لا 3)" || bad "مهامّ أ = «$N»"

N=$(as_user "$HRB" "SELECT out_tasks_active FROM public.onboarding_summary();")
[ "$N" = "1" ] && ok "مهامّ ب = 1" || bad "مهامّ ب = «$N»"

N=$(as_user "$HRA" "SELECT out_offboarded FROM public.onboarding_summary();")
[ "$N" = "1" ] && ok "إنهاءات أ = 1" || bad "إنهاءات أ = «$N»"

N=$(as_user "$HRA" "SELECT out_orphan_active FROM public.onboarding_summary();")
[ "$N" = "0" ] && ok "لا سجلّ يتيم" || bad "سجلّات يتيمة = «$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.offboarding_board(NULL,NULL,100);")
[ "$N" = "1" ] && ok "offboarding_board/أ = 1" || bad "= «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.offboarding_board(NULL,NULL,100);")
[ "$N" = "0" ] && ok "offboarding_board/ب = 0" || bad "= «$N»"

echo ""
echo "═══ ⑤ حرّاس الدور والحدود ═══"

for f in "public.onboarding_board(NULL,10)" \
         "public.onboarding_summary()" \
         "public.offboarding_board(NULL,NULL,10)"; do
  OUT=$(as_user "$E1" "SELECT * FROM $f;")
  echo "$OUT" | grep -q "غير مصرَّح" \
    && ok "الموظف محجوب عن ${f%%(*}" || bad "★ الموظف: «$(echo "$OUT"|head -1)»"
done

OUT=$(as_user "$E1" "SELECT public.onboarding_start('$EMP2'::UUID);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يبدأ تعريفاً" || bad "★ الموظف بدأ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.onboarding_set_task('$REC1'::UUID,'completed');")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يُتمّ مهمته بنفسه" || bad "★ الموظف أتمّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT count(*) FROM public.onboarding_board(NULL,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "المدير (ليس staff) محجوب" || bad "★ المدير: «$(echo "$OUT"|head -1)»"

# ★★ عبر الحدود
OUT=$(as_user "$HRA" "SELECT public.onboarding_start('$EMPB'::UUID);")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يبدأ تعريف موظف ب" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.onboarding_set_task('$RECB'::UUID,'completed');")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يُتمّ مهمة ب" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

ST=$($PSQL -c "SELECT status FROM public.employee_onboarding WHERE id='$RECB';")
[ "$ST" = "pending" ] && ok "مهمة ب لم تتغيّر" || bad "صارت «$ST»"

OUT=$(as_user "$HRA" "SELECT public.offboarding_execute('$EMPB'::UUID,
        DATE '2026-08-31','محاولة');")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يُنهي خدمة موظف ب" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

AB=$($PSQL -c "SELECT is_active FROM public.employees WHERE id='$EMPB';")
[ "$AB" = "t" ] && ok "موظف ب ما زال نشطاً" || bad "موظف ب = «$AB»"

echo ""
echo "═══ ⑥ anon ═══"

anon_q() { $PSQL <<SQL 2>&1
SET ROLE anon;
$1
SQL
}

for t in employee_onboarding offboarding_records onboarding_tasks; do
  OUT=$(anon_q "SELECT count(*) FROM public.$t;")
  if echo "$OUT" | grep -qi "permission denied"; then
    ok "anon محجوب عن $t"
  elif [ "$(echo "$OUT" | tr -d '[:space:]')" = "0" ]; then
    ok "anon يرى صفر صفّ من $t (RLS)"
  else
    bad "★ anon قرأ $t: «$(echo "$OUT"|head -1)»"
  fi
done

for f in "public.onboarding_board(NULL,10)" \
         "public.onboarding_summary()" \
         "public.onboarding_start('$EMP1'::UUID)" \
         "public.onboarding_set_task('$REC1'::UUID,'completed')" \
         "public.offboarding_board(NULL,NULL,10)" \
         "public.offboarding_execute('$EMP1'::UUID,DATE '2026-08-31','x')"; do
  OUT=$(anon_q "SELECT * FROM $f;")
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon محجوب عن ${f%%(*}" \
    || bad "★ anon نفّذ ${f%%(*}: «$(echo "$OUT"|head -1)»"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 0359 RLS — كل الفحوص مرّت"
else
  echo "❌ 0359 RLS — $FAIL فشلاً"
fi
exit "$FAIL"
