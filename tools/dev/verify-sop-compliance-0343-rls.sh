#!/usr/bin/env bash
# ============================================================================
# verify-sop-compliance-0343-rls.sh
#
# إجراءات التشغيل عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-sop-compliance-0343.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال ولا يقيس
#   السياسات. **جوهر عطل ② سياسة UPDATE** — الموظف كان لا يستطيع تحديث
#   سجلّ قراءته ولا اعتماده (مُقاس: 0 صفوف متأثّرة) — وهو ما لا يُقاس
#   هناك إطلاقاً.
#
#   PGPORT=5452 bash tools/dev/verify-sop-compliance-0343-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5452}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa430000-0000-0000-0000-0000000000aa
TB=bb430000-0000-0000-0000-0000000000bb
HR=11430000-0000-0000-0000-0000000000aa
EMP=12430000-0000-0000-0000-0000000000aa
OTH=13430000-0000-0000-0000-0000000000aa
EMB=12430000-0000-0000-0000-0000000000bb
DA=21430000-0000-0000-0000-0000000000aa
DB=21430000-0000-0000-0000-0000000000bb
EH=31430000-0000-0000-0000-0000000000aa
EE=32430000-0000-0000-0000-0000000000aa
EO=33430000-0000-0000-0000-0000000000aa
EB=31430000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.sop_readings WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.sops         WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees    WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id=NULL, supervisor_id=NULL,
       direct_manager_id=NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HR','$EMP','$OTH','$EMB');
DELETE FROM auth.users      WHERE id IN ('$HR','$EMP','$OTH','$EMB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان · موظفان + موارد في أ · موظف في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','so43rls-a'),('$TB','B','شركة ب','so43rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@s43.io'),('$EMP','emp@s43.io'),('$OTH','oth@s43.io'),('$EMB','emb@s43.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','الإنتاج'),('$DB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr','الإنتاج'),
  ('$EMP','$TA','سعد الموظف','employee','الإنتاج'),
  ('$OTH','$TA','ليلى','employee','الإنتاج'),
  ('$EMB','$TB','موظف ب','employee','قسم ب');
UPDATE public.employees SET id='$EH', department_id='$DA', employee_code='S43H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EE', department_id='$DA', employee_code='S43E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='S43O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='S43B'
 WHERE user_id='$EMB' AND tenant_id='$TB';

INSERT INTO public.sops(tenant_id,code,title,description,department,department_id,
                        category,version,status,is_mandatory) VALUES
 ('$TA','R43-001','إجراء السلامة','وصف','الإنتاج','$DA','safety','1.0','active',TRUE),
 ('$TA','R43-002','إجراء عام','وصف','general',NULL,'quality','1.0','active',FALSE),
 ('$TB','R43-B01','إجراء ب','وصف','قسم ب','$DB','safety','1.0','active',TRUE);
SQL

S1=$($PSQL -c "SELECT id FROM public.sops WHERE code='R43-001';")
S2=$($PSQL -c "SELECT id FROM public.sops WHERE code='R43-002';")
SB=$($PSQL -c "SELECT id FROM public.sops WHERE code='R43-B01';")

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① ★★★ العطل الأصلي: التحديث المباشر لسجلّ القراءة ──"
# نُنشئ سجلّاً بدور postgres ثم نحاول تحديثه بدور الموظف بالطريقة القديمة
$PSQL >/dev/null <<SQL
INSERT INTO public.sop_readings(tenant_id,sop_id,employee_id,started_at,last_read_at,
                                read_count,time_spent,completed,approved,approval_status)
 VALUES('$TA','$S1','$EE',NOW(),NOW(),1,10,FALSE,FALSE,'pending');
SQL
N=$(as_user "$EMP" "WITH u AS (UPDATE public.sop_readings SET time_spent=99 WHERE sop_id='$S1' AND employee_id='$EE' RETURNING 1) SELECT count(*) FROM u;")
[[ "$N" == "1" ]] && ok "الموظف يُحدّث سجلّ قراءته (كان 0 صفوف)" \
                  || bad "★★★ ما زال 0 — سياسة المالك لا تعمل"

echo
echo "── ② ★★★ ولا يمسّ سجلّ غيره ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.sop_readings(tenant_id,sop_id,employee_id,started_at,last_read_at,
                                read_count,time_spent,completed,approved,approval_status)
 VALUES('$TA','$S1','$EO',NOW(),NOW(),1,50,FALSE,FALSE,'pending');
SQL
N=$(as_user "$EMP" "WITH u AS (UPDATE public.sop_readings SET time_spent=999 WHERE employee_id='$EO' RETURNING 1) SELECT count(*) FROM u;")
[[ "$N" == "0" ]] && ok "سجلّ زميلته محميّ (0 صفوف)" || bad "★★★ عدّل سجلّ غيره: $N"

echo
echo "── ③ ★★★ ولا سجلّ من مستأجر آخر ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.sop_readings(tenant_id,sop_id,employee_id,started_at,last_read_at,
                                read_count,time_spent,completed,approved,approval_status)
 VALUES('$TB','$SB','$EB',NOW(),NOW(),1,50,FALSE,FALSE,'pending');
SQL
N=$(as_user "$EMP" "WITH u AS (UPDATE public.sop_readings SET time_spent=999 WHERE tenant_id='$TB' RETURNING 1) SELECT count(*) FROM u;")
[[ "$N" == "0" ]] && ok "سجلّ المستأجر ب محميّ" || bad "★★★ اختراق عبر المستأجرين: $N"

echo
echo "── ④ بوّابة اللمس تعمل بجلسة الموظف ──"
$PSQL >/dev/null -c "DELETE FROM public.sop_readings WHERE tenant_id IN ('$TA','$TB');"
V=$(as_user "$EMP" "SELECT out_read_count FROM public.sop_reading_touch('$S1', NULL);" 2>&1 | tail -1)
[[ "$V" == "1" ]] && ok "أول لمسة أنشأت السجلّ" || bad "فشل: $V"

N=$($PSQL -c "SELECT count(*) FROM public.sop_readings WHERE sop_id='$S1' AND employee_id='$EE';")
[[ "$N" == "1" ]] && ok "والصفّ مكتوب في القاعدة (كان useState فقط)" || bad "★★★ لم يُكتب: $N"

V=$($PSQL -c "SELECT tenant_id FROM public.sop_readings WHERE sop_id='$S1' AND employee_id='$EE';")
[[ "$V" == "$TA" ]] && ok "و tenant_id مُشتقّ من الجلسة" || bad "★★ tenant خاطئ: $V"

echo
echo "── ⑤ ★★★ الاعتماد بجلسة الموظف (كان مستحيلاً) ──"
V=$(as_user "$EMP" "SELECT public.sop_reading_approve('$S1');" 2>&1 | tail -1)
[[ "$V" == "t" ]] && ok "الموظف اعتمد قراءته" || bad "★★★ فشل الاعتماد: $V"

# ★ psql مع -A يطبع boolean نصّاً كاملاً ('true') لا 't'
V=$($PSQL -c "SELECT approved::TEXT||'/'||approval_status FROM public.sop_readings WHERE sop_id='$S1' AND employee_id='$EE';")
[[ "$V" == "true/approved" ]] && ok "ودليل الامتثال مكتوب ($V)" || bad "★★★ $V"

echo
echo "── ⑥ ★★ الحارس تحت RLS ──"
OUT=$(as_user "$EMP" "UPDATE public.sop_readings SET approved=false WHERE sop_id='$S1' AND employee_id='$EE';" 2>&1)
echo "$OUT" | grep -q "SOP_APPROVAL_FINAL" && ok "لا يسحب اعتماده" || bad "★★★ سحب الاعتماد: $OUT"

# ★ نرفع الوقت أولاً بدور postgres، وإلا كانت القيمة 0 و«0 ← 0» ليس نقصاً
$PSQL >/dev/null -c "UPDATE public.sop_readings SET time_spent=400 WHERE sop_id='$S1' AND employee_id='$EE';"
OUT=$(as_user "$EMP" "UPDATE public.sop_readings SET time_spent=0 WHERE sop_id='$S1' AND employee_id='$EE';" 2>&1)
echo "$OUT" | grep -q "SOP_TIME_MONOTONIC" && ok "ولا يُنقص وقته" || bad "★★ نقص الوقت: $OUT"

OUT=$(as_user "$EMP" "UPDATE public.sop_readings SET employee_id='$EO' WHERE sop_id='$S1' AND employee_id='$EE';" 2>&1)
echo "$OUT" | grep -qE "SOP_READING_IMMUTABLE_LINK|row-level security" \
  && ok "ولا ينقل السجلّ لغيره" || bad "★★★ نقل السجلّ: $OUT"

echo
echo "── ⑦ ★ الموارد البشرية تُصحّح إدارياً ──"
N=$(as_user "$HR" "WITH u AS (UPDATE public.sop_readings SET time_spent=1 WHERE sop_id='$S1' AND employee_id='$EE' RETURNING 1) SELECT count(*) FROM u;")
[[ "$N" == "1" ]] && ok "الموارد تُصحّح (الحارس يستثنيها)" || bad "★ الموارد مُنعت: $N"
$PSQL >/dev/null -c "UPDATE public.sop_readings SET time_spent=400 WHERE sop_id='$S1' AND employee_id='$EE';"

echo
echo "── ⑧ ★★ الكتالوج تحت RLS ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.my_sops(NULL,NULL,NULL,100,0);")
[[ "$N" == "2" ]] && ok "الموظف يرى إجراءَي قسمه والعام" || bad "★★ يرى $N"

N=$(as_user "$EMP" "SELECT count(*) FROM public.my_sops(NULL,NULL,NULL,100,0) WHERE out_id='$SB';")
[[ "$N" == "0" ]] && ok "ولا يرى إجراء المستأجر ب" || bad "★★★ تسريب: $N"

N=$(as_user "$EMB" "SELECT count(*) FROM public.my_sops(NULL,NULL,NULL,100,0) WHERE out_id IN ('$S1','$S2');")
[[ "$N" == "0" ]] && ok "وموظف ب لا يرى إجراءات أ" || bad "★★★ تسريب: $N"

V=$(as_user "$EMP" "SELECT out_approved FROM public.my_sops(NULL,NULL,NULL,100,0) WHERE out_id='$S1';")
[[ "$V" == "t" ]] && ok "وتقدّمه يظهر في الكتالوج" || bad "★★ التقدّم لا يظهر: $V"

echo
echo "── ⑨ ★★ الامتثال تحت RLS ──"
# ★ ثلاثة مستهدَفين: سعد وليلى **وهالة** — كلّهم في قسم الإنتاج هنا
V=$(as_user "$HR" "SELECT out_target_count||'/'||out_approved_count FROM public.sop_compliance_overview(NULL) WHERE out_sop_id='$S1';")
[[ "$V" == "3/1" ]] && ok "الموارد ترى: 3 مستهدَفين · معتمِد واحد" || bad "★★ $V"

N=$(as_user "$HR" "SELECT count(*) FROM public.sop_compliance_overview(NULL) WHERE out_sop_id='$SB';")
[[ "$N" == "0" ]] && ok "ولا تعرض إجراء المستأجر ب" || bad "★★★ تسريب: $N"

# ★ موظف عادي: الامتثال يعتمد على RLS جدول sop_readings
N=$(as_user "$OTH" "SELECT out_approved_count FROM public.sop_compliance_overview(NULL) WHERE out_sop_id='$S1';")
[[ "$N" == "0" ]] && ok "★★ موظفة لا ترى اعتمادات زملائها (RLS يحكم)" \
                  || bad "★★★ موظفة ترى $N اعتماداً لغيرها"

echo
echo "── ⑩ ★ anon لا يصل إلى شيء ──"
for fn in "public.sop_reading_touch('$S1', NULL)" "public.sop_reading_approve('$S1')" "public.my_sops(NULL,NULL,NULL,10,0)" "public.sop_compliance_overview(NULL)"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT * FROM $fn;
SQL
)
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon مُنع من ${fn%%(*}" || bad "★★★ anon نفّذ ${fn%%(*}: ${OUT:0:60}"
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "════════ verify-sop-compliance-0343-rls: كل التأكيدات نجحت ════════"
else
  echo "════════ verify-sop-compliance-0343-rls: $FAIL إخفاق ════════"
  exit 1
fi
