#!/usr/bin/env bash
# ============================================================================
# verify-tech-exports-0332-rls.sh
#
# عزل الصادرات الموحّدة وأحداث الناقلين عبر **RLS حقيقي**.
#
# لماذا هذا الملف موجود بجانب verify-tech-exports-0332.sql؟
#   ملف الـSQL يعمل بدور postgres الذي يملك BYPASSRLS، فيقيس منطق الدوال
#   ولا يقيس السياسات. دوال 0332 كلها SECURITY INVOKER عمداً لتحترم RLS
#   الجداول الخمسة — وهذا ادّعاء يحتاج إثباتاً تشغيلياً لا افتراضاً.
#
# ★ الطبقتان مختلفتان ومقصودتان:
#   finance_report_exports  → current_user_can_access_legal_entity()
#                             (عضوية كيان في entity_memberships)
#   الأربعة الأخرى          → tenant_id = current_user_tenant_id()
#                             AND current_user_role() IN (…)
#   لذلك تقني الشركة بلا عضوية كيان **لا يرى** صادرات المالية — وهذا
#   ليس عطلاً بل تصميم: بوابة التقنية لا تتجاوز حوكمة الكيانات المالية.
#
#   PGPORT=55542 bash tools/dev/verify-tech-exports-0332-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55542}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aa320000-0000-0000-0000-0000000000aa
TB=bb320000-0000-0000-0000-0000000000bb
ITA=11320000-0000-0000-0000-0000000000aa   # تقني شركة أ
EMA=22320000-0000-0000-0000-0000000000aa   # موظف عادي شركة أ
ITB=11320000-0000-0000-0000-0000000000bb   # تقني شركة ب
LEA=33320000-0000-0000-0000-0000000000aa
LEB=33320000-0000-0000-0000-0000000000bb
CARA=44320000-0000-0000-0000-0000000000aa
CARB=44320000-0000-0000-0000-0000000000bb
FRA=55320000-0000-0000-0000-0000000000aa
FRB=55320000-0000-0000-0000-0000000000bb
IRA=66320000-0000-0000-0000-0000000000aa

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.inventory_carrier_webhook_events WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.finance_report_exports    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.inventory_report_exports  WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.mrp_bom_export_requests   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.mrp_manufacturing_export_requests WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.export_logs               WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.finance_report_runs       WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.inventory_periodic_report_runs WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.inventory_carriers        WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.entity_memberships        WHERE user_id IN ('$ITA','$EMA','$ITB');
DELETE FROM public.legal_entities            WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$ITA','$EMA','$ITB');
DELETE FROM auth.users      WHERE id IN ('$ITA','$EMA','$ITB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان · صادرات من خمسة مصادر · أحداث ناقلين ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','ex32rls-a'),('$TB','B','شركة ب','ex32rls-b');
INSERT INTO auth.users(id,email)
  VALUES ('$ITA','it-a@e32.io'),('$EMA','em-a@e32.io'),('$ITB','it-b@e32.io');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$ITA','$TA','تقني أ','it_admin'),
  ('$EMA','$TA','موظف أ','employee'),
  ('$ITB','$TB','تقني ب','it_admin');
INSERT INTO public.legal_entities(id,tenant_id,code,name_ar)
  VALUES ('$LEA','$TA','LE32RA','كيان أ'),('$LEB','$TB','LE32RB','كيان ب');
INSERT INTO public.inventory_carriers(id,tenant_id,carrier_code,name_ar,provider)
  VALUES ('$CARA','$TA','C32A','ناقل أ','aramex'),
         ('$CARB','$TB','C32B','ناقل ب','dhl');
INSERT INTO public.finance_report_runs(id,tenant_id,legal_entity_id,report_type,report_name)
  VALUES ('$FRA','$TA','$LEA','trial_balance','ميزان أ'),
         ('$FRB','$TB','$LEB','balance_sheet','ميزانية ب — سرّية');
INSERT INTO public.inventory_periodic_report_runs
  (id,tenant_id,report_number,report_type,period_start,period_end,delivery_status)
  VALUES ('$IRA','$TA','IPR32RA','daily_operations',current_date-1,current_date,'generated');

-- صادرات شركة أ
INSERT INTO public.finance_report_exports
  (tenant_id,legal_entity_id,report_run_id,export_format,status,requested_by)
  VALUES ('$TA','$LEA','$FRA','xlsx','ready','$ITA');
INSERT INTO public.inventory_report_exports
  (tenant_id,report_run_id,export_type,status,requested_by)
  VALUES ('$TA','$IRA','excel','ready','$ITA');
INSERT INTO public.mrp_bom_export_requests
  (tenant_id,request_number,export_type,status,requested_by)
  VALUES ('$TA','BOM32RA','csv','ready','$ITA');
-- ★ عالقة منذ 30 ساعة: requested_at افتراضيه now() فلا بدّ من تصريحه
INSERT INTO public.mrp_manufacturing_export_requests
  (tenant_id,export_number,export_format,status,requested_by,requested_at)
  VALUES ('$TA','MFG32RA','xlsx','queued','$ITA',NOW()-INTERVAL '30 hours');
INSERT INTO public.export_logs(tenant_id,user_id,export_type,record_count)
  VALUES ('$TA','$ITA','موظفو_أ',10);

-- ★ صادرات شركة ب — يجب ألّا تظهر لتقني أ أبداً
INSERT INTO public.finance_report_exports
  (tenant_id,legal_entity_id,report_run_id,export_format,status,requested_by)
  VALUES ('$TB','$LEB','$FRB','pdf','failed','$ITB');
INSERT INTO public.mrp_bom_export_requests
  (tenant_id,request_number,export_type,status,requested_by)
  VALUES ('$TB','BOM32RB_سرّي','csv','failed','$ITB');
INSERT INTO public.export_logs(tenant_id,user_id,export_type,record_count)
  VALUES ('$TB','$ITB','رواتب_ب_سرّية',9999);

-- أحداث ناقلين
INSERT INTO public.inventory_carrier_webhook_events
  (tenant_id,carrier_id,tracking_number,event_status,processed,received_at)
  VALUES ('$TA','$CARA','TRK32A1','delivered',TRUE ,NOW()-INTERVAL '2 hours'),
         ('$TA','$CARA','TRK32A2','in_transit',FALSE,NOW()-INTERVAL '30 hours'),
         ('$TB','$CARB','TRK32B_سرّي','held',FALSE,NOW());
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① تقني أ يرى صادرات شركته (بلا عضوية كيان بعد) ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0);")
[ "$R" = "4" ] && ok "يرى 4 صادرات غير مالية (المالية تحتاج عضوية كيان)" \
  || bad "★ يرى $R صادرة (متوقَّع 4)"

echo "── ② ★★ لا تسريب من شركة ب ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0) WHERE out_reference IN ('BOM32RB_سرّي','رواتب_ب_سرّية','ميزانية ب — سرّية');")
[ "$R" = "0" ] && ok "لا صادرة أجنبية واحدة" || bad "★★ تسريب: $R صادرة من شركة ب"

echo "── ③ ★ سياسة الكيان المالي تُحترم لا تُتجاوز ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_log('finance',NULL,500,0);")
[ "$R" = "0" ] && ok "بلا عضوية كيان: صفر صادرة مالية (السياسة نافذة)" \
  || bad "★★ رأى $R صادرة مالية بلا عضوية كيان — SECURITY DEFINER مُقنَّع؟"

echo "── ④ ✔ بعد منح عضوية الكيان تظهر صادرات المالية ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.entity_memberships(tenant_id,legal_entity_id,user_id,is_active)
  VALUES ('$TA','$LEA','$ITA',TRUE);
SQL
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_log('finance',NULL,500,0);")
[ "$R" = "1" ] && ok "عضو الكيان يرى صادرة كيانه" || bad "★ عضو الكيان يرى $R (متوقَّع 1)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0);")
[ "$R" = "5" ] && ok "الإجمالي صار 5" || bad "★ الإجمالي $R (متوقَّع 5)"

echo "── ⑤ ★★ عضوية كيان أ لا تفتح صادرات كيان ب ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0) WHERE out_reference='ميزانية ب — سرّية';")
[ "$R" = "0" ] && ok "عضوية كيان واحد لا تعمّم" || bad "★★ تسريب عبر عضوية الكيان: $R"

echo
echo "── ⑥ الملخّص معزول (المجموع لا عدد الصفوف) ──"
R=$(as_user "$ITA" "SELECT coalesce(sum(out_total),0) FROM public.tech_export_summary(30);")
[ "$R" = "5" ] && ok "مجموع الملخّص = 5" || bad "★★ الملخّص يجمع $R (متوقَّع 5)"

R=$(as_user "$ITA" "SELECT coalesce(sum(out_failed),0) FROM public.tech_export_summary(30);")
[ "$R" = "0" ] && ok "لا يحسب فاشلات شركة ب" || bad "★★ يحسب $R فاشلة أجنبية"

echo "── ⑦ المتعثّرات معزولة ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_export_failures(6);")
[ "$R" = "1" ] && ok "المتعثّرة الوحيدة هي العالقة MFG32RA" || bad "★ متعثّرات = $R (متوقَّع 1)"

R=$(as_user "$ITA" "SELECT coalesce(max(out_reference),'NONE') FROM public.tech_export_failures(6);")
[ "$R" = "MFG32RA" ] && ok "المرجع صحيح: $R" || bad "★★ المتعثّرة المرئية: $R"

echo
echo "── ⑧ أحداث الناقلين معزولة ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_carrier_webhooks(NULL,500,0);")
[ "$R" = "2" ] && ok "يرى حدثَي شركته" || bad "★ يرى $R حدثاً (متوقَّع 2)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.tech_carrier_webhooks(NULL,500,0) WHERE out_tracking='TRK32B_سرّي';")
[ "$R" = "0" ] && ok "لا يرى حدث شركة ب" || bad "★★ تسريب حدث ناقل: $R"

R=$(as_user "$ITA" "SELECT coalesce(sum(out_total),0) FROM public.tech_webhook_summary(7);")
[ "$R" = "2" ] && ok "ملخّص الناقلين معزول (مجموع=2)" || bad "★★ الملخّص يجمع $R"

echo
echo "── ⑨ ★★ الموظف العادي محجوب ──"
R=$(as_user "$EMA" "SELECT count(*) FROM public.tech_carrier_webhooks(NULL,500,0);")
[ "$R" = "0" ] && ok "موظف عادي لا يرى أحداث الناقلين (الدور غير مسموح)" \
  || bad "★★ موظف عادي يرى $R حدثاً"

# ★ export_logs محميّة بـ current_user_is_staff() — الموظف العادي ليس staff
R=$(as_user "$EMA" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0);")
[ "$R" = "0" ] && ok "موظف عادي محجوب عن كل الصادرات ($R)" \
  || bad "★★ موظف عادي يرى $R صادرة (متوقَّع 0)"

echo "── ⑩ تقني ب يرى بياناته وحدها ──"
R=$(as_user "$ITB" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0);")
[ "$R" = "2" ] && ok "تقني ب يرى صادرتَيه غير الماليتين" || bad "★ تقني ب يرى $R (متوقَّع 2)"

R=$(as_user "$ITB" "SELECT count(*) FROM public.tech_export_log(NULL,NULL,500,0) WHERE out_reference='ميزان أ';")
[ "$R" = "0" ] && ok "لا تسريب معاكس" || bad "★★ تقني ب رأى صادرة شركة أ"

R=$(as_user "$ITB" "SELECT count(*) FROM public.tech_carrier_webhooks(NULL,500,0);")
[ "$R" = "1" ] && ok "تقني ب يرى حدث ناقله" || bad "★ تقني ب يرى $R حدثاً"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0332-rls: 16/16 عبر RLS حقيقي"
else
  echo "❌ verify-0332-rls: $FAIL فشل"; exit 1
fi
