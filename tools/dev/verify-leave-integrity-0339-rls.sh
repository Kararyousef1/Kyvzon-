#!/usr/bin/env bash
# ============================================================================
# verify-leave-integrity-0339-rls.sh
#
# نزاهة الإجازات عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-leave-integrity-0339.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال والمحفّزات
#   ولا يقيس السياسات. `leave_requests_view` أُعلنت SECURITY INVOKER عمداً
#   — ادّعاء يحتاج إثباتاً تشغيلياً. وبقية الدوال DEFINER فيجب إثبات أنها
#   **لا تفتح** ثغرة قراءة أو كتابة عبر المستأجرين.
#
#   PGPORT=5439 bash tools/dev/verify-leave-integrity-0339-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5439}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa390000-0000-0000-0000-0000000000aa
TB=bb390000-0000-0000-0000-0000000000bb
MGR=11390000-0000-0000-0000-0000000000aa   # مدير شركة أ
SUP=12390000-0000-0000-0000-0000000000aa   # مشرف شركة أ
EMP=13390000-0000-0000-0000-0000000000aa   # موظف شركة أ
OTH=14390000-0000-0000-0000-0000000000aa   # زميل شركة أ
HR=15390000-0000-0000-0000-0000000000aa    # موارد بشرية شركة أ
EMB=13390000-0000-0000-0000-0000000000bb   # موظف شركة ب
DA=21390000-0000-0000-0000-0000000000aa
DB=21390000-0000-0000-0000-0000000000bb
EA=31390000-0000-0000-0000-0000000000aa
EO=32390000-0000-0000-0000-0000000000aa
EH=33390000-0000-0000-0000-0000000000aa
EB=31390000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.unified_approval_steps WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_steps      WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_requests   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.permissions_request    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leaves                 WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leave_balance          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.holidays               WHERE tenant_id IN ('$TA','$TB');
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

echo "── تهيئة: شركتان · سلسلة مشرف→مدير · رصيد لكلٍّ ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','lv39rls-a'),('$TB','B','شركة ب','lv39rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$MGR','mgr@l39.io'),('$SUP','sup@l39.io'),('$EMP','emp@l39.io'),
  ('$OTH','oth@l39.io'),('$HR','hr@l39.io'),('$EMB','emb@l39.io');
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
-- ★ قسم ب بلا رؤساء عمداً: يقيس مسار الاعتماد التلقائي تحت RLS
-- ★ محفّز 0317 أنشأ سجلات الموظفين؛ قيد 0335 يمنع الإدراج الثاني
UPDATE public.employees SET id='$EA', department_id='$DA', employee_code='L39A'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='L39O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EH', department_id='$DA', employee_code='L39H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='L39B'
 WHERE user_id='$EMB' AND tenant_id='$TB';
-- ★ رصيد لكل موظف على سنتين: مدى current_date+40 قد يعبر رأس السنة،
--   وقيد leave_balance فريد على (tenant_id, employee_id, year).
INSERT INTO public.leave_balance(tenant_id,employee_id,year,annual_total)
SELECT e.tenant_id, e.id, y, 21
  FROM public.employees e
 CROSS JOIN (SELECT EXTRACT(YEAR FROM current_date)::INT AS y
             UNION ALL SELECT EXTRACT(YEAR FROM current_date)::INT + 1) yy
 WHERE e.tenant_id IN ('$TA','$TB')
ON CONFLICT DO NOTHING;
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① الطلب يُنشأ بجلسة الموظف نفسه (SECURITY DEFINER لا يفتح ثغرة) ──"
LVA=$(as_user "$EMP" "SELECT out_leave_id FROM public.submit_leave_request('سنوية',current_date+7,current_date+9,'طلب سعد');" 2>&1 | tail -1)
if [[ "$LVA" =~ ^[0-9a-f-]{36}$ ]]; then ok "الموظف أنشأ طلباً: ${LVA:0:8}"
else bad "إنشاء الطلب فشل: $LVA"; fi

LVB=$(as_user "$EMB" "SELECT out_leave_id FROM public.submit_leave_request('سنوية',current_date+7,current_date+9,'طلب ب');" 2>&1 | tail -1)
if [[ "$LVB" =~ ^[0-9a-f-]{36}$ ]]; then ok "موظف ب أنشأ طلباً على نفس المدى (لا تداخل عبر المستأجرين)"
else bad "طلب موظف ب فشل: $LVB"; fi

echo
echo "── ② ★ المعرّف يُشتقّ من الجلسة لا من المتصفح ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.leaves WHERE id='$LVA' AND employee_id='$EA';")
[[ "$N" == "1" ]] && ok "الطلب نُسب إلى employees.id الصحيح ($EA)" \
                  || bad "الطلب نُسب لمعرّف خاطئ (N=$N)"

echo
echo "── ③ ★★★ leave_requests_view نطاق mine — لا تسريب ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.leave_requests_view('mine',NULL,100,0) WHERE out_employee_id<>'$EA';")
[[ "$N" == "0" ]] && ok "الموظف لا يرى في mine إلا طلباته" \
                  || bad "★★★ mine سرّب $N صفّاً لغير صاحبه"

# ★★ 0372: النطاق `all` صار **ممنوعاً صراحةً** لغير المخوَّل بعد
#   بلاغ المستخدم «يظهر للموظف كما يظهر للموارد البشرية». كان يمرّ
#   ويعتمد على RLS وحدها فيُعيد صفراً — وصفرٌ صامتٌ أوهم الموظف
#   أنّه يطالع سجلّ الشركة الفارغ. المنعُ الصريح أقوى.
OUT=$(as_user "$OTH" "SELECT count(*) FROM public.leave_requests_view('all',NULL,100,0);" 2>&1)
if echo "$OUT" | grep -q "LEAVE_SCOPE_FORBIDDEN"; then
  ok "زميل عادي: نطاق all مرفوضٌ صراحةً (0372 — أقوى من صفرٍ صامت)"
else
  N=$(echo "$OUT" | tail -1)
  [[ "$N" == "0" ]] && ok "زميل عادي: نطاق all يعطيه 0 (RLS يحكم)" \
                    || bad "★★★ زميل عادي رأى $N طلباً عبر نطاق all"
fi

OUT=$(as_user "$EMB" "SELECT count(*) FROM public.leave_requests_view('all',NULL,100,0) WHERE out_id='$LVA';" 2>&1)
if echo "$OUT" | grep -q "LEAVE_SCOPE_FORBIDDEN"; then
  ok "موظف المستأجر ب: نطاق all مرفوضٌ صراحةً"
else
  N=$(echo "$OUT" | tail -1)
  [[ "$N" == "0" ]] && ok "موظف المستأجر ب لا يرى طلب المستأجر أ" \
                    || bad "★★★ تسريب عبر المستأجرين: $N"
fi

echo
echo "── ④ ★★ can_decide من السلسلة لا من مسار URL ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.leave_requests_view('mine',NULL,100,0) WHERE out_can_decide;")
[[ "$N" == "0" ]] && ok "الموظف لا يملك قراراً في أي من طلباته" \
                  || bad "★★★ الموظف يملك can_decide في $N طلباً"

N=$(as_user "$SUP" "SELECT count(*) FROM public.leave_requests_view('inbox',NULL,100,0) WHERE out_id='$LVA';")
[[ "$N" == "1" ]] && ok "المشرفة ترى طلب سعد في صندوقها (خطوتها active)" \
                  || bad "صندوق المشرفة لا يحوي الطلب (N=$N)"

N=$(as_user "$MGR" "SELECT count(*) FROM public.leave_requests_view('inbox',NULL,100,0) WHERE out_id='$LVA';")
[[ "$N" == "0" ]] && ok "المدير لا يرى الطلب في صندوقه (خطوته pending بعد)" \
                  || bad "★★ المدير يرى طلباً ليس دوره (N=$N)"

N=$(as_user "$HR" "SELECT count(*) FROM public.leave_requests_view('inbox',NULL,100,0);")
[[ "$N" == "0" ]] && ok "الموارد البشرية: صندوق فارغ (staff يرى ولا يقرّر)" \
                  || bad "★★ الموارد البشرية تملك قرار $N طلباً بلا خطوة"

echo
echo "── ⑤ ★★ الموارد البشرية ترى الكل لكن لا تتجاوز السلسلة ──"
N=$(as_user "$HR" "SELECT count(*) FROM public.leave_requests_view('all',NULL,100,0);")
[[ "$N" == "1" ]] && ok "الموارد البشرية ترى طلب مستأجرها وحده ($N)" \
                  || bad "الموارد البشرية ترى $N طلباً (متوقَّع 1)"

OUT=$(as_user "$HR" "UPDATE public.leaves SET status='موافق' WHERE id='$LVA';" 2>&1)
if echo "$OUT" | grep -q "APPROVAL_CHAIN_BYPASS"; then
  ok "حارس 0324 صدّ تجاوز السلسلة من دور hr"
else bad "★★★ الموارد البشرية تجاوزت السلسلة: $OUT"; fi

echo
echo "── ⑥ ★★★ الإلغاء: الملكية تُفحص تحت RLS ──"
OUT=$(as_user "$OTH" "SELECT public.cancel_leave_request('$LVA','لست صاحبه');" 2>&1)
if echo "$OUT" | grep -qE "LEAVE_NOT_OWNER|LEAVE_NOT_FOUND"; then
  ok "زميل في نفس المستأجر مُنع من إلغاء طلب غيره"
else bad "★★★ زميل ألغى طلب غيره: $OUT"; fi

OUT=$(as_user "$EMB" "SELECT public.cancel_leave_request('$LVA','من مستأجر آخر');" 2>&1)
if echo "$OUT" | grep -qE "LEAVE_NOT_OWNER|LEAVE_NOT_FOUND"; then
  ok "موظف من مستأجر آخر مُنع من الإلغاء"
else bad "★★★ اختراق عبر المستأجرين في الإلغاء: $OUT"; fi

echo
echo "── ⑦ ★★ الرصيد: يتحرك بجلسة المستخدم ولا يتسرّب ──"
V=$(as_user "$EMP" "SELECT sum(annual_pending)::TEXT FROM public.leave_balance WHERE employee_id='$EA';")
[[ "$V" != "0.000" && -n "$V" ]] && ok "حجز رصيد سعد = $V" \
                                || bad "★★ رصيد سعد لم يُحجز ($V)"

V=$(as_user "$EMP" "SELECT COALESCE(sum(annual_pending),-1)::TEXT FROM public.leave_balance WHERE tenant_id='$TB';")
[[ "$V" == "-1" || "$V" == "0.000" ]] && ok "الموظف لا يقرأ رصيد المستأجر الآخر ($V)" \
                                      || bad "★★★ تسريب رصيد عبر المستأجرين: $V"

echo
echo "── ⑧ ★★★ تضارب المصالح تحت RLS: المدير وطلبه ──"
LVM=$(as_user "$MGR" "SELECT out_leave_id FROM public.submit_leave_request('سنوية',current_date+40,current_date+42,'إجازة المدير');" 2>&1 | tail -1)
if [[ "$LVM" =~ ^[0-9a-f-]{36}$ ]]; then
  N=$($PSQL -c "SELECT count(*) FROM public.hr_approval_steps s JOIN public.hr_approval_requests r ON r.id=s.request_id WHERE r.related_id='$LVM' AND s.approver_id='$MGR';")
  [[ "$N" == "0" ]] && ok "المدير ليس معتمِداً في سلسلة طلبه" \
                    || bad "★★★ المدير معتمِدُ نفسه في $N خطوة"

  REQM=$($PSQL -c "SELECT id FROM public.hr_approval_requests WHERE related_id='$LVM';")
  OUT=$(as_user "$MGR" "SELECT public.decide_hr_approval_step('$REQM','approved','أوافق');" 2>&1)
  if echo "$OUT" | grep -q "not authorized"; then
    ok "المدير مُنع من البتّ في طلبه"
  else bad "★★★ المدير بتّ في طلبه: $OUT"; fi
else bad "طلب المدير لم يُنشأ: $LVM"; fi

echo
echo "── ⑨ ★ الاعتماد التلقائي يُزامن المصدر (قسم ب بلا رؤساء) ──"
S=$($PSQL -c "SELECT status FROM public.leaves WHERE id='$LVB';")
[[ "$S" == "موافق" ]] && ok "طلب موظف ب اعتُمد تلقائياً وزُومن المصدر" \
                      || bad "★★ المصدر = '$S' بينما الطلب معتمَد تلقائياً"

echo
echo "── ⑩ المسار الطبيعي: المشرفة ثم المدير ──"
REQA=$($PSQL -c "SELECT id FROM public.hr_approval_requests WHERE related_id='$LVA';")
F1=$(as_user "$SUP" "SELECT public.decide_hr_approval_step('$REQA','approved',NULL);" 2>&1 | tail -1)
[[ "$F1" == "pending" ]] && ok "قرار المشرفة نقل الدور للمدير" || bad "قرار المشرفة أعطى: $F1"
F2=$(as_user "$MGR" "SELECT public.decide_hr_approval_step('$REQA','approved',NULL);" 2>&1 | tail -1)
[[ "$F2" == "approved" ]] && ok "قرار المدير أنهى السلسلة" || bad "قرار المدير أعطى: $F2"

S=$($PSQL -c "SELECT status FROM public.leaves WHERE id='$LVA';")
[[ "$S" == "موافق" ]] && ok "leaves.status زُومن من المحرّك" || bad "leaves.status = '$S'"

V=$($PSQL -c "SELECT sum(annual_used)::TEXT FROM public.leave_balance WHERE employee_id='$EA';")
[[ "$V" != "0.000" ]] && ok "الرصيد خُصم بعد الاعتماد ($V)" || bad "★★ الرصيد لم يُخصم"
V=$($PSQL -c "SELECT sum(annual_pending)::TEXT FROM public.leave_balance WHERE employee_id='$EA';")
[[ "$V" == "0.000" ]] && ok "الحجز حُرِّر بعد التثبيت" || bad "★ الحجز باقٍ: $V"

echo
echo "── ⑪ ★ anon لا يصل إلى شيء ──"
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.submit_leave_request('سنوية',current_date+90,current_date+91,'anon');
SQL
)
if echo "$OUT" | grep -qi "permission denied"; then ok "anon مُنع من submit_leave_request"
else bad "★★★ anon نفّذ submit_leave_request: $OUT"; fi

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.leave_requests_view('all',NULL,100,0);
SQL
)
if echo "$OUT" | grep -qi "permission denied"; then ok "anon مُنع من leave_requests_view"
else bad "★★★ anon قرأ leave_requests_view: $OUT"; fi

echo
if [[ $FAIL -eq 0 ]]; then
  echo "════════ verify-leave-integrity-0339-rls: كل التأكيدات نجحت ════════"
else
  echo "════════ verify-leave-integrity-0339-rls: $FAIL إخفاق ════════"
  exit 1
fi
