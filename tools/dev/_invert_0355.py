#!/usr/bin/env python3
"""
عكس إصلاحات 0355 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ ثلاثة إصلاحات في هذه الجولة لا يراها ملف الـSQL إطلاقاً لأنه يعمل
   بدور postgres وهو BYPASSRLS:
     · RESTRICTIVE على بوابة الوحدة  (كانت PERMISSIVE ⇒ تسريب كامل)
     · REVOKE ALL FROM authenticated (المنحة الضمنية من 0268)
   هذه تُقاس بسكربت RLS.

★ ملاحظة على DDL: `CREATE TABLE IF NOT EXISTS` و`CREATE UNIQUE INDEX
  IF NOT EXISTS` لا تُعيد الإنشاء على قاعدة مُطبَّقة، فعكسُها بتعديل
  النصّ وحده لا أثر له. تلك تُعكس بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5473 python3 tools/dev/_invert_0355.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0355_employee_loans_lifecycle.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-loans-lifecycle-0355.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-loans-lifecycle-0355-rls.sh')

PGPORT = os.environ.get('PGPORT', '5473')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

RLS_CHECK = {'INV01'}


def psql(path):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, errors='replace', env=ENV, timeout=240)


def psql_c(sql):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-c', sql],
        capture_output=True, text=True, errors='replace', env=ENV, timeout=120)


def run_rls():
    return subprocess.run(['bash', VERIFY_RLS],
                          capture_output=True, text=True, errors='replace', env=ENV, timeout=400)


# ═══════════════════════════════════════════════════════════════════════
#  عكوس نصّية على المايجريشن
# ═══════════════════════════════════════════════════════════════════════
INVERSIONS = [
    (
        'INV01',
        '★★★ بوابة الوحدة PERMISSIVE بدل RESTRICTIVE (تسريب كامل بين المستأجرين)',
        """CREATE POLICY hybrid_gate_loan_repayments ON public.loan_repayments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));""",
        """CREATE POLICY hybrid_gate_loan_repayments ON public.loan_repayments
  FOR ALL
  USING (public.hybrid_allows_module('hr'))
  WITH CHECK (public.hybrid_allows_module('hr'));""",
    ),
    # ★ INV02 نُقل إلى DDL_INVERSIONS — انظر DDL05 والسبب هناك.
    (
        'INV03',
        '★★★ إسقاط حلقة التسديد من payroll_approve (السلفة الأبدية تعود)',
        """  FOR v_loan IN
    SELECT l.id
      FROM public.employee_loans l
     WHERE l.tenant_id = v_tenant
       AND l.status = 'approved'
       AND COALESCE(l.remaining_amount, 0) > 0
       AND EXISTS (SELECT 1 FROM public.payroll_records r
                    WHERE r.tenant_id = v_tenant
                      AND r.period_id = p_period_id
                      AND r.employee_id = l.employee_id)
     ORDER BY l.created_at
  LOOP
    PERFORM public.loan_apply_repayment(v_loan.id, p_period_id, NULL, 'payroll');
  END LOOP;""",
        """  -- (أُسقطت حلقة التسديد)""",
    ),
    (
        'INV04',
        '★★ إسقاط قصّ آخر قسط عند المتبقّي (يُخصم 100,000 من متبقٍّ 40,000)',
        """  v_pay := LEAST(
    COALESCE(NULLIF(p_amount, 0), v_loan.monthly_installment, 0),
    v_rem);""",
        """  v_pay := COALESCE(NULLIF(p_amount, 0), v_loan.monthly_installment, 0);""",
    ),
    (
        'INV05',
        '★★ إسقاط إغلاق السلفة بـ paid عند بلوغ الصفر',
        """         status           = CASE WHEN v_rem - v_pay <= 0 THEN 'paid'
                                 ELSE status END,""",
        """         status           = status,""",
    ),
    (
        'INV06',
        '★★ إسقاط حارس «التسديد يتطلّب approved» (تُسدَّد سلفة مرفوضة/مسدَّدة)',
        """  IF v_loan.status <> 'approved' THEN
    RAISE EXCEPTION 'LOAN_NOT_ACTIVE: السلفة بحالة «%» — التسديد يتطلّب approved',
      v_loan.status USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV07',
        '★★ إسقاط ترشيح المستأجر من loan_apply_repayment (تسديد عبر الحدود)',
        """  SELECT * INTO v_loan FROM public.employee_loans
   WHERE id = p_loan_id AND tenant_id = v_tenant
   FOR UPDATE;""",
        """  SELECT * INTO v_loan FROM public.employee_loans
   WHERE id = p_loan_id
   FOR UPDATE;""",
    ),
    (
        'INV08',
        '★★★ حساب end_date بشهور تقويمية → إضافة أيام (31 يناير + شهر ≠ 28 فبراير)',
        """          (v_start + (p_months || ' months')::INTERVAL)::DATE,""",
        """          (v_start + (p_months * 31 || ' days')::INTERVAL)::DATE,""",
    ),
    (
        'INV09',
        '★★ إسقاط حارس عدد الأشهر (القسمة على صفر تعود)',
        """  IF p_months IS NULL OR p_months < 1 OR p_months > 60 THEN
    RAISE EXCEPTION 'LOAN_BAD_MONTHS: عدد الأشهر يجب أن يكون بين 1 و 60 (المُمرَّر: %)',
      COALESCE(p_months::TEXT,'NULL') USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV10',
        '★★ إسقاط حارس المبلغ الموجب',
        """  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'LOAN_BAD_AMOUNT: المبلغ يجب أن يكون موجباً (المُمرَّر: %)',
      COALESCE(p_amount::TEXT,'NULL') USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV11',
        '★ إسقاط حارس الغرض الإلزاميّ',
        """  IF p_purpose IS NULL OR btrim(p_purpose) = '' THEN
    RAISE EXCEPTION 'LOAN_NO_PURPOSE: الغرض إلزاميّ' USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV12',
        '★ إسقاط حارس القسط (قسط أكبر من المبلغ يمرّ)',
        """  IF v_inst <= 0 OR v_inst > p_amount THEN
    RAISE EXCEPTION 'LOAN_BAD_INSTALLMENT: القسط % خارج المجال (0، %]',
      v_inst, p_amount USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV13',
        '★★ إهمال p_start_date (العطل ⑥ يعود: كل سلفة تبدأ اليوم)',
        """  v_start := COALESCE(p_start_date, (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE);""",
        """  v_start := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;""",
    ),
    (
        'INV14',
        '★★★ إسقاط بناء سلسلة الاعتماد من loan_create (الباب الخلفيّ يعود)',
        """  PERFORM public.create_financial_request_approval(
    'loan', v_id, p_employee_id, p_amount);""",
        """  -- (أُسقط)""",
    ),
    (
        'INV15',
        '★★ إسقاط حارس دور الإنشاء (الموظف يُنشئ سلفة لنفسه)',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء سلفة (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV16',
        '★★ إسقاط تحقّق أن الموظف من المستأجر نفسه (إنشاء لموظف أجنبي)',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV17',
        '★★★ «الساري» = status=active المُختلَقة بدل approved بمتبقٍّ موجب',
        """    count(*) FILTER (WHERE l.status = 'approved'
                       AND COALESCE(l.remaining_amount,0) > 0)::INTEGER,""",
        """    count(*) FILTER (WHERE l.status = 'active')::INTEGER,""",
    ),
    (
        'INV18',
        '★★ المتبقّي القائم يشمل الملغاة والمرفوضة (الشرط يُسقَط)',
        """    round(COALESCE(sum(l.remaining_amount)
      FILTER (WHERE l.status = 'approved'), 0), 2),""",
        """    round(COALESCE(sum(l.remaining_amount), 0), 2),""",
    ),
    (
        'INV19',
        '★★ إسقاط ترشيح المستأجر من loan_summary (تسريب الأرقام)',
        """  FROM public.employee_loans l
  WHERE l.tenant_id = v_tenant;""",
        """  FROM public.employee_loans l;""",
    ),
    (
        'INV20',
        '★★ إسقاط حارس staff من loan_summary (الموظف يرى أرقام الشركة)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص السلف';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV21',
        '★★★ حارس مفردات loan_board يقبل active/completed المُختلَقتين',
        """  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending','approved','rejected','paid','cancelled') THEN""",
        """  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending','approved','rejected','paid',
                          'cancelled','active','completed') THEN""",
    ),
    (
        'INV22',
        '★★ التقدّم يُحسب للمرفوضة أيضاً (سلفة مرفوضة تظهر 100% مسدَّدة)',
        """    CASE WHEN l.status IN ('approved','paid') AND COALESCE(l.amount,0) > 0""",
        """    CASE WHEN COALESCE(l.amount,0) > 0""",
    ),
    (
        'INV23',
        '★★ سلسلة الاحتياط للاسم تُسقَط (full_name_ar فارغ ⇒ عمود خالٍ)',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             NULLIF(btrim(p.full_name), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV24',
        '★ إسقاط الحدّ الأعلى من loan_board (نقل الجدول كلّه للمتصفّح)',
        """  LIMIT GREATEST(COALESCE(p_limit, 200), 1);""",
        """  ;""",
    ),
    (
        'INV25',
        '★★ إسقاط ترشيح المستأجر من loan_board (تسريب اللوحة)',
        """  WHERE l.tenant_id = v_tenant
    AND (p_status IS NULL OR l.status = p_status)""",
        """  WHERE (p_status IS NULL OR l.status = p_status)""",
    ),
    (
        'INV26',
        '★★★ إسقاط حارس السلسلة من loan_decide (زرّ الموافقة يلتفّ على الاعتماد)',
        """  IF v_open > 0 AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'LOAN_CHAIN_OPEN: للسلفة سلسلة اعتماد مفتوحة '
      '(% خطوة) — استعمل صندوق الموافقات', v_open
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV27',
        '★★ إسقاط حارس «لا بتّ مرّتين»',
        """  IF v_loan.status <> 'pending' THEN
    RAISE EXCEPTION 'LOAN_ALREADY_DECIDED: السلفة بحالة «%» — '
      'القرار يتطلّب pending', v_loan.status USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV28',
        '★★ إسقاط إغلاق خطوات السلسلة عند تجاوز admin (خطوة معلَّقة أبداً)',
        """  UPDATE public.hr_approval_steps s
     SET status     = 'skipped',
         comments   = COALESCE(s.comments, '') ||
                      ' [تجاوز إداريّ 0355: بُتَّ في السلفة مباشرةً]',
         decided_at = NOW()
    FROM public.hr_approval_requests r
   WHERE r.id = s.request_id
     AND r.related_id = p_loan_id
     AND r.tenant_id  = v_tenant
     AND s.status IN ('pending','active');""",
        """  -- (أُسقط)""",
    ),
    (
        'INV29',
        '★★ إسقاط ملء remaining_amount عند الاعتماد (يبقى صفراً ⇒ لا خصم أبداً)',
        """         remaining_amount = CASE WHEN p_decision = 'approved'
                                 THEN amount ELSE remaining_amount END,""",
        """         remaining_amount = remaining_amount,""",
    ),
    (
        'INV30',
        '★ إسقاط حارس سبب الرفض الإلزاميّ',
        """  IF p_decision IN ('rejected','cancelled')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'LOAN_NO_REASON: سبب الرفض/الإلغاء إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV31',
        '★★ قبول قرار «paid» في loan_decide (تجاوز مسار التسديد كلّه)',
        """  IF p_decision NOT IN ('approved','rejected','cancelled') THEN""",
        """  IF p_decision NOT IN ('approved','rejected','cancelled','paid') THEN""",
    ),
    (
        'INV32',
        '★★ إسقاط حارس ملكية سجلّ التسديد (موظف يقرأ سجلّ زميله)',
        """  IF NOT public.current_user_is_staff()
     AND (v_emp IS NULL OR v_emp <> v_owner) THEN
    RAISE EXCEPTION 'غير مصرَّح بسجلّ هذه السلفة';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV33',
        '★ إسقاط ترشيح المستأجر من loan_repayment_history',
        """  SELECT l.employee_id INTO v_owner FROM public.employee_loans l
   WHERE l.id = p_loan_id AND l.tenant_id = v_tenant;""",
        """  SELECT l.employee_id INTO v_owner FROM public.employee_loans l
   WHERE l.id = p_loan_id;""",
    ),
]


# ═══════════════════════════════════════════════════════════════════════
#  عكوس DDL — `IF NOT EXISTS` يمنع إعادة الإنشاء فتلزم عبارة صريحة
# ═══════════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════════
#  ★★★ لماذا نُقل INV02 إلى DDL_INVERSIONS
#
#  عكسُه نصّياً (حذف سطر REVOKE من المايجريشن) **نجا** في الجولة الأولى.
#  السبب ليس ضعف تغطية بل فخّ إدارة الحالة: منحةُ `authenticated`
#  الضمنية تأتي من `ALTER DEFAULT PRIVILEGES IN SCHEMA public` (0268)
#  وهي تُطبَّق لحظة **CREATE TABLE** وحدها. والجدول موجود مسبقاً على
#  قاعدةٍ طُبِّق عليها المايجريشن، و`CREATE TABLE IF NOT EXISTS` لا
#  يُعيد إنشاءه. فحذفُ REVOKE من النصّ لا يُعيد المنحة — الصلاحية
#  بقيت `SELECT` وحدها (مقيس).
#
#  هذا هو فخّ `IF NOT EXISTS` نفسه المُوثَّق منذ الجولات السابقة، في
#  ثوب الصلاحيات. العكس الصحيح هو `GRANT` صريح — وهو DDL05.
# ═══════════════════════════════════════════════════════════════════════
DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط الفهرس الفريد uq_loan_repay_per_period (الخصم المزدوج يعود)',
        'DROP INDEX IF EXISTS public.uq_loan_repay_per_period;',
        """CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_repay_per_period
  ON public.loan_repayments (loan_id, payroll_period_id)
  WHERE payroll_period_id IS NOT NULL;""",
    ),
    (
        'DDL02',
        '★★ إسقاط محفّز منع الحذف (سجلّ التسديد يصير قابلاً للمحو)',
        'DROP TRIGGER IF EXISTS trg_block_loan_repayment_delete '
        'ON public.loan_repayments;',
        """CREATE TRIGGER trg_block_loan_repayment_delete
  BEFORE DELETE ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_loan_repayment_delete();""",
    ),
    (
        'DDL03',
        '★★ إسقاط قيد موجبية مبلغ التسديد',
        'ALTER TABLE public.loan_repayments '
        'DROP CONSTRAINT IF EXISTS loan_repayments_amount_pos;',
        'ALTER TABLE public.loan_repayments ADD CONSTRAINT '
        'loan_repayments_amount_pos CHECK (amount > 0);',
    ),
    (
        'DDL05',
        '★★★ إعادة المنحة الضمنية لـauthenticated (0268 يمنحها لكل جدول جديد)',
        'GRANT INSERT, UPDATE, DELETE, TRUNCATE '
        'ON public.loan_repayments TO authenticated;',
        'REVOKE ALL ON public.loan_repayments FROM authenticated; '
        'GRANT SELECT ON public.loan_repayments TO authenticated;',
    ),
    (
        'DDL04',
        '★★ تعطيل RLS على loan_repayments بالكامل',
        'ALTER TABLE public.loan_repayments DISABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;',
    ),
]

DDL_RLS_CHECK = {'DDL04'}


# ═══════════════════════════════════════════════════════════════════════
#  تكافؤات مُثبتة — لا تُعدّ ثغرات تغطية
# ═══════════════════════════════════════════════════════════════════════
EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        "حارس p_source في loan_apply_repayment",
        "مُكافئ لقيد loan_repayments_source_chk: عكسُه يُبدّل رسالة الخطأ "
        "من نصّ عربيّ إلى انتهاك CHECK، والصفّ يُرفض في الحالتين. "
        "(مُثبَت: INSERT بـ source='x' يرمي check_violation بالقيد وحده.)",
    ),
    (
        'EQ02',
        "`RETURN 0` حين remaining_amount <= 0",
        "مُكافئ عملياً لحارس status='approved' (INV06): سلفة بمتبقٍّ صفر "
        "لا تكون approved إلا لحظةً واحدة قبل أن يضبطها التسديد على paid. "
        "الفرع محروس بـINV06 الذي يسقط الاختبار فعلاً.",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0355 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql(MIG)
    base = psql(VERIFY)
    base_rls = run_rls()
    if base.returncode != 0 or base_rls.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print((base.stdout + base.stderr)[-2000:])
        print((base_rls.stdout + base_rls.stderr)[-2000:])
        return 1
    print('✔ خطّ الأساس: SQL و RLS ينجحان قبل أي عكس\n')

    # ── (أ) العكوس النصّية ──────────────────────────────────────────
    for ident, desc, old, new in INVERSIONS:
        if old not in original:
            print(f'✖ {ident}: النصّ الأصلي لم يُطابَق — العكس وهمي!')
            print(f'   {desc}')
            results.append((ident, desc, 'NO_MATCH'))
            continue
        cnt = original.count(old)
        if cnt != 1:
            print(f'⚠ {ident}: النصّ تكرّر {cnt} مرة — العكس يصيب الأول فقط')

        broken = original.replace(old, new, 1)
        assert broken != original, f'{ident}: الاستبدال لم يُغيّر شيئاً'

        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False,
                                         encoding='utf-8') as fh:
            fh.write(broken)
            tmp = fh.name
        try:
            ap = psql(tmp)
            if ap.returncode != 0:
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
                print(f'✔ {ident}  FAILED_AS_EXPECTED (رفضته القاعدة عند التطبيق)')
                print(f'   {desc}')
                continue

            if ident in RLS_CHECK:
                ver = run_rls()
                tag = 'RLS'
            else:
                ver = psql(VERIFY)
                m = re.search(r'FAIL \[[^\]]+\]', ver.stdout + ver.stderr)
                tag = m.group(0) if m else '؟'

            if ver.returncode != 0:
                print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {tag}')
                print(f'   {desc}')
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
            else:
                print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
                print(f'   {desc}')
                results.append((ident, desc, 'SURVIVED'))
        finally:
            os.unlink(tmp)
            psql(MIG)

    # ── (ب) عكوس DDL ────────────────────────────────────────────────
    print()
    for ident, desc, break_sql, restore_sql in DDL_INVERSIONS:
        br = psql_c(break_sql)
        if br.returncode != 0:
            print(f'✖ {ident}: عبارة الكسر نفسها فشلت — {br.stderr[:120]}')
            results.append((ident, desc, 'BREAK_FAILED'))
            continue
        try:
            if ident in DDL_RLS_CHECK:
                ver = run_rls()
                tag = 'RLS'
            else:
                ver = psql(VERIFY)
                m = re.search(r'FAIL \[[^\]]+\]', ver.stdout + ver.stderr)
                tag = m.group(0) if m else '؟'
            if ver.returncode != 0:
                print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {tag}')
                print(f'   {desc}')
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
            else:
                print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
                print(f'   {desc}')
                results.append((ident, desc, 'SURVIVED'))
        finally:
            rs = psql_c(restore_sql)
            if rs.returncode != 0:
                print(f'  ⚠ الاسترجاع فشل: {rs.stderr[:160]}')
            psql(MIG)

    open(MIG, 'w', encoding='utf-8').write(original)
    psql(MIG)
    final = psql(VERIFY)
    final_rls = run_rls()

    print()
    for ident, desc, why in EQUIVALENT_INVERSIONS:
        print(f'◈ {ident}  EQUIVALENT — {desc}')
        print(f'   السبب المُثبَت: {why}')

    print('\n' + '═' * 74)
    ok = sum(1 for _, _, s in results if s == 'FAILED_AS_EXPECTED')
    bad = [r for r in results if r[2] != 'FAILED_AS_EXPECTED']
    print(f'  النتيجة: {ok}/{len(results)} عكساً أسقط الاختبار')
    for ident, desc, st in bad:
        print(f'    ✖ {ident} [{st}] {desc}')
    good = final.returncode == 0 and final_rls.returncode == 0
    print(f'  الاسترجاع: {"✔ SQL و RLS ينجحان" if good else "✖ فشل"}')
    print('═' * 74)
    return 0 if (not bad and good) else 1


if __name__ == '__main__':
    sys.exit(main())
