#!/usr/bin/env bash
# ============================================================================
# verify-disciplinary-0365-rls.sh
#
# الإجراءات التأديبية عبر **RLS حقيقي** (SET ROLE authenticated).
#
# ★★★ ملف الـSQL يعمل بدور postgres وهو BYPASSRLS: يُثبت منطق الدوال
#   ولا يُثبت أن الجدار قائم.
#
#   ما يحرسه هنا خصوصاً:
#     ① العطل ⑯: الموظف **لا يملك UPDATE** على الجدول (السياسة تشترط
#        staff) — ومع ذلك يتظلّم عبر disciplinary_appeal().
#     ② العزل: الموظف يرى إجراءه وحده · HR باء لا ترى ألف.
#     ③ العطل ⑮: HR لا تحذف حذفاً نهائياً بدور حقيقيّ (كانت تحذف).
#     ④ الأعطال ①/③: FK المركَّب يحرس الكتابة المباشرة بدور حقيقيّ.
#     ⑤ العطل ⑭: expire_due معزولةٌ بالمستأجر بدور حقيقيّ.
#     ⑥ can_appeal في اللوح بسياق كلٍّ من الموظف و HR.
#     ⑦ anon محجوب.
#
#   PGPORT=5500 bash tools/dev/verify-disciplinary-0365-rls.sh
# ============================================================================
set -uo pipefail

PGSOCK="${PGSOCK:-/home/user/.pgtest/sock}"
PGPORT="${PGPORT:-5500}"
PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -q -A -t"

TA=a3650000-0000-0000-0000-00000000000a
TB=b3650000-0000-0000-0000-00000000000b
HRA=13650001-0000-0000-0000-000000000001
E1=23650002-0000-0000-0000-000000000002
E2=33650003-0000-0000-0000-000000000003
HRB=53650005-0000-0000-0000-000000000005
EB=63650006-0000-0000-0000-000000000006

FAIL=0
ok(){  echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  $PSQL >/dev/null 2>&1 <<SQL
ALTER TABLE public.disciplinary_actions DISABLE TRIGGER trg_block_disciplinary_delete;
DELETE FROM public.disciplinary_actions WHERE tenant_id IN ('$TA','$TB');
ALTER TABLE public.disciplinary_actions ENABLE TRIGGER trg_block_disciplinary_delete;
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
  ('$TA','A','شركة ألف','a365-disc'), ('$TB','B','شركة باء','b365-disc');
INSERT INTO auth.users(id,email) VALUES
  ('$HRA','huda@a365'),('$E1','salem@a365'),('$E2','noor@a365'),
  ('$HRB','laila@b365'),('$EB','badr@b365');
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

if [ -z "$EMP1" ] || [ -z "$EMP2" ] || [ -z "$EMPB" ]; then
  echo "❌ صفوف employees لم تُنشأ — المحفّز tg_ensure_employee_row لم يعمل."; exit 1
fi

# ★★★ إثباتٌ أن العيّنة تحوي صفّاً أجنبياً فعلاً — وإلّا كان عزل
#   المستأجر شرطاً «لا بيانات تخالفه» أي غير مُختبَر (درس متكرّر).
if [ "$EMPB" = "$EMP1" ]; then echo "❌ موظف باء = موظف ألف"; exit 1; fi

# إجراءات: سالم(ألف) · نور(ألف) · بدر(باء)
$PSQL <<SQL >/dev/null
INSERT INTO public.disciplinary_actions
  (id,tenant_id,employee_id,type,reason,severity,incident_date,issued_by,status) VALUES
  ('d3650001-0000-0000-0000-000000000001','$TA','$EMP1','written_warning','تأخّرٌ متكرّر','medium',
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'$HRA','active'),
  ('d3650002-0000-0000-0000-000000000002','$TA','$EMP2','verbal_warning','إهمال','low',
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'$HRA','active'),
  ('d3650003-0000-0000-0000-000000000003','$TB','$EMPB','suspension','إجراءٌ في باء','high',
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'$HRB','active');
INSERT INTO public.disciplinary_actions
  (id,tenant_id,employee_id,type,reason,severity,incident_date,valid_until,issued_by,status) VALUES
  ('d3650004-0000-0000-0000-000000000004','$TA','$EMP1','written_warning','منتهي الأجل','medium',
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE - 500,
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE - 200,'$HRA','active'),
  ('d3650005-0000-0000-0000-000000000005','$TB','$EMPB','written_warning','منتهي في باء','medium',
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE - 300,
   (now() AT TIME ZONE 'Asia/Baghdad')::DATE - 100,'$HRB','active');
SQL

GRANT_SQL="GRANT USAGE ON SCHEMA public TO authenticated;"
$PSQL -c "$GRANT_SQL" >/dev/null 2>&1

as_user() {  # $1=uid  $2=sql
  $PSQL <<SQL 2>&1
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
SQL
}

echo ""
echo "════════ ① العزل بدور authenticated حقيقيّ ════════"

N=$(as_user "$E1" "SELECT count(*) FROM public.disciplinary_actions;")
[ "$N" = "2" ] && ok "سالم يرى إجراءَيه فقط (2)" || bad "سالم يرى [$N] بدل 2"

N=$(as_user "$E1" "SELECT count(*) FROM public.disciplinary_actions WHERE employee_id='$EMP2';")
[ "$N" = "0" ] && ok "سالم لا يرى إجراء زميلته نور" || bad "سالم يرى إجراء نور [$N]"

N=$(as_user "$HRA" "SELECT count(*) FROM public.disciplinary_actions;")
[ "$N" = "3" ] && ok "هدى (HR ألف) ترى ثلاثة إجراءات مستأجرها" || bad "هدى ترى [$N] بدل 3"

# ★★★ صفُّ باء موجودٌ فعلاً (تحقّقنا أعلاه) ⇒ هذا التأكيد ليس فراغاً
N=$(as_user "$HRA" "SELECT count(*) FROM public.disciplinary_actions WHERE tenant_id='$TB';")
[ "$N" = "0" ] && ok "هدى لا ترى مستأجر باء (وفيه صفّان فعلاً)" || bad "تسرّبٌ بين المستأجرين [$N]"

N=$(as_user "$HRB" "SELECT count(*) FROM public.disciplinary_actions;")
[ "$N" = "2" ] && ok "ليلى (HR باء) ترى صفَّي باء" || bad "ليلى ترى [$N] بدل 2"

echo ""
echo "════════ ② ★★★ العطل ⑯ — التظلّم ════════"

# ★★★ أولاً نُثبت أن الجدار **ما زال مغلقاً** أمام UPDATE المباشر
N=$(as_user "$E1" "UPDATE public.disciplinary_actions SET is_appealed=TRUE
                    WHERE id='d3650001-0000-0000-0000-000000000001';
                   SELECT count(*) FROM public.disciplinary_actions
                    WHERE id='d3650001-0000-0000-0000-000000000001' AND is_appealed=TRUE;")
if echo "$N" | grep -q "0"; then
  ok "UPDATE المباشر ما زال محجوباً عن الموظف (السياسة تشترط staff)"
else
  bad "الموظف حرّر الجدول مباشرةً — السياسة انفتحت [$N]"
fi

# ثم نُثبت أن الدالة تفتح له حقَّه — وهو ما كان مستحيلاً قبل 0365
OUT=$(as_user "$E1" "SELECT public.disciplinary_appeal('d3650001-0000-0000-0000-000000000001','كنتُ في مهمّةٍ رسمية');")
echo "$OUT" | grep -q "^t$" && ok "سالم تظلّم عبر disciplinary_appeal()" || bad "التظلّم فشل: $OUT"

ST=$($PSQL -c "SELECT status||'/'||COALESCE(appeal_reason,'-') FROM public.disciplinary_actions
                WHERE id='d3650001-0000-0000-0000-000000000001';")
[ "$ST" = "appealed/كنتُ في مهمّةٍ رسمية" ] && ok "الحالة appealed والسبب مُخزَّن" || bad "الحالة [$ST]"

# ★ حارس الملكية بدور حقيقيّ: نور لا تتظلّم على إجراء سالم
OUT=$(as_user "$E2" "SELECT public.disciplinary_appeal('d3650001-0000-0000-0000-000000000001','نيابةً');")
echo "$OUT" | grep -q "DISCIPLINARY_NOT_OWNER" && ok "لا تظلّم بالنيابة (بدور حقيقيّ)" || bad "نور تظلّمت نيابةً: $OUT"

# ★★★ عبورُ مستأجر: بدر (باء) لا يتظلّم على إجراءٍ في ألف
OUT=$(as_user "$EB" "SELECT public.disciplinary_appeal('d3650001-0000-0000-0000-000000000001','من باء');")
echo "$OUT" | grep -q "DISCIPLINARY_NOT_FOUND" && ok "موظف باء لا يصل إجراءات ألف عبر الدالة" || bad "عبورُ مستأجر عبر الدالة: $OUT"

echo ""
echo "════════ ③ البتّ في التظلّم بدور حقيقيّ ════════"

OUT=$(as_user "$E1" "SELECT public.disciplinary_appeal_decide('d3650001-0000-0000-0000-000000000001','overturned','ألغي عقوبتي');")
echo "$OUT" | grep -q "DISCIPLINARY_NOT_STAFF" && ok "الموظف لا يبتّ في تظلّمه" || bad "الموظف بتَّ: $OUT"

# ★★★ HR باء لا تبتّ في تظلّمٍ داخل ألف — حارس المستأجر لا الدور
OUT=$(as_user "$HRB" "SELECT public.disciplinary_appeal_decide('d3650001-0000-0000-0000-000000000001','upheld','من باء');")
echo "$OUT" | grep -q "DISCIPLINARY_NOT_FOUND" && ok "HR باء لا تبتّ في تظلّم ألف" || bad "HR باء بتَّت: $OUT"

OUT=$(as_user "$HRA" "SELECT public.disciplinary_appeal_decide('d3650001-0000-0000-0000-000000000001','reduced','المهمّة ثابتةٌ جزئياً');")
echo "$OUT" | grep -q "^active$" && ok "هدى بتَّت: reduced ⇒ العودة إلى active" || bad "البتّ فشل: $OUT"

SEV=$($PSQL -c "SELECT severity FROM public.disciplinary_actions WHERE id='d3650001-0000-0000-0000-000000000001';")
[ "$SEV" = "low" ] && ok "reduced أنزل الخطورة medium ← low فعلياً" || bad "الخطورة [$SEV]"

echo ""
echo "════════ ④ ★★★ العطل ⑮ — الحذف بدور حقيقيّ ════════"

# قبل 0365: RLS_4 أثبت أن HR **تمحو** الصفّ فعلاً بدور authenticated.
OUT=$(as_user "$HRA" "DELETE FROM public.disciplinary_actions WHERE id='d3650002-0000-0000-0000-000000000002';")
echo "$OUT" | grep -q "DISCIPLINARY_DELETE_BLOCKED" && ok "HR لا تحذف نهائياً (كانت تحذف قبل 0365)" || bad "الحذف نجح: $OUT"

N=$($PSQL -c "SELECT count(*) FROM public.disciplinary_actions WHERE id='d3650002-0000-0000-0000-000000000002';")
[ "$N" = "1" ] && ok "الصفّ ما زال قائماً" || bad "الصفّ اختفى [$N]"

OUT=$(as_user "$HRA" "SELECT public.disciplinary_revoke('d3650002-0000-0000-0000-000000000002','صدر بالخطأ');")
echo "$OUT" | grep -q "^t$" && ok "البديل السليم: disciplinary_revoke() ينجح" || bad "الإلغاء فشل: $OUT"

echo ""
echo "════════ ⑤ الأعطال ①/③ — الكتابة المباشرة بدور حقيقيّ ════════"

OUT=$(as_user "$HRA" "INSERT INTO public.disciplinary_actions
  (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
  VALUES ('$TA','ffffffff-ffff-ffff-ffff-ffffffffffff','written_warning','معدوم','low',
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'$HRA');")
echo "$OUT" | grep -q "fk_disciplinary_employee_tenant" && ok "موظفٌ معدوم مرفوض بدور حقيقيّ" || bad "قُبِل: $OUT"

OUT=$(as_user "$HRA" "INSERT INTO public.disciplinary_actions
  (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
  VALUES ('$TA','$EMPB','suspension','عبورُ مستأجر','high',
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'$HRA');")
echo "$OUT" | grep -q "fk_disciplinary_employee_tenant" && ok "موظف باء داخل ألف مرفوض (FK مركَّب)" || bad "قُبِل: $OUT"

OUT=$(as_user "$HRA" "INSERT INTO public.disciplinary_actions
  (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
  VALUES ('$TA','$EMP1','written_warning','واقعةٌ مستقبلية','low',
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE + 30,'$HRA');")
echo "$OUT" | grep -q "DISCIPLINARY_FUTURE_INCIDENT" && ok "واقعةٌ مستقبلية مرفوضة (المحفّز)" || bad "قُبِلت: $OUT"

# ★★★ محاولةُ زرعِ صفٍّ في مستأجرٍ آخر عبر WITH CHECK
OUT=$(as_user "$HRA" "INSERT INTO public.disciplinary_actions
  (tenant_id,employee_id,type,reason,severity,incident_date,issued_by)
  VALUES ('$TB','$EMPB','suspension','زرعٌ في باء','high',
          (now() AT TIME ZONE 'Asia/Baghdad')::DATE,'$HRB');")
if echo "$OUT" | grep -qi "policy\|denied"; then
  ok "هدى لا تزرع صفّاً في مستأجر باء (WITH CHECK)"
else
  bad "الزرع في مستأجرٍ آخر نجح: $OUT"
fi

echo ""
echo "════════ ⑥ اللوح والملخّص بدور حقيقيّ ════════"

# سالم يرى صفَّيه فقط عبر اللوح (SECURITY INVOKER ⇒ RLS سارية)
N=$(as_user "$E1" "SELECT count(*) FROM public.disciplinary_board();")
[ "$N" = "2" ] && ok "اللوح بسياق سالم = 2 (RLS سارية على SECURITY INVOKER)" || bad "اللوح [$N] بدل 2"

N=$(as_user "$HRA" "SELECT count(*) FROM public.disciplinary_board();")
[ "$N" = "3" ] && ok "اللوح بسياق هدى = 3" || bad "اللوح [$N] بدل 3"

# ★★★ can_appeal: «منتهي الأجل» نشطٌ لسالم ولم يُتظلَّم عليه ⇒ true
#   و«تأخّرٌ متكرّر» صار active بعد reduced لكن is_appealed=true ⇒ false
V=$(as_user "$E1" "SELECT can_appeal FROM public.disciplinary_board() WHERE reason='منتهي الأجل';")
[ "$V" = "t" ] && ok "can_appeal = true لإجرائه النافذ" || bad "can_appeal [$V]"

V=$(as_user "$E1" "SELECT can_appeal FROM public.disciplinary_board() WHERE reason='تأخّرٌ متكرّر';")
[ "$V" = "f" ] && ok "can_appeal = false بعد التظلّم" || bad "can_appeal [$V]"

# ★ HR ليست صاحبة الشأن ⇒ false في كل الصفوف
N=$(as_user "$HRA" "SELECT count(*) FROM public.disciplinary_board() WHERE can_appeal;")
[ "$N" = "0" ] && ok "can_appeal = false لكل صفوف HR (ليست صاحبة الشأن)" || bad "HR تستطيع التظلّم [$N]"

# الملخّص مُرشَّحٌ بالمستأجر عبر RLS
T=$(as_user "$HRA" "SELECT total FROM public.disciplinary_summary();")
[ "$T" = "3" ] && ok "الملخّص بسياق هدى total=3 (لا 5)" || bad "الملخّص [$T] بدل 3"

T=$(as_user "$HRB" "SELECT total FROM public.disciplinary_summary();")
[ "$T" = "2" ] && ok "الملخّص بسياق ليلى total=2" || bad "الملخّص [$T] بدل 2"

echo ""
echo "════════ ⑦ العطل ⑭ — expire_due معزولةٌ بدور حقيقيّ ════════"

# «منتهي الأجل» في ألف · «منتهي في باء» في باء — كلاهما نشطٌ منتهي الأجل
N=$(as_user "$HRA" "SELECT public.disciplinary_expire_due();")
[ "$N" = "1" ] && ok "expire_due بسياق ألف = 1 (لم تمسّ باء)" || bad "expire_due [$N] بدل 1"

ST=$($PSQL -c "SELECT status FROM public.disciplinary_actions WHERE id='d3650005-0000-0000-0000-000000000005';")
[ "$ST" = "active" ] && ok "صفُّ باء ما زال active بعد نداء ألف" || bad "صفُّ باء تغيّر [$ST]"

N=$(as_user "$HRB" "SELECT public.disciplinary_expire_due();")
[ "$N" = "1" ] && ok "expire_due بسياق باء = 1" || bad "expire_due باء [$N]"

# ★ الموظف ينادي expire_due — تعمل لكن بمستأجره وبلا صلاحية staff:
#   لا حارس دورٍ فيها عمداً (عمليةُ صيانةٍ لا قرار). نُثبت أنها لا تُسرّب.
N=$(as_user "$E1" "SELECT public.disciplinary_expire_due();")
[ "$N" = "0" ] && ok "نداء الموظف لا يُحدّث شيئاً (كلُّها انتهت)" || bad "نداء الموظف [$N]"

echo ""
echo "════════ ⑧ anon محجوب ════════"

$PSQL -c "GRANT USAGE ON SCHEMA public TO anon;" >/dev/null 2>&1
OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT count(*) FROM public.disciplinary_actions;
SQL
)
echo "$OUT" | grep -qi "denied" && ok "anon محجوبٌ عن الجدول" || bad "anon يقرأ: $OUT"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.disciplinary_board();
SQL
)
echo "$OUT" | grep -qi "denied" && ok "anon محجوبٌ عن disciplinary_board()" || bad "anon ينادي اللوح: $OUT"

OUT=$($PSQL <<SQL 2>&1
SET ROLE anon;
SELECT public.disciplinary_appeal('d3650001-0000-0000-0000-000000000001','x');
SQL
)
echo "$OUT" | grep -qi "denied" && ok "anon محجوبٌ عن disciplinary_appeal()" || bad "anon يتظلّم: $OUT"

echo ""
if [ "$FAIL" = "0" ]; then
  echo "════════════════════════════════════════"
  echo "  ✅ verify-disciplinary-0365-rls.sh — كل التأكيدات نجحت"
  echo "════════════════════════════════════════"
  exit 0
else
  echo "❌ فشل $FAIL تأكيداً"
  exit 1
fi
