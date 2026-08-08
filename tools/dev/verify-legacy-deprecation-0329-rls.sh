#!/usr/bin/env bash
# ============================================================================
# verify-legacy-deprecation-0329-rls.sh
#
# عزل جدول قياس المسارات القديمة عبر **RLS حقيقي**.
#
# جدول القياس يكشف سلوك مستخدمي كل شركة (أي صفحات يزورون ومتى)،
# فتسريبه بين المستأجرين تسريب سلوكي. وهو جدول جديد (0329) فلا يكفي
# افتراض أنه ورث الحماية.
#
# الاستعمال:
#   PGPORT=55537 PGSOCK=/home/user/.pgtest/sock ./verify-legacy-deprecation-0329-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55537}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=1a000000-0000-0000-0000-0000000000aa
TB=1b000000-0000-0000-0000-0000000000bb
ITA=2a000000-0000-0000-0000-0000000000aa   # تقني شركة أ
EMA=3a000000-0000-0000-0000-0000000000aa   # موظف عادي شركة أ
DEV=4d000000-0000-0000-0000-0000000000dd   # مطوّر المنصة

FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.legacy_route_usage WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles  WHERE id IN ('$ITA','$EMA','$DEV');
DELETE FROM auth.users       WHERE id IN ('$ITA','$EMA','$DEV');
DELETE FROM public.tenants   WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: شركتان + سجلّات قياس لكلٍّ منهما ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','شركة أ','lg29rls-a'),('$TB','B','شركة ب','lg29rls-b');
INSERT INTO auth.users(id,email) VALUES
  ('$ITA','it-a@l29.io'),('$EMA','em-a@l29.io'),('$DEV','dev@l29.io');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$ITA','$TA','تقني أ','it_admin'),
  ('$EMA','$TA','موظف أ','employee'),
  ('$DEV',(SELECT id FROM public.tenants WHERE slug='kyvzon'),'مطوّر المنصة','developer');
INSERT INTO public.legacy_route_usage(tenant_id,view_id,resolved_to,hit_count) VALUES
  ('$TA','hr-attendance','/app/hr/attendance',5),
  ('$TB','admin-employees','/app/admin/employees',9);
SQL

as_user() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo
echo "── ① تقني الشركة يرى قياس شركته فقط ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.legacy_route_usage;")
[ "$R" = "1" ] && ok "يرى صفاً واحداً ($R)" || bad "★ يرى $R صفاً (متوقَّع 1)"

R=$(as_user "$ITA" "SELECT count(*) FROM public.legacy_route_usage WHERE tenant_id <> current_user_tenant_id();")
[ "$R" = "0" ] && ok "لا يرى قياس شركة أخرى" || bad "★★ يرى $R صفاً أجنبياً — تسريب سلوكي"

R=$(as_user "$ITA" "SELECT coalesce(max(view_id),'NONE') FROM public.legacy_route_usage;")
[ "$R" = "hr-attendance" ] && ok "الصفّ المرئي هو صفّ شركته" || bad "★ رأى: $R"

echo "── ② موظف عادي لا يرى القياس (بيانات تقنية) ──"
R=$(as_user "$EMA" "SELECT count(*) FROM public.legacy_route_usage;")
[ "$R" = "0" ] && ok "الموظف العادي محجوب ($R)" || bad "★ موظف عادي يرى $R صفاً"

echo "── ③ ★ التسجيل ينسب للمستأجر الصحيح ──"
as_user "$ITA" "SELECT public.record_legacy_route_hit('kiosk-mode','/app/kiosk');" >/dev/null
R=$($PSQL -c "SELECT count(*) FROM public.legacy_route_usage WHERE tenant_id='$TA' AND view_id='kiosk-mode';")
[ "$R" = "1" ] && ok "سُجّل لشركة أ" || bad "★ لم يُسجّل صحيحاً ($R)"

R=$($PSQL -c "SELECT count(*) FROM public.legacy_route_usage WHERE tenant_id='$TB' AND view_id='kiosk-mode';")
[ "$R" = "0" ] && ok "ولم يُلوّث شركة ب" || bad "★★ لوّث بيانات شركة أخرى ($R)"

echo "── ④ ★ لا يستطيع الكتابة المباشرة على الجدول ──"
as_user "$ITA" "INSERT INTO public.legacy_route_usage(tenant_id,view_id) VALUES ('$TB','مزوّر');" >/dev/null 2>&1 || true
R=$($PSQL -c "SELECT count(*) FROM public.legacy_route_usage WHERE view_id='مزوّر';")
[ "$R" = "0" ] && ok "الكتابة المباشرة مرفوضة" || bad "★★ كتب صفاً مزوّراً لشركة أخرى"

echo "── ⑤ لوحة الجاهزية تحترم العزل ──"
R=$(as_user "$ITA" "SELECT count(*) FROM public.legacy_route_readiness(90);")
[ "$R" = "2" ] && ok "يرى مساري شركته فقط ($R)" || bad "★ اللوحة أعادت $R (متوقَّع 2)"

R=$(as_user "$ITA" "SELECT out_total_hits FROM public.legacy_route_summary(90);")
[ "$R" = "6" ] && ok "الملخّص يحسب زيارات شركته فقط ($R)" \
  || bad "★★ الملخّص يحسب زيارات شركات أخرى ($R — متوقَّع 6)"

echo
echo "── ⑥ ✔ مطوّر المنصة يرى الكل (لإدارة الإيقاف) ──"
R=$(as_user "$DEV" "SELECT count(*) FROM public.legacy_route_usage;")
[ "$R" -ge 3 ] && ok "يرى قياس كل الشركات ($R)" || bad "مطوّر المنصة حُجب ($R)"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0329-rls: 10/10 عبر RLS حقيقي"
else
  echo "❌ verify-0329-rls: $FAIL فشل"; exit 1
fi
