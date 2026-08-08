#!/usr/bin/env bash
# ============================================================================
# verify-request-guard-0324-rls.sh
#
# إثبات حارس تجاوز سلسلة الاعتماد عبر **RLS حقيقي**.
#
# لماذا سكربت منفصل عن verify-request-guard-0324.sql؟
#   `postgres` له BYPASSRLS، فملف verify يقيس منطق الدوال والمحفّزات فقط.
#   قياس RLS يحتاج `SET request.jwt.claim.sub` + `SET ROLE authenticated`
#   في **جلسة psql واحدة** (تمرير -c متعدد لا يحفظ الحالة).
#
# الاستعمال:
#   PGPORT=55527 PGSOCK=/home/user/.pgtest/sock ./verify-request-guard-0324-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55527}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

T=11111111-1111-1111-1111-111111111111   # المستأجر
E=22222222-2222-2222-2222-222222222222   # صاحب الطلب
O=33333333-3333-3333-3333-333333333333   # موظف عادي آخر
H=55555555-5555-5555-5555-555555555555   # دور hr
M=66666666-6666-6666-6666-666666666666   # مدير قسم آخر
S=77777777-7777-7777-7777-777777777777   # المشرف (المعتمِد الشرعي)
D=88888888-8888-8888-8888-888888888888   # القسم
L=44444444-4444-4444-4444-444444444444   # الإجازة

FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.notifications        WHERE tenant_id='$T';
DELETE FROM public.hr_approval_steps    WHERE tenant_id='$T';
DELETE FROM public.hr_approval_requests WHERE tenant_id='$T';
DELETE FROM public.leaves               WHERE tenant_id='$T';
DELETE FROM public.employees            WHERE tenant_id='$T';
DELETE FROM public.profiles   WHERE id IN ('$E','$O','$H','$M','$S');
DELETE FROM auth.users        WHERE id IN ('$E','$O','$H','$M','$S');
DELETE FROM public.departments WHERE tenant_id='$T';
DELETE FROM public.tenants     WHERE id='$T';
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES ('$T','R','ر','rls-guard');
INSERT INTO auth.users(id,email) VALUES
  ('$E','e@rls.io'),('$O','o@rls.io'),('$H','h@rls.io'),('$M','m@rls.io'),('$S','s@rls.io');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$O','$T','موظف آخر','employee'),
  ('$H','$T','موظف HR','hr'),
  ('$M','$T','مدير قسم آخر','manager'),
  ('$S','$T','المشرف','supervisor');
INSERT INTO public.departments(id,tenant_id,name_ar,supervisor_id,is_active)
  VALUES ('$D','$T','العمليات','$S',true);
INSERT INTO public.profiles(id,tenant_id,full_name,role,department)
  VALUES ('$E','$T','صاحب الطلب','employee','العمليات');
UPDATE public.employees SET department_id='$D' WHERE user_id='$E';
INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
  SELECT '$L','$T',e.id,'annual','2026-09-01','2026-09-03','انتظار'
    FROM public.employees e WHERE e.user_id='$E';
SET request.jwt.claim.sub='$E';
SELECT public.create_hr_approval('leave','$L',(SELECT id FROM public.employees WHERE user_id='$E'));
SQL

OPEN=$($PSQL -c "SELECT count(*) FROM public.hr_approval_steps WHERE status IN ('pending','active');")
echo "  خطوات مفتوحة: $OPEN"
[ "$OPEN" -ge 1 ] || { echo "❌ السلسلة لم تُبنَ"; exit 1; }

# يعيد حالة الإجازة بعد محاولة تحديث بدور مُعطى
try_bypass() {
  $PSQL >/dev/null 2>&1 <<SQL || true
SET request.jwt.claim.sub='$1';
SET ROLE authenticated;
UPDATE public.leaves SET status='موافق' WHERE id='$L';
SQL
  $PSQL -c "SELECT status FROM public.leaves WHERE id='$L';"
}

echo
echo "── ① موظف عادي يفتح /app/manager/… ويضغط «موافقة» ──"
[ "$(try_bypass $O)" = "انتظار" ] && ok "صُدّ" || bad "موظف عادي غيّر حالة إجازة زميله"

echo "── ② مدير قسم آخر ──"
[ "$(try_bypass $M)" = "انتظار" ] && ok "صُدّ" || bad "مدير خارج السلسلة غيّر الحالة"

echo "── ③ ★ دور hr — الثغرة الأصلية قبل 0324 ──"
[ "$(try_bypass $H)" = "انتظار" ] && ok "صُدّ بحارس 0324" \
  || bad "★ دور hr تجاوز سلسلة الاعتماد كاملةً"

echo
echo "── ④ المسار الشرعي: المشرف عبر محرّك الموافقات ──"
$PSQL >/dev/null <<SQL
SET request.jwt.claim.sub='$S';
SELECT public.unified_approval_decide('hr',
  (SELECT id FROM public.hr_approval_requests WHERE related_id='$L'),'approved','موافق');
SQL
ST=$($PSQL -c "SELECT status FROM public.leaves WHERE id='$L';")
[ "$ST" = "موافق" ] && ok "اعتُمد وتزامن المصدر (status=$ST)" \
  || bad "الحارس منع المحرّك الشرعي (status=$ST)"

echo "── ⑤ قراءة: هل يرى موظف آخر إجازة زميله؟ ──"
N=$($PSQL <<SQL
SET request.jwt.claim.sub='$O';
SET ROLE authenticated;
SELECT count(*) FROM public.leaves WHERE id='$L';
SQL
)
[ "$N" = "0" ] && ok "لا يراها" || bad "موظف يقرأ إجازة زميله ($N صف)"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0324-rls: 5/5 عبر RLS حقيقي"
else
  echo "❌ verify-0324-rls: $FAIL فشل"; exit 1
fi
