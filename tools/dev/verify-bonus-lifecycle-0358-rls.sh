#!/usr/bin/env bash
# ============================================================================
# verify-bonus-lifecycle-0358-rls.sh
#
# دورة حياة المكافآت عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① صفوف `bonuses` لا تُقرأ عبر المستأجرين.
#     ② الموظف يقرأ مكافأته هو ولا يقرأ مكافأة زميله.
#     ③ محفّز منع الحذف يعمل بدور authenticated أيضاً.
#     ④ القيود تحرس الكتابة المباشرة من المتصفّح.
#     ⑤ anon محجوب.
#
#   PGPORT=5481 bash tools/dev/verify-bonus-lifecycle-0358-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5481}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a8580000-0000-0000-0000-00000000000a
TB=b8580000-0000-0000-0000-00000000000b
E1=18580001-0000-0000-0000-000000000001
E2=28580002-0000-0000-0000-000000000002
HRA=38580003-0000-0000-0000-000000000003
MGRA=48580004-0000-0000-0000-000000000004
EB=58580005-0000-0000-0000-000000000005
HRB=68580006-0000-0000-0000-000000000006

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.bonuses DISABLE TRIGGER trg_block_bonus_delete;
DELETE FROM public.bonuses   WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.bonuses ENABLE TRIGGER trg_block_bonus_delete;
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
  ('$TA','A','شركة أ','a858-bonus'), ('$TB','B','شركة ب','b858-bonus');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a858'),('$E2','n@a858'),('$HRA','hr@a858'),
  ('$MGRA','m@a858'),('$EB','e@b858'),('$HRB','hr@b858');
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

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.bonus_create('$EMP1'::UUID,'performance',400000,'أداء');
SELECT public.bonus_create('$EMP2'::UUID,'spot',100000,'إنجاز');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.bonus_create('$EMPB'::UUID,'annual',900000,'سنوية ب');
RESET request.jwt.claim.sub;
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.bonuses WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT مكافأة (متوقَّع 3) ──"
[ "$TOT" = "3" ] || { echo "❌ العيّنة ناقصة"; exit 1; }

B1=$($PSQL -c "SELECT id FROM public.bonuses WHERE employee_id='$EMP1';")
BB=$($PSQL -c "SELECT id FROM public.bonuses WHERE employee_id='$EMPB';")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① القراءة عبر RLS ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.bonuses;")
[ "$N" = "2" ] && ok "HR/أ يرى مكافأتَي شركته (لا 3)" || bad "HR/أ رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.bonuses;")
[ "$N" = "1" ] && ok "HR/ب يرى واحدة" || bad "HR/ب رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.bonuses WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: $N"

N=$(as_user "$E1" "SELECT count(*) FROM public.bonuses;")
[ "$N" = "1" ] && ok "سالم يرى مكافأته وحدها" || bad "سالم رأى «$N»"

N=$(as_user "$E1" "SELECT count(*) FROM public.bonuses WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى مكافأة ناصر" || bad "★ تسريب بين الزملاء: $N"

N=$(as_user "$MGRA" "SELECT count(*) FROM public.bonuses;")
[ "$N" = "0" ] && ok "المدير (ليس staff) لا يرى مكافآت غيره" || bad "المدير رأى «$N»"

echo ""
echo "═══ ② الحذف — المحفّز يحرس بدور authenticated ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.bonuses WHERE id='$B1';")
echo "$OUT" | grep -q "BONUS_IMMUTABLE" \
  && ok "الحذف يرمي BONUS_IMMUTABLE" || bad "الحذف: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.bonuses WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "3" ] && ok "لا صفّ فُقد" || bad "بقي $N من 3"

echo ""
echo "═══ ★★★ ③ القيود تحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "UPDATE public.bonuses SET status='موافق' WHERE id='$B1';")
echo "$OUT" | grep -q "bonuses_status_chk" \
  && ok "المفردة العربية «موافق» مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.bonuses SET amount=-1 WHERE id='$B1';")
echo "$OUT" | grep -q "bonuses_amount_pos" \
  && ok "المبلغ السالب مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.bonuses SET bonus_type='مخترع' WHERE id='$B1';")
echo "$OUT" | grep -q "bonuses_type_chk" \
  && ok "النوع المخترع مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

# ★★ والمرآة تعمل بدور authenticated أيضاً
as_user "$HRA" "UPDATE public.bonuses SET amount=450000, bonus_amount=1 WHERE id='$B1';" >/dev/null
N=$($PSQL -c "SELECT bonus_amount FROM public.bonuses WHERE id='$B1';")
[ "$N" = "450000.00" ] && ok "المرآة تعمل بدور authenticated (450000 لا 1)" \
                        || bad "bonus_amount = «$N»"

echo ""
echo "═══ ④ الدوال بدور authenticated ═══"

N=$(as_user "$HRA" "SELECT out_total FROM public.bonus_summary();")
[ "$N" = "2" ] && ok "summary/أ = 2" || bad "summary/أ = «$N»"

N=$(as_user "$HRB" "SELECT out_total FROM public.bonus_summary();")
[ "$N" = "1" ] && ok "summary/ب = 1" || bad "summary/ب = «$N»"

# ★★ 450,000 + 100,000 = 550,000 معلَّقة
N=$(as_user "$HRA" "SELECT out_amt_pending FROM public.bonus_summary();")
[ "$N" = "550000.00" ] && ok "مبلغ أ = 550000.00 (محسوب يدوياً)" || bad "مبلغ أ = «$N»"

N=$(as_user "$HRB" "SELECT out_amt_pending FROM public.bonus_summary();")
[ "$N" = "900000.00" ] && ok "مبلغ ب = 900000.00 (لم يتلوّث)" || bad "مبلغ ب = «$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.bonus_board(NULL,NULL,NULL,TRUE,500);")
[ "$N" = "2" ] && ok "board/أ = 2" || bad "board/أ = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.bonus_board(NULL,NULL,NULL,TRUE,500)
                     WHERE out_employee_id = '$EMP1';")
[ "$N" = "0" ] && ok "اللوحة لا تُسرّب موظفي أ" || bad "★ تسريب لوحة: $N"

# ★★★ الاعتماد ينجح بدور authenticated — وكان يرمي invalid uuid
OUT=$(as_user "$HRA" "SELECT public.bonus_decide('$B1'::UUID,'approved');")
echo "$OUT" | grep -q "approved" \
  && ok "الاعتماد ينجح (كان يرمي invalid input syntax for uuid)" \
  || bad "الاعتماد: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT approved_by FROM public.bonuses WHERE id='$B1';")
[ "$N" = "$HRA" ] && ok "approved_by = المستخدم لا نصّ «system»" || bad "approved_by = «$N»"

echo ""
echo "═══ ⑤ حرّاس الدور والحدود ═══"

OUT=$(as_user "$E1" "SELECT out_total FROM public.bonus_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن summary" || bad "★ الموظف: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.bonus_board(NULL,NULL,NULL,FALSE,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن board" || bad "★ الموظف: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.bonus_create('$EMP2'::UUID,'other',1000,'ذاتيّ');")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يُنشئ مكافأة" || bad "★ الموظف أنشأ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT out_total FROM public.bonus_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "المدير محجوب" || bad "★ المدير: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.bonus_decide('$BB'::UUID,'approved');")
echo "$OUT" | grep -q "غير موجودة في هذا المستأجر" \
  && ok "HR/أ لا يبتّ في مكافأة ب" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

ST=$($PSQL -c "SELECT status FROM public.bonuses WHERE id='$BB';")
[ "$ST" = "pending" ] && ok "حالة الأجنبية لم تتغيّر" || bad "الأجنبية صارت «$ST»"

OUT=$(as_user "$HRA" "SELECT public.bonus_create('$EMPB'::UUID,'other',1000,'أجنبي');")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يُنشئ لموظف ب" || bad "★ إنشاء عبر الحدود: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ⑥ anon ═══"

anon_q() { $PSQL <<SQL 2>&1
SET ROLE anon;
$1
SQL
}

OUT=$(anon_q "SELECT count(*) FROM public.bonuses;")
if echo "$OUT" | grep -qi "permission denied"; then
  ok "anon محجوب عن bonuses"
elif [ "$(echo "$OUT" | tr -d '[:space:]')" = "0" ]; then
  ok "anon يرى صفر صفّ (RLS)"
else
  bad "★ anon قرأ: «$(echo "$OUT"|head -1)»"
fi

for f in "public.bonus_summary()" \
         "public.bonus_board(NULL,NULL,NULL,FALSE,10)" \
         "public.bonus_create('$EMP1'::UUID,'other',1000,'x')" \
         "public.bonus_decide('$B1'::UUID,'paid')" \
         "public.bonus_archive('$B1'::UUID,'x')"; do
  OUT=$(anon_q "SELECT * FROM $f;")
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon محجوب عن ${f%%(*}" \
    || bad "★ anon نفّذ ${f%%(*}: «$(echo "$OUT"|head -1)»"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 0358 RLS — كل الفحوص مرّت"
else
  echo "❌ 0358 RLS — $FAIL فشلاً"
fi
exit "$FAIL"
