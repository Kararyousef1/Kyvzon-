#!/usr/bin/env bash
# ============================================================================
# verify-tech-audit-0330-rls.sh
#
# عزل السجلّ الموحّد والأخطاء والمهام عبر **RLS حقيقي**.
#
# السجلّ الموحّد يقرأ 15 جدولاً لكلٍّ سياساته. دواله `SECURITY INVOKER`
# عمداً لتحترم RLS كل جدول — وهذا يحتاج إثباتاً تشغيلياً لا افتراضاً.
#
#   PGPORT=55539 PGSOCK=/home/user/.pgtest/sock ./verify-tech-audit-0330-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55539}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa300000-0000-0000-0000-0000000000aa
TB=bb300000-0000-0000-0000-0000000000bb
ITA=11300000-0000-0000-0000-0000000000aa   # تقني شركة أ
EMA=22300000-0000-0000-0000-0000000000aa   # موظف عادي شركة أ
LEA=33300000-0000-0000-0000-0000000000aa   # كيان قانوني شركة أ

FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.scheduled_job_runs   WHERE job_name LIKE 'rls30-%';
DELETE FROM public.error_logs           WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.audit_logs           WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.inventory_audit_log  WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.finance_audit_events WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.legal_entities       WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles  WHERE id IN ('$ITA','$EMA');
DELETE FROM auth.users       WHERE id IN ('$ITA','$EMA');
DELETE FROM public.tenants   WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان + أحداث تدقيق وأخطاء لكلٍّ منهما ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','au30rls-a'),('$TB','B','شركة ب','au30rls-b');
INSERT INTO auth.users(id,email) VALUES ('$ITA','it-a@a30.io'),('$EMA','em-a@a30.io');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$ITA','$TA','تقني أ','it_admin'),
  ('$EMA','$TA','موظف أ','employee');
INSERT INTO public.legal_entities(id,tenant_id,code,name_ar)
  VALUES ('$LEA','$TA','LE30R','كيان أ');
-- أحداث شركة أ
INSERT INTO public.audit_logs(tenant_id,actor_id,action,table_name,created_at)
  VALUES ('$TA','$ITA','update','employees',NOW());
INSERT INTO public.inventory_audit_log(tenant_id,actor_id,action,entity_table,created_at)
  VALUES ('$TA','$ITA','stock_adjust','inventory_items',NOW());
-- ★ أحداث شركة ب — يجب ألّا تظهر
INSERT INTO public.audit_logs(tenant_id,action,table_name,created_at)
  VALUES ('$TB','delete','رواتب_سرّية',NOW());
INSERT INTO public.inventory_audit_log(tenant_id,action,entity_table,created_at)
  VALUES ('$TB','purge','مخزون_سرّي',NOW());
INSERT INTO public.error_logs(tenant_id,message,severity,created_at)
  VALUES ('$TA','خطأ شركة أ','high',NOW()),
         ('$TB','خطأ شركة ب — سرّي','critical',NOW());
INSERT INTO public.scheduled_job_runs(job_name,started_at,status,duration_ms,tenants_processed)
  VALUES ('rls30-job',NOW()-INTERVAL '1 hour','success',500,99);
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① السجلّ الموحّد يحترم عزل المستأجر ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_audit_trail(NULL,NULL,100,0);")
[ "$R" = "2" ] && ok "يرى حدثَي شركته ($R)" || bad "★ يرى $R حدثاً (متوقَّع 2)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_audit_trail(NULL,NULL,100,0) WHERE out_entity IN ('رواتب_سرّية','مخزون_سرّي');")
[ "$R" = "0" ] && ok "لا يرى أحداث شركة أخرى" || bad "★★ يرى $R حدثاً أجنبياً — تسريب تدقيق"

echo "── ② البحث لا يتجاوز العزل ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_audit_trail(NULL,'سرّي',100,0);")
[ "$R" = "0" ] && ok "البحث عن «سرّي» لا يكشف شيئاً" || bad "★★ البحث كشف $R حدثاً أجنبياً"

echo "── ③ لوحة الوحدات معزولة ──"
R=$(as_user "$ITA" "SELECT coalesce(sum(out_events),0) FROM public.tech_audit_modules();")
[ "$R" = "2" ] && ok "إجمالي أحداث شركته ($R)" || bad "★★ اللوحة تحسب $R (متوقَّع 2)"

echo "── ④ سجلّ الأخطاء معزول ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_error_log(NULL,100,0);")
[ "$R" = "1" ] && ok "يرى خطأ شركته ($R)" || bad "★ يرى $R خطأ (متوقَّع 1)"

R=$(as_user "$ITA" "SELECT coalesce(max(out_message),'NONE') FROM public.tech_error_log(NULL,100,0);")
[ "$R" = "خطأ شركة أ" ] && ok "الخطأ المرئي هو خطؤه" || bad "★★ رأى: $R"

echo "── ⑤ ملخّص الأخطاء معزول ──"
R=$(as_user "$ITA" "SELECT out_count FROM public.tech_error_summary(24) WHERE out_severity='critical';")
[ "$R" = "0" ] && ok "لا يرى الخطأ الحرج لشركة أخرى ($R)" \
  || bad "★★ الملخّص يحسب أخطاء شركة أخرى ($R)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_error_summary(24);")
[ "$R" = "4" ] && ok "كل مستويات الخطورة تظهر ($R)" || bad "مستويات ناقصة ($R)"

echo
echo "── ⑥ ★ الموظف العادي محجوب عن البيانات التقنية ──"
R=$(as_user "$EMA" "SELECT count(*) FROM public.tech_scheduled_jobs();")
[ "$R" = "0" ] && ok "لا يرى المهام المجدولة ($R)" || bad "★★ موظف عادي يرى $R مهمة"

echo "── ⑦ ✔ تقني الشركة يرى المهام (وظيفته) ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_scheduled_jobs() WHERE out_job_name='rls30-job';")
[ "$R" = "1" ] && ok "يرى المهمة المجدولة" || bad "تقني الشركة حُجب عن المهام ($R)"

echo "── ⑧ ★★ المهام لا تكشف عدد المستأجرين ──"
R=$(as_user "$ITA" "SELECT count(*) FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='tech_scheduled_jobs';")
# دالة لا جدول ⇒ لا أعمدة؛ الفحص الحقيقي على الإخراج
R=$(as_user "$ITA" "SELECT out_runs_24h::text FROM public.tech_scheduled_jobs() WHERE out_job_name='rls30-job';")
[ "$R" = "1" ] && ok "تُعيد عدّاد التشغيل لا عدّاد المستأجرين ($R لا 99)" \
  || bad "★★ أعادت $R — قد تكون كشفت tenants_processed"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0330-rls: 11/11 عبر RLS حقيقي"
else
  echo "❌ verify-0330-rls: $FAIL فشل"; exit 1
fi
