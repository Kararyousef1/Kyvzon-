#!/usr/bin/env bash
# ============================================================================
# verify-hr-communication-0371-rls.sh
#
# صندوق بريد الموارد البشرية عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS.
# ★★★ `SET x = '…'` على مستوى الجلسة لا `set_config(…, true)` — الأخيرة
#     محليّةٌ بالمعاملة وكلّ عبارةٍ في psql معاملةٌ مستقلّة (درس 0370).
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ①: الاسم يظهر بدورٍ حقيقيّ لا سلسلةً فارغة.
#     ② العطل ⑪: الموظف يرى ردَّ الموارد البشرية.
#     ③ الكتابة (الردّ/الإغلاق/الأرشفة) للموارد البشرية وحدها.
#     ④ العزل بين المستأجرين وبين الزملاء.
#     ⑤ العطل ⑤: الحذف النهائيّ محجوب بدورٍ حقيقيّ.
#     ⑥ اللوح والملخّص SECURITY INVOKER ⇒ RLS سارية.
#     ⑦ anon محجوب.
#
#   PGPORT=5512 bash tools/dev/verify-hr-communication-0371-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5512}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3710000-0000-0000-0000-00000000000a
TB=b3710000-0000-0000-0000-00000000000b
HRA=13710001-0000-0000-0000-000000000001
E1=23710002-0000-0000-0000-000000000002
E2=33710003-0000-0000-0000-000000000003
HRB=43710004-0000-0000-0000-000000000004
EB=53710005-0000-0000-0000-000000000005

M1=c3710000-0000-0000-0000-0000000000c1

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
-- ★★★ تعطيلٌ صريحٌ للمحفّزَين المانعَين — لا \`|| true\` يبتلع الخطأ.
--   \`trg_block_hr_case_delete\` من 0367 كان يترك المستأجرَين فيُفسد
--   كلَّ تشغيلٍ لاحق (انحدارُ 0367 نفسه).
ALTER TABLE public.hr_messages DISABLE TRIGGER trg_block_hr_message_delete;
ALTER TABLE public.hr_cases    DISABLE TRIGGER trg_block_hr_case_delete;
DELETE FROM public.hr_messages WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.hr_case_comments WHERE case_id IN
  (SELECT id FROM public.hr_cases WHERE tenant_id IN ('$TA','$TB'));
DELETE FROM public.hr_cases   WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.hr_messages ENABLE TRIGGER trg_block_hr_message_delete;
ALTER TABLE public.hr_cases    ENABLE TRIGGER trg_block_hr_case_delete;
DELETE FROM public.employees  WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

# ★ حارس التهيئة: جدولٌ ملوَّثٌ يُفسد كل ما بعده (درس انحدارات 0367)
LEFT=$($PSQL -c "SELECT count(*) FROM public.profiles WHERE tenant_id IN ('$TA','$TB');")
[ "${LEFT:-1}" = "0" ] || { echo "❌ التنظيف فشل — بقي $LEFT صفّ."; exit 1; }
LEFTM=$($PSQL -c "SELECT count(*) FROM public.hr_messages WHERE tenant_id IN ('$TA','$TB');")
[ "${LEFTM:-1}" = "0" ] || { echo "❌ بقيت $LEFTM رسالة."; exit 1; }
LEFTC=$($PSQL -c "SELECT count(*) FROM public.hr_cases WHERE tenant_id IN ('$TA','$TB');")
[ "${LEFTC:-1}" = "0" ] || { echo "❌ بقيت $LEFTC حالة."; exit 1; }

$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

echo "════════ تهيئة ════════"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 ('$TA','R0371A','مستأجر ألف','r-0371-a'), ('$TB','R0371B','مستأجر باء','r-0371-b');
INSERT INTO auth.users(id,email) VALUES
 ('$HRA','hra@r.l'),('$E1','e1@r.l'),('$E2','e2@r.l'),('$HRB','hrb@r.l'),('$EB','eb@r.l');
INSERT INTO public.profiles(id,tenant_id,full_name,email,role,department) VALUES
 ('$HRA','$TA','مدير الموارد ألف','hra@r.l','hr','الموارد البشرية'),
 ('$E1','$TA','سالم الأول','e1@r.l','employee','الهندسة'),
 ('$E2','$TA','ريم الثانية','e2@r.l','employee','المالية'),
 ('$HRB','$TB','مدير الموارد باء','hrb@r.l','hr','الموارد البشرية'),
 ('$EB','$TB','موظف باء','eb@r.l','employee','قسم باء');
INSERT INTO public.hr_messages(id,tenant_id,employee_id,subject,message,priority,status)
 SELECT '$M1','$TA',e.id,'استفسار سالم','متى يُصرف الراتب؟','urgent','new'
 FROM public.employees e WHERE e.user_id='$E1';
INSERT INTO public.hr_messages(tenant_id,employee_id,subject,message)
 SELECT '$TB',e.id,'رسالةُ باء','نصّ' FROM public.employees e WHERE e.user_id='$EB';
SQL
echo "  تمّت."

as_user() { # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① ★★★★ العطل ①: الاسم يظهر بدورٍ حقيقيّ ════════"
OUT=$(as_user "$HRA" "SELECT sender_name || '|' || sender_dept FROM public.hr_message_board();")
if echo "$OUT" | grep -q "سالم الأول|الهندسة"; then
  ok "hr يرى «سالم الأول|الهندسة» (كانت \"\" فارغةً دائماً)"
else
  bad "الاسم أو القسم مفقود — $(echo "$OUT" | tr '\n' ' ')"
fi

echo ""
echo "════════ ② العزل بين المستأجرين ════════"
N=$(as_user "$HRA" "SELECT count(*) FROM public.hr_message_board();" | tail -1)
[ "$N" = "1" ] && ok "hr ألف يرى رسالةً واحدة (رسالته)" || bad "hr ألف يرى $N — توقّعنا 1"

OUT=$(as_user "$HRA" "SELECT subject FROM public.hr_message_board();")
echo "$OUT" | grep -q "رسالةُ باء" \
  && bad "★★★ تسرَّبت رسالةُ مستأجرٍ آخر" \
  || ok "★★★ رسالةُ باء لا تظهر لألف"

N=$(as_user "$HRB" "SELECT count(*) FROM public.hr_message_board();" | tail -1)
[ "$N" = "1" ] && ok "hr باء يرى رسالته وحدها" || bad "hr باء يرى $N"

echo ""
echo "════════ ③ الموظف: يرى رسائله لا رسائل زملائه ════════"
N=$(as_user "$E1" "SELECT count(*) FROM public.hr_messages;" | tail -1)
[ "$N" = "1" ] && ok "سالم يرى رسالته" || bad "سالم يرى $N — توقّعنا 1"

N=$(as_user "$E2" "SELECT count(*) FROM public.hr_messages;" | tail -1)
[ "$N" = "0" ] && ok "★★★ ريم لا ترى رسالة سالم" || bad "ريم ترى $N رسالة"

echo ""
echo "════════ ④ الكتابة للموارد البشرية وحدها ════════"
OUT=$(as_user "$E1" "SELECT public.hr_message_reply('$M1','ردٌّ من موظف');")
echo "$OUT" | grep -q "HR_MESSAGE_FORBIDDEN" \
  && ok "employee: الردّ ممنوعٌ بصوتٍ مسموع" \
  || bad "employee ردّ على رسالة — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$E1" "SELECT public.hr_message_archive('$M1','أُخفيها');")
echo "$OUT" | grep -q "HR_MESSAGE_FORBIDDEN" \
  && ok "employee: الأرشفة ممنوعة" \
  || bad "employee أرشف رسالة — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$E1" "UPDATE public.hr_messages SET status='closed' WHERE id='$M1';")
if echo "$OUT" | grep -qiE "row-level security|violates|permission denied"; then
  ok "employee: التحديث المباشر مرفوض"
else
  N=$($PSQL -c "SELECT status FROM public.hr_messages WHERE id='$M1';")
  [ "$N" = "new" ] && ok "employee: التحديث لم يُغيّر شيئاً (RLS)" \
                   || bad "employee غيّر الحالة إلى $N"
fi

echo ""
echo "════════ ⑤ ★★★★ العطل ⑪: الردُّ يصل الموظف ════════"
$PSQL >/dev/null <<SQL
INSERT INTO public.hr_cases(id,tenant_id,employee_id,case_type,subject,description,priority,status)
 SELECT 'f3710000-0000-0000-0000-0000000000fa','$TA',e.id,'general_inquiry',
        'طلبُ سالم','نصّ','normal','open'
 FROM public.employees e WHERE e.user_id='$E1';
UPDATE public.hr_messages SET case_id='f3710000-0000-0000-0000-0000000000fa' WHERE id='$M1';
SQL

OUT=$(as_user "$HRA" "SELECT public.hr_message_reply('$M1','يُصرف يوم 25');")
echo "$OUT" | grep -q "^t$" \
  && ok "hr ردّ بنجاح" \
  || bad "الردّ فشل — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

# ★★★★ الموظف يقرأ الردَّ من رسالته
OUT=$(as_user "$E1" "SELECT reply FROM public.hr_messages WHERE id='$M1';")
echo "$OUT" | grep -q "يُصرف يوم 25" \
  && ok "★★★★ سالم يقرأ الردَّ في رسالته" \
  || bad "الردُّ غير مرئيٍّ للموظف — $(echo "$OUT" | tr '\n' ' ')"

# ★★★★ وفي الحالة التي تقرؤها ContactPage فعلاً
OUT=$(as_user "$E1" "SELECT status FROM public.hr_cases WHERE id='f3710000-0000-0000-0000-0000000000fa';")
echo "$OUT" | grep -q "in_review" \
  && ok "★★★★ والحالةُ انتقلت إلى in_review — الشاشة التي يقرؤها فعلاً" \
  || bad "الحالة لم تنتقل — $(echo "$OUT" | tr '\n' ' ')"

echo ""
echo "════════ ⑥ العزل في الكتابة ════════"
OUT=$(as_user "$HRB" "SELECT public.hr_message_close('$M1');")
if echo "$OUT" | grep -q "HR_MESSAGE_NOT_REPLIED"; then
  ok "★★★ hr باء لا يرى رسالةَ ألف فلا يُغلقها (RLS)"
else
  N=$($PSQL -c "SELECT status FROM public.hr_messages WHERE id='$M1';")
  [ "$N" = "replied" ] && ok "★★★ hr باء لم يُغيّر رسالةَ ألف" \
                       || bad "hr باء غيّر الحالة إلى $N"
fi

echo ""
echo "════════ ⑦ ★★★ العطل ⑤: الحذف النهائيّ محجوب ════════"
OUT=$(as_user "$HRA" "DELETE FROM public.hr_messages WHERE id='$M1';")
if echo "$OUT" | grep -qiE "permission denied|HR_MESSAGE_DELETE_BLOCKED"; then
  ok "hr: الحذف مرفوض"
else
  N=$($PSQL -c "SELECT count(*) FROM public.hr_messages WHERE id='$M1';")
  [ "$N" = "1" ] && ok "hr: الرسالة باقية" || bad "الرسالة حُذفت"
fi

# ★★★ طبقتان تحرسان الحذف، والمحفّزُ يمسك الحالة **قبل** الصلاحية
#   فتبقى الصلاحيةُ غيرَ مُختبَرة (نمط «حارسٌ سابق يمسك الحالة»).
#   نفصلهما: نُعطّل المحفّز مؤقتاً ونُثبت أنّ الصلاحية وحدها تمنع.
$PSQL -c "ALTER TABLE public.hr_messages DISABLE TRIGGER trg_block_hr_message_delete;" >/dev/null 2>&1
OUT=$(as_user "$HRA" "DELETE FROM public.hr_messages WHERE id='$M1';")
$PSQL -c "ALTER TABLE public.hr_messages ENABLE TRIGGER trg_block_hr_message_delete;" >/dev/null 2>&1
if echo "$OUT" | grep -qi "permission denied"; then
  ok "★★★ وبلا المحفّز: صلاحيةُ DELETE وحدها تمنع (طبقتان مستقلّتان)"
else
  N=$($PSQL -c "SELECT count(*) FROM public.hr_messages WHERE id='$M1';")
  [ "$N" = "1" ] && bad "المحفّز وحده يحرس — الصلاحية مفتوحة" \
                 || bad "★★★ الرسالة حُذفت بلا محفّز — الصلاحية مفتوحة"
fi

echo ""
echo "════════ ⑧ الملخّص بدورٍ حقيقيّ ════════"
OUT=$(as_user "$HRA" "SELECT total_open::TEXT || '|' || unlinked::TEXT FROM public.hr_message_summary();")
echo "$OUT" | tail -1 | grep -q "^0|0$" \
  && ok "hr ألف: مفتوحة=0 · غير مرتبطة=0 (رسالتُه مردودٌ عليها ومرتبطة)" \
  || bad "الملخّص غير متوقَّع: $(echo "$OUT" | tail -1)"

OUT=$(as_user "$HRB" "SELECT total_open::TEXT FROM public.hr_message_summary();")
echo "$OUT" | tail -1 | grep -q "^1$" \
  && ok "★★★ وhr باء يرى مفتوحته هو وحدها (الملخّص INVOKER)" \
  || bad "ملخّص باء: $(echo "$OUT" | tail -1)"

echo ""
echo "════════ ⑨ الموظف لا يقرأ اللوح ════════"
# ★ الفحصُ الأوّل كشف قراراً ناقصاً لا خطأً في الاختبار: اللوح كان بلا
#   حارس دورٍ فرأى الموظفُ رسالتَه فيه. لا تسرُّبَ (RLS تحرس)، لكنّ
#   صندوق الوارد للموارد البشرية. أُضيف الحارسُ الصريح — دفاعٌ مزدوج.
OUT=$(as_user "$E1" "SELECT count(*) FROM public.hr_message_board();")
echo "$OUT" | grep -q "HR_MESSAGE_FORBIDDEN" \
  && ok "★★★ الموظف ممنوعٌ من لوح الوارد بصوتٍ مسموع" \
  || bad "الموظف قرأ اللوح — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$(as_user "$E1" "SELECT count(*) FROM public.hr_message_summary();")
echo "$OUT" | grep -q "HR_MESSAGE_FORBIDDEN" \
  && ok "★★★ والملخّص كذلك" \
  || bad "الموظف قرأ الملخّص — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

# ★★★★ لكنّه **يقرأ ردَّه** — وهذا جوهر العطل ⑪
OUT=$(as_user "$E1" "SELECT reply FROM public.hr_messages WHERE id='$M1';")
echo "$OUT" | grep -q "يُصرف يوم 25" \
  && ok "★★★★ ومع ذلك يقرأ ردَّه من رسالته — الحقُّ محفوظ" \
  || bad "المنعُ حجب الردَّ عن صاحبه — $(echo "$OUT" | tr '\n' ' ')" 

echo ""
echo "════════ ⑩ anon محجوب ════════"
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.hr_messages;
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon: permission denied على hr_messages" \
  || bad "anon قرأ hr_messages — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.hr_message_board();
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon: permission denied على hr_message_board" \
  || bad "anon قرأ اللوح — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.hr_message_reply('$M1','x');
SQL
)
echo "$OUT" | grep -qi "permission denied" \
  && ok "anon: permission denied على hr_message_reply" \
  || bad "anon ردّ — $(echo "$OUT" | tail -2 | tr '\n' ' ')"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-hr-communication-0371-rls: كل الفحوص ناجحة"
  exit 0
else
  echo "❌ verify-hr-communication-0371-rls: $FAIL فحصاً فاشلاً"
  exit 1
fi
