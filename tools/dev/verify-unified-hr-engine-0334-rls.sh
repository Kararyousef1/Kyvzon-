#!/usr/bin/env bash
# ============================================================================
# verify-unified-hr-engine-0334-rls.sh
#
# توحيد محرّك الاعتماد عبر **RLS حقيقي**.
#
# لماذا بجانب verify-unified-hr-engine-0334.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق المرآة ولا
#   يقيس السياسات. `approval_steps_for` و`resolve_hr_approval_source`
#   كلتاهما SECURITY INVOKER عمداً — ادّعاء يحتاج إثباتاً تشغيلياً.
#
# ★ المرآة نفسها SECURITY DEFINER عن قصد: المحفّز يعمل بسياق المُعتمِد
#   الذي قد لا يملك INSERT على unified_approval_steps. هذا الاختبار
#   يتحقق أن ذلك **لا يفتح** ثغرة قراءة.
#
#   PGPORT=55580 bash tools/dev/verify-unified-hr-engine-0334-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55580}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa340000-0000-0000-0000-0000000000aa
TB=bb340000-0000-0000-0000-0000000000bb
MGR=11340000-0000-0000-0000-0000000000aa   # مدير شركة أ
SUP=12340000-0000-0000-0000-0000000000aa   # مشرف شركة أ
EMP=13340000-0000-0000-0000-0000000000aa   # موظف شركة أ
OTH=14340000-0000-0000-0000-0000000000aa   # زميل شركة أ (لا علاقة له)
MGB=11340000-0000-0000-0000-0000000000bb   # مدير شركة ب
DA=21340000-0000-0000-0000-0000000000aa
DB=21340000-0000-0000-0000-0000000000bb
EA=31340000-0000-0000-0000-0000000000aa
EO=32340000-0000-0000-0000-0000000000aa
EB=31340000-0000-0000-0000-0000000000bb
# ★ 0339: أُضيف موظف عادي في شركة ب. قبل 0339 كان الطلب باسم مدير ب
#   نفسه وهو مدير قسمه ⇒ كان معتمِدَ نفسه، وكان التأكيد ⑦ يوثّق ذلك
#   كسلوك صحيح («يرى خطوة طلبه»). 0339 يتخطّى الخطوة التي معتمِدها هو
#   الطالب ⇒ صفر خطوات. لم ينكسر شيء: تصحّح توقُّعٌ خاطئ.
EMB=15340000-0000-0000-0000-0000000000bb   # موظف عادي شركة ب
EBE=33340000-0000-0000-0000-0000000000bb   # سجلّ موظفه

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.unified_approval_steps WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_steps      WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_approval_requests   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.leaves                 WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.notifications          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees              WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL
 WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$MGR','$SUP','$EMP','$OTH','$MGB','$EMB');
DELETE FROM auth.users      WHERE id IN ('$MGR','$SUP','$EMP','$OTH','$MGB','$EMB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان · سلسلة مشرف→مدير · إجازة لكلٍّ ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','u34rls-a'),('$TB','B','شركة ب','u34rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$MGR','mgr@u34.io'),('$SUP','sup@u34.io'),('$EMP','emp@u34.io'),
  ('$OTH','oth@u34.io'),('$MGB','mgb@u34.io'),('$EMB','emb@u34.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','التقنية'),('$DB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$MGR','$TA','المدير','manager','التقنية'),
  ('$SUP','$TA','المشرف','supervisor','التقنية'),
  ('$EMP','$TA','الموظف','employee','التقنية'),
  ('$OTH','$TA','زميل','employee','التقنية'),
  ('$MGB','$TB','مدير ب','manager','قسم ب'),
  ('$EMB','$TB','موظف ب','employee','قسم ب');
-- ★ departments.manager_id → profiles لا employees
UPDATE public.departments SET manager_id='$MGR', supervisor_id='$SUP' WHERE id='$DA';
UPDATE public.departments SET manager_id='$MGB' WHERE id='$DB';
-- ★ تحديث 0335: المحفّز أنشأ السجلات؛ القيد الجديد يمنع الإدراج الثاني
UPDATE public.employees SET id='$EA', department_id='$DA', employee_code='U34A'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='U34O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='U34B'
 WHERE user_id='$MGB' AND tenant_id='$TB';
UPDATE public.employees SET id='$EBE', department_id='$DB', employee_code='U34BE'
 WHERE user_id='$EMB' AND tenant_id='$TB';
SQL

# إنشاء الطلبات بسياق كل موظف (create_hr_approval تعتمد current_user_tenant_id)
LVA=$($PSQL <<SQL
SET request.jwt.claim.sub='$EMP';
INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to)
  VALUES ('$TA','$EA','سنوية',current_date+7,current_date+9) RETURNING id;
SQL
)
REQA=$($PSQL <<SQL
SET request.jwt.claim.sub='$EMP';
SELECT public.create_hr_approval('leave','$LVA','$EA');
SQL
)
# ★ 0339: الطالب موظف عادي، والمعتمِد مديره — لا معتمِدَ نفسه
LVB=$($PSQL <<SQL
SET request.jwt.claim.sub='$EMB';
INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to)
  VALUES ('$TB','$EBE','سنوية',current_date+7,current_date+9) RETURNING id;
SQL
)
REQB=$($PSQL <<SQL
SET request.jwt.claim.sub='$EMB';
SELECT public.create_hr_approval('leave','$LVB','$EBE');
SQL
)

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① المرآة بُنيت رغم أن الكاتب موظف عادي ──"
R=$($PSQL -c "SELECT count(*) FROM public.unified_approval_steps WHERE source_id='$REQA';")
[ "$R" = "2" ] && ok "خطوتان معكوستان ($R)" || bad "★★ المرآة = $R (متوقَّع 2)"

echo "── ② ✔ صاحب الطلب يرى سلسلته ──"
R=$(as_user "$EMP" "SELECT count(*) FROM public.approval_steps_for('hr','$REQA');")
[ "$R" = "2" ] && ok "الموظف يرى خطوتَي طلبه" || bad "★ الموظف يرى $R خطوة"

echo "── ③ ✔ وبمعرّف الإجازة أيضاً (الترجمة) ──"
R=$(as_user "$EMP" "SELECT count(*) FROM public.approval_steps_for('hr','$LVA');")
[ "$R" = "2" ] && ok "الترجمة تعمل عبر RLS" || bad "★★ بمعرّف الإجازة = $R"

echo "── ④ ✔ المعتمِد يرى السلسلة ──"
R=$(as_user "$SUP" "SELECT count(*) FROM public.approval_steps_for('hr','$REQA');")
[ "$R" = "2" ] && ok "المشرف يرى السلسلة" || bad "★ المشرف يرى $R"

echo
echo "── ⑤ ★★ زميل لا علاقة له محجوب ──"
R=$(as_user "$OTH" "SELECT count(*) FROM public.approval_steps_for('hr','$REQA');")
[ "$R" = "0" ] && ok "الزميل لا يرى سلسلة غيره ($R)" \
  || bad "★★ زميل يرى $R خطوة من طلب ليس له — can_view_approval_trail مخترَق"

echo "── ⑥ ★★ شركة ب لا ترى شيئاً من شركة أ ──"
R=$(as_user "$MGB" "SELECT count(*) FROM public.approval_steps_for('hr','$REQA');")
[ "$R" = "0" ] && ok "لا تسريب عبر معرّف الطلب" || bad "★★ مدير ب يرى $R خطوة"

R=$(as_user "$MGB" "SELECT count(*) FROM public.approval_steps_for('hr','$LVA');")
[ "$R" = "0" ] && ok "ولا عبر معرّف الإجازة" || bad "★★ تسريب عبر الترجمة: $R"

R=$(as_user "$MGB" "SELECT count(*) FROM public.resolve_hr_approval_source('$LVA');")
[ "$R" = "0" ] && ok "الترجمة نفسها معزولة" || bad "★★ ترجم معرّف شركة أ: $R"

echo "── ⑦ ✔ ومدير ب يرى طلب موظفه ──"
R=$(as_user "$MGB" "SELECT count(*) FROM public.approval_steps_for('hr','$REQB');")
[ "$R" = "1" ] && ok "يرى خطوة طلب موظفه ($R)" || bad "★ مدير ب يرى $R من طلب موظفه"

# ★★ 0339: ولا يستطيع أن يكون معتمِدَ نفسه. طلب باسم المدير نفسه ⇒ صفر خطوات.
LVSELF=$($PSQL <<SQL
SET request.jwt.claim.sub='$MGB';
INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to)
  VALUES ('$TB','$EB','سنوية',current_date+30,current_date+32) RETURNING id;
SQL
)
REQSELF=$($PSQL <<SQL
SET request.jwt.claim.sub='$MGB';
SELECT public.create_hr_approval('leave','$LVSELF','$EB');
SQL
)
R=$($PSQL -c "SELECT count(*) FROM public.hr_approval_steps WHERE request_id='$REQSELF' AND approver_id='$MGB';")
[ "$R" = "0" ] && ok "★★★ 0339: المدير ليس معتمِدَ نفسه ($R خطوة)" \
  || bad "★★★ المدير معتمِدُ نفسه في $R خطوة — تضارب مصالح"

echo
echo "── ⑧ ★★ غير المعتمِد لا يبتّ ──"
# ★ psql يُخرج ERROR ثم أسطر CONTEXT — `tail -1` يلتقط CONTEXT فيضيع
#   نصّ الخطأ. نجمع الخرج كاملاً ونطابق داخله.
R=$(as_user "$OTH" "SELECT public.hr_approval_decide_any('$LVA','approved','محاولة');" 2>&1 | tr '\n' ' ')
case "$R" in
  *"not authorized"*|*"NOT_FOUND"*) ok "رُفض: ${R:0:46}" ;;
  *) bad "★★ زميل بتّ في طلب غيره: $R" ;;
esac

echo "── ⑨ ★★ ولا مدير شركة أخرى ──"
R=$(as_user "$MGB" "SELECT public.hr_approval_decide_any('$LVA','approved','محاولة');" 2>&1 | tr '\n' ' ')
case "$R" in
  *"not authorized"*|*"NOT_FOUND"*) ok "رُفض: ${R:0:46}" ;;
  *) bad "★★ مدير ب بتّ في طلب شركة أ: $R" ;;
esac

echo
echo "── ⑩ ✔ المعتمِد الصحيح يبتّ والمرآة تتبع ──"
R=$(as_user "$SUP" "SELECT public.hr_approval_decide_any('$LVA','approved','موافق');" 2>&1 | tail -1)
[ "$R" = "pending" ] && ok "المشرف بتّ ($R — بقيت خطوة المدير)" || bad "★ نتيجة البتّ: $R"

R=$($PSQL -c "SELECT status FROM public.unified_approval_steps WHERE source_id='$REQA' AND step_order=1;")
[ "$R" = "approved" ] && ok "المرآة تتبع القرار" || bad "★★ المرآة = $R (متوقَّع approved)"

echo "── ⑪ ✔ اكتمال السلسلة يُزامن المصدر (0323) ──"
R=$(as_user "$MGR" "SELECT public.hr_approval_decide_any('$REQA','approved','موافق');" 2>&1 | tail -1)
[ "$R" = "approved" ] && ok "المدير أنهى السلسلة" || bad "★ نتيجة: $R"

R=$($PSQL -c "SELECT status FROM public.leaves WHERE id='$LVA';")
[ "$R" = "موافق" ] && ok "حالة الإجازة = $R" || bad "★★ حالة الإجازة = $R"

R=$($PSQL -c "SELECT count(*) FROM public.unified_approval_steps WHERE source_id='$REQA' AND status='approved';")
[ "$R" = "2" ] && ok "كل خطوات المرآة معتمَدة ($R)" || bad "★ المرآة = $R معتمَدة"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0334-rls: 16/16 عبر RLS حقيقي"
else
  echo "❌ verify-0334-rls: $FAIL فشل"; exit 1
fi
