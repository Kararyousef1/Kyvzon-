#!/usr/bin/env bash
# ============================================================================
# verify-permission-integrity-0340-rls.sh
#
# نزاهة الزمنيات عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-permission-integrity-0340.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال والمحفّزات
#   ولا يقيس السياسات. `permission_requests_view` أُعلنت SECURITY INVOKER
#   عمداً — ادّعاء يحتاج إثباتاً تشغيلياً. وبقية الدوال DEFINER فيجب
#   إثبات أنها **لا تفتح** ثغرة قراءة أو كتابة عبر المستأجرين.
#
#   PGPORT=5441 bash tools/dev/verify-permission-integrity-0340-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5441}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa400000-0000-0000-0000-0000000000aa
TB=bb400000-0000-0000-0000-0000000000bb
MGR=11400000-0000-0000-0000-0000000000aa
SUP=12400000-0000-0000-0000-0000000000aa
EMP=13400000-0000-0000-0000-0000000000aa
OTH=14400000-0000-0000-0000-0000000000aa
HR=15400000-0000-0000-0000-0000000000aa
EMB=13400000-0000-0000-0000-0000000000bb
DA=21400000-0000-0000-0000-0000000000aa
DB=21400000-0000-0000-0000-0000000000bb
EA=31400000-0000-0000-0000-0000000000aa
EO=32400000-0000-0000-0000-0000000000aa
EH=33400000-0000-0000-0000-0000000000aa
EB=31400000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.unified_approval_steps WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_steps      WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_requests   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.permissions            WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.permissions_request    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leaves                 WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leave_balance          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.notifications          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees              WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
       direct_manager_id=NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$MGR','$SUP','$EMP','$OTH','$HR','$EMB');
DELETE FROM auth.users      WHERE id IN ('$MGR','$SUP','$EMP','$OTH','$HR','$EMB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان · سلسلة مشرفة→مدير في أ · قسم ب بلا رؤساء ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','pm40rls-a'),('$TB','B','شركة ب','pm40rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$MGR','mgr@p40.io'),('$SUP','sup@p40.io'),('$EMP','emp@p40.io'),
  ('$OTH','oth@p40.io'),('$HR','hr@p40.io'),('$EMB','emb@p40.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','التقنية'),('$DB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$MGR','$TA','ليث المدير','manager','التقنية'),
  ('$SUP','$TA','رنا المشرفة','supervisor','التقنية'),
  ('$EMP','$TA','سعد الموظف','employee','التقنية'),
  ('$OTH','$TA','زميل','employee','التقنية'),
  ('$HR' ,'$TA','هالة الموارد','hr','التقنية'),
  ('$EMB','$TB','موظف ب','employee','قسم ب');
-- ★ departments.manager_id → profiles لا employees (مُحقَّق من pg_constraint)
UPDATE public.departments SET manager_id='$MGR', supervisor_id='$SUP' WHERE id='$DA';
-- ★ محفّز 0317 أنشأ سجلات الموظفين؛ قيد 0335 يمنع الإدراج الثاني
UPDATE public.employees SET id='$EA', department_id='$DA', employee_code='P40A'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='P40O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EH', department_id='$DA', employee_code='P40H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='P40B'
 WHERE user_id='$EMB' AND tenant_id='$TB';
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① الطلب يُنشأ بجلسة الموظف (DEFINER لا يفتح ثغرة) ──"
PA=$(as_user "$EMP" "SELECT out_permission_id FROM public.submit_permission_request('عادية',current_date+2,'10:00','12:00','زمنية سعد');" 2>&1 | tail -1)
[[ "$PA" =~ ^[0-9a-f-]{36}$ ]] && ok "الموظف أنشأ طلباً: ${PA:0:8}" || bad "فشل الإنشاء: $PA"

PB=$(as_user "$EMB" "SELECT out_permission_id FROM public.submit_permission_request('عادية',current_date+2,'10:00','12:00','زمنية ب');" 2>&1 | tail -1)
[[ "$PB" =~ ^[0-9a-f-]{36}$ ]] && ok "موظف ب أنشأ طلباً بنفس اليوم والوقت (لا تصادم)" || bad "فشل طلب ب: $PB"

N=$(as_user "$EMP" "SELECT count(*) FROM public.permissions_request WHERE id='$PA' AND employee_id='$EA';")
[[ "$N" == "1" ]] && ok "نُسب إلى employees.id الصحيح" || bad "★★★ نُسب لمعرّف خاطئ ($N)"

echo
echo "── ② ★★★ نطاق mine لا يسرّب ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.permission_requests_view('mine',NULL,200,0) WHERE out_employee_id<>'$EA';")
[[ "$N" == "0" ]] && ok "الموظف لا يرى إلا طلباته" || bad "★★★ mine سرّب $N صفّاً"

# ★★ 0372: النطاق `all` صار **ممنوعاً صراحةً** لغير المخوَّل بعد بلاغ
#   المستخدم «يظهر للموظف كما يظهر للموارد البشرية». كان يمرّ ويعتمد
#   على RLS وحدها فيُعيد صفراً — وصفرٌ صامتٌ أوهم الموظف أنّه يطالع
#   سجلّاً فارغاً. المنعُ الصريح أقوى. (نظيرُ إصلاح 0339-rls)
OUT=$(as_user "$OTH" "SELECT count(*) FROM public.permission_requests_view('all',NULL,200,0);" 2>&1)
if echo "$OUT" | grep -q "PERM_SCOPE_FORBIDDEN"; then
  ok "زميل عادي: نطاق all مرفوضٌ صراحةً (0372)"
else
  N=$(echo "$OUT" | tail -1)
  [[ "$N" == "0" ]] && ok "زميل عادي: نطاق all يعطيه 0 (RLS يحكم)" \
                    || bad "★★★ زميل رأى $N طلباً"
fi

OUT=$(as_user "$EMB" "SELECT count(*) FROM public.permission_requests_view('all',NULL,200,0) WHERE out_id='$PA';" 2>&1)
if echo "$OUT" | grep -q "PERM_SCOPE_FORBIDDEN"; then
  ok "موظف ب: نطاق all مرفوضٌ صراحةً"
else
  N=$(echo "$OUT" | tail -1)
  [[ "$N" == "0" ]] && ok "موظف ب لا يرى طلب المستأجر أ" \
                    || bad "★★★ تسريب عبر المستأجرين: $N"
fi

echo
echo "── ③ ★★★ can_decide من السلسلة لا من مسار URL ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.permission_requests_view('mine',NULL,200,0) WHERE out_can_decide;")
[[ "$N" == "0" ]] && ok "الموظف بلا قرار في طلباته" || bad "★★★ الموظف يقرّر في $N طلباً"

N=$(as_user "$SUP" "SELECT count(*) FROM public.permission_requests_view('inbox',NULL,200,0) WHERE out_id='$PA';")
[[ "$N" == "1" ]] && ok "المشرفة ترى الطلب في صندوقها (خطوتها active)" || bad "★★ صندوق المشرفة فارغ ($N)"

N=$(as_user "$MGR" "SELECT count(*) FROM public.permission_requests_view('inbox',NULL,200,0) WHERE out_id='$PA';")
[[ "$N" == "0" ]] && ok "المدير لا يراه (خطوته pending بعد)" || bad "★★ المدير يرى ما ليس دوره ($N)"

N=$(as_user "$HR" "SELECT count(*) FROM public.permission_requests_view('inbox',NULL,200,0);")
[[ "$N" == "0" ]] && ok "الموارد البشرية: صندوق فارغ (ترى ولا تقرّر)" || bad "★★ الموارد تقرّر في $N"

echo
echo "── ④ ★★ سياسة المعتمِد من 0339 على permissions_request ──"
N=$(as_user "$SUP" "SELECT count(*) FROM public.permissions_request WHERE id='$PA';")
[[ "$N" == "1" ]] && ok "المشرفة ترى الطلب المُحال إليها (سياسة 0339)" || bad "★★★ المشرفة ترى $N — انحدار 0339"

echo
echo "── ⑤ ★★★ زرّ الموافقة القديم: كل مساراته مسدودة ──"
OUT=$(as_user "$HR" "UPDATE public.permissions_request SET status='موافق', approved_by='$EH' WHERE id='$PA';" 2>&1)
if echo "$OUT" | grep -qE "APPROVAL_CHAIN_BYPASS|foreign key"; then
  ok "الاعتماد المباشر بـemployees.id مسدود"
else bad "★★★ مرّ: $OUT"; fi

OUT=$(as_user "$HR" "UPDATE public.permissions_request SET status='موافق', approved_by='$HR' WHERE id='$PA';" 2>&1)
if echo "$OUT" | grep -q "APPROVAL_CHAIN_BYPASS"; then
  ok "حارس 0324 صدّ تجاوز السلسلة من دور hr"
else bad "★★★ الموارد تجاوزت السلسلة: $OUT"; fi

echo
echo "── ⑥ ★★★ الإلغاء: الملكية تحت RLS ──"
OUT=$(as_user "$OTH" "SELECT public.cancel_permission_request('$PA','لست صاحبه');" 2>&1)
if echo "$OUT" | grep -qE "PERM_NOT_OWNER|PERM_NOT_FOUND"; then
  ok "زميل في نفس المستأجر مُنع"
else bad "★★★ زميل ألغى طلب غيره: $OUT"; fi

OUT=$(as_user "$EMB" "SELECT public.cancel_permission_request('$PA','من مستأجر آخر');" 2>&1)
if echo "$OUT" | grep -qE "PERM_NOT_OWNER|PERM_NOT_FOUND"; then
  ok "موظف من مستأجر آخر مُنع"
else bad "★★★ اختراق عبر المستأجرين: $OUT"; fi

echo
echo "── ⑦ ★ الاعتماد التلقائي (قسم ب بلا رؤساء) نفّذ الزمنية ──"
S=$($PSQL -c "SELECT status FROM public.permissions_request WHERE id='$PB';")
[[ "$S" == "موافق" ]] && ok "طلب ب اعتُمد تلقائياً وزُومن" || bad "★★ status = '$S'"
N=$($PSQL -c "SELECT count(*) FROM public.permissions WHERE tenant_id='$TB';")
[[ "$N" == "1" ]] && ok "ونُفِّذ في جدول permissions ($N)" || bad "★★★ التنفيذ = $N"

echo
echo "── ⑧ المسار الطبيعي: المشرفة ثم المدير ──"
REQ=$($PSQL -c "SELECT id FROM public.hr_approval_requests WHERE related_id='$PA' AND request_type='permission';")
F1=$(as_user "$SUP" "SELECT public.decide_hr_approval_step('$REQ','approved',NULL);" 2>&1 | tail -1)
[[ "$F1" == "pending" ]] && ok "قرار المشرفة نقل الدور للمدير" || bad "قرار المشرفة: $F1"
F2=$(as_user "$MGR" "SELECT public.decide_hr_approval_step('$REQ','approved',NULL);" 2>&1 | tail -1)
[[ "$F2" == "approved" ]] && ok "قرار المدير أنهى السلسلة" || bad "قرار المدير: $F2"

S=$($PSQL -c "SELECT status FROM public.permissions_request WHERE id='$PA';")
[[ "$S" == "موافق" ]] && ok "الحالة زُومنت من المحرّك" || bad "status = '$S'"

V=$($PSQL -c "SELECT COALESCE(approved_by::TEXT,'NULL') FROM public.permissions_request WHERE id='$PA';")
[[ "$V" == "$MGR" ]] && ok "approved_by = المدير (آخر من قرّر)" || bad "★★★ approved_by = $V"

V=$($PSQL -c "SELECT CASE WHEN reviewed_at IS NULL THEN 'NULL' ELSE 'set' END FROM public.permissions_request WHERE id='$PA';")
[[ "$V" == "set" ]] && ok "reviewed_at مملوء" || bad "★★ reviewed_at = NULL"

N=$($PSQL -c "SELECT count(*) FROM public.permissions WHERE tenant_id='$TA' AND employee_id='$EA';")
[[ "$N" == "1" ]] && ok "الزمنية نُفِّذت في permissions ($N)" || bad "★★★ التنفيذ = $N"

echo
echo "── ⑨ ★★ سياسة المعتمِد على الجدول المنفَّذ ──"
N=$(as_user "$MGR" "SELECT count(*) FROM public.permissions WHERE employee_id='$EA';")
[[ "$N" == "1" ]] && ok "المدير الذي اعتمدها يرى تنفيذها" || bad "★★ المدير يرى $N"

N=$(as_user "$EMP" "SELECT count(*) FROM public.permissions WHERE employee_id='$EA';")
[[ "$N" == "1" ]] && ok "وصاحبها يراها ($N)" || bad "★★ صاحب الزمنية يرى $N من تنفيذه"

N=$(as_user "$OTH" "SELECT count(*) FROM public.permissions WHERE employee_id='$EA';")
[[ "$N" == "0" ]] && ok "زميل لا علاقة له لا يرى شيئاً" || bad "★★★ زميل يرى $N"

N=$(as_user "$EMB" "SELECT count(*) FROM public.permissions WHERE tenant_id='$TA';")
[[ "$N" == "0" ]] && ok "موظف ب لا يرى تنفيذ المستأجر أ" || bad "★★★ تسريب: $N"

echo
echo "── ⑩ ★ علَم التنفيذ في العرض ──"
V=$(as_user "$EMP" "SELECT out_executed FROM public.permission_requests_view('mine',NULL,200,0) WHERE out_id='$PA';")
[[ "$V" == "t" ]] && ok "out_executed = true للزمنية المنفَّذة" || bad "★ out_executed = $V"

echo
echo "── ⑪ ★ anon لا يصل إلى شيء ──"
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.submit_permission_request('عادية',current_date+20,'10:00','11:00','anon');
SQL
)
echo "$OUT" | grep -qi "permission denied" && ok "anon مُنع من submit" || bad "★★★ anon نفّذ submit: $OUT"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.permission_requests_view('all',NULL,100,0);
SQL
)
echo "$OUT" | grep -qi "permission denied" && ok "anon مُنع من العرض" || bad "★★★ anon قرأ العرض: $OUT"

echo
if [[ $FAIL -eq 0 ]]; then
  echo "════════ verify-permission-integrity-0340-rls: كل التأكيدات نجحت ════════"
else
  echo "════════ verify-permission-integrity-0340-rls: $FAIL إخفاق ════════"
  exit 1
fi
