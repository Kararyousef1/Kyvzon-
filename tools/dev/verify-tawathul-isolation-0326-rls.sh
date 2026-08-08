#!/usr/bin/env bash
# ============================================================================
# verify-tawathul-isolation-0326-rls.sh
#
# عزل بوابة التواصل عبر **RLS حقيقي**.
#
# لماذا سكربت منفصل؟
#   `postgres` له BYPASSRLS، فملفات verify تقيس منطق الدوال لا السياسات.
#   قياس RLS يحتاج `SET request.jwt.claim.sub` + `SET ROLE authenticated`
#   في **جلسة psql واحدة** (تمرير -c متعدد لا يحفظ الحالة).
#
# ★ هذا السكربت يوثّق نتيجة **سليمة**: العزل لم يكن معطوباً.
#   كتبتُه لأنني ادّعيتُ في التقرير أن العزل سليم — والادّعاء بلا اختبار
#   دائم لا قيمة له، ولأن أي تعديل لاحق على 22 سياسة قد يكسره صامتاً.
#
# الاستعمال:
#   PGPORT=55531 PGSOCK=/home/user/.pgtest/sock ./verify-tawathul-isolation-0326-rls.sh
# ============================================================================
set -euo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-55531}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=aaaaaaaa-0000-0000-0000-0000000000a1   # شركة أ
TB=bbbbbbbb-0000-0000-0000-0000000000b1   # شركة ب
A1=aaaaaaaa-1111-0000-0000-0000000000a1   # عضو المحادثة (شركة أ)
A2=aaaaaaaa-2222-0000-0000-0000000000a2   # عضو المحادثة (شركة أ)
A3=aaaaaaaa-3333-0000-0000-0000000000a3   # شركة أ لكن **ليس عضواً**
B1=bbbbbbbb-1111-0000-0000-0000000000b1   # شركة ب
CV=cccccccc-0000-0000-0000-0000000000c1   # المحادثة السرّية

FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL || true
DELETE FROM public.notifications          WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.tawathul_notifications WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.tawathul_messages      WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.tawathul_members       WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.tawathul_conversations WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles  WHERE id IN ('$A1','$A2','$A3','$B1');
DELETE FROM auth.users       WHERE id IN ('$A1','$A2','$A3','$B1');
DELETE FROM public.tenants   WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

echo "── تهيئة: محادثة سرّية في شركة أ ──"
$PSQL >/dev/null <<SQL
INSERT INTO public.tenants(id,name,name_ar,slug)
  VALUES ('$TA','A','أ','tw-iso-a'),('$TB','B','ب','tw-iso-b');
INSERT INTO auth.users(id,email) VALUES
  ('$A1','a1@tw.io'),('$A2','a2@tw.io'),('$A3','a3@tw.io'),('$B1','b1@tw.io');
INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
  ('$A1','$TA','عضو أ1','employee'),
  ('$A2','$TA','عضو أ2','employee'),
  ('$A3','$TA','غير عضو أ3','employee'),
  ('$B1','$TB','موظف شركة ب','employee');
INSERT INTO public.tawathul_conversations(id,tenant_id,type,title,created_by)
  VALUES ('$CV','$TA','group','رواتب الإدارة العليا — سرّي','$A1');
INSERT INTO public.tawathul_members(tenant_id,conversation_id,user_id,role)
  VALUES ('$TA','$CV','$A1','admin'),('$TA','$CV','$A2','member');
INSERT INTO public.tawathul_messages(tenant_id,conversation_id,sender_id,body)
  VALUES ('$TA','$CV','$A1','راتب المدير التنفيذي 45,000');
SQL

# يعيد: convs|msgs|members لمستخدم معطى تحت RLS
counts_for() {
  $PSQL <<SQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
SELECT (SELECT count(*) FROM public.tawathul_conversations)||'|'||
       (SELECT count(*) FROM public.tawathul_messages)||'|'||
       (SELECT count(*) FROM public.tawathul_members);
SQL
}

echo
echo "── ① موظف من **شركة أخرى** ──"
R=$(counts_for "$B1")
[ "$R" = "0|0|0" ] && ok "لا يرى شيئاً ($R)" || bad "★ تسريب عبر المستأجرين: $R"

echo "── ② موظف من نفس الشركة لكن **ليس عضواً** ──"
R=$(counts_for "$A3")
[ "${R%%|*}" = "0" ] && [ "$(echo "$R" | cut -d'|' -f2)" = "0" ] \
  && ok "لا يرى المحادثة السرّية ($R)" \
  || bad "★ غير العضو يقرأ محادثة سرّية: $R"

echo "── ③ عضو حقيقي — يجب أن يرى ──"
R=$(counts_for "$A2")
[ "$(echo "$R" | cut -d'|' -f2)" = "1" ] \
  && ok "يرى رسالة محادثته ($R)" \
  || bad "العضو الشرعي محجوب عن محادثته: $R"

echo
echo "── ④ إشعارات التواصل: لكلٍّ إشعاره وحده ──"
N=$($PSQL <<SQL
SET request.jwt.claim.sub = '$A2';
SET ROLE authenticated;
SELECT count(*) FROM public.tawathul_notifications;
SQL
)
[ "$N" = "1" ] && ok "العضو يرى إشعاره ($N)" || bad "إشعار العضو = $N (متوقَّع 1)"

N=$($PSQL <<SQL
SET request.jwt.claim.sub = '$B1';
SET ROLE authenticated;
SELECT count(*) FROM public.tawathul_notifications;
SQL
)
[ "$N" = "0" ] && ok "شركة أخرى لا ترى إشعارات التواصل" \
  || bad "★ تسرّب $N إشعار تواصل لشركة أخرى"

echo "── ⑤ ★ الجسر (0326): الجرس الموحّد يحترم العزل ──"
N=$($PSQL <<SQL
SET request.jwt.claim.sub = '$B1';
SET ROLE authenticated;
SELECT count(*) FROM public.notifications;
SQL
)
[ "$N" = "0" ] && ok "شركة أخرى لا ترى الجرس ($N)" \
  || bad "★ الجسر سرّب $N إشعاراً لشركة أخرى"

N=$($PSQL <<SQL
SET request.jwt.claim.sub = '$A3';
SET ROLE authenticated;
SELECT count(*) FROM public.notifications;
SQL
)
[ "$N" = "0" ] && ok "غير العضو لا يرى إشعار المحادثة ($N)" \
  || bad "★ الجسر كشف محادثة لغير عضو: $N"

N=$($PSQL <<SQL
SET request.jwt.claim.sub = '$A2';
SET ROLE authenticated;
SELECT count(*) FROM public.notifications WHERE related_table='tawathul_messages';
SQL
)
[ "$N" = "1" ] && ok "العضو يرى إشعار المحادثة في الجرس ($N)" \
  || bad "الجسر لم يوصل الإشعار للعضو: $N"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✅ verify-0326-rls: 8/8 عبر RLS حقيقي"
else
  echo "❌ verify-0326-rls: $FAIL فشل"; exit 1
fi
