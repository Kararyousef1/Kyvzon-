#!/usr/bin/env bash
# ============================================================================
# verify-performance-review-0356-rls.sh
#
# سلامة تقييم الأداء عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم. هذا السكربت يُثبته.
#
#   ما يحرسه خصوصاً:
#     ① صفوف `performance_reviews` لا تُقرأ عبر المستأجرين.
#     ② الموظف يقرأ تقييمه هو ولا يقرأ تقييم زميله.
#     ③ الدورات محصورة بالطاقم (سياسة SELECT فيها is_staff صراحةً).
#     ④ محفّز منع الحذف يعمل بدور authenticated أيضاً.
#     ⑤ anon محجوب عن كل شيء.
#
#   PGPORT=5475 bash tools/dev/verify-performance-review-0356-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5475}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a6560000-0000-0000-0000-00000000000a
TB=b6560000-0000-0000-0000-00000000000b
E1=11560001-0000-0000-0000-000000000001
E2=22560002-0000-0000-0000-000000000002
HRA=33560003-0000-0000-0000-000000000003
MGRA=44560004-0000-0000-0000-000000000004
EB=55560005-0000-0000-0000-000000000005
HRB=66560006-0000-0000-0000-000000000006

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
-- ★ التقييمات والدورات محميّة بمحفّزات ضدّ الحذف (وهو المقصود).
--   التنظيف التقنيّ للعيّنة يُعطّلها مؤقتاً بدور المالك ثم يُعيدها.
ALTER TABLE public.performance_reviews DISABLE TRIGGER trg_block_perf_review_delete;
ALTER TABLE public.performance_cycles  DISABLE TRIGGER trg_block_perf_cycle_delete;
DELETE FROM public.performance_reviews WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.performance_cycles  WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.performance_reviews ENABLE TRIGGER trg_block_perf_review_delete;
ALTER TABLE public.performance_cycles  ENABLE TRIGGER trg_block_perf_cycle_delete;
DELETE FROM public.employees   WHERE tenant_id IN ('$TA','$TB');
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
  ('$TA','A','شركة أ','a656-perf'), ('$TB','B','شركة ب','b656-perf');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','e1@a656'),('$E2','e2@a656'),('$HRA','hr@a656'),
  ('$MGRA','m@a656'),('$EB','e@b656'),('$HRB','hr@b656');

INSERT INTO public.profiles(id,tenant_id,full_name,role,department,salary) VALUES
  ('$MGRA','$TA','مدير أ','manager','المالية',3000000);
INSERT INTO public.departments(tenant_id,name_ar,manager_id) VALUES
  ('$TA','المالية','$MGRA');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department,salary) VALUES
  ('$HRA','$TA','موارد أ','hr','الموارد',1500000),
  ('$E1','$TA','سالم أ','employee','المالية',1000000),
  ('$E2','$TA','ناصر أ','employee','المالية',1200000),
  ('$HRB','$TB','موارد ب','hr','الموارد',1500000),
  ('$EB','$TB','موظف ب','employee','المالية',1000000);
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ (1=$EMP1 2=$EMP2 B=$EMPB)"; exit 1
fi

$PSQL <<SQL >/dev/null
SET request.jwt.claim.sub = '$HRA';
SELECT public.performance_review_create('$EMP1'::UUID, NULL, '$MGRA'::UUID, 88);
SELECT public.performance_review_create('$EMP2'::UUID, NULL, '$MGRA'::UUID, 64);
SELECT public.performance_cycle_create('دورة أ', NULL,
       DATE '2026-01-01', DATE '2026-03-31', 'quarterly');
RESET request.jwt.claim.sub;
SET request.jwt.claim.sub = '$HRB';
SELECT public.performance_review_create('$EMPB'::UUID, NULL, NULL, 70);
SELECT public.performance_cycle_create('دورة ب', NULL,
       DATE '2026-01-01', DATE '2026-03-31', 'quarterly');
RESET request.jwt.claim.sub;
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.performance_reviews WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT تقييماً (متوقَّع 3) ──"
[ "$TOT" = "3" ] || { echo "❌ العيّنة ناقصة"; exit 1; }

R1=$($PSQL -c "SELECT id FROM public.performance_reviews WHERE employee_id='$EMP1';")
RB=$($PSQL -c "SELECT id FROM public.performance_reviews WHERE employee_id='$EMPB';")
CB=$($PSQL -c "SELECT id FROM public.performance_cycles WHERE tenant_id='$TB';")

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① performance_reviews — القراءة عبر RLS ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.performance_reviews;")
[ "$N" = "2" ] && ok "HR/أ يرى تقييمَي شركته (لا 3)" || bad "HR/أ رأى «$N» — متوقَّع 2"

N=$(as_user "$HRB" "SELECT count(*) FROM public.performance_reviews;")
[ "$N" = "1" ] && ok "HR/ب يرى تقييماً واحداً" || bad "HR/ب رأى «$N» — متوقَّع 1"

N=$(as_user "$HRB" "SELECT count(*) FROM public.performance_reviews WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى شيئاً من أ" || bad "★ تسريب: HR/ب رأى $N من أ"

N=$(as_user "$E1" "SELECT count(*) FROM public.performance_reviews;")
[ "$N" = "1" ] && ok "سالم يرى تقييمه وحده" || bad "سالم رأى «$N» — متوقَّع 1"

N=$(as_user "$E1" "SELECT count(*) FROM public.performance_reviews WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى تقييم ناصر" || bad "★ تسريب بين الزملاء: $N"

# ★ المدير ليس staff ولا موظفاً مُقيَّماً ⇒ صفر
N=$(as_user "$MGRA" "SELECT count(*) FROM public.performance_reviews;")
[ "$N" = "0" ] && ok "المدير (ليس staff) لا يرى تقييمات غيره" || bad "المدير رأى «$N»"

echo ""
echo "═══ ② performance_cycles — محصورة بالطاقم ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.performance_cycles;")
[ "$N" = "1" ] && ok "HR/أ يرى دورة شركته" || bad "HR/أ رأى «$N» — متوقَّع 1"

N=$(as_user "$HRB" "SELECT count(*) FROM public.performance_cycles WHERE tenant_id='$TA';")
[ "$N" = "0" ] && ok "HR/ب لا يرى دورة أ" || bad "★ تسريب دورات: $N"

N=$(as_user "$E1" "SELECT count(*) FROM public.performance_cycles;")
[ "$N" = "0" ] && ok "الموظف لا يرى الدورات" || bad "الموظف رأى «$N» دورة"

echo ""
echo "═══ ③ الحذف — المحفّز يحرس بدور authenticated ═══"

OUT=$(as_user "$HRA" "DELETE FROM public.performance_reviews WHERE id='$R1';")
echo "$OUT" | grep -q "REVIEW_IMMUTABLE" \
  && ok "حذف التقييم يرمي REVIEW_IMMUTABLE" \
  || bad "حذف التقييم: «$(echo "$OUT" | head -1)»"

OUT=$(as_user "$HRA" "DELETE FROM public.performance_cycles
                       WHERE tenant_id='$TA';")
echo "$OUT" | grep -q "CYCLE_IMMUTABLE" \
  && ok "حذف الدورة يرمي CYCLE_IMMUTABLE" \
  || bad "حذف الدورة: «$(echo "$OUT" | head -1)»"

N=$($PSQL -c "SELECT count(*) FROM public.performance_reviews WHERE tenant_id IN ('$TA','$TB');")
[ "$N" = "3" ] && ok "لا صفّ فُقد" || bad "بقي $N من 3"

echo ""
echo "═══ ④ التقييم الذاتيّ — المحفّز يحرس بدور authenticated ═══"

OUT=$(as_user "$HRA" "INSERT INTO public.performance_reviews
  (tenant_id, employee_id, reviewer_id, score, status)
  VALUES ('$TA','$EMP1','$E1', 100, 'draft');")
echo "$OUT" | grep -q "REVIEW_SELF_NOT_ALLOWED" \
  && ok "التقييم الذاتيّ مرفوض" || bad "★ ذاتيّ مرّ: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ⑤ الدوال بدور authenticated ═══"

N=$(as_user "$HRA" "SELECT out_reviews FROM public.performance_summary();")
[ "$N" = "2" ] && ok "summary/أ = 2" || bad "summary/أ = «$N»"

N=$(as_user "$HRB" "SELECT out_reviews FROM public.performance_summary();")
[ "$N" = "1" ] && ok "summary/ب = 1" || bad "summary/ب = «$N»"

# ★★ المتوسّط: (88 + 64) ÷ 2 = 76.0
N=$(as_user "$HRA" "SELECT out_avg_score FROM public.performance_summary();")
[ "$N" = "76.0" ] && ok "متوسّط أ = 76.0 (محسوب يدوياً)" || bad "المتوسّط = «$N»"

N=$(as_user "$HRA" "SELECT count(*) FROM public.performance_reviews_board(NULL,NULL,NULL,FALSE,500);")
[ "$N" = "2" ] && ok "reviews_board/أ = 2" || bad "reviews_board/أ = «$N»"

N=$(as_user "$HRB" "SELECT count(*) FROM public.performance_reviews_board(NULL,NULL,NULL,TRUE,500)
                     WHERE out_employee_id = '$EMP1';")
[ "$N" = "0" ] && ok "اللوحة لا تُسرّب موظفي أ إلى ب" || bad "★ تسريب لوحة: $N"

N=$(as_user "$HRA" "SELECT count(*) FROM public.performance_cycles_board(FALSE,100);")
[ "$N" = "1" ] && ok "cycles_board/أ = 1" || bad "cycles_board/أ = «$N»"

OUT=$(as_user "$E1" "SELECT out_reviews FROM public.performance_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يستدعي summary" || bad "الموظف: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.performance_reviews_board(NULL,NULL,NULL,FALSE,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يستدعي reviews_board" || bad "الموظف/board: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT public.performance_review_create('$EMP1'::UUID,NULL,NULL,100);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف لا يُنشئ تقييماً لنفسه" || bad "★ الموظف أنشأ: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ⑥ عبر الحدود — الدوال ═══"

# ★★ التقييم الأجنبيّ draft (قابل للانتقال) ⇒ ترشيح المستأجر وحده يمسكه
OUT=$(as_user "$HRA" "SELECT public.performance_review_set_status('$RB'::UUID,'submitted');")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يُغيّر حالة تقييم ب" || bad "★ عبر الحدود: «$(echo "$OUT"|head -1)»"

ST=$($PSQL -c "SELECT status FROM public.performance_reviews WHERE id='$RB';")
[ "$ST" = "draft" ] && ok "حالة الأجنبيّ لم تتغيّر" || bad "الأجنبيّ صار «$ST»"

OUT=$(as_user "$HRA" "SELECT public.performance_review_archive('$RB'::UUID,'محاولة');")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يؤرشف تقييم ب" || bad "★ أرشفة عبر الحدود: «$(echo "$OUT"|head -1)»"

AR=$($PSQL -c "SELECT (archived_at IS NULL) FROM public.performance_reviews WHERE id='$RB';")
[ "$AR" = "t" ] && ok "الأجنبيّ غير مؤرشف" || bad "الأجنبيّ أُرشف"

OUT=$(as_user "$HRA" "SELECT public.performance_cycle_set_status('$CB'::UUID,'active');")
echo "$OUT" | grep -q "غير موجودة في هذا المستأجر" \
  && ok "HR/أ لا يُغيّر دورة ب" || bad "★ دورة عبر الحدود: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$HRA" "SELECT public.performance_review_create('$EMPB'::UUID,NULL,NULL,80);")
echo "$OUT" | grep -q "غير موجود في هذا المستأجر" \
  && ok "HR/أ لا يُنشئ لموظف ب" || bad "★ إنشاء عبر الحدود: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ⑦ anon ═══"

anon_q() { $PSQL <<SQL 2>&1
SET ROLE anon;
$1
SQL
}

OUT=$(anon_q "SELECT count(*) FROM public.performance_reviews;")
echo "$OUT" | grep -qiE "permission denied|0" >/dev/null
if echo "$OUT" | grep -qi "permission denied"; then
  ok "anon محجوب عن performance_reviews"
elif [ "$(echo "$OUT" | tr -d '[:space:]')" = "0" ]; then
  ok "anon يرى صفر صفّ (RLS)"
else
  bad "★ anon قرأ: «$(echo "$OUT"|head -1)»"
fi

for f in "public.performance_summary()" \
         "public.performance_reviews_board(NULL,NULL,NULL,FALSE,10)" \
         "public.performance_cycles_board(FALSE,10)" \
         "public.performance_review_create('$EMP1'::UUID,NULL,NULL,50)" \
         "public.performance_review_set_status('$R1'::UUID,'submitted')" \
         "public.performance_review_archive('$R1'::UUID,'x')" \
         "public.performance_cycle_create('x',NULL,DATE '2026-01-01',DATE '2026-02-01','monthly')"; do
  OUT=$(anon_q "SELECT * FROM $f;")
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon محجوب عن ${f%%(*}" \
    || bad "★ anon نفّذ ${f%%(*}: «$(echo "$OUT"|head -1)»"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 0356 RLS — كل الفحوص مرّت"
else
  echo "❌ 0356 RLS — $FAIL فشلاً"
fi
exit "$FAIL"
