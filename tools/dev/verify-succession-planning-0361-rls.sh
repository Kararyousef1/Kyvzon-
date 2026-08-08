#!/usr/bin/env bash
# ============================================================================
# verify-succession-planning-0361-rls.sh
#
# تخطيط التعاقب عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① خطط التعاقب لا تُقرأ عبر المستأجرين — والموظف لا يراها إطلاقاً.
#     ② العطلان ②/③: FK المركَّب يحرس الكتابة المباشرة من المتصفّح.
#     ③ العطل ⑦: محفّز خلافة النفس يعمل بدور authenticated أيضاً.
#     ④ العطلان ⑩/⑪: منع الحذف و RESTRICT بدور authenticated.
#     ⑤ العطل ⑧: قيد اتّساق الدرجة/المستوى يحرس الكتابة المباشرة.
#     ⑥ العطل ①: ترتيب «جاهز الآن» أولاً عبر الدالة بدور حقيقيّ.
#     ⑦ anon محجوب.
#
#   PGPORT=5490 bash tools/dev/verify-succession-planning-0361-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5490}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3610000-0000-0000-0000-00000000000a
TB=b3610000-0000-0000-0000-00000000000b
E1=11610001-0000-0000-0000-000000000001
E2=22610002-0000-0000-0000-000000000002
HRA=33610003-0000-0000-0000-000000000003
MGRA=44610004-0000-0000-0000-000000000004
EB=66610006-0000-0000-0000-000000000006
HRB=77610007-0000-0000-0000-000000000007

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.succession_candidates DISABLE TRIGGER trg_block_succession_candidate_delete;
ALTER TABLE public.critical_positions   DISABLE TRIGGER trg_block_critical_position_delete;
DELETE FROM public.succession_candidates WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.critical_positions    WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.succession_candidates ENABLE TRIGGER trg_block_succession_candidate_delete;
ALTER TABLE public.critical_positions   ENABLE TRIGGER trg_block_critical_position_delete;
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
  ('$TA','A','شركة أ','a361-succ'), ('$TB','B','شركة ب','b361-succ');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','s@a361'),('$E2','n@a361'),('$HRA','hr@a361'),
  ('$MGRA','m@a361'),('$EB','e@b361'),('$HRB','hr@b361');
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
EMPM=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$MGRA';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPM" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ"; exit 1
fi

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.succession_position_upsert(NULL,'المدير المالي',NULL,'$EMPM'::UUID,'critical');
SELECT public.succession_position_upsert(NULL,'مدير التقنية',NULL,NULL,'high');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.succession_position_upsert(NULL,'منصب باء',NULL,'$EMPB'::UUID,'critical');
RESET request.jwt.claim.sub;
SQL

P1=$($PSQL -c "SELECT id FROM public.critical_positions WHERE title='المدير المالي';")
P2=$($PSQL -c "SELECT id FROM public.critical_positions WHERE title='مدير التقنية';")
PB=$($PSQL -c "SELECT id FROM public.critical_positions WHERE title='منصب باء';")

# سالم جاهز الآن(90) · ناصر موهبة(25) على P1
$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.succession_candidate_nominate('$P1'::UUID,'$EMP1'::UUID,'ready_now',90);
SELECT public.succession_candidate_nominate('$P1'::UUID,'$EMP2'::UUID,'future_potential',25);
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.critical_positions WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT منصب (متوقَّع 3) ──"
[ "$TOT" = "3" ] || { echo "❌ العيّنة ناقصة"; exit 1; }
C1=$($PSQL -c "SELECT id FROM public.succession_candidates WHERE employee_id='$EMP1';")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① عزل المستأجر عبر RLS ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.critical_positions;")
[ "$N" = "2" ] && ok "HR/أ يرى منصبَي شركته (لا 3)" || bad "HR/أ رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.critical_positions;")
[ "$N" = "1" ] && ok "HR/ب يرى واحداً" || bad "HR/ب رأى «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.critical_positions WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: $N"

N=$(as_user "$HRB" "SELECT count(*) FROM public.succession_candidates;")
[ "$N" = "0" ] && ok "HR/ب لا يرى مرشّحي أ" || bad "★ تسريب مرشّحين: $N"

# ★★★ الموظف ليس staff ⇒ لا يرى خطط التعاقب إطلاقاً
N=$(as_user "$E1" "SELECT count(*) FROM public.succession_candidates;")
[ "$N" = "0" ] && ok "سالم لا يرى ترشيحه (السياسة staff فقط)" || bad "★ سالم رأى «$N»"

N=$(as_user "$MGRA" "SELECT count(*) FROM public.critical_positions;")
[ "$N" = "0" ] && ok "المدير (ليس staff) لا يرى المناصب" || bad "المدير رأى «$N»"

echo ""
echo "═══ ★★★ ② العطلان ②/③: FK المركَّب يحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.critical_positions(tenant_id,title,incumbent_employee_id,risk_level)
                      VALUES ('$TA','معدوم','ffffffff-ffff-ffff-ffff-ffffffffffff','high');")
echo "$OUT" | grep -q "critical_positions_incumbent_tenant_fkey" \
  && ok "شاغلٌ معدوم مرفوض بـFK" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

# ★★★ الفخّ الحقيقيّ: شاغلٌ موجود في مستأجرٍ آخر
OUT=$(as_user "$HRA" "INSERT INTO public.critical_positions(tenant_id,title,incumbent_employee_id,risk_level)
                      VALUES ('$TA','عابر','$EMPB','high');")
echo "$OUT" | grep -q "critical_positions_incumbent_tenant_fkey" \
  && ok "شاغلٌ من مستأجر آخر مرفوض بـFK المركَّب" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "INSERT INTO public.succession_candidates(tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
                      VALUES ('$TA','$P2','$EMPB','ready_now',90);")
echo "$OUT" | grep -q "succession_candidates_employee_tenant_fkey" \
  && ok "مرشّحٌ من مستأجر آخر مرفوض" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

# ★★★ العطل ⑥: منصبٌ في مستأجرٍ آخر
OUT=$(as_user "$HRA" "INSERT INTO public.succession_candidates(tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
                      VALUES ('$TA','$PB','$EMP1','ready_now',90);")
echo "$OUT" | grep -q "succession_candidates_position_tenant_fkey" \
  && ok "منصبٌ من مستأجر آخر مرفوض" || bad "★★★ مرّ: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★★ ③ العطل ⑦: خلافة النفس ممنوعة بدور authenticated ═══"

OUT=$(as_user "$HRA" "SELECT public.succession_candidate_nominate('$P1'::UUID,'$EMPM'::UUID,'ready_now',95);")
echo "$OUT" | grep -q "SUCCESSION_SELF_NOMINATION" \
  && ok "الشاغل لا يخلف نفسه" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "INSERT INTO public.succession_candidates(tenant_id,critical_position_id,employee_id,readiness_level,readiness_score)
                      VALUES ('$TA','$P1','$EMPM','ready_now',95);")
echo "$OUT" | grep -q "SUCCESSION_SELF_NOMINATION" \
  && ok "والمحفّز يمسك الإدراج المباشر" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ★★ ④ العطل ⑧: القيد يحرس الكتابة المباشرة ═══"

OUT=$(as_user "$HRA" "UPDATE public.succession_candidates SET readiness_score=3 WHERE id='$C1';")
echo "$OUT" | grep -q "succession_candidates_score_level_chk" \
  && ok "«جاهز الآن» بدرجة 3 مرفوضة" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.succession_candidates SET readiness_score=NULL WHERE id='$C1';")
echo "$OUT" | grep -qi "null value\|not-null" \
  && ok "الدرجة الفارغة مرفوضة (NOT NULL)" || bad "★ مرّت: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "UPDATE public.critical_positions SET risk_level='مخترع' WHERE id='$P1';")
echo "$OUT" | grep -q "critical_positions_risk_level_check" \
  && ok "مستوى خطرٍ مخترع مرفوض" || bad "★ مرّ: «$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT readiness_score FROM public.succession_candidates WHERE id='$C1';")
[ "$N" = "90" ] && ok "الدرجة لم تتغيّر (90)" || bad "الدرجة صارت «$N»"

echo ""
echo "═══ ★★★ ⑤ العطلان ⑩/⑪: الحذف والإبادة ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.succession_candidates WHERE id='$C1';")
echo "$OUT" | grep -q "SUCCESSION_DELETE_BLOCKED" \
  && ok "حذف المرشّح يرمي SUCCESSION_DELETE_BLOCKED" || bad "«$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "DELETE FROM public.critical_positions WHERE id='$P1';")
echo "$OUT" | grep -q "SUCCESSION_DELETE_BLOCKED" \
  && ok "حذف المنصب يرمي كذلك" || bad "«$(echo "$OUT"|head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.succession_candidates WHERE critical_position_id='$P1';")
[ "$N" = "2" ] && ok "المرشّحان باقيان" || bad "بقي $N من 2"

echo ""
echo "═══ ★★★ ⑥ العطل ①: «جاهز الآن» أوّلاً بدور حقيقيّ ═══"

N=$(as_user "$HRA" "SELECT out_candidates -> 0 ->> 'level' FROM public.succession_board(NULL,NULL,'active',500) WHERE out_id='$P1';")
[ "$N" = "ready_now" ] && ok "الأول = ready_now (كان يُقصى بالترتيب الأبجديّ)" \
                       || bad "★★★ الأول = «$N»"

N=$(as_user "$HRA" "SELECT out_candidates -> 0 ->> 'employeeName' FROM public.succession_board(NULL,NULL,'active',500) WHERE out_id='$P1';")
[ "$N" = "سالم الأول" ] && ok "واسمه سالم الأول" || bad "الاسم «$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.succession_board(NULL,NULL,'active',500);")
[ "$N" = "2" ] && ok "board/أ = 2" || bad "board/أ = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.succession_board(NULL,NULL,'active',500);")
[ "$N" = "1" ] && ok "board/ب = 1 (لم يتلوّث)" || bad "board/ب = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.succession_board(NULL,NULL,'active',500) WHERE out_title='المدير المالي';")
[ "$N" = "0" ] && ok "اللوح لا يُسرّب مناصب أ" || bad "★ تسريب لوح: $N"

# ★★ الملخّص: 2 نشط · 1 مكشوف (P2) · 1 جاهز الآن · معدّل (90+25)/2 = 57.5
N=$(as_user "$HRA" "SELECT out_positions FROM public.succession_summary();")
[ "$N" = "2" ] && ok "summary/أ = 2" || bad "summary/أ = «$N»"

N=$(as_user "$HRA" "SELECT out_uncovered FROM public.succession_summary();")
[ "$N" = "1" ] && ok "المكشوف = 1" || bad "المكشوف = «$N»"

N=$(as_user "$HRA" "SELECT out_ready_now FROM public.succession_summary();")
[ "$N" = "1" ] && ok "جاهزون الآن = 1" || bad "«$N»"

N=$(as_user "$HRA" "SELECT out_avg_score FROM public.succession_summary();")
[ "$N" = "57.5" ] && ok "معدّل الجاهزية = 57.5 (محسوب يدوياً)" || bad "المعدّل «$N»"

N=$(as_user "$HRB" "SELECT out_avg_score FROM public.succession_summary();")
[ -z "$N" ] && ok "معدّل ب = NULL (لا مرشّح) لا صفر" || bad "معدّل ب = «$N»"

echo ""
echo "═══ ⑦ حرّاس الدور ═══"

OUT=$(as_user "$E1" "SELECT out_positions FROM public.succession_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن الملخّص" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.succession_board(NULL,NULL,'active',10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن اللوح" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$MGRA" "SELECT public.succession_position_upsert(NULL,'منصبي',NULL,NULL,'high');")
echo "$OUT" | grep -q "SUCCESSION_NOT_AUTHORIZED" \
  && ok "المدير لا يُنشئ منصباً (ليس staff)" || bad "★ «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.succession_candidate_nominate('$P2'::UUID,'$EMP1'::UUID,'ready_now',95);")
echo "$OUT" | grep -q "SUCCESSION_NOT_AUTHORIZED" \
  && ok "الموظف لا يُرشِّح نفسه" || bad "★ «$(echo "$OUT"|head -1)»"

# ★★★ وHR/أ لا يبتّ في منصب باء
OUT=$(as_user "$HRA" "SELECT public.succession_position_close('$PB'::UUID,'closed');")
echo "$OUT" | grep -q "SUCCESSION_POSITION_NOT_FOUND" \
  && ok "HR/أ لا يُغلق منصب باء" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

ST=$($PSQL -c "SELECT status FROM public.critical_positions WHERE id='$PB';")
[ "$ST" = "active" ] && ok "منصب باء لم يتغيّر" || bad "صار «$ST»"

N=$($PSQL -c "SELECT count(*) FROM public.critical_positions WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "3" ] && ok "لا صفّ دخل ولا فُقد من الحرّاس" || bad "صار $N من 3"

echo ""
echo "═══ ⑧ anon محجوب ═══"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.critical_positions;
SQL
)
echo "$OUT" | grep -qE "permission denied|^0$" \
  && ok "anon لا يقرأ المناصب" || bad "★★★ anon قرأ: «$(echo "$OUT"|head -1)»"

for f in "public.succession_summary()" \
         "public.succession_board(NULL,NULL,'active',10)" \
         "public.succession_position_upsert(NULL,'x',NULL,NULL,'high')" \
         "public.succession_candidate_nominate('$P1'::UUID,'$EMP1'::UUID,'ready_now',90)"; do
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
  echo "════════════ كل فحوص RLS لـ0361 نجحت ════════════"; exit 0
else
  echo "════════════ ❌ $FAIL فحصاً فشل ════════════"; exit 1
fi
