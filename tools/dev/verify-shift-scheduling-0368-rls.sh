#!/usr/bin/env bash
# ============================================================================
# verify-shift-scheduling-0368-rls.sh
#
# جدولة الورديات عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① ★★★★ العطل ①: الإسناد ينجح فعلاً بدور HR حقيقيّ
#        (كان `schedule_id NOT NULL` يكسر كل إدراجٍ من الواجهة).
#     ② العزل: الموظف يرى ورديّاته وحدها · HR باء لا ترى ألف.
#     ③ حرّاس الدور: الموظف لا يُجدول ولا يُلغي.
#     ④ العطل ⑪: الحذف النهائيّ محجوبٌ حتى عن HR.
#     ⑤ العطل ⑨: الإجازة المعتمدة تمنع الجدولة بدور حقيقيّ.
#     ⑥ اللوح والملخّص SECURITY INVOKER ⇒ RLS سارية.
#     ⑦ anon محجوب.
#
#   PGPORT=5506 bash tools/dev/verify-shift-scheduling-0368-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5506}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3680000-0000-0000-0000-00000000000a
TB=b3680000-0000-0000-0000-00000000000b
HRA=13680001-0000-0000-0000-000000000001
E1=23680002-0000-0000-0000-000000000002
E2=33680003-0000-0000-0000-000000000003
HRB=43680004-0000-0000-0000-000000000004
EB=53680005-0000-0000-0000-000000000005

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.shift_assignments DISABLE TRIGGER trg_block_shift_delete;
DELETE FROM public.shift_assignments WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.shift_assignments ENABLE TRIGGER trg_block_shift_delete;
DELETE FROM public.leaves    WHERE tenant_id IN ('$TA','$TB');
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
  echo "❌ التنظيف فشل — بقي $LEFT صفّ. أوقف."; exit 1
fi

# ══════════════════════ العيّنة ══════════════════════
$PSQL <<SQL >/dev/null
INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
  ('$TA','A','شركة ألف','a368-shift'), ('$TB','B','شركة باء','b368-shift');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','huda@a368'),('$E1','salem@a368'),('$E2','noor@a368'),
  ('$HRB','laila@b368'),('$EB','badr@b368');
INSERT INTO public.profiles(id,tenant_id,full_name,role,department) VALUES
  ('$HRA','$TA','هدى الموارد','hr','الموارد'),
  ('$E1','$TA','سالم الأول','employee','الإنتاج'),
  ('$E2','$TA','نور الثانية','employee','الإنتاج'),
  ('$HRB','$TB','ليلى الموارد','hr','الموارد'),
  ('$EB','$TB','بدر الباء','employee','الإنتاج');
SQL

EMP1=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E1';")
EMP2=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$E2';")
EMPB=$($PSQL -c "SELECT id FROM public.employees WHERE user_id='$EB';")
D0=$($PSQL -c "SELECT ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 20)::TEXT;")

if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ."; exit 1
fi
# ★★★ إثباتٌ أن العيّنة تحوي صفّاً أجنبياً فعلاً
if [ "$EMPB" = "$EMP1" ]; then echo "❌ موظف باء = موظف ألف"; exit 1; fi

$PSQL -c "GRANT USAGE ON SCHEMA public TO authenticated;" >/dev/null 2>&1

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① ★★★★ العطل ①: الإسناد بدور HR حقيقيّ ════════"

# قبل 0368: كلُّ إدراجٍ من الواجهة يفشل بـschedule_id NOT NULL
OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP1','morning','$D0'::date,'وردية أولى');")
if echo "$OUT" | grep -qE '^[0-9a-f]{8}-'; then
  ok "هدى أسندت وردية (كان الإدراج يفشل دائماً قبل 0368)"
else
  bad "★★★★ الإسناد ما زال يفشل: $OUT"
fi

SCHED=$($PSQL -c "SELECT schedule_id IS NOT NULL FROM public.shift_assignments
                   WHERE employee_id='$EMP1' AND shift_date='$D0';")
[ "$SCHED" = "t" ] && ok "schedule_id مملوءٌ بالافتراضيّ" || bad "schedule_id معدوم [$SCHED]"

OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP2','evening','$D0'::date,NULL);")
echo "$OUT" | grep -qE '^[0-9a-f]{8}-' && ok "ووردية ثانية لنور" || bad "الإسناد الثاني فشل: $OUT"

echo ""
echo "════════ ② العزل بدور authenticated ════════"

N=$(as_user "$E1" "SELECT count(*) FROM public.shift_assignments;")
[ "$N" = "1" ] && ok "سالم يرى ورديته وحدها" || bad "سالم يرى [$N] بدل 1"

N=$(as_user "$E1" "SELECT count(*) FROM public.shift_assignments WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى وردية زميلته" || bad "تسرّبٌ بين الزملاء [$N]"

N=$(as_user "$HRA" "SELECT count(*) FROM public.shift_assignments;")
[ "$N" = "2" ] && ok "هدى ترى ورديّتَي مستأجرها" || bad "هدى ترى [$N] بدل 2"

# ★★★ صفٌّ في باء موجودٌ فعلاً ⇒ التأكيد ليس فراغاً
$PSQL -c "INSERT INTO public.shift_assignments(tenant_id,employee_id,shift_type,shift_date)
          VALUES ('$TB','$EMPB','night','$D0');" >/dev/null 2>&1
N=$($PSQL -c "SELECT count(*) FROM public.shift_assignments WHERE tenant_id='$TB';")
[ "$N" = "1" ] && ok "صفُّ باء مُدرَجٌ فعلاً (العيّنة ليست فارغة)" || bad "صفُّ باء غائب [$N]"

N=$(as_user "$HRA" "SELECT count(*) FROM public.shift_assignments WHERE tenant_id='$TB';")
[ "$N" = "0" ] && ok "هدى لا ترى مستأجر باء" || bad "تسرّبٌ بين المستأجرين [$N]"

N=$(as_user "$HRB" "SELECT count(*) FROM public.shift_assignments;")
[ "$N" = "1" ] && ok "ليلى ترى وردية باء وحدها" || bad "ليلى ترى [$N] بدل 1"

echo ""
echo "════════ ③ حرّاس الدور ════════"

OUT=$(as_user "$E1" "SELECT public.shift_assign('$EMP1','night',('$D0'::date+5),NULL);")
echo "$OUT" | grep -q "SHIFT_NOT_STAFF" && ok "الموظف لا يُجدول لنفسه" || bad "الموظف جدول: $OUT"

OUT=$(as_user "$E1" "SELECT public.shift_assign('$EMP2','night',('$D0'::date+5),NULL);")
echo "$OUT" | grep -q "SHIFT_NOT_STAFF" && ok "ولا يُجدول لزميلته" || bad "الموظف جدول لغيره: $OUT"

SID=$($PSQL -c "SELECT id FROM public.shift_assignments WHERE employee_id='$EMP1' AND shift_date='$D0';")
OUT=$(as_user "$E1" "SELECT public.shift_cancel('$SID','لا أريدها');")
echo "$OUT" | grep -q "SHIFT_NOT_STAFF" && ok "ولا يُلغي ورديته" || bad "الموظف ألغى: $OUT"

# ★★★ UPDATE المباشر محجوبٌ أيضاً (السياسة تشترط staff)
OUT=$(as_user "$E1" "UPDATE public.shift_assignments SET shift_type='flexible'
                      WHERE id='$SID';
                     SELECT count(*) FROM public.shift_assignments
                      WHERE id='$SID' AND shift_type='flexible';")
echo "$OUT" | tail -1 | grep -q "^0$" && ok "UPDATE المباشر محجوبٌ عن الموظف" || bad "الموظف حرّر الجدول: $OUT"

# ★★★ HR باء لا تُلغي وردية ألف
OUT=$(as_user "$HRB" "SELECT public.shift_cancel('$SID','من باء');")
echo "$OUT" | grep -q "SHIFT_NOT_FOUND" && ok "HR باء لا تُلغي وردية ألف" || bad "HR باء ألغت: $OUT"

echo ""
echo "════════ ④ ★★ العطل ⑪: الحذف النهائيّ ════════"

OUT=$(as_user "$HRA" "DELETE FROM public.shift_assignments WHERE id='$SID';")
if echo "$OUT" | grep -q "SHIFT_DELETE_BLOCKED"; then
  ok "HR تصطدم بمحفّز المنع (كانت تحذف قبل 0368)"
else
  N=$($PSQL -c "SELECT count(*) FROM public.shift_assignments WHERE id='$SID';")
  [ "$N" = "1" ] && ok "الصفّ باقٍ" || bad "★★ HR حذفت الوردية: $OUT"
fi

OUT=$(as_user "$HRA" "SELECT public.shift_cancel('$SID','تغطيةٌ غير لازمة');")
echo "$OUT" | grep -q "^t$" && ok "البديل السليم: shift_cancel() ينجح" || bad "الإلغاء فشل: $OUT"

ST=$($PSQL -c "SELECT status||'/'||COALESCE(cancelled_by::TEXT,'-')
                FROM public.shift_assignments WHERE id='$SID';")
[ "$ST" = "cancelled/$HRA" ] && ok "الحالة cancelled والفاعل هدى" || bad "الحالة [$ST]"

echo ""
echo "════════ ⑤ ★★★★ العطل ⑨: الإجازة المعتمدة بدور حقيقيّ ════════"

$PSQL -c "INSERT INTO public.leaves(tenant_id,employee_id,leave_type,date_from,date_to,status,reason)
          VALUES ('$TA','$EMP2','سنوية',('$D0'::date+30),('$D0'::date+35),'موافق','سفر');" >/dev/null

# ★ إثباتٌ أن الإجازة أُنشئت فعلاً — وإلّا كان التأكيد فراغاً
N=$($PSQL -c "SELECT count(*) FROM public.leaves WHERE employee_id='$EMP2' AND status='موافق';")
[ "$N" = "1" ] && ok "إجازةٌ معتمدة مُدرَجةٌ فعلاً" || bad "الإجازة غائبة [$N]"

OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP2','morning',('$D0'::date+32),NULL);")
echo "$OUT" | grep -q "SHIFT_ON_APPROVED_LEAVE" && ok "لا جدولة على إجازةٍ معتمدة" || bad "★★★★ جُدولت: $OUT"

# ★ وخارج مدّة الإجازة تنجح
OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP2','morning',('$D0'::date+40),NULL);")
echo "$OUT" | grep -qE '^[0-9a-f]{8}-' && ok "وخارج مدّتها تنجح (الحارس ليس أوسع من قصده)" || bad "مُنعت خارج الإجازة: $OUT"

echo ""
echo "════════ ⑥ ★★★ حدُّ الراحة بدور حقيقيّ ════════"

OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP1','night',('$D0'::date+50),NULL);")
echo "$OUT" | grep -qE '^[0-9a-f]{8}-' && ok "ليليةٌ أُسندت" || bad "الليلية فشلت: $OUT"

OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP1','morning',('$D0'::date+51),NULL);")
echo "$OUT" | grep -q "SHIFT_NO_REST" && ok "لا صباحية بعدها مباشرةً" || bad "قُبِلت: $OUT"

OUT=$(as_user "$HRA" "SELECT public.shift_assign('$EMP1','evening',('$D0'::date+51),NULL);")
echo "$OUT" | grep -qE '^[0-9a-f]{8}-' && ok "ومسائيةٌ بعدها مسموحة" || bad "مُنعت المسائية: $OUT"

echo ""
echo "════════ ⑦ اللوح والملخّص بدور حقيقيّ ════════"

N=$(as_user "$E1" "SELECT count(*) FROM public.shift_week_board('$D0'::date, 60);")
# سالم: الوردية الملغاة في D0 + ليلية D0+50 + مسائية D0+51 = 3
[ "$N" = "3" ] && ok "اللوح بسياق سالم = 3 (RLS سارية على INVOKER)" || bad "اللوح [$N] بدل 3"

N=$(as_user "$HRA" "SELECT count(*) FROM public.shift_week_board('$D0'::date, 60);")
[ "$N" = "5" ] && ok "اللوح بسياق هدى = 5" || bad "اللوح [$N] بدل 5"

N=$(as_user "$HRB" "SELECT count(*) FROM public.shift_week_board('$D0'::date, 60);")
[ "$N" = "1" ] && ok "اللوح بسياق ليلى = 1 (عزلٌ تامّ)" || bad "اللوح [$N] بدل 1"

T=$(as_user "$HRA" "SELECT total FROM public.shift_week_summary('$D0'::date, 60);")
[ "$T" = "5" ] && ok "الملخّص بسياق هدى = 5" || bad "الملخّص [$T] بدل 5"

C=$(as_user "$HRA" "SELECT cancelled FROM public.shift_week_summary('$D0'::date, 60);")
[ "$C" = "1" ] && ok "الملغاة = 1 في الملخّص" || bad "الملغاة [$C]"

# ★ اسم الوردية من structure_shifts بدور حقيقيّ
NM=$(as_user "$HRA" "SELECT shift_name_ar FROM public.shift_week_board(('$D0'::date+50),1);")
[ "$NM" = "الوردية الليلية" ] && ok "اسم الوردية من structure_shifts" || bad "الاسم [$NM]"

echo ""
echo "════════ ⑧ anon محجوب ════════"

$PSQL -c "GRANT USAGE ON SCHEMA public TO anon;" >/dev/null 2>&1
for expr in "SELECT count(*) FROM public.shift_assignments" \
            "SELECT public.shift_week_board()" \
            "SELECT public.shift_assign('$EMP1','morning',CURRENT_DATE,NULL)"; do
  OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
$expr;
SQL
)
  if echo "$OUT" | grep -qi "denied"; then
    ok "anon محجوبٌ عن: ${expr:0:48}"
  else
    bad "anon يصل: $expr ⇒ $OUT"
  fi
done

echo ""
if [ "$FAIL" = "0" ]; then
  echo "════════════════════════════════════════"
  echo "  ✅ verify-shift-scheduling-0368-rls.sh — كل التأكيدات نجحت"
  echo "════════════════════════════════════════"
  exit 0
else
  echo "❌ فشل $FAIL تأكيداً"
  exit 1
fi
