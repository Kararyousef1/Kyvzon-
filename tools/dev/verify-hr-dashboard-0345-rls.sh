#!/usr/bin/env bash
# ============================================================================
# verify-hr-dashboard-0345-rls.sh
#
# لوحة الموارد عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-hr-dashboard-0345.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال ولا يقيس
#   السياسات. ودوال 0345 كلها SECURITY INVOKER — أي أن **RLS وحده** هو
#   ما يمنع موظفاً عادياً من قراءة إحصاءات الشركة كلها. هذا لا يُقاس هناك
#   إطلاقاً: بدور postgres كل صفّ مرئيّ فتبدو الأرقام صحيحة دوماً.
#
#   PGPORT=5447 bash tools/dev/verify-hr-dashboard-0345-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5447}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa450000-0000-0000-0000-0000000000aa
TB=bb450000-0000-0000-0000-0000000000bb
HR=11450000-0000-0000-0000-0000000000aa
EMP=12450000-0000-0000-0000-0000000000aa
OTH=13450000-0000-0000-0000-0000000000aa
HRB=11450000-0000-0000-0000-0000000000bb
DA=21450000-0000-0000-0000-0000000000aa
DB2=22450000-0000-0000-0000-0000000000aa
DBB=21450000-0000-0000-0000-0000000000bb
EH=31450000-0000-0000-0000-0000000000aa
EE=32450000-0000-0000-0000-0000000000aa
EO=33450000-0000-0000-0000-0000000000aa
EHB=31450000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  # ★★★ محفّز trg_block_incident_delete (0341) يمنع حذف البلاغات — وهو
  #   حماية مقصودة («البلاغ دليل»). بلا تعطيله لحظياً يفشل التنظيف
  #   **صامتاً** (`|| true` يبتلع الخطأ) فتتراكم صفوف كل تشغيل:
  #   قِستُ 9 بلاغات من ثلاث جولات، فصار «إجمالي البلاغات = 6» بدل 2.
  #   نفس النمط المستعمل في verify-incident-lifecycle-0341-rls.sh:41.
  $PSQL >/dev/null 2>&1 <<SQL || true
ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.wellness_entries WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.incidents        WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.employees        WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
       direct_manager_id=NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$EMP','$OTH','$HRB');
DELETE FROM auth.users      WHERE id IN ('$HR','$EMP','$OTH','$HRB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

# ★★ حارس ضدّ تكرار العطل: نتحقّق أن التنظيف نجح **فعلاً** قبل التجهيز.
#   بقاء صفٍّ واحد يعني أن كل عدّ لاحق باطل — وهو ما حدث ومرّ صامتاً.
LEFT=$($PSQL -c "SELECT count(*) FROM public.incidents WHERE tenant_id IN ('$TA','$TB');")
if [[ "$LEFT" != "0" ]]; then
  echo "  ❌ التنظيف فشل: بقي $LEFT بلاغاً — كل الأرقام بعده باطلة"
  exit 1
fi

echo "── تهيئة: شركتان · موارد+موظفان في أ · موارد في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','hr45a'),('$TB','B','شركة ب','hr45b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@h45.io'),('$EMP','emp@h45.io'),('$OTH','oth@h45.io'),('$HRB','hrb@h45.io');
INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
  ('$DA','$TA','الإنتاج'),('$DB2','$TA','الجودة'),('$DBB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr'),
  ('$EMP','$TA','سعد الموظف','employee'),
  ('$OTH','$TA','ليلى','employee'),
  ('$HRB','$TB','موارد ب','hr');
UPDATE public.employees SET id='$EH' , department_id='$DA' , employee_code='H45H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EE' , department_id='$DA' , employee_code='H45E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO' , department_id='$DB2', employee_code='H45O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EHB', department_id='$DBB', employee_code='H45B'
 WHERE user_id='$HRB' AND tenant_id='$TB';

-- ★★★ قيم مميِّزة عمداً: متوسط الشركة (90+62+40)/3 = 64 **لا يساوي
--   درجة أي فرد**. النسخة الأولى استعملت 80·60·40 فكان المتوسط 60 —
--   وهو بالضبط درجة الموظف نفسه. فحين رأى الموظف «60» ظننتُه تسريباً
--   لمتوسط الشركة بينما كان يرى درجته وحدها. تأكيدٌ يسقط لسبب خاطئ:
--   المقارنة بقيمة تتصادم مع قيمة أخرى في نفس المجموعة (درس التغطية).
-- المستأجر أ: 3 موظفين · 3 إدخالات عافية (90·62·40 ⇒ متوسط 64) · 2 بلاغ
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy) VALUES
 ('$TA','$EH',current_date,90,'great',10,90),
 ('$TA','$EE',current_date,62,'neutral',40,60),
 ('$TA','$EO',current_date,40,'bad',70,30);
INSERT INTO public.incidents(tenant_id,user_id,title,description,category,severity,status,department_id)
 VALUES ('$TA','$EMP','بلاغ أ1','وصف','safety','critical','pending','$DA'),
        ('$TA','$OTH','بلاغ أ2','وصف','hr','low','resolved','$DB2');

-- المستأجر ب: موظف واحد · عافية 5 (قيمة مميِّزة) · بلاغ واحد
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy)
 VALUES ('$TB','$EHB',current_date,5,'terrible',99,1);
INSERT INTO public.incidents(tenant_id,user_id,title,description,category,severity,status,department_id)
 VALUES ('$TB','$HRB','بلاغ ب','وصف','other','critical','pending','$DBB');
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ① الموارد في أ يرى شركته كاملة ──"
V=$(as_user "$HR" "SELECT out_total_employees||'/'||out_active_employees||'/'||out_incidents_total||'/'||out_wellness_score FROM public.hr_dashboard_summary();" 2>&1 | tail -1)
[[ "$V" == "3/3/2/64" ]] && ok "لوحة الموارد: $V" \
  || bad "★★★ لوحة الموارد = $V (متوقَّع 3/3/2/64)"

echo
echo "── ② ★★★ ولا يرى شيئاً من المستأجر ب ──"
# 4 موظفين أو 3 بلاغات أو عافية 46 (متوسط الخمسة) تعني تسريباً
V=$(as_user "$HR" "SELECT count(*) FROM public.hr_dashboard_departments(50);" 2>&1 | tail -1)
[[ "$V" == "2" ]] && ok "أقسام أ فقط = $V" || bad "★★★ الأقسام = $V (متوقَّع 2)"
V=$(as_user "$HR" "SELECT count(*) FROM public.hr_dashboard_departments(50) WHERE out_name='قسم ب';" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "قسم المستأجر ب محجوب" || bad "★★★ قسم ب ظهر: $V"

echo
echo "── ③ ★★★ وموارد ب يرى شركته وحدها بقيم مختلفة تماماً ──"
V=$(as_user "$HRB" "SELECT out_total_employees||'/'||out_incidents_total||'/'||out_wellness_score FROM public.hr_dashboard_summary();" 2>&1 | tail -1)
[[ "$V" == "1/1/5" ]] && ok "لوحة موارد ب: $V (مختلفة عن أ)" \
  || bad "★★★ لوحة موارد ب = $V (متوقَّع 1/1/5)"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ④ ★★★ موظف عادي: ماذا يرى من لوحة الشركة؟ ──"
#
# ★ الدوال INVOKER ⇒ RLS يقرّر. سياسة incidents للموظف تُظهر بلاغاته
#   وحدها، وسياسة wellness_entries كذلك. فالأرقام تنكمش تلقائياً.
#   هذا **سلوك مقصود**: الدالة ليست بوّابة صلاحية بل عدسة على ما يراه
#   المستخدم أصلاً. الخطر الحقيقي هو العكس — أن يرى الموظف أرقام الجميع.
V=$(as_user "$EMP" "SELECT out_incidents_total FROM public.hr_dashboard_summary();" 2>&1 | tail -1)
if [[ "$V" == "2" ]]; then
  bad "★★★ موظف عادي يرى كل بلاغات الشركة ($V) — تسريب"
else
  ok "موظف عادي يرى $V بلاغ لا 2 (RLS يقلّص المدى)"
fi

# ★★★ درجة الموظف 62 · متوسط الشركة 64 — قيمتان **مختلفتان** عمداً.
#   لو تساوتا لما أمكن التمييز بين «يرى نفسه» و«يرى الجميع».
V=$(as_user "$EMP" "SELECT out_wellness_score FROM public.hr_dashboard_summary();" 2>&1 | tail -1)
if [[ "$V" == "64" ]]; then
  bad "★★★ موظف عادي يرى متوسط عافية الشركة (64) — تسريب خصوصية"
elif [[ "$V" == "62" ]]; then
  ok "موظف عادي يرى درجته وحدها (62) لا متوسط الشركة (64)"
else
  bad "قيمة غير متوقَّعة: $V (متوقَّع 62)"
fi

# ★★ ودليل موجب: صفوف العافية المرئية له = 1 لا 3
V=$(as_user "$EMP" "SELECT out_wellness_samples FROM public.hr_dashboard_summary();" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "عيّنات العافية المرئية له = 1 (لا 3)" \
  || bad "★★★ الموظف يرى $V عيّنة (متوقَّع 1)"

echo
echo "── ⑤ ★★★ ولا يرى بيانات زميلته في مستأجر آخر بأي حال ──"
V=$(as_user "$EMP" "SELECT count(*) FROM public.hr_dashboard_departments(50) WHERE out_name='قسم ب';" 2>&1 | tail -1)
[[ "$V" == "0" ]] && ok "قسم المستأجر ب محجوب عن الموظف" || bad "★★★ تسريب: $V"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑥ الاتجاه الشهري معزول ──"
V=$(as_user "$HR" "SELECT sum(out_problems) FROM public.hr_dashboard_monthly_trend(6);" 2>&1 | tail -1)
[[ "$V" == "2" ]] && ok "بلاغات الأشهر الستة لـأ = $V" \
  || bad "★★★ مجموع الاتجاه = $V (متوقَّع 2)"
V=$(as_user "$HRB" "SELECT sum(out_problems) FROM public.hr_dashboard_monthly_trend(6);" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "بلاغات ب = $V (مختلفة)" || bad "★★★ اتجاه ب = $V"

echo
echo "── ⑦ اتجاه العافية معزول ──"
V=$(as_user "$HR" "SELECT out_score FROM public.hr_dashboard_wellness_trend(7) WHERE out_date=current_date;" 2>&1 | tail -1)
[[ "$V" == "64" ]] && ok "عافية اليوم لـأ = $V" || bad "★★★ عافية أ = $V (متوقَّع 64)"
V=$(as_user "$HRB" "SELECT out_score FROM public.hr_dashboard_wellness_trend(7) WHERE out_date=current_date;" 2>&1 | tail -1)
[[ "$V" == "5" ]] && ok "عافية اليوم لـب = $V (مختلفة)" || bad "★★★ عافية ب = $V"

echo
echo "── ⑧ ★★★ ويوم بلا بيانات يعود فارغاً لا صفراً ──"
V=$(as_user "$HR" "SELECT COALESCE(out_score::text,'NULL') FROM public.hr_dashboard_wellness_trend(7) WHERE out_date=current_date-3;" 2>&1 | tail -1)
[[ "$V" == "NULL" ]] && ok "يوم فارغ = NULL" \
  || bad "★★★ يوم فارغ = $V (صفر يعني «أسوأ حالة نفسية» في الرسم)"

# ═══════════════════════════════════════════════════════════════════════════
echo
echo "── ⑨ anon محروم من كل دوال اللوحة ──"
for fn in hr_dashboard_summary hr_dashboard_departments \
          hr_dashboard_monthly_trend hr_dashboard_wellness_trend; do
  N=$($PSQL -c "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee='anon' AND routine_name='$fn';")
  [[ "$N" == "0" ]] && ok "anon محروم من $fn" || bad "★★★ anon يملك EXECUTE على $fn"
done

echo
echo "── ⑩ ★★★ anon لا يقرأ الجداول الأساسية ──"
for tbl in incidents wellness_entries employees; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.$tbl;
SQL
)
  LAST=$(echo "$OUT" | tail -1)
  if [[ "$LAST" == "0" ]] || echo "$OUT" | grep -qi "permission denied\|policy"; then
    ok "anon محجوب عن $tbl"
  else
    bad "★★★ anon قرأ $LAST صفّاً من $tbl"
  fi
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "✅ verify-hr-dashboard-0345-rls: كل التأكيدات ناجحة"
else
  echo "❌ $FAIL إخفاقاً"
fi
exit $FAIL
