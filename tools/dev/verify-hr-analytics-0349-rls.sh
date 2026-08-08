#!/usr/bin/env bash
# ============================================================================
# verify-hr-analytics-0349-rls.sh
#
# تحليلات الموارد البشرية عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-hr-analytics-0349.sql؟
#   ملف الـSQL يعمل بدور postgres وهو BYPASSRLS — فكل صفّ مرئيّ له،
#   وأي تأكيد على العزل هناك قد يمرّ جوفاء (حدث فعلاً في 0338: ثلاثة
#   تأكيدات مرّت صدفةً). التحليلات تكشف رواتب لا، لكنها تكشف:
#     · درجات الصحة النفسية لكل قسم   ← بيانات شديدة الحساسية
#     · بلاغات الموظفين وأوقات حلّها
#     · معدلات غياب الأفراد مُجمَّعة بالقسم
#   والدوال الأربع `SECURITY DEFINER` — أي أنها **تتجاوز RLS عمداً**.
#   فالحارس الوحيد هو `current_user_is_staff()` داخلها. هذا السكربت
#   يقيس ذلك الحارس بدور حقيقي لا بدور خارق.
#
#   PGPORT=5456 bash tools/dev/verify-hr-analytics-0349-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5456}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa490000-0000-0000-0000-0000000000aa
TB=bb490000-0000-0000-0000-0000000000bb
DA=dd490000-0000-0000-0000-0000000000aa
DB=dd490000-0000-0000-0000-0000000000bb
HR=11490000-0000-0000-0000-0000000000aa
MGR=14490000-0000-0000-0000-0000000000aa
EMP=12490000-0000-0000-0000-0000000000aa
GK=15490000-0000-0000-0000-0000000000aa
HRB=11490000-0000-0000-0000-0000000000bb
EMPB=12490000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ───────────────────────────────────────────────────────────────────────────
# تنظيف — ★ درس سابق: `|| true` يبتلع خطأ المحفّز فتتراكم الصفوف.
#   لذلك نُعطّل محفّز منع حذف البلاغات صراحةً ثم نتحقّق أن التنظيف نجح.
# ───────────────────────────────────────────────────────────────────────────
cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.wellness_entries   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.attendance_summary WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.incidents          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employee_contracts WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.succession_candidates WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.critical_positions WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments        WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$MGR','$EMP','$GK','$HRB','$EMPB');
DELETE FROM auth.users      WHERE id IN ('$HR','$MGR','$EMP','$GK','$HRB','$EMPB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;
SQL
}

cleanup

# ★ حارس التنظيف: لو بقي صفّ لفسدت كل القياسات التالية صامتةً
LEFT=$($PSQL -c "SELECT count(*) FROM public.employees WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ employees. أوقف."
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# التهيئة
# ───────────────────────────────────────────────────────────────────────────
$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','أ','a49-'||substr('$TA',1,8)),
  ('$TB','B','ب','b49-'||substr('$TB',1,8));

INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
  ('$DA','$TA','الهندسة'), ('$DB','$TB','قسم ب');

INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr49a@x.co'), ('$MGR','mgr49a@x.co'), ('$EMP','emp49a@x.co'),
  ('$GK','gk49a@x.co'), ('$HRB','hr49b@x.co'), ('$EMPB','emp49b@x.co');

INSERT INTO public.profiles(id,tenant_id,full_name,role,department,status) VALUES
  ('$HR',  '$TA','مدير الموارد','hr',        'الهندسة','active'),
  ('$MGR', '$TA','مدير قسم',   'manager',   'الهندسة','active'),
  ('$EMP', '$TA','موظف',       'employee',  'الهندسة','active'),
  ('$GK',  '$TA','حارس',       'gatekeeper','الهندسة','active'),
  ('$HRB', '$TB','مدير ب',     'hr',        'قسم ب','active'),
  ('$EMPB','$TB','موظف ب',     'employee',  'قسم ب','active');

-- درجات صحة: المستأجر أ = 20 و40 (متوسط 30) · المستأجر ب = 90
INSERT INTO public.wellness_entries(employee_id,tenant_id,date,score,mood,stress,energy)
SELECT e.id,'$TA',CURRENT_DATE,
       CASE WHEN e.user_id='$EMP' THEN 20 ELSE 40 END,'bad',70,30
  FROM public.employees e WHERE e.tenant_id='$TA' AND e.user_id IN ('$EMP','$MGR');
INSERT INTO public.wellness_entries(employee_id,tenant_id,date,score,mood,stress,energy)
SELECT e.id,'$TB',CURRENT_DATE,90,'great',10,90
  FROM public.employees e WHERE e.tenant_id='$TB' AND e.user_id='$EMPB';
SQL

echo "════════════════════════════════════════════════════════"
echo "  0349 — تحليلات الموارد البشرية عبر RLS حقيقي"
echo "════════════════════════════════════════════════════════"

# دالة مساعدة: تنفيذ بدور authenticated بهوية محددة
# ★★★ `set_config(...,true)` محلّي بالمعاملة، وكل عبارة في psql معاملة
#   مستقلّة ⇒ الهوية تضيع قبل الاستدعاء. النمط الصحيح (كما في 0348)
#   هو `SET` على مستوى الجلسة. أخطأتُ أولاً واكتشفه فشل السكربت.
as_user() {
  local uid="$1"; shift
  $PSQL <<SQL
SET request.jwt.claim.sub = '$uid';
SET ROLE authenticated;
$*
SQL
}

# ───────────────────────────────────────────────────────────────────────────
echo "── ① الأدوار المسموح لها ──"

R=$(as_user "$HR" "SELECT out_wellness_score FROM public.hr_analytics_overview();" \
     2>/dev/null | grep -E '^[0-9.]+$' | head -1)
if [ "$R" = "30.0" ]; then ok "hr يرى مؤشر الصحة = 30.0 (متوسط 20 و40)"
else bad "hr: المتوقَّع 30.0 والناتج '${R:-<فشل>}'"; fi

R=$(as_user "$HR" "SELECT count(*) FROM public.hr_analytics_departments();" \
     2>/dev/null | grep -E '^[0-9]+$' | head -1)
if [ "$R" = "1" ]; then ok "hr يرى قسماً واحداً (قسمه فقط)"
else bad "الأقسام: المتوقَّع 1 والناتج '${R:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ② الأدوار الممنوعة (ليست staff) ──"
# ★★★ current_user_is_staff() = admin·hr·developer·it_admin فقط.
#   المدير والموظف والحارس ليسوا staff — وهذه بيانات صحة نفسية.

for pair in "$MGR:manager" "$EMP:employee" "$GK:gatekeeper"; do
  uid="${pair%%:*}"; role="${pair##*:}"
  OUT=$(as_user "$uid" "SELECT out_wellness_score FROM public.hr_analytics_overview();" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then
    ok "$role مرفوض من overview"
  else
    bad "$role نفذ overview! الناتج: $(echo "$OUT" | head -2 | tr '\n' ' ')"
  fi

  OUT=$(as_user "$uid" "SELECT count(*) FROM public.hr_analytics_departments();" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then
    ok "$role مرفوض من departments"
  else
    bad "$role نفذ departments! الناتج: $(echo "$OUT" | head -2 | tr '\n' ' ')"
  fi
done

for fn in hr_analytics_wellness_trend hr_analytics_incident_trend; do
  OUT=$(as_user "$EMP" "SELECT count(*) FROM public.$fn();" 2>&1)
  if echo "$OUT" | grep -q "لا تملك صلاحية"; then
    ok "employee مرفوض من $fn"
  else
    bad "employee نفذ $fn!"
  fi
done

# ───────────────────────────────────────────────────────────────────────────
echo "── ③ العزل بين المستأجرين ──"
# ★ الدوال SECURITY DEFINER ⇒ تتجاوز RLS. الترشيح الداخلي هو الحارس.

R=$(as_user "$HRB" "SELECT out_wellness_score FROM public.hr_analytics_overview();" \
     2>/dev/null | grep -E '^[0-9.]+$' | head -1)
if [ "$R" = "90.0" ]; then ok "hr(ب) يرى 90.0 — لا 30.0 ولا متوسطاً مختلطاً"
elif [ "$R" = "60.0" ] || [ "$R" = "50.0" ]; then
  bad "★★★ تسريب! متوسط مختلط = $R (بيانات المستأجرين اختلطت)"
else bad "hr(ب): المتوقَّع 90.0 والناتج '${R:-<فشل>}'"; fi

R=$(as_user "$HRB" "SELECT out_department_name FROM public.hr_analytics_departments();" \
     2>/dev/null | grep -v '^$' | tail -1)
if [ "$R" = "قسم ب" ]; then ok "hr(ب) يرى «قسم ب» فقط"
else bad "hr(ب) يرى '${R:-<فشل>}' والمتوقَّع «قسم ب»"; fi

R=$(as_user "$HRB" "SELECT count(*) FROM public.hr_analytics_departments();" \
     2>/dev/null | grep -E '^[0-9]+$' | head -1)
if [ "$R" = "1" ]; then ok "hr(ب) يرى قسماً واحداً لا قسمين"
else bad "hr(ب): الأقسام = '${R:-<فشل>}' والمتوقَّع 1"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ④ حدود المُعاملات تحت دور حقيقي ──"

OUT=$(as_user "$HR" "SELECT count(*) FROM public.hr_analytics_wellness_trend(0);" 2>&1)
if echo "$OUT" | grep -q "بين 1 و36"; then ok "p_months=0 مرفوض"
else bad "p_months=0 قُبل!"; fi

OUT=$(as_user "$HR" "SELECT count(*) FROM public.hr_analytics_incident_trend(37);" 2>&1)
if echo "$OUT" | grep -q "بين 1 و36"; then ok "p_months=37 مرفوض"
else bad "p_months=37 قُبل!"; fi

OUT=$(as_user "$HR" \
  "SELECT count(*) FROM public.hr_analytics_overview(CURRENT_DATE, CURRENT_DATE-5);" 2>&1)
if echo "$OUT" | grep -q "نطاق تاريخ غير صالح"; then ok "النطاق المعكوس مرفوض"
else bad "النطاق المعكوس قُبل!"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑤ الجداول الأساسية ما زالت محميّة بـRLS ──"
# ★ الدوال DEFINER تكشف مُجمَّعات. القراءة المباشرة يجب أن تبقى محكومة.

R=$(as_user "$EMP" "SELECT count(*) FROM public.wellness_entries;" \
     2>/dev/null | grep -E '^[0-9]+$' | head -1)
if [ "${R:-9}" -le 1 ]; then ok "موظف يرى ${R} صفّ صحة مباشرةً (سجلّه وحده)"
else bad "★★★ موظف يرى $R صفّ صحة — تسريب خصوصية"; fi

R=$(as_user "$EMPB" "SELECT count(*) FROM public.wellness_entries WHERE tenant_id='$TA';" \
     2>/dev/null | grep -E '^[0-9]+$' | head -1)
if [ "${R:-9}" = "0" ]; then ok "موظف(ب) لا يرى صفوف المستأجر أ"
else bad "★★★ موظف(ب) يرى $R من صفوف أ"; fi

cleanup

echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 0349 RLS — كل التأكيدات نجحت"
else
  echo "  ❌ 0349 RLS — $FAIL فشلاً"
fi
echo "════════════════════════════════════════════════════════"
exit "$FAIL"
