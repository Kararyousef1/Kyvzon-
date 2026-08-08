#!/usr/bin/env bash
# ============================================================================
# verify-hr-reports-0370-rls.sh
#
# تقارير الموارد البشرية عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS.
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ⑤: `manager` يُمنَع بصوتٍ مسموع لا بملفٍّ فارغٍ صامت.
#     ② العطل ⑤ الأخطر: كم صفاً كان `manager` يحصل عليه قبل الإصلاح؟
#     ③ العزل بين المستأجرين — التقرير لا يعبر.
#     ④ الموظف العاديّ ممنوع.
#     ⑤ المنفّذ SECURITY INVOKER ⇒ RLS سارية على كلّ جدولٍ يقرؤه.
#     ⑥ العطل ④: الأثر التدقيقيّ يُكتب باسم الفاعل الحقيقيّ لا غيره.
#     ⑦ السجلّ لا يُعدَّل ولا يُحذف بدور حقيقيّ.
#     ⑧ anon محجوب.
#     ⑨ العطل ②: الإبلاغ المجهول محميٌّ بدورٍ حقيقيّ أيضاً.
#
#   PGPORT=5510 bash tools/dev/verify-hr-reports-0370-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5510}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3700000-0000-0000-0000-00000000000a
TB=b3700000-0000-0000-0000-00000000000b
HRA=13700001-0000-0000-0000-000000000001
E1=23700002-0000-0000-0000-000000000002
MGR=63700006-0000-0000-0000-000000000006
HRB=43700004-0000-0000-0000-000000000004
EB=53700005-0000-0000-0000-000000000005

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.hr_report_runs DISABLE TRIGGER trg_block_hr_report_run_change;
DELETE FROM public.hr_report_runs WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.hr_report_runs ENABLE TRIGGER trg_block_hr_report_run_change;
ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.incidents        WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.wellness_entries WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees        WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments      WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$E1','$MGR','$HRB','$EB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$E1','$MGR','$HRB','$EB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

# ★ حارس التهيئة: جدولٌ ملوَّثٌ يُفسد كل ما بعده (درس انحدارات 0367)
LEFT=$($PSQL -c "SELECT count(*) FROM public.profiles WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ."; exit 1
fi
LEFTR=$($PSQL -c "SELECT count(*) FROM public.hr_report_runs WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFTR:-1}" != "0" ]; then
  echo "❌ بقي $LEFTR سجلّ تشغيل."; exit 1
fi

echo "════════ تهيئة ════════"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
 ('$TA','R0370A','مستأجر ألف','r-0370-a'), ('$TB','R0370B','مستأجر باء','r-0370-b');
INSERT INTO auth.users(id,email) VALUES
 ('$HRA','hra@r.l'),('$E1','e1@r.l'),('$MGR','mgr@r.l'),('$HRB','hrb@r.l'),('$EB','eb@r.l');
INSERT INTO public.profiles(id,tenant_id,full_name,email,role) VALUES
 ('$HRA','$TA','مدير الموارد ألف','hra@r.l','hr'),
 ('$E1','$TA','سالم الأول','e1@r.l','employee'),
 ('$MGR','$TA','مدير القسم','mgr@r.l','manager'),
 ('$HRB','$TB','مدير الموارد باء','hrb@r.l','hr'),
 ('$EB','$TB','موظف باء','eb@r.l','employee');
INSERT INTO public.departments(id,tenant_id,name_ar) VALUES
 ('d3700000-0000-0000-0000-0000000000d1','$TA','الهندسة');
UPDATE public.employees SET department_id='d3700000-0000-0000-0000-0000000000d1',
       first_name='سالم', last_name='الأول' WHERE user_id='$E1';
INSERT INTO public.wellness_entries(tenant_id,employee_id,date,score,mood,stress,energy,notes)
 SELECT '$TA',e.id,CURRENT_DATE,20,'terrible',90,10,'أفكّر في الاستقالة'
 FROM public.employees e WHERE e.user_id='$E1';
INSERT INTO public.incidents(tenant_id,user_id,employee_id,title,description,category,severity,status,employee_name,is_anonymous,reported_by)
 SELECT '$TA','$E1',e.id,'بلاغ ألف المجهول','وصف','hr','critical','pending','سالم الأول',TRUE,'$E1'
 FROM public.employees e WHERE e.user_id='$E1';
INSERT INTO public.incidents(tenant_id,user_id,employee_id,title,description,category,severity,status,employee_name,is_anonymous,reported_by)
 SELECT '$TB','$EB',e.id,'بلاغ باء','وصف','hr','high','pending','موظف باء',FALSE,'$EB'
 FROM public.employees e WHERE e.user_id='$EB';
SQL
echo "  تمّت."

# دالّة تشغيل بدور authenticated بهويّة محدَّدة
$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

# ★★★ `SET x = '…'` على مستوى الجلسة — لا `set_config(…, true)`:
#   الأخيرة محليّةٌ بالمعاملة، وكلّ عبارةٍ في psql معاملةٌ مستقلّة
#   ⇒ `auth.uid()` يعود NULL في العبارة التالية. وقعتُ في هذا هنا
#   فظهرت نجاحاتُ `manager` **زائفةً**: كان يُمنَع لأنّه بلا هويّةٍ
#   أصلاً، لا لأنّ دوره manager.
as_user() { # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① العطل ⑤: manager يُمنَع بصوتٍ مسموع ════════"
OUT=$(as_user "$MGR" "SELECT count(*) FROM public.hr_report_execute('workforce_kpi');")
if echo "$OUT" | grep -q "HR_REPORT_FORBIDDEN"; then
  ok "manager: رسالة HR_REPORT_FORBIDDEN صريحة"
else
  bad "manager لم يُمنَع بصوتٍ مسموع — الناتج: $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

OUT=$(as_user "$MGR" "SELECT count(*) FROM public.hr_report_catalog();")
if echo "$OUT" | grep -q "HR_REPORT_FORBIDDEN"; then
  ok "manager: الكتالوج ممنوعٌ كذلك"
else
  bad "manager قرأ الكتالوج — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

OUT=$(as_user "$MGR" "SELECT count(*) FROM public.hr_report_run_board();")
if echo "$OUT" | grep -q "HR_REPORT_FORBIDDEN"; then
  ok "manager: سجلّ التصديرات ممنوع"
else
  bad "manager قرأ سجلّ التصديرات — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

echo ""
echo "════════ ② ★ كم صفاً كان manager يحصل عليه قبل الإصلاح؟ ════════"
# هذا هو جوهر العطل ⑤: لولا الحارس لخرج ملفٌّ **بترويسةٍ بلا صفوف**
OUT=$(as_user "$MGR" "SELECT count(*) FROM public.incidents;")
N=$(echo "$OUT" | tail -1)
if [ "$N" = "0" ]; then
  ok "manager يرى 0 بلاغ (وكان يُصدَّر له ملفٌّ فارغٌ صامت — العطل ⑤)"
else
  bad "manager يرى $N بلاغاً — توقّعنا 0"
fi
OUT=$(as_user "$MGR" "SELECT count(*) FROM public.wellness_entries;")
N=$(echo "$OUT" | tail -1)
[ "$N" = "0" ] && ok "manager يرى 0 إدخال صحّة نفسية" || bad "manager يرى $N إدخالاً"

echo ""
echo "════════ ③ الموظف العاديّ ممنوع ════════"
OUT=$(as_user "$E1" "SELECT count(*) FROM public.hr_report_execute('incidents_detail');")
if echo "$OUT" | grep -q "HR_REPORT_FORBIDDEN"; then
  ok "employee: ممنوعٌ من تنفيذ التقارير"
else
  bad "employee نفّذ تقريراً — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

echo ""
echo "════════ ④ hr ينفّذ ويرى مستأجره وحده ════════"
OUT=$(as_user "$HRA" "SELECT count(*) FROM public.hr_report_execute('incidents_detail',CURRENT_DATE-30,CURRENT_DATE);")
N=$(echo "$OUT" | tail -1)
if [ "$N" = "1" ]; then
  ok "hr ألف يرى بلاغاً واحداً (بلاغه) لا بلاغَ باء"
else
  bad "hr ألف رأى $N — توقّعنا 1 (تسرُّبٌ بين المستأجرين؟)"
fi

OUT=$(as_user "$HRA" "SELECT c1 FROM public.hr_report_execute('incidents_detail',CURRENT_DATE-30,CURRENT_DATE);")
if echo "$OUT" | grep -q "بلاغ باء"; then
  bad "★★★ تسرَّب بلاغُ مستأجرٍ آخر إلى التقرير"
else
  ok "★★★ بلاغ باء لا يظهر في تقرير ألف"
fi

OUT=$(as_user "$HRB" "SELECT c1 FROM public.hr_report_execute('incidents_detail',CURRENT_DATE-30,CURRENT_DATE);")
if echo "$OUT" | grep -q "بلاغ باء" && ! echo "$OUT" | grep -q "بلاغ ألف"; then
  ok "hr باء يرى بلاغه وحده"
else
  bad "hr باء: ناتجٌ غير متوقَّع — $(echo "$OUT" | tr '\n' ' ')"
fi

echo ""
echo "════════ ⑤ ★★★★ العطل ②: الإبلاغ المجهول بدورٍ حقيقيّ ════════"
OUT=$(as_user "$HRA" "SELECT c5 FROM public.hr_report_execute('incidents_detail',CURRENT_DATE-30,CURRENT_DATE);")
if echo "$OUT" | grep -q "مُبلِّغ مجهول" && ! echo "$OUT" | grep -q "سالم"; then
  ok "hr نفسه لا يرى اسم المُبلِّغ المجهول"
else
  bad "★★★★ اسم المُبلِّغ مكشوفٌ لـhr — $(echo "$OUT" | tr '\n' ' ')"
fi

echo ""
echo "════════ ⑥ ★★★★ العطل ③: الصحة النفسية مجمَّعةٌ بدورٍ حقيقيّ ════════"
OUT=$(as_user "$HRA" "SELECT c1 FROM public.hr_report_execute('wellness_aggregate',CURRENT_DATE-30,CURRENT_DATE);")
if echo "$OUT" | grep -q "سالم"; then
  bad "★★★★ اسمُ موظفٍ ظهر في تقرير الصحة النفسية"
else
  ok "لا اسمَ موظفٍ في تقرير الصحة النفسية"
fi
# إدخالٌ وحيدٌ في الهندسة ⇒ n=1 < 3 ⇒ يُدمج في «أقسام أخرى»
if echo "$OUT" | grep -q "أقسام أخرى"; then
  ok "★★★ القسم ذو الإدخال الواحد مُدمَجٌ (k ≥ 3)"
else
  bad "الإخفاء k=3 لم يُطبَّق — $(echo "$OUT" | tr '\n' ' ')"
fi
OUT=$(as_user "$HRA" "SELECT c1||'|'||COALESCE(c2,'')||'|'||COALESCE(c3,'') FROM public.hr_report_execute('wellness_aggregate',CURRENT_DATE-30,CURRENT_DATE);")
if echo "$OUT" | grep -q "استقالة"; then
  bad "★★★★ ملاحظةٌ شخصيّة تسرَّبت"
else
  ok "لا ملاحظاتٍ شخصيّة"
fi

echo ""
echo "════════ ⑦ العطل ④: الأثر التدقيقيّ باسم الفاعل الحقيقيّ ════════"
N=$($PSQL -c "SELECT count(*) FROM public.hr_report_runs WHERE tenant_id='$TA' AND executed_by='$HRA';")
if [ "${N:-0}" -ge 1 ]; then
  ok "تشغيلات hr ألف مسجَّلةٌ باسمه ($N سجلّاً)"
else
  bad "لا سجلّ تشغيلٍ لـhr ألف"
fi
N=$($PSQL -c "SELECT count(*) FROM public.hr_report_runs WHERE executed_by='$MGR';")
[ "${N:-1}" = "0" ] && ok "لا سجلَّ لمحاولات manager الممنوعة" || bad "سُجِّلت $N محاولةً لـmanager"

# ★ الإدراج باسم غيرك مرفوض
OUT=$(as_user "$HRA" "INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated) VALUES ('$TA','workforce_kpi','$E1',1,1,FALSE);")
if echo "$OUT" | grep -qi "row-level security\|violates"; then
  ok "★★★ تسجيل تصديرٍ باسم شخصٍ آخر مرفوض (RLS)"
else
  bad "سُجِّل تصديرٌ باسم غير الفاعل — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

# ★ الإدراج في مستأجرٍ آخر مرفوض
OUT=$(as_user "$HRA" "INSERT INTO public.hr_report_runs(tenant_id,report_code,executed_by,row_count,total_rows,was_truncated) VALUES ('$TB','workforce_kpi','$HRA',1,1,FALSE);")
if echo "$OUT" | grep -qi "row-level security\|violates"; then
  ok "★★★ تسجيلٌ في مستأجرٍ آخر مرفوض"
else
  bad "سُجِّل تصديرٌ في مستأجرٍ آخر — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

echo ""
echo "════════ ⑧ السجلّ لا يُعدَّل ولا يُحذف بدورٍ حقيقيّ ════════"
OUT=$(as_user "$HRA" "UPDATE public.hr_report_runs SET row_count=0 WHERE tenant_id='$TA';")
if echo "$OUT" | grep -qi "permission denied\|HR_REPORT_RUN_IMMUTABLE"; then
  ok "تعديل السجلّ مرفوض"
else
  bad "عُدِّل السجلّ — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi
OUT=$(as_user "$HRA" "DELETE FROM public.hr_report_runs WHERE tenant_id='$TA';")
if echo "$OUT" | grep -qi "permission denied\|HR_REPORT_RUN_IMMUTABLE"; then
  ok "حذف السجلّ مرفوض"
else
  bad "حُذف السجلّ — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

echo ""
echo "════════ ⑨ hr باء لا يرى سجلّ تصديرات ألف ════════"
# ★ تصحيح تأكيدٍ كتبتُه خاطئاً أوّلاً: كنتُ أتوقّع 0 مطلقاً، وباء
#   شغّل تقريراً في الفحص ④ فصار له سجلُّه المشروع. المقصود أن
#   **سجلّات ألف** لا تظهر له — نقيس ذلك باسم الفاعل لا بالعدد المطلق.
OUT=$(as_user "$HRB" "SELECT actor_name FROM public.hr_report_run_board();")
if echo "$OUT" | grep -q "مدير الموارد ألف"; then
  bad "★★★ سجلّ تصديرات ألف ظهر لـhr باء"
else
  ok "★★★ لا سجلَّ من ألف يظهر لـhr باء"
fi
OUT=$(as_user "$HRB" "SELECT actor_name FROM public.hr_report_run_board();")
if echo "$OUT" | grep -q "مدير الموارد باء"; then
  ok "وباء يرى سجلَّه هو"
else
  bad "باء لا يرى سجلَّه — $(echo "$OUT" | tr '\n' ' ')"
fi

echo ""
echo "════════ ⑩ anon محجوب ════════"
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.hr_report_runs;
SQL
)
if echo "$OUT" | grep -qi "permission denied"; then
  ok "anon: permission denied على hr_report_runs"
else
  bad "anon قرأ hr_report_runs — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.hr_report_execute('workforce_kpi');
SQL
)
if echo "$OUT" | grep -qi "permission denied"; then
  ok "anon: permission denied على hr_report_execute"
else
  bad "anon نفّذ تقريراً — $(echo "$OUT" | tail -2 | tr '\n' ' ')"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-hr-reports-0370-rls: كل الفحوص ناجحة"
  exit 0
else
  echo "❌ verify-hr-reports-0370-rls: $FAIL فحصاً فاشلاً"
  exit 1
fi
