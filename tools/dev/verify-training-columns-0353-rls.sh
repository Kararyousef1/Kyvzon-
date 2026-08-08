#!/usr/bin/env bash
# ============================================================================
# verify-training-columns-0353-rls.sh
#
# الأعمدة الجديدة وجدول المحاولات عبر **RLS حقيقي**.
#
# لماذا؟ `quiz_attempts` جدول جديد يحمل **درجات اختبار الأفراد** — من رسب
# ومن أعاد المحاولة كم مرة. وسياسته تسمح للموظف بمحاولاته وحدها.
# ملف الـSQL يعمل بدور postgres (BYPASSRLS) فلا يقيس ذلك إطلاقاً.
#
#   PGPORT=5466 bash tools/dev/verify-training-columns-0353-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5466}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa530000-0000-0000-0000-0000000000aa
TB=bb530000-0000-0000-0000-0000000000bb
HRA=11530000-0000-0000-0000-0000000000aa
E1=12530000-0000-0000-0000-0000000000aa
E2=13530000-0000-0000-0000-0000000000aa
HRB=11530000-0000-0000-0000-0000000000bb
EB=12530000-0000-0000-0000-0000000000bb
CA=51530000-0000-0000-0000-0000000000aa
QA=61530000-0000-0000-0000-0000000000aa

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
DELETE FROM public.quiz_attempts   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.quizzes         WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.course_progress WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.courses         WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees       WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}

cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.quiz_attempts WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقيت $LEFT محاولة. أوقف."
  exit 1
fi

$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','أ','a53-x'), ('$TB','B','ب','b53-x');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','hr53a@x.co'),('$E1','e1@x.co'),('$E2','e2@x.co'),
  ('$HRB','hr53b@x.co'),('$EB','eb@x.co');
INSERT INTO public.profiles(id,tenant_id,full_name,role,status) VALUES
  ('$HRA','$TA','مدير أ','hr','active'),
  ('$E1', '$TA','علي','employee','active'),
  ('$E2', '$TA','سارة','employee','active'),
  ('$HRB','$TB','مدير ب','hr','active'),
  ('$EB', '$TB','موظف ب','employee','active');
INSERT INTO public.courses(id,tenant_id,title,description,category,level,status)
  VALUES ('$CA','$TA','دورة أ','د','ع','مبتدئ','active');
INSERT INTO public.quizzes(id,tenant_id,course_id,title,questions,passing_score)
  VALUES ('$QA','$TA','$CA','اختبار أ','[]'::jsonb,60);
SQL

echo "════════════════════════════════════════════════════════"
echo "  0353 — الأعمدة الجديدة عبر RLS حقيقي"
echo "════════════════════════════════════════════════════════"

as_user() {
  local uid="$1"; shift
  $PSQL <<SQL
SET request.jwt.claim.sub = '$uid';
SET ROLE authenticated;
$*
SQL
}

# ───────────────────────────────────────────────────────────────────────────
echo "── ① الموظف يسجّل تقدّمه ومحاولاته ──"

V=$(as_user "$E1" "SELECT out_time_spent FROM public.training_progress_touch('$CA', 600, 40);" 2>/dev/null | tail -1)
if [ "$V" = "600" ]; then ok "علي سجّل 600 ثانية"
else bad "النبضة أعادت '${V:-<فشل>}'"; fi

V=$(as_user "$E1" "SELECT out_time_spent FROM public.training_progress_touch('$CA', 300, 55);" 2>/dev/null | tail -1)
if [ "$V" = "900" ]; then ok "النبضة الثانية تراكمت ⇒ 900"
elif [ "$V" = "300" ]; then bad "★★★ استبدال بدل تراكم"
else bad "الوقت = '${V:-<فشل>}'"; fi

V=$(as_user "$E1" "SELECT out_score||'|'||out_passed||'|'||out_best_score FROM public.training_quiz_submit('$QA', 45);" 2>/dev/null | tail -1)
# ★ الوسيط المُمرَّر يُعاد كما كُتب (45) بينما max() يُعيد NUMERIC(5,2)
#   المُنسَّق (45.00) — فالصيغتان تتعايشان في السطر نفسه. نُطبّع بدل
#   مقارنة نصّ حرفي هشّ.
V_NORM=$(echo "$V" | sed 's/\.00\b//g')
if [ "$V_NORM" = "45|false|45" ]; then ok "المحاولة الأولى 45 ⇒ رسوب (أفضل درجة 45)"
else bad "النتيجة = '${V:-<فشل>}'"; fi

V=$(as_user "$E1" "SELECT out_best_score FROM public.training_quiz_submit('$QA', 88);" 2>/dev/null | tail -1)
if [ "$V" = "88.00" ] || [ "$V" = "88" ]; then ok "أفضل درجة صارت 88"
else bad "أفضل درجة = '${V:-<فشل>}'"; fi

V=$(as_user "$E1" "SELECT out_best_score FROM public.training_quiz_submit('$QA', 20);" 2>/dev/null | tail -1)
if [ "$V" = "88.00" ] || [ "$V" = "88" ]; then ok "محاولة أسوأ (20) لم تُنقص الأفضل"
else bad "★★★ أفضل درجة صارت '${V:-<فشل>}' — آخر درجة بدل أفضلها"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ② ★★★ خصوصية المحاولات بين الزملاء ──"

E1EMP=$($PSQL -c "SELECT id FROM public.employees WHERE tenant_id='$TA' AND user_id='$E1';")

V=$(as_user "$E1" "SELECT count(*) FROM public.training_quiz_attempts();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "3" ]; then ok "علي يرى محاولاته الثلاث"
else bad "علي يرى '${V:-<فشل>}'"; fi

V=$(as_user "$E2" "SELECT count(*) FROM public.training_quiz_attempts();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "سارة لا ترى محاولات علي"
else bad "★★★ تسريب! سارة ترى $V من محاولات علي"; fi

OUT=$(as_user "$E2" "SELECT count(*) FROM public.training_quiz_attempts(NULL,'$E1EMP');" 2>&1)
if echo "$OUT" | grep -q "لا تملك صلاحية"; then ok "سارة مرفوضة عند تمرير معرّف علي"
else bad "★★★ سارة قرأت محاولات علي بتمرير معرّفه!"; fi

V=$(as_user "$E2" "SELECT count(*) FROM public.quiz_attempts;" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "القراءة المباشرة محكومة بـRLS أيضاً"
else bad "★★★ سارة ترى $V صفّاً مباشرةً"; fi

V=$(as_user "$HRA" "SELECT count(*) FROM public.training_quiz_attempts();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "3" ]; then ok "مدير الموارد يرى الكلّ"
else bad "المدير يرى '${V:-<فشل>}'"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ③ ★★★ سجلّ الاختبار لا يُعدَّل ولا يُحذَف ──"

N=$(as_user "$E1" "WITH u AS (UPDATE public.quiz_attempts SET score=100 WHERE employee_id='$E1EMP' RETURNING 1) SELECT count(*) FROM u;" 2>/dev/null | tail -1)
if [ "${N:-9}" = "0" ]; then ok "تعديل الدرجة لا يمسّ أي صفّ"
else bad "★★★ عُدِّلت $N درجة — سجلّ الاختبار قابل للتزوير"; fi

N=$(as_user "$E1" "WITH d AS (DELETE FROM public.quiz_attempts WHERE employee_id='$E1EMP' RETURNING 1) SELECT count(*) FROM d;" 2>/dev/null | tail -1)
if [ "${N:-9}" = "0" ]; then ok "الحذف لا يمسّ أي صفّ"
else bad "★★★ حُذفت $N محاولة"; fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ④ العزل بين المستأجرين ──"

V=$(as_user "$HRB" "SELECT count(*) FROM public.training_quiz_attempts();" 2>/dev/null | tail -1)
if [ "${V:-9}" = "0" ]; then ok "مدير ب لا يرى محاولات المستأجر أ"
else bad "★★★ تسريب! مدير ب يرى $V محاولة"; fi

OUT=$(as_user "$EB" "SELECT public.training_progress_touch('$CA', 60);" 2>&1)
if echo "$OUT" | grep -q "لا تخصّ مستأجرك"; then ok "موظف ب لا يسجّل تقدّماً على دورة أ"
else bad "★★★ موظف ب سجّل تقدّماً على دورة المستأجر أ!"; fi

OUT=$(as_user "$EB" "SELECT public.training_quiz_submit('$QA', 90);" 2>&1)
if echo "$OUT" | grep -q "لا يخصّ مستأجرك\|does not exist\|null value"; then
  ok "موظف ب لا يُسلّم اختبار المستأجر أ"
else
  V=$($PSQL -c "SELECT count(*) FROM public.quiz_attempts WHERE quiz_id='$QA' AND tenant_id='$TB';")
  if [ "${V:-9}" = "0" ]; then ok "لم تُسجَّل محاولة عابرة للمستأجرين"
  else bad "★★★ سُجّلت محاولة عابرة للمستأجرين"; fi
fi

# ───────────────────────────────────────────────────────────────────────────
echo "── ⑤ المتوسط على المُختبَرين وحدهم ──"
# علي درجته 88 · سارة لم تُختبَر ⇒ المتوسط 88 لا 44

$PSQL >/dev/null 2>&1 <<SQL
INSERT INTO public.course_progress(tenant_id,course_id,employee_id,progress,score)
SELECT '$TA','$CA',e.id,30,NULL FROM public.employees e
 WHERE e.tenant_id='$TA' AND e.user_id='$E2'
ON CONFLICT (employee_id,course_id) DO NOTHING;
SQL

V=$(as_user "$HRA" "SELECT out_avg_score||'|'||out_scored_count FROM public.training_course_stats();" 2>/dev/null | tail -1)
if [ "$V" = "88.0|1" ]; then ok "المتوسط 88.0 على مُختبَر واحد — لا 44"
elif [ "$V" = "44.0|2" ]; then bad "★★★ المتوسط 44 — أُدخلت سارة بصفر"
else bad "النتيجة = '${V:-<فشل>}' والمتوقَّع 88.0|1"; fi

cleanup

echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 0353 RLS — كل التأكيدات نجحت"
else
  echo "  ❌ 0353 RLS — $FAIL فشلاً"
fi
echo "════════════════════════════════════════════════════════"
exit "$FAIL"
