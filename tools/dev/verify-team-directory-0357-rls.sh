#!/usr/bin/env bash
# ============================================================================
# verify-team-directory-0357-rls.sh
#
# دليل الفريق عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ★★ ما يحرسه هنا خصوصاً — العطل ⑦:
#     سياسة `kyvzon_employees_select` هي `(tenant_id = …)` **بلا تمييز
#     دور** (مُحقَّق). فالجدول مفتوح لكل مُصادَق داخل الشركة. الحماية
#     الحقيقية في حارس `current_user_is_staff()` داخل الدوال — وهذا
#     السكربت يُثبت أنه يعمل بدور authenticated لا بدور postgres.
#
#   PGPORT=5477 bash tools/dev/verify-team-directory-0357-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5477}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a7570000-0000-0000-0000-00000000000a
TB=b7570000-0000-0000-0000-00000000000b
E1=17570001-0000-0000-0000-000000000001
E2=27570002-0000-0000-0000-000000000002
HRA=37570003-0000-0000-0000-000000000003
MGRA=47570004-0000-0000-0000-000000000004
EB=57570005-0000-0000-0000-000000000005
HRB=67570006-0000-0000-0000-000000000006

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.wellness_entries        WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_certifications WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leaves                  WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.incidents               WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.employees               WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments             WHERE tenant_id IN ('$TA','$TB');
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
  ('$TA','A','شركة أ','a757-team'), ('$TB','B','شركة ب','b757-team');
INSERT INTO auth.users(id,email) VALUES
  ('$E1','salem@a757.iq'),('$E2','nasser@a757.iq'),('$HRA','hr@a757.iq'),
  ('$MGRA','mgr@a757.iq'),('$EB','emp@b757.iq'),('$HRB','hr@b757.iq');

INSERT INTO public.profiles(id,tenant_id,full_name,role,department,phone,position) VALUES
  ('$MGRA','$TA','مدير أ','manager','المالية','07701111111','مدير');
INSERT INTO public.departments(tenant_id,name_ar,manager_id) VALUES
  ('$TA','المالية','$MGRA');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department,phone,position) VALUES
  ('$HRA','$TA','موارد أ','hr','الموارد','07702222222','مسؤول'),
  ('$E1','$TA','سالم أ','employee','المالية','07703333333','محاسب'),
  ('$E2','$TA','ناصر أ','employee','المالية','07704444444','مدقّق'),
  ('$HRB','$TB','موارد ب','hr','الموارد','07705555555','مسؤول'),
  ('$EB','$TB','موظف ب','employee','المالية','07706666666','موظف');
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ (1=$EMP1 2=$EMP2 B=$EMPB)"; exit 1
fi

$PSQL <<SQL >/dev/null
-- سالم 80 و 60 ⇒ 70 · ناصر 40 · الأجنبيّ 100
INSERT INTO public.wellness_entries (tenant_id, employee_id, date, score, mood) VALUES
 ('$TA','$EMP1', DATE '2026-08-01', 80, 'good'),
 ('$TA','$EMP1', DATE '2026-08-02', 60, 'neutral'),
 ('$TA','$EMP2', DATE '2026-08-01', 40, 'bad'),
 ('$TB','$EMPB', DATE '2026-08-01', 100, 'great');
INSERT INTO public.incidents (tenant_id,title,description,category,severity,status,reported_by) VALUES
 ('$TA','ب1','و','other','medium','pending','$E1'),
 ('$TB','ب-ب','و','other','high','pending','$EB');
SQL

TOT=$($PSQL -c "SELECT count(*) FROM public.employees WHERE tenant_id IN ('$TA','$TB');")
echo "── العيّنة: $TOT موظفاً (متوقَّع 6) ──"
[ "$TOT" = "6" ] || { echo "❌ العيّنة ناقصة"; exit 1; }

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "═══ ① الدليل — العزل بين المستأجرين ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.team_directory(NULL,NULL,NULL,TRUE,500);")
[ "$N" = "4" ] && ok "HR/أ يرى أربعة (لا 6)" || bad "HR/أ رأى «$N» — متوقَّع 4"

N=$(as_user "$HRB" "SELECT count(*) FROM public.team_directory(NULL,NULL,NULL,TRUE,500);")
[ "$N" = "2" ] && ok "HR/ب يرى اثنين" || bad "HR/ب رأى «$N» — متوقَّع 2"

N=$(as_user "$HRB" "SELECT count(*) FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
                     WHERE out_id = '$EMP1';")
[ "$N" = "0" ] && ok "HR/ب لا يرى موظفي أ" || bad "★ تسريب: HR/ب رأى $N من أ"

echo ""
echo "═══ ★★★ ② الأرقام لا تتلوّث عبر الحدود ═══"

# سالم (80+60)/2 = 70 · ناصر 40 ⇒ متوسّط المتوسّطات (70+40)/2 = 55.0
N=$(as_user "$HRA" "SELECT out_avg_wellness FROM public.team_summary();")
[ "$N" = "55.0" ] && ok "متوسّط أ = 55.0 (محسوب يدوياً)" || bad "متوسّط أ = «$N»"

N=$(as_user "$HRB" "SELECT out_avg_wellness FROM public.team_summary();")
[ "$N" = "100.0" ] && ok "متوسّط ب = 100.0" || bad "متوسّط ب = «$N»"

N=$(as_user "$HRA" "SELECT out_open_issues FROM public.team_summary();")
[ "$N" = "1" ] && ok "بلاغات أ = 1 (لا 2)" || bad "بلاغات أ = «$N»"

N=$(as_user "$HRA" "SELECT out_wellness FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
                     WHERE out_id = '$EMP1';")
[ "$N" = "70.0" ] && ok "صحة سالم = 70.0 (كانت 0 دائماً)" || bad "صحة سالم = «$N»"

N=$(as_user "$HRA" "SELECT out_open_issues FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
                     WHERE out_id = '$EMP1';")
[ "$N" = "1" ] && ok "بلاغات سالم = 1 (كانت 0 دائماً)" || bad "بلاغات سالم = «$N»"

echo ""
echo "═══ ★★★ ③ الاسم والبريد من مصادرهما ═══"

N=$(as_user "$HRA" "SELECT out_full_name FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
                     WHERE out_id = '$EMP1';")
[ "$N" = "سالم أ" ] && ok "الاسم من profiles" || bad "الاسم = «$N»"

N=$(as_user "$HRA" "SELECT out_email FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
                     WHERE out_id = '$EMP1';")
[ "$N" = "salem@a757.iq" ] && ok "البريد من auth.users" || bad "البريد = «$N»"

N=$(as_user "$HRA" "SELECT out_role FROM public.team_directory(NULL,NULL,NULL,TRUE,500)
                     WHERE out_user_id = '$MGRA';")
[ "$N" = "manager" ] && ok "الدور من profiles" || bad "الدور = «$N»"

echo ""
echo "═══ ★★ ⑦ حارس الدور يعمل بدور authenticated ═══"

# ★★★ سياسة employees مفتوحة لكل مُصادَق داخل الشركة — نُثبت ذلك أوّلاً
N=$(as_user "$E1" "SELECT count(*) FROM public.employees;")
[ "$N" = "4" ] && ok "الجدول نفسه مفتوح للموظف (السياسة بلا تمييز دور)" \
                || bad "قراءة الجدول: «$N»"

# ★ ولذلك الحماية في الدالة — لا في الجدول
OUT=$(as_user "$E1" "SELECT count(*) FROM public.team_directory(NULL,NULL,NULL,TRUE,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن team_directory" || bad "★ الموظف نفّذ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT out_total FROM public.team_summary();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن team_summary" || bad "★ الموظف نفّذ: «$(echo "$OUT"|head -1)»"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.team_departments();")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "الموظف محجوب عن team_departments" || bad "★ الموظف نفّذ: «$(echo "$OUT"|head -1)»"

# المدير ليس staff
OUT=$(as_user "$MGRA" "SELECT count(*) FROM public.team_directory(NULL,NULL,NULL,TRUE,10);")
echo "$OUT" | grep -q "غير مصرَّح" \
  && ok "المدير (ليس staff) محجوب" || bad "★ المدير نفّذ: «$(echo "$OUT"|head -1)»"

echo ""
echo "═══ ④ الأقسام ═══"

N=$(as_user "$HRA" "SELECT count(*) FROM public.team_departments();")
[ "$N" = "1" ] && ok "HR/أ يرى قسمه" || bad "HR/أ رأى «$N» قسماً"

N=$(as_user "$HRB" "SELECT count(*) FROM public.team_departments();")
[ "$N" = "0" ] && ok "HR/ب بلا أقسام (ولا يرى قسم أ)" || bad "HR/ب رأى «$N»"

echo ""
echo "═══ ⑤ anon ═══"

anon_q() { $PSQL <<SQL 2>&1
SET ROLE anon;
$1
SQL
}

for f in "public.team_directory(NULL,NULL,NULL,TRUE,10)" \
         "public.team_summary()" \
         "public.team_departments()"; do
  OUT=$(anon_q "SELECT * FROM $f;")
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon محجوب عن ${f%%(*}" \
    || bad "★ anon نفّذ ${f%%(*}: «$(echo "$OUT"|head -1)»"
done

OUT=$(anon_q "SELECT count(*) FROM public.wellness_entries;")
if echo "$OUT" | grep -qi "permission denied"; then
  ok "anon محجوب عن wellness_entries"
elif [ "$(echo "$OUT" | tr -d '[:space:]')" = "0" ]; then
  ok "anon يرى صفر صفّ من wellness_entries (RLS)"
else
  bad "★ anon قرأ: «$(echo "$OUT"|head -1)»"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 0357 RLS — كل الفحوص مرّت"
else
  echo "❌ 0357 RLS — $FAIL فشلاً"
fi
exit "$FAIL"
