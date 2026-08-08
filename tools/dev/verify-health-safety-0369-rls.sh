#!/usr/bin/env bash
# ============================================================================
# verify-health-safety-0369-rls.sh
#
# الصحة والسلامة المهنية عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS.
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ⑭: المالك يرى الإجراء المُسنَد إليه (لم يكن يراه).
#     ② الكتابة تبقى للموارد البشرية وحدها.
#     ③ العزل بين المستأجرين وبين الزملاء.
#     ④ العطل ⑪: الحذف النهائيّ محجوب.
#     ⑤ اللوحان والملخّص SECURITY INVOKER ⇒ RLS سارية.
#     ⑥ العطل ①: التصنيفات الأربعة تُقبل بدور حقيقيّ.
#     ⑦ anon محجوب.
#
#   PGPORT=5508 bash tools/dev/verify-health-safety-0369-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5508}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3690000-0000-0000-0000-00000000000a
TB=b3690000-0000-0000-0000-00000000000b
HRA=13690001-0000-0000-0000-000000000001
E1=23690002-0000-0000-0000-000000000002
E2=33690003-0000-0000-0000-000000000003
HRB=43690004-0000-0000-0000-000000000004
EB=53690005-0000-0000-0000-000000000005

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.corrective_actions DISABLE TRIGGER trg_block_capa_delete;
ALTER TABLE public.incidents DISABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.corrective_actions WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.incidents WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.corrective_actions ENABLE TRIGGER trg_block_capa_delete;
ALTER TABLE public.incidents ENABLE TRIGGER trg_block_incident_delete;
DELETE FROM public.employees WHERE tenant_id IN ('$TA','$TB');
UPDATE public.departments SET manager_id = NULL WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.departments WHERE tenant_id IN ('$TA','$TB');
DELETE FROM public.profiles WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM auth.users      WHERE id IN ('$HRA','$E1','$E2','$HRB','$EB');
DELETE FROM public.tenants  WHERE id IN ('$TA','$TB');
SQL
}
trap cleanup EXIT
cleanup

LEFT=$($PSQL -c "SELECT count(*) FROM public.profiles WHERE tenant_id IN ('$TA','$TB');")
if [ "${LEFT:-1}" != "0" ]; then
  echo "❌ التنظيف فشل — بقي $LEFT صفّ."; exit 1
fi

$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','شركة ألف','a369-hse'), ('$TB','B','شركة باء','b369-hse');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','huda@a369'),('$E1','salem@a369'),('$E2','noor@a369'),
  ('$HRB','laila@b369'),('$EB','badr@b369');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HRA','$TA','هدى الموارد','hr','الموارد'),
  ('$E1','$TA','سالم الأول','employee','الإنتاج'),
  ('$E2','$TA','نور الثانية','employee','الإنتاج'),
  ('$HRB','$TB','ليلى الموارد','hr','الموارد'),
  ('$EB','$TB','بدر الباء','employee','الإنتاج');
SQL

$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① ★★★★ العطل ①: التصنيفات بدور حقيقيّ ════════"

for c in safety work_injury near_miss security_incident; do
  OUT=$(as_user "$E1" "INSERT INTO public.incidents(tenant_id,user_id,title,description,category,severity)
    VALUES ('$TA','$E1','حادث $c','وصف','$c','high') RETURNING id;")
  if echo "$OUT" | grep -qE '^[0-9a-f]{8}-'; then
    ok "التصنيف $c مقبول"
  else
    bad "★★★★ التصنيف $c رُفض: $OUT"
  fi
done

IID=$($PSQL -c "SELECT id FROM public.incidents WHERE tenant_id='$TA' AND category='safety' LIMIT 1;")
$PSQL -c "INSERT INTO public.incidents(id,tenant_id,user_id,title,description,category,severity)
          VALUES (gen_random_uuid(),'$TB','$EB','حادثُ باء','x','safety','high');" >/dev/null

echo ""
echo "════════ ② الكتابة للموارد البشرية وحدها ════════"

OUT=$(as_user "$HRA" "SELECT public.capa_open('$IID','تركيب حواجز','في الممرّ','high','$E1',
        ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 14));")
if echo "$OUT" | grep -qE '^[0-9a-f]{8}-'; then
  ok "هدى أنشأت إجراءً تصحيحياً"
  AID=$(echo "$OUT" | grep -oE '^[0-9a-f-]{36}' | head -1)
else
  bad "الإنشاء فشل: $OUT"; AID=""
fi

OUT=$(as_user "$E1" "SELECT public.capa_open(NULL,'من الموظف','x','low');")
echo "$OUT" | grep -q "CAPA_NOT_STAFF" && ok "الموظف لا يُنشئ إجراءً" || bad "الموظف أنشأ: $OUT"

OUT=$(as_user "$E1" "UPDATE public.corrective_actions SET status='completed' WHERE id='$AID';
                     SELECT count(*) FROM public.corrective_actions
                      WHERE id='$AID' AND status='completed';")
echo "$OUT" | tail -1 | grep -q "^0$" && ok "UPDATE المباشر محجوبٌ عن الموظف" || bad "الموظف حرّر: $OUT"

OUT=$(as_user "$E1" "SELECT public.capa_complete('$AID','x');")
echo "$OUT" | grep -q "CAPA_NOT_STAFF" && ok "ولا يُنجزه عبر الدالة" || bad "الموظف أنجز: $OUT"

echo ""
echo "════════ ③ ★★★ العطل ⑭: المالك يرى إجراءه ════════"

# قبل 0369: سياسة SELECT تشترط staff وحدها ⇒ المالك لا يرى شيئاً
N=$(as_user "$E1" "SELECT count(*) FROM public.corrective_actions;")
[ "$N" = "1" ] && ok "سالم (المالك) يرى إجراءه (لم يكن يراه قبل 0369)" || bad "سالم يرى [$N] بدل 1"

N=$(as_user "$E2" "SELECT count(*) FROM public.corrective_actions;")
[ "$N" = "0" ] && ok "نور لا ترى إجراءً ليس لها" || bad "تسرّبٌ بين الزملاء [$N]"

N=$(as_user "$HRA" "SELECT count(*) FROM public.corrective_actions;")
[ "$N" = "1" ] && ok "هدى ترى إجراء مستأجرها" || bad "هدى ترى [$N]"

# ★★★ صفٌّ في باء موجودٌ فعلاً ⇒ التأكيد ليس فراغاً
BIID=$($PSQL -c "SELECT id FROM public.incidents WHERE tenant_id='$TB' LIMIT 1;")
$PSQL -c "INSERT INTO public.corrective_actions(tenant_id,incident_id,title,created_by)
          VALUES ('$TB','$BIID','إجراءُ باء','$HRB');" >/dev/null
N=$($PSQL -c "SELECT count(*) FROM public.corrective_actions WHERE tenant_id='$TB';")
[ "$N" = "1" ] && ok "إجراءُ باء مُدرَجٌ فعلاً" || bad "إجراء باء غائب [$N]"

N=$(as_user "$HRA" "SELECT count(*) FROM public.corrective_actions WHERE tenant_id='$TB';")
[ "$N" = "0" ] && ok "هدى لا ترى مستأجر باء" || bad "تسرّبٌ بين المستأجرين [$N]"

N=$(as_user "$HRB" "SELECT count(*) FROM public.corrective_actions;")
[ "$N" = "1" ] && ok "ليلى ترى إجراء باء وحده" || bad "ليلى ترى [$N]"

# ★★★ HR باء لا تُنجز إجراء ألف
OUT=$(as_user "$HRB" "SELECT public.capa_complete('$AID','من باء');")
echo "$OUT" | grep -q "CAPA_NOT_FOUND" && ok "HR باء لا تُنجز إجراء ألف" || bad "HR باء أنجزت: $OUT"

echo ""
echo "════════ ④ ★★ العطل ⑪: الحذف النهائيّ ════════"

OUT=$(as_user "$HRA" "DELETE FROM public.corrective_actions WHERE id='$AID';")
if echo "$OUT" | grep -q "CAPA_DELETE_BLOCKED"; then
  ok "HR تصطدم بمحفّز المنع (كانت تحذف قبل 0369)"
else
  N=$($PSQL -c "SELECT count(*) FROM public.corrective_actions WHERE id='$AID';")
  [ "$N" = "1" ] && ok "الصفّ باقٍ" || bad "★★ HR حذفت الإجراء: $OUT"
fi

echo ""
echo "════════ ⑤ دورة CAPA بدور HR حقيقيّ ════════"

OUT=$(as_user "$HRA" "SELECT public.capa_start('$AID');")
echo "$OUT" | grep -q "^t$" && ok "هدى بدأت الإجراء" || bad "البدء فشل: $OUT"

OUT=$(as_user "$HRA" "SELECT public.capa_complete('$AID','فُحصت الحواجز');")
echo "$OUT" | grep -q "^t$" && ok "ثم أنجزته" || bad "الإنجاز فشل: $OUT"

ST=$($PSQL -c "SELECT status||'/'||COALESCE(completed_by::TEXT,'-') FROM public.corrective_actions WHERE id='$AID';")
[ "$ST" = "completed/$HRA" ] && ok "المُنجِز هو هدى" || bad "الحالة [$ST]"

OUT=$(as_user "$HRA" "SELECT public.capa_cancel('$AID','تراجع');")
echo "$OUT" | grep -q "CAPA_ALREADY_COMPLETED" && ok "لا إلغاءَ لمُنجَز" || bad "أُلغي المُنجَز: $OUT"

echo ""
echo "════════ ⑥ اللوحان والملخّص بدور حقيقيّ ════════"

N=$(as_user "$HRA" "SELECT count(*) FROM public.safety_incident_board();")
[ "$N" = "4" ] && ok "لوح الحوادث بسياق هدى = 4" || bad "اللوح [$N] بدل 4"

N=$(as_user "$HRB" "SELECT count(*) FROM public.safety_incident_board();")
[ "$N" = "1" ] && ok "لوح الحوادث بسياق ليلى = 1 (عزلٌ تامّ)" || bad "اللوح [$N] بدل 1"

N=$(as_user "$E1" "SELECT count(*) FROM public.capa_board();")
[ "$N" = "1" ] && ok "لوح CAPA بسياق المالك = 1 (RLS على INVOKER)" || bad "اللوح [$N] بدل 1"

N=$(as_user "$E2" "SELECT count(*) FROM public.capa_board();")
[ "$N" = "0" ] && ok "لوح CAPA بسياق نور = 0" || bad "اللوح [$N] بدل 0"

T=$(as_user "$HRA" "SELECT capa_total FROM public.health_safety_summary();")
[ "$T" = "1" ] && ok "الملخّص بسياق هدى capa_total=1" || bad "الملخّص [$T]"

T=$(as_user "$HRB" "SELECT incidents_total FROM public.health_safety_summary();")
[ "$T" = "1" ] && ok "الملخّص بسياق ليلى incidents_total=1" || bad "الملخّص [$T]"

# ★★★★ needs_capa بدور حقيقيّ
V=$(as_user "$HRA" "SELECT count(*) FROM public.safety_incident_board() WHERE needs_capa;")
[ "$V" = "3" ] && ok "needs_capa = 3 (الحوادث بلا إجراء)" || bad "needs_capa [$V] بدل 3"

echo ""
echo "════════ ⑦ anon محجوب ════════"

$PSQL -c "GRANT USAGE ON SCHEMA public TO anon;" >/dev/null 2>&1
for expr in "SELECT count(*) FROM public.corrective_actions" \
            "SELECT public.capa_board()" \
            "SELECT public.capa_open(NULL,'x','y')"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
$expr;
SQL
)
  if echo "$OUT" | grep -qi "denied"; then
    ok "anon محجوبٌ عن: ${expr:0:46}"
  else
    bad "anon يصل: $expr ⇒ $OUT"
  fi
done

echo ""
if [ "$FAIL" = "0" ]; then
  echo "════════════════════════════════════════"
  echo "  ✅ verify-health-safety-0369-rls.sh — كل التأكيدات نجحت"
  echo "════════════════════════════════════════"
  exit 0
else
  echo "❌ فشل $FAIL تأكيداً"
  exit 1
fi
