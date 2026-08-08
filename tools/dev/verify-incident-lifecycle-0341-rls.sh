#!/usr/bin/env bash
# ============================================================================
# verify-incident-lifecycle-0341-rls.sh
#
# دورة حياة البلاغ عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-incident-lifecycle-0341.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال والمحفّزات
#   ولا يقيس السياسات. الدوال الثلاث القارئة أُعلنت SECURITY INVOKER عمداً
#   — ادّعاء يحتاج إثباتاً تشغيلياً. بل إن التأكيد 11.1 هناك يتوقّع أن
#   **يُرى** بلاغ المستأجر الآخر بدور postgres، لأن الترشيح على RLS لا
#   داخل الدالة. هنا نُثبت أن RLS يقوم بدوره فعلاً.
#
#   PGPORT=5443 bash tools/dev/verify-incident-lifecycle-0341-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5443}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa410000-0000-0000-0000-0000000000aa
TB=bb410000-0000-0000-0000-0000000000bb
HR=11410000-0000-0000-0000-0000000000aa
EMP=12410000-0000-0000-0000-0000000000aa
OTH=13410000-0000-0000-0000-0000000000aa
EMB=12410000-0000-0000-0000-0000000000bb
DA=21410000-0000-0000-0000-0000000000aa
DB=21410000-0000-0000-0000-0000000000bb
EH=31410000-0000-0000-0000-0000000000aa
EE=32410000-0000-0000-0000-0000000000aa
EO=33410000-0000-0000-0000-0000000000aa
EB=31410000-0000-0000-0000-0000000000bb

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.incident_comments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.incidents         WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
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

echo "── تهيئة: شركتان · موارد + موظفان في أ · موظف في ب ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','in41rls-a'),('$TB','B','شركة ب','in41rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@i41.io'),('$EMP','emp@i41.io'),('$OTH','oth@i41.io'),('$EMB','emb@i41.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','التقنية'),('$DB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr','التقنية'),
  ('$EMP','$TA','سعد الموظف','employee','التقنية'),
  ('$OTH','$TA','زميل','employee','التقنية'),
  ('$EMB','$TB','موظف ب','employee','قسم ب');
-- ★ محفّز 0317 أنشأ سجلات الموظفين؛ قيد 0335 يمنع الإدراج الثاني
UPDATE public.employees SET id='$EH', department_id='$DA', employee_code='I41H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EE', department_id='$DA', employee_code='I41E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='I41O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='I41B'
 WHERE user_id='$EMB' AND tenant_id='$TB';

INSERT INTO public.incidents(tenant_id,user_id,employee_id,department_id,
                             employee_name,department,title,description,
                             category,severity,status,is_anonymous) VALUES
 ('$TA','$EMP','$EE','$DA','سعد الموظف','التقنية','تسريب مياه','الطابق الثاني','workplace','high','pending',false),
 ('$TA','$EMP','$EE','$DA','سعد الموظف','التقنية','مضايقة','بلاغ حسّاس','hr','critical','pending',true),
 ('$TA','$OTH','$EO','$DA','زميل','التقنية','بطء الشبكة','منذ أسبوع','technical','medium','pending',false),
 ('$TB','$EMB','$EB','$DB','موظف ب','قسم ب','بلاغ ب','من مستأجر آخر','other','low','pending',false);
SQL

IA=$($PSQL -c "SELECT id FROM public.incidents WHERE tenant_id='$TA' AND title='تسريب مياه';")
IANON=$($PSQL -c "SELECT id FROM public.incidents WHERE tenant_id='$TA' AND title='مضايقة';")
IOTH=$($PSQL -c "SELECT id FROM public.incidents WHERE tenant_id='$TA' AND title='بطء الشبكة';")
IB=$($PSQL -c "SELECT id FROM public.incidents WHERE tenant_id='$TB';")

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① ★★★ عزل المستأجرين عبر RLS (ما لا يقيسه ملف SQL) ──"
N=$(as_user "$HR" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0);")
[[ "$N" == "3" ]] && ok "صندوق أ يعرض 3 بلاغات (لا الرابع من ب)" || bad "★★★ الصندوق يعرض $N"

N=$(as_user "$HR" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IB';")
[[ "$N" == "0" ]] && ok "بلاغ المستأجر ب غير مرئي" || bad "★★★ تسريب عبر المستأجرين"

V=$(as_user "$HR" "SELECT COALESCE(max(out_total),0) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,1,0);")
[[ "$V" == "3" ]] && ok "out_total = 3 يحترم RLS (لا يعدّ ب)" || bad "★★★ out_total = $V يتجاوز RLS"

V=$(as_user "$HR" "SELECT out_total FROM public.hr_incident_stats(30);")
[[ "$V" == "3" ]] && ok "الإحصاءات تحترم RLS ($V)" || bad "★★★ الإحصاءات = $V"

echo
echo "── ② ★★ من يرى ماذا ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.my_incidents(NULL,NULL,200,0);")
[[ "$N" == "2" ]] && ok "سعد يرى بلاغيه فقط" || bad "★★ سعد يرى $N"

N=$(as_user "$OTH" "SELECT count(*) FROM public.my_incidents(NULL,NULL,200,0);")
[[ "$N" == "1" ]] && ok "الزميل يرى بلاغه وحده" || bad "★★ الزميل يرى $N"

N=$(as_user "$EMP" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0);")
[[ "$N" == "2" ]] && ok "موظف عادي عبر صندوق الموارد يرى بلاغيه فقط (RLS يحكم)" \
                  || bad "★★★ موظف يرى $N عبر صندوق الموارد"

N=$(as_user "$EMB" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IA';")
[[ "$N" == "0" ]] && ok "موظف ب لا يرى بلاغ أ" || bad "★★★ تسريب: $N"

echo
echo "── ③ ★★★ إخفاء الهوية المجهولة (0338) تحت RLS ──"
V=$(as_user "$HR" "SELECT out_reporter FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IANON';")
[[ "$V" == "مُبلِّغ مجهول" ]] && ok "الاسم مخفيّ عن الموارد البشرية" || bad "★★★ الاسم مكشوف: $V"

V=$(as_user "$HR" "SELECT COALESCE(out_employee_id::TEXT,'NULL') FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IANON';")
[[ "$V" == "NULL" ]] && ok "المعرّف مخفيّ" || bad "★★★ المعرّف مكشوف: $V"

V=$(as_user "$HR" "SELECT out_department FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IANON';")
[[ "$V" == "—" ]] && ok "القسم مخفيّ" || bad "★★★ القسم مكشوف: $V"

N=$(as_user "$HR" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,'سعد',TRUE,200,0) WHERE out_id='$IANON';")
[[ "$N" == "0" ]] && ok "البحث بالاسم لا يكشف المجهول" || bad "★★★ ثغرة استنتاج: $N"

echo
echo "── ④ ★★★ الاسم الحيّ من profiles ──"
$PSQL >/dev/null -c "UPDATE public.profiles SET full_name='سعد الاسم الجديد' WHERE id='$EMP';"
V=$(as_user "$HR" "SELECT out_reporter FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IA';")
[[ "$V" == "سعد الاسم الجديد" ]] && ok "الصندوق يتبع profiles" || bad "★★★ يعرض '$V' المتجمّد"
$PSQL >/dev/null -c "UPDATE public.profiles SET full_name='سعد الموظف' WHERE id='$EMP';"

echo
echo "── ⑤ ★★★ تغيير الحالة: من يستطيع ──"
V=$(as_user "$EMP" "SELECT public.set_incident_status('$IA','closed','سحبتُ بلاغي');" 2>&1 | tail -1)
[[ "$V" == "closed" ]] && ok "صاحب البلاغ سحب بلاغه المعلّق" || bad "★★★ صاحب البلاغ مُنع: $V"

OUT=$(as_user "$EMP" "SELECT public.set_incident_status('$IOTH','closed','ليس لي');" 2>&1)
echo "$OUT" | grep -q "INCIDENT_NOT_OWNER" && ok "ومُنع من بلاغ زميله" || bad "★★★ أغلق بلاغ غيره: $OUT"

OUT=$(as_user "$EMB" "SELECT public.set_incident_status('$IA','pending','من مستأجر آخر');" 2>&1)
echo "$OUT" | grep -qE "INCIDENT_NOT_FOUND|INCIDENT_NOT_OWNER" \
  && ok "وموظف ب مُنع من بلاغ أ" || bad "★★★ اختراق عبر المستأجرين: $OUT"

V=$(as_user "$HR" "SELECT public.set_incident_status('$IA','in_progress','أعدنا الفتح');" 2>&1 | tail -1)
[[ "$V" == "in_progress" ]] && ok "الموارد تُعيد الفتح" || bad "الموارد مُنعت: $V"

OUT=$(as_user "$EMP" "SELECT public.set_incident_status('$IA','closed','سحب متأخر');" 2>&1)
echo "$OUT" | grep -q "INCIDENT_OWNER_LIMIT" \
  && ok "وصاحبه لا يسحبه بعد بدء المعالجة" || bad "★★ سحب بلاغاً قيد المعالجة: $OUT"

echo
echo "── ⑥ ★★★ الحذف النهائي ممنوع على الجميع ──"
for pair in "سعد:$EMP" "هالة(hr):$HR"; do
  who="${pair%%:*}"; uid="${pair##*:}"
  OUT=$(as_user "$uid" "DELETE FROM public.incidents WHERE id='$IOTH';" 2>&1)
  if echo "$OUT" | grep -q "INCIDENT_DELETE_FORBIDDEN"; then ok "$who: صُدّ بالمحفّز"
  elif echo "$OUT" | grep -qi "permission denied\|policy"; then ok "$who: صُدّ بالسياسة"
  else
    N=$($PSQL -c "SELECT count(*) FROM public.incidents WHERE id='$IOTH';")
    [[ "$N" == "1" ]] && ok "$who: لم يُحذف شيء" || bad "★★★ $who حذف البلاغ نهائياً"
  fi
done

echo
echo "── ⑦ ★★ الأرشفة ──"
OUT=$(as_user "$EMP" "SELECT public.archive_incident('$IOTH','محاولة');" 2>&1)
echo "$OUT" | grep -q "INCIDENT_NOT_AUTHORIZED_TO_ARCHIVE" \
  && ok "موظف عادي مُنع من الأرشفة" || bad "★★ موظف أرشف: $OUT"

OUT=$(as_user "$EMB" "SELECT public.archive_incident('$IOTH','من مستأجر آخر');" 2>&1)
echo "$OUT" | grep -qE "INCIDENT_NOT_AUTHORIZED_TO_ARCHIVE|INCIDENT_NOT_FOUND" \
  && ok "وموظف ب كذلك" || bad "★★★ أرشف من مستأجر آخر: $OUT"

V=$(as_user "$HR" "SELECT public.archive_incident('$IOTH','مكرّر');" 2>&1 | tail -1)
[[ "$V" == "t" ]] && ok "الموارد أرشفت البلاغ" || bad "الأرشفة فشلت: $V"

N=$(as_user "$HR" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,200,0) WHERE out_id='$IOTH';")
[[ "$N" == "0" ]] && ok "والمؤرشف اختفى من الصندوق الافتراضي" || bad "★★ ما زال ظاهراً"

N=$(as_user "$HR" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,200,0) WHERE out_id='$IOTH';")
[[ "$N" == "1" ]] && ok "ويظهر بـp_include_archived" || bad "★ لا يظهر حتى بالمعامل"

N=$($PSQL -c "SELECT count(*) FROM public.incidents WHERE id='$IOTH';")
[[ "$N" == "1" ]] && ok "والبلاغ باقٍ في الجدول (أرشفة لا حذف)" || bad "★★★ اختفى"

echo
echo "── ⑧ ★ الإسناد (assign_incident من 0338) ──"
V=$(as_user "$HR" "SELECT public.assign_incident('$IA','$EO');" 2>&1 | tail -1)
[[ "$V" == "t" ]] && ok "الموارد أسندت البلاغ" || bad "الإسناد فشل: $V"

OUT=$(as_user "$EMP" "SELECT public.assign_incident('$IA','$EE');" 2>&1)
echo "$OUT" | grep -qi "NOT_AUTHORIZED_TO_ASSIGN" \
  && ok "وموظف عادي مُنع" || bad "★★ موظف أسند: $OUT"

OUT=$(as_user "$HR" "SELECT public.assign_incident('$IA','$EB');" 2>&1)
echo "$OUT" | grep -q "ASSIGNEE_NOT_IN_TENANT" \
  && ok "ولا إسناد لموظف من مستأجر آخر" || bad "★★★ أُسنِد عبر المستأجرين: $OUT"

echo
echo "── ⑨ ★ anon لا يصل إلى شيء ──"
for fn in "public.my_incidents(NULL,NULL,10,0)" "public.hr_incidents_inbox(NULL,NULL,NULL,FALSE,10,0)" "public.hr_incident_stats(30)"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM $fn;
SQL
)
  echo "$OUT" | grep -qi "permission denied" \
    && ok "anon مُنع من ${fn%%(*}" || bad "★★★ anon قرأ ${fn%%(*}: $OUT"
done

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.set_incident_status('$IA','closed',NULL);
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon مُنع من set_incident_status" || bad "★★★ anon غيّر الحالة: $OUT"

echo
if [[ $FAIL -eq 0 ]]; then
  echo "════════ verify-incident-lifecycle-0341-rls: كل التأكيدات نجحت ════════"
else
  echo "════════ verify-incident-lifecycle-0341-rls: $FAIL إخفاق ════════"
  exit 1
fi
