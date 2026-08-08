#!/usr/bin/env bash
# ============================================================================
# verify-incident-intake-0342-rls.sh
#
# رفع البلاغ والمحادثة عبر **RLS حقيقي** (SET ROLE authenticated).
#
# لماذا بجانب verify-incident-intake-0342.sql؟
#   ملف الـSQL يعمل بدور postgres (BYPASSRLS) فيقيس منطق الدوال ولا يقيس
#   السياسات. **جوهر هذه الجولة سياسة قراءة** — من يرى أي تعليق — وهو ما
#   لا يُقاس هناك إطلاقاً. تحديداً:
#     • حجب التعليق الداخلي عن صاحب البلاغ (ثغرة ⑫ في العكس: لم تسقط
#       في ملف SQL لأن postgres يرى كل شيء).
#     • رؤية صاحب البلاغ لردّ الموارد العلني.
#     • فشل الإدراج بلا tenant_id — وهو ما عطّل الصفحة أصلاً.
#
#   PGPORT=5450 bash tools/dev/verify-incident-intake-0342-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5450}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa420000-0000-0000-0000-0000000000aa
TB=bb420000-0000-0000-0000-0000000000bb
HR=11420000-0000-0000-0000-0000000000aa
EMP=12420000-0000-0000-0000-0000000000aa
OTH=13420000-0000-0000-0000-0000000000aa
EMB=12420000-0000-0000-0000-0000000000bb
DA=21420000-0000-0000-0000-0000000000aa
DB=21420000-0000-0000-0000-0000000000bb
EH=31420000-0000-0000-0000-0000000000aa
EE=32420000-0000-0000-0000-0000000000aa
EO=33420000-0000-0000-0000-0000000000aa
EB=31420000-0000-0000-0000-0000000000bb

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
  VALUES ('$TA','A','شركة أ','ni42rls-a'),('$TB','B','شركة ب','ni42rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$HR','hr@i42.io'),('$EMP','emp@i42.io'),('$OTH','oth@i42.io'),('$EMB','emb@i42.io');
INSERT INTO public.departments(id,tenant_id,name_ar)
  VALUES ('$DA','$TA','التقنية'),('$DB','$TB','قسم ب');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HR' ,'$TA','هالة الموارد','hr','التقنية'),
  ('$EMP','$TA','سعد الموظف','employee','التقنية'),
  ('$OTH','$TA','زميل','employee','التقنية'),
  ('$EMB','$TB','موظف ب','employee','قسم ب');
UPDATE public.employees SET id='$EH', department_id='$DA', employee_code='I42H'
 WHERE user_id='$HR'  AND tenant_id='$TA';
UPDATE public.employees SET id='$EE', department_id='$DA', employee_code='I42E'
 WHERE user_id='$EMP' AND tenant_id='$TA';
UPDATE public.employees SET id='$EO', department_id='$DA', employee_code='I42O'
 WHERE user_id='$OTH' AND tenant_id='$TA';
UPDATE public.employees SET id='$EB', department_id='$DB', employee_code='I42B'
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
echo "── ① ★★★ العطل الأصلي: الإدراج الخام بلا tenant_id ──"
OUT=$(as_user "$EMP" "INSERT INTO public.incidents(title,description,category,severity,is_anonymous,user_id,status) VALUES('خام','و','technical','medium',false,'$EMP','pending');" 2>&1)
if echo "$OUT" | grep -q "row-level security"; then
  ok "ما تفعله NewProblemPage القديمة مصدود بـRLS — الصفحة كانت معطّلة"
else bad "★★★ الإدراج الخام مرّ: $OUT"; fi

echo
echo "── ② البوّابة تنجح حيث فشل الإدراج الخام ──"
IA=$(as_user "$EMP" "SELECT out_id FROM public.submit_incident('تسريب مياه','الطابق الثاني','workplace','high',FALSE,'{\"summary\":\"تحليل\"}'::JSONB);" 2>&1 | tail -1)
[[ "$IA" =~ ^[0-9a-f-]{36}$ ]] && ok "الموظف رفع بلاغاً: ${IA:0:8}" || bad "★★★ فشل: $IA"

IANON=$(as_user "$EMP" "SELECT out_id FROM public.submit_incident('مضايقة','حسّاس','hr','critical',TRUE,NULL);" 2>&1 | tail -1)
[[ "$IANON" =~ ^[0-9a-f-]{36}$ ]] && ok "ورفع بلاغاً مجهولاً (كان مستحيلاً)" || bad "★★★ فشل المجهول: $IANON"

IB=$(as_user "$EMB" "SELECT out_id FROM public.submit_incident('بلاغ ب','من مستأجر آخر','other','low',FALSE,NULL);" 2>&1 | tail -1)
[[ "$IB" =~ ^[0-9a-f-]{36}$ ]] && ok "وموظف ب رفع بلاغه" || bad "فشل ب: $IB"

echo
echo "── ③ ★★★ البلاغ المجهول: صاحبه يتابعه وهويته مخفيّة ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.my_incidents(NULL,NULL,50,0) WHERE out_id='$IANON';")
[[ "$N" == "1" ]] && ok "صاحبه يراه في «بلاغاتي» (كان 0)" || bad "★★★ فقده: $N"

V=$(as_user "$HR" "SELECT out_reporter FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id='$IANON';")
[[ "$V" == "مُبلِّغ مجهول" ]] && ok "وهويته مخفيّة عن الموارد" || bad "★★★ مكشوف: $V"

N=$(as_user "$OTH" "SELECT count(*) FROM public.my_incidents(NULL,NULL,50,0) WHERE out_id='$IANON';")
[[ "$N" == "0" ]] && ok "وزميل لا يراه" || bad "★★★ زميل يرى بلاغ غيره: $N"

echo
echo "── ④ ★★★ الإدراج الخام للتعليق (ما تفعله addComment) ──"
OUT=$(as_user "$EMP" "INSERT INTO public.incident_comments(incident_id,user_id,text,is_internal) VALUES('$IA','$EMP','بلا tenant',false);" 2>&1)
if echo "$OUT" | grep -q "row-level security"; then
  ok "مصدود بـRLS — إضافة أي تعليق كانت مستحيلة"
else bad "★★★ مرّ: $OUT"; fi

echo
echo "── ⑤ بوّابة التعليق تنجح ──"
C1=$(as_user "$EMP" "SELECT public.add_incident_comment('$IA','تعليق الموظف نفسه',FALSE);" 2>&1 | tail -1)
[[ "$C1" =~ ^[0-9a-f-]{36}$ ]] && ok "الموظف علّق على بلاغه" || bad "فشل: $C1"

C2=$(as_user "$HR" "SELECT public.add_incident_comment('$IA','ردّ الموارد العلني',FALSE);" 2>&1 | tail -1)
[[ "$C2" =~ ^[0-9a-f-]{36}$ ]] && ok "والموارد ردّت علناً" || bad "فشل: $C2"

C3=$(as_user "$HR" "SELECT public.add_incident_comment('$IA','ملاحظة داخلية سرّية',TRUE);" 2>&1 | tail -1)
[[ "$C3" =~ ^[0-9a-f-]{36}$ ]] && ok "وكتبت ملاحظة داخلية" || bad "فشل: $C3"

echo
echo "── ⑥ ★★★ جوهر الجولة: من يرى أي تعليق؟ ──"
N=$(as_user "$EMP" "SELECT count(*) FROM public.incident_thread('$IA');")
[[ "$N" == "2" ]] && ok "صاحب البلاغ يرى 2: تعليقه + ردّ الموارد العلني" \
                  || bad "★★★ صاحب البلاغ يرى $N (متوقَّع 2)"

V=$(as_user "$EMP" "SELECT count(*) FROM public.incident_thread('$IA') WHERE out_is_internal;")
[[ "$V" == "0" ]] && ok "★★★ والملاحظة الداخلية محجوبة عنه" \
                  || bad "★★★ الملاحظات الإدارية مكشوفة للموظف: $V"

V=$(as_user "$EMP" "SELECT count(*) FROM public.incident_thread('$IA') WHERE out_text='ردّ الموارد العلني';")
[[ "$V" == "1" ]] && ok "★★★ وردّ الموارد وصله (كانت المحادثة أحادية)" \
                  || bad "★★★ ردّ الموارد غير مرئي لصاحب البلاغ"

N=$(as_user "$HR" "SELECT count(*) FROM public.incident_thread('$IA');")
[[ "$N" == "3" ]] && ok "والموارد ترى الثلاثة" || bad "الموارد ترى $N"

N=$(as_user "$OTH" "SELECT count(*) FROM public.incident_thread('$IA');")
[[ "$N" == "0" ]] && ok "★★★ وزميل لا طرف فيه لا يرى شيئاً" \
                  || bad "★★★ زميل يرى $N تعليقاً من بلاغ ليس له"

N=$(as_user "$EMB" "SELECT count(*) FROM public.incident_thread('$IA');")
[[ "$N" == "0" ]] && ok "وموظف ب كذلك (عزل المستأجر)" || bad "★★★ تسريب: $N"

echo
echo "── ⑦ ★★ الطرفية في الكتابة ──"
OUT=$(as_user "$OTH" "SELECT public.add_incident_comment('$IA','لست طرفاً',FALSE);" 2>&1)
echo "$OUT" | grep -q "COMMENT_NOT_PARTY" && ok "زميل مُنع من التعليق" || bad "★★★ زميل علّق: $OUT"

OUT=$(as_user "$EMB" "SELECT public.add_incident_comment('$IA','من مستأجر آخر',FALSE);" 2>&1)
echo "$OUT" | grep -qE "INCIDENT_NOT_FOUND|COMMENT_NOT_PARTY" \
  && ok "وموظف ب كذلك" || bad "★★★ اختراق عبر المستأجرين: $OUT"

OUT=$(as_user "$EMP" "SELECT public.add_incident_comment('$IA','محاولة داخلية',TRUE);" 2>&1)
echo "$OUT" | grep -q "COMMENT_INTERNAL_STAFF_ONLY" \
  && ok "والموظف مُنع من كتابة ملاحظة داخلية" || bad "★★ موظف كتب داخلية: $OUT"

echo
echo "── ⑧ ★★★ خيط البلاغ المجهول: الهوية مخفيّة في التعليقات أيضاً ──"
as_user "$EMP" "SELECT public.add_incident_comment('$IANON','تعليق صاحب المجهول',FALSE);" >/dev/null 2>&1
as_user "$HR"  "SELECT public.add_incident_comment('$IANON','ردّ على المجهول',FALSE);" >/dev/null 2>&1

V=$(as_user "$HR" "SELECT out_author FROM public.incident_thread('$IANON') WHERE out_text='تعليق صاحب المجهول';")
[[ "$V" == "مُبلِّغ مجهول" ]] && ok "الموارد لا ترى اسم صاحب البلاغ المجهول" \
                             || bad "★★★ الخيط يكشف الهوية: $V"

V=$(as_user "$HR" "SELECT COALESCE(out_author_id::TEXT,'NULL') FROM public.incident_thread('$IANON') WHERE out_text='تعليق صاحب المجهول';")
[[ "$V" == "NULL" ]] && ok "ولا معرّفه" || bad "★★★ المعرّف مكشوف: $V"

V=$(as_user "$HR" "SELECT out_author FROM public.incident_thread('$IANON') WHERE out_text='ردّ على المجهول';")
[[ "$V" == "هالة الموارد" ]] && ok "لكن اسم الموارد يظهر (إخفاء بقدر الحاجة)" \
                             || bad "★ الإخفاء أوسع من اللازم: $V"

N=$(as_user "$EMP" "SELECT count(*) FROM public.incident_thread('$IANON');")
[[ "$N" == "2" ]] && ok "وصاحبه يتابع محادثته (2)" || bad "★★★ صاحب المجهول يرى $N"

echo
echo "── ⑨ ★★ السياق مُشتقّ: القسم يظهر في الصندوق ──"
V=$(as_user "$HR" "SELECT out_department FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id='$IA';")
[[ "$V" == "التقنية" ]] && ok "القسم = التقنية (كان «—» لأن department_id فارغ)" \
                        || bad "★★ القسم = $V"

V=$(as_user "$HR" "SELECT out_comment_count FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id='$IA';")
[[ "$V" == "3" ]] && ok "وعدّ التعليقات = 3" || bad "★ العدّ = $V"

V=$(as_user "$HR" "SELECT (out_ai_analysis ? 'summary') FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id='$IA';")
[[ "$V" == "t" ]] && ok "والتحليل الذكي يُعرض (كان يُخزَّن ولا يُقرأ)" || bad "★ ai_analysis = $V"

echo
echo "── ⑩ ★★ عزل المستأجرين في الصندوق ──"
N=$(as_user "$HR" "SELECT count(*) FROM public.hr_incidents_inbox(NULL,NULL,NULL,TRUE,50,0) WHERE out_id='$IB';")
[[ "$N" == "0" ]] && ok "صندوق أ لا يعرض بلاغ ب" || bad "★★★ تسريب: $N"

echo
echo "── ⑪ ★ anon لا يصل إلى شيء ──"
for fn in "public.submit_incident('ع','و','other','low',FALSE,NULL)" "public.add_incident_comment('$IA','ع',FALSE)" "public.incident_thread('$IA')"; do
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
  echo "════════ verify-incident-intake-0342-rls: كل التأكيدات نجحت ════════"
else
  echo "════════ verify-incident-intake-0342-rls: $FAIL إخفاق ════════"
  exit 1
fi
