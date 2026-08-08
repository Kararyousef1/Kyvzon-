#!/usr/bin/env bash
# ============================================================================
# verify-tech-isolation-0328-rls.sh
#
# ★★ عزل بوابة التقنية عبر **RLS حقيقي**.
#
# بوابة التقنية خاصة بالشركة المستأجِرة. مسؤول تقنيتها يجب ألّا يعلم
# بوجود شركات أخرى أصلاً — لا أسماءها ولا خططها ولا كياناتها.
#
# لماذا سكربت منفصل؟
#   `postgres` له BYPASSRLS، وملفات verify تقيس منطق الدوال لا السياسات.
#   قياس RLS يحتاج `SET request.jwt.claim.sub` + `SET ROLE authenticated`
#   في **جلسة psql واحدة** (تمرير -c متعدد لا يحفظ الحالة).
#
# الاستعمال:
#   PGPORT=55535 PGSOCK=/home/user/.pgtest/sock ./verify-tech-isolation-0328-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55535}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a0000000-0000-0000-0000-00000000000a   # شركة عميلة أ
TB=b0000000-0000-0000-0000-00000000000b   # شركة عميلة ب
ITA=a1000000-0000-0000-0000-00000000000a  # تقني شركة أ  (it_admin)
ADA=a2000000-0000-0000-0000-00000000000a  # مسؤول شركة أ (admin)
DEV=d0000000-0000-0000-0000-00000000000d  # مطوّر المنصة (developer)

FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.system_settings   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.tenant_modules    WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.biometric_devices WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.security_events   WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles  WHERE id IN ('$ITA','$ADA','$DEV');
DELETE FROM auth.users       WHERE id IN ('$ITA','$ADA','$DEV');
DELETE FROM public.tenants   WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان عميلتان + مطوّر منصة ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','iso28-a'),('$TB','B','شركة ب','iso28-b');
INSERT INTO auth.users(id,email) VALUES
  ('$ITA','it-a@iso28.io'),('$ADA','ad-a@iso28.io'),('$DEV','dev@iso28.io');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$ITA','$TA','تقني شركة أ','it_admin'),
  ('$ADA','$TA','مسؤول شركة أ','admin'),
  ('$DEV',(SELECT id FROM public.tenants WHERE slug='kyvzon'),'مطوّر المنصة','developer');
-- إعدادات وأسرار لكل شركة
INSERT INTO public.system_settings(id,tenant_id,general_settings) VALUES
  ('s28-a','$TA','{"company":"شركة أ"}'::jsonb),
  ('s28-b','$TB','{"company":"شركة ب","secret_api_key":"sk-live-SECRET-B"}'::jsonb);
INSERT INTO public.tenant_modules(tenant_id,module_key,is_enabled) VALUES
  ('$TA','hr',true),('$TB','finance',true) ON CONFLICT DO NOTHING;
INSERT INTO public.biometric_devices(tenant_id,name,ip_address,location) VALUES
  ('$TA','جهاز أ','10.0.0.1','مدخل أ'),('$TB','جهاز ب','10.0.0.2','مدخل ب');
SQL

# يُنفّذ استعلاماً بهوية مستخدم تحت RLS
as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① ★★ تقني الشركة ليس مالكاً للمنصة ──"
R=$(as_user "$ITA" "SELECT public.current_user_is_platform_owner()::text;")
[ "$R" = "false" ] && ok "is_platform_owner = false" \
  || bad "★★ it_admin ما زال مالكاً للمنصة ($R)"

echo "── ② ★★ لا يرى قائمة الشركات العميلة ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tenants;")
[ "$R" = "1" ] && ok "يرى شركة واحدة فقط ($R)" \
  || bad "★★ يرى $R شركة — تسريب قائمة العملاء"

R=$(as_user "$ITA" "SELECT count(*) FROM public.tenants WHERE id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "ولا شركة غير شركته" \
  || bad "★★ يرى $R شركة أجنبية"

echo "── ③ ★★ لا يرى اشتراكات ولا كيانات الشركات الأخرى ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tenant_subscriptions WHERE tenant_id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "tenant_subscriptions معزول" || bad "★★ يرى $R اشتراكاً أجنبياً"

R=$(as_user "$ITA" "SELECT count(*) FROM public.legal_entities WHERE tenant_id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "legal_entities معزول" || bad "★★ يرى $R كياناً أجنبياً"

echo "── ④ ★★ إعدادات الشركات الأخرى وأسرارها ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.system_settings WHERE tenant_id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "system_settings معزول" || bad "★★ يقرأ $R إعداداً أجنبياً"

R=$(as_user "$ITA" "SELECT coalesce(max(general_settings->>'secret_api_key'),'NONE') FROM public.system_settings;")
[ "$R" = "NONE" ] && ok "لا يرى مفتاح شركة أخرى السرّي" \
  || bad "★★★ قرأ مفتاحاً سرّياً: $R"

echo "── ⑤ ★★ ولا يكتب على إعدادات غيره ──"
as_user "$ITA" "UPDATE public.system_settings SET general_settings='{\"company\":\"مُخترَقة\"}'::jsonb WHERE tenant_id='$TB';" >/dev/null 2>&1 || true
R=$($PSQL -c "SELECT general_settings->>'company' FROM public.system_settings WHERE id='s28-b';")
[ "$R" = "شركة ب" ] && ok "إعدادات شركة ب سليمة" \
  || bad "★★★ كتب على إعدادات شركة أخرى (صارت: $R)"

echo "── ⑥ وحدات الاشتراك وأجهزة البصمة ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.tenant_modules WHERE tenant_id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "tenant_modules معزول" || bad "★★ يرى $R وحدة أجنبية"

R=$(as_user "$ITA" "SELECT count(*) FROM public.biometric_devices WHERE tenant_id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "biometric_devices معزول" || bad "★★ يرى $R جهازاً أجنبياً"

echo
echo "── ⑦ ✔ وظيفته التقنية داخل شركته سليمة ──"
R=$(as_user "$ITA" "SELECT public.current_user_is_tenant_tech()::text;")
[ "$R" = "true" ] && ok "is_tenant_tech = true" || bad "تقني الشركة فقد صلاحيته ($R)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.system_settings WHERE tenant_id = current_user_tenant_id();")
[ "$R" = "1" ] && ok "يرى إعدادات شركته" || bad "حُجب عن إعدادات شركته ($R)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.biometric_devices WHERE tenant_id = current_user_tenant_id();")
[ "$R" = "1" ] && ok "يرى أجهزة شركته" || bad "حُجب عن أجهزة شركته ($R)"

as_user "$ITA" "UPDATE public.system_settings SET general_settings='{\"company\":\"شركة أ\",\"tz\":\"Asia/Baghdad\"}'::jsonb WHERE tenant_id='$TA';" >/dev/null 2>&1 || true
R=$($PSQL -c "SELECT coalesce(general_settings->>'tz','NONE') FROM public.system_settings WHERE id='s28-a';")
[ "$R" = "Asia/Baghdad" ] && ok "يعدّل إعدادات شركته" || bad "تعذّر تعديل إعدادات شركته ($R)"

echo "── ⑧ تقرير العزل الذاتي ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.my_isolation_report() WHERE NOT out_is_isolated;")
[ "$R" = "0" ] && ok "كل المجالات معزولة ($R خرق)" || bad "★★ $R مجال غير معزول"

echo
echo "── ⑨ ✔ مطوّر المنصة يحتفظ بصلاحيته ──"
R=$(as_user "$DEV" "SELECT public.current_user_is_platform_owner()::text;")
[ "$R" = "true" ] && ok "مطوّر المنصة ما زال مالكاً" \
  || bad "★ كُسر مطوّر المنصة — لا يستطيع إدارة المنصة ($R)"

R=$(as_user "$DEV" "SELECT count(*) FROM public.tenants;")
[ "$R" -ge 3 ] && ok "يرى كل الشركات ($R)" || bad "مطوّر المنصة حُجب عن الشركات ($R)"

echo "── ⑩ مسؤول الشركة (admin) ليس مالكاً للمنصة أيضاً ──"
R=$(as_user "$ADA" "SELECT public.current_user_is_platform_owner()::text;")
[ "$R" = "false" ] && ok "admin الشركة ليس مالكاً" || bad "★★ admin الشركة مالك للمنصة ($R)"

R=$(as_user "$ADA" "SELECT count(*) FROM public.tenants WHERE id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "لا يرى شركات أخرى" || bad "★★ admin يرى $R شركة أجنبية"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0328-rls: 17/17 عبر RLS حقيقي"
else
  echo "❌ verify-0328-rls: $FAIL فشل"; exit 1
fi
