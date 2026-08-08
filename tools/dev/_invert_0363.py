#!/usr/bin/env python3
"""
عكس إصلاحات 0363 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`ADD COLUMN IF NOT EXISTS`
   و`CREATE UNIQUE INDEX IF NOT EXISTS` يمنع إعادة الإنشاء ⇒ عكسُها
   بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5494 python3 tools/dev/_invert_0363.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0363_expense_lifecycle_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-expense-lifecycle-0363.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-expense-lifecycle-0363-rls.sh')

PGPORT = os.environ.get('PGPORT', '5494')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   السبب مُثبَت لا مُفترَض (دروس 0360/0361):
#   · حرّاس الدور: ملف SQL يستدعي الدوال بسياق **هدى (hr)** وهي staff
#     فعلاً، والموظف والمدير لا يظهران إلا في سكربت RLS.
#   · REVOKE عن anon: الأثر على anon وحده و`postgres` لا يمرّ منه.
# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   حرّاس الدور: ملف SQL يستدعي الدوال بسياق هدى (hr) وهي staff.
#   و REVOKE عن anon: الأثر على anon وحده.
RLS_CHECK = {'INV37'}
DDL_RLS_CHECK: set = set()


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
    return subprocess.run(['bash', VERIFY_RLS], capture_output=True,
                          text=True, errors='replace', env=ENV, timeout=400)


INVERSIONS = [
    (
        'INV01',
        '★★★ المحفّز يتوقّف عن ملء approved_by/at (العطل ⑨)',
        """    IF NEW.status IN ('approved','paid') AND OLD.status NOT IN ('approved','paid') THEN
      NEW.approved_by := COALESCE(NEW.approved_by, auth.uid(), OLD.approved_by);
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV02',
        '★★★ المحفّز يتوقّف عن ملء paid_at (العطل ⑩)',
        """    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      NEW.paid_at := COALESCE(NEW.paid_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV03',
        '★★ المحفّز يتوقّف عن تجميد الموظف والمستأجر',
        """    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;""",
        """    NULL;""",
    ),
    (
        'INV04',
        '★★ المحفّز يقبل تاريخاً في المستقبل (العطل ⑥)',
        """    IF NEW.expense_date > v_today THEN NEW.expense_date := v_today; END IF;""",
        """    NULL;""",
    ),
    (
        'INV05',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑫)',
        """  RAISE EXCEPTION
    'EXPENSE_DELETE_BLOCKED: طلب النفقة لا يُحذف — استخدم الإلغاء';""",
        """  RETURN OLD;""",
    ),
    (
        'INV06',
        '★★★ كشف التجمّد يسقط من expense_chain_state (العطل ①)',
        """    (EXISTS (SELECT 1 FROM req WHERE status = 'pending')
     AND COALESCE((SELECT total FROM st), 0) = 0);""",
        """    FALSE;""",
    ),
    (
        'INV07',
        '★★★ كشف التجمّد يسقط من اللوح',
        """    (b.status = 'pending' AND COALESCE(c.req_pending, FALSE)
       AND COALESCE(c.total, 0) = 0),""",
        """    FALSE,""",
    ),
    (
        'INV08',
        '★★★ كشف التجمّد يسقط من الملخّص',
        """    (SELECT count(*)::INTEGER FROM x
      JOIN chains c ON c.xid = x.id
     WHERE x.status = 'pending' AND c.req_pending AND c.total = 0),""",
        """    0,""",
    ),
    (
        'INV09',
        '★★★ حارس السلسلة المفتوحة في expense_decide يسقط',
        """  IF v_open > 0 THEN
    RAISE EXCEPTION
      'EXPENSE_CHAIN_OPEN: للطلب % خطوة اعتماد مفتوحة — استعمل صندوق الموافقات',
      v_open;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV10',
        '★★★ حارس سبب الرفض في الدالة يسقط (العطل ⑧)',
        """  IF p_decision = 'rejected' AND btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'EXPENSE_REJECTION_REASON_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV11',
        '★★ حارس «المدفوع لا يُنقَض» يسقط',
        """  IF v_old = 'paid' THEN RAISE EXCEPTION 'EXPENSE_ALREADY_PAID'; END IF;""",
        """  NULL;""",
    ),
    (
        'INV12',
        '★★ حارس «المعلَّق وحده يُبتّ» يسقط',
        """  IF v_old <> 'pending' THEN
    RAISE EXCEPTION 'EXPENSE_NOT_PENDING: %', v_old;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV13',
        '★★ حارس مفردات القرار يسقط',
        """  IF p_decision NOT IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'EXPENSE_DECISION_INVALID: %', p_decision;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV14',
        '★★★ حارس «لا صرفَ لغير المعتمَد» يسقط (العطل ⑩)',
        """  IF v_old <> 'approved' THEN
    RAISE EXCEPTION 'EXPENSE_NOT_APPROVED: %', v_old;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV15',
        '★★★ حارس «لا تُقدّم باسم غيرك» يسقط (العطل ⑰)',
        """  IF v_emp IS DISTINCT FROM v_me AND NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'EXPENSE_NOT_AUTHORIZED: لا تُقدّم نفقةً باسم غيرك';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV16',
        '★★★ حارس المستأجر في expense_submit يسقط (العطلان ③/④)',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = v_emp AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'EXPENSE_EMPLOYEE_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV17',
        '★★ حارس المبلغ في الدالة يسقط (العطل ⑤)',
        """  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'EXPENSE_AMOUNT_INVALID';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV18',
        '★★ حارس الفئة يسقط (العطل ⑦)',
        """  IF p_category NOT IN ('general','travel','meals','supplies',
                        'training','medical','transport') THEN
    RAISE EXCEPTION 'EXPENSE_CATEGORY_INVALID: %', p_category;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV19',
        '★★ حارس تاريخ المستقبل في الدالة يسقط',
        """  IF COALESCE(p_date, v_today) > v_today THEN
    RAISE EXCEPTION 'EXPENSE_DATE_IN_FUTURE';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV20',
        '★★ حارس العنوان الفارغ يسقط',
        """  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'EXPENSE_TITLE_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV21',
        '★★ حارس الوصف الفارغ يسقط',
        """  IF btrim(COALESCE(p_description,'')) = '' THEN
    RAISE EXCEPTION 'EXPENSE_DESCRIPTION_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV22',
        '★★★ حارس الدور في expense_decide يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'EXPENSE_NOT_AUTHORIZED';
  END IF;
  IF p_decision NOT IN""",
        """  NULL;
  IF p_decision NOT IN""",
    ),
    (
        'INV23',
        '★★★ حارس الدور في expense_mark_paid يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'EXPENSE_NOT_AUTHORIZED';
  END IF;

  SELECT status INTO v_old FROM public.expense_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  -- ★★ لا صرفَ لغير المعتمَد""",
        """  NULL;

  SELECT status INTO v_old FROM public.expense_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  -- ★★ لا صرفَ لغير المعتمَد""",
    ),
    (
        'INV24',
        '★★★ حارس الدور في الملخّص يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص النفقات';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV25',
        '★★★ ترشيح المستأجر في اللوح يسقط',
        """    SELECT x.* FROM public.expense_requests x
     WHERE x.tenant_id = v_tenant""",
        """    SELECT x.* FROM public.expense_requests x
     WHERE (x.tenant_id = v_tenant OR TRUE)""",
    ),
    (
        'INV26',
        '★★★ ترشيح المستأجر في الملخّص يسقط',
        """  WITH x AS (SELECT * FROM public.expense_requests WHERE tenant_id = v_tenant),""",
        """  WITH x AS (SELECT * FROM public.expense_requests),""",
    ),
    (
        'INV27',
        '★★★ ترشيح المستأجر في expense_decide يسقط',
        """  SELECT status INTO v_old FROM public.expense_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  -- ★★ المدفوع لا يُنقَض""",
        """  SELECT status INTO v_old FROM public.expense_requests
   WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  -- ★★ المدفوع لا يُنقَض""",
    ),
    (
        'INV28',
        '★★★ الموظف يرى نفقات زملائه في اللوح',
        """       AND (v_staff OR x.employee_id = v_me)""",
        """       AND (v_staff OR TRUE)""",
    ),
    (
        'INV29',
        '★★ ترشيح الحالة في اللوح يصير بلا أثر',
        """       AND (p_status IS NULL OR x.status = p_status)""",
        """       AND (p_status IS NULL OR TRUE)""",
    ),
    (
        'INV30',
        '★★ ترشيح الفئة في اللوح يصير بلا أثر',
        """       AND (p_category IS NULL OR x.category = p_category)""",
        """       AND (p_category IS NULL OR TRUE)""",
    ),
    (
        'INV31',
        '★★ الاحتياطيّ لاسم الموظف يسقط (full_name_ar فارغ)',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
             'موظف ' || e.employee_code)::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV32',
        '★★ الترتيب الحتميّ في اللوح يسقط (درس 0357)',
        """ ORDER BY (b.status = 'pending') DESC, b.expense_date ASC, b.id DESC""",
        """ ORDER BY b.title""",
    ),
    (
        'INV33',
        '★★ الحدّ الأعلى في اللوح يصير بلا أثر',
        """  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);""",
        """  v_lim    INTEGER := 500;""",
    ),
    (
        'INV34',
        '★★★ توقيت بغداد يسقط من اللوح — يُزاح v_today يوماً كاملاً',
        """  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER""",
        """  v_today  DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1);
  v_lim    INTEGER""",
    ),
    (
        'INV35',
        '★★ COALESCE خارج round ⇒ 0 لا 0.00 (درس 0355)',
        """    (SELECT round(COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0), 2) FROM x),""",
        """    (SELECT COALESCE(round(sum(amount) FILTER (WHERE status = 'pending'), 2), 0) FROM x),""",
    ),
    (
        'INV36',
        '★★ عدّاد «بلا إيصال» يشمل الملغى',
        """    (SELECT count(*)::INTEGER FROM x
      WHERE status <> 'cancelled' AND receipt_url IS NULL);""",
        """    (SELECT count(*)::INTEGER FROM x WHERE receipt_url IS NULL);""",
    ),
    (
        'INV38',
        '★★★ استخراج سبب الرفض من الخطوة يسقط (العطل ⑲)',
        """  RETURN COALESCE(v_reason, 'رُفض عبر صندوق الموافقات بلا تعليق');""",
        """  RETURN NULL;""",
    ),
    (
        'INV39',
        '★★★ محفّز ملء سبب الرفض من المزامنة يسقط (العطل ⑲)',
        """    IF v_req IS NOT NULL THEN
      NEW.rejection_reason := public.expense_apply_rejection_reason(v_req);
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV40',
        '★★ الترتيب الحتميّ لاختيار خطوة الرفض يسقط (درس 0357)',
        """   ORDER BY s.decided_at DESC NULLS LAST, s.step_order DESC, s.id DESC
   LIMIT 1;""",
        """   LIMIT 1;""",
    ),
    (
        'INV37',
        '★★★ REVOKE عن anon يسقط عن اللوح',
        """REVOKE ALL ON FUNCTION public.expense_board(TEXT, TEXT, INTEGER) FROM anon;""",
        """GRANT EXECUTE ON FUNCTION public.expense_board(TEXT, TEXT, INTEGER) TO anon;""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط FK المركَّب (employee_id, tenant_id)',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_employee_tenant_fkey;',
        'ALTER TABLE public.expense_requests ADD CONSTRAINT '
        'expense_requests_employee_tenant_fkey FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL02',
        '★★ إسقاط قيد المبلغ الموجب (العطل ⑤)',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_amount_chk;',
        'ALTER TABLE public.expense_requests ADD CONSTRAINT '
        'expense_requests_amount_chk CHECK (amount > 0);',
    ),
    (
        'DDL03',
        '★★ إسقاط قيد الفئة (العطل ⑦)',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_category_chk;',
        "ALTER TABLE public.expense_requests ADD CONSTRAINT "
        "expense_requests_category_chk CHECK (category IN ('general','travel',"
        "'meals','supplies','training','medical','transport'));",
    ),
    (
        'DDL04',
        '★★★ إسقاط قيد سبب الرفض (العطل ⑧)',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_rejection_chk;',
        "ALTER TABLE public.expense_requests ADD CONSTRAINT "
        "expense_requests_rejection_chk CHECK (status <> 'rejected' OR "
        "(rejection_reason IS NOT NULL AND btrim(rejection_reason) <> ''));",
    ),
    (
        'DDL05',
        '★★★ إسقاط قيد المعتمِد/الوقت (العطل ⑨)',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_approved_chk;',
        "ALTER TABLE public.expense_requests ADD CONSTRAINT "
        "expense_requests_approved_chk CHECK (status NOT IN ('approved','paid') "
        "OR (approved_by IS NOT NULL AND approved_at IS NOT NULL));",
    ),
    (
        'DDL06',
        '★★★ إسقاط قيد وقت الدفع (العطل ⑩)',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_paid_chk;',
        "ALTER TABLE public.expense_requests ADD CONSTRAINT "
        "expense_requests_paid_chk CHECK (status <> 'paid' OR paid_at IS NOT NULL);",
    ),
    (
        'DDL07',
        '★★ إسقاط قيد العنوان/الوصف',
        'ALTER TABLE public.expense_requests '
        'DROP CONSTRAINT IF EXISTS expense_requests_title_chk;',
        "ALTER TABLE public.expense_requests ADD CONSTRAINT "
        "expense_requests_title_chk CHECK (btrim(title) <> '' AND btrim(description) <> '');",
    ),
    (
        'DDL08',
        '★★ إعادة tenant_id إلى NULLABLE (العطل ②)',
        'ALTER TABLE public.expense_requests ALTER COLUMN tenant_id DROP NOT NULL;',
        'ALTER TABLE public.expense_requests ALTER COLUMN tenant_id SET NOT NULL;',
    ),
]

EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        'إسقاط `GRANT EXECUTE … TO authenticated` عن أيٍّ من الدوال الستّ',
        '★★★ `0268` نفّذ `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON '
        'FUNCTIONS`، و`pg_default_acl` = `f | postgres | anon=X '
        'authenticated=X service_role=X` ⇒ كل دالة جديدة تُولَد ومعها '
        'EXECUTE لـauthenticated تلقائياً (أُثبت بمسبار في 0360/EQ04). '
        'المنحة تحصيل حاصل. ★ أمّا `REVOKE … FROM anon` فعكسه (INV37) '
        'أسقط سكربت RLS فعلاً.'
    ),
    (
        'EQ02',
        'إسقاط `idx_expense_requests_pending`',
        'فهرس أداءٍ محض لا يغيّر نتيجة أيّ استعلام — الخطة تسقط إلى '
        'Seq Scan على عيّنة من خمسة صفوف. ★ ولا `LIMIT` بلا `ORDER BY` '
        '(درس 0357): الترتيب حتميّ بثلاثة مفاتيح. عكسُه مغطًّى ضمنياً '
        'بالتأكيدين 11.8 و11.11.'
    ),
    (
        'EQ03',
        'إبقاء `trg_guard_status_bypass` القديم دون تعديل',
        '★★★ **لم نُعدّله عمداً وهو ليس إصلاحاً في هذه الجولة.** الحارس '
        'يعدّ الخطوات المفتوحة، و«صفر خطوة» تعني «لا سلسلة» — سلوكٌ '
        'مقصود للسجلات القديمة. العطل ① ليس في الحارس بل في أنّ طلباً '
        'بلا خطوات **يُنشأ أصلاً**. علاجنا كشفٌ لا منع: '
        '`expense_chain_state.out_is_stalled` + عدّاد في الملخّص + '
        'راية في اللوح. التأكيد 1.11 يحرس بقاءه سليماً.'
    ),
]

def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0363 — إثبات أن كل إصلاح مُختبَر فعلاً')
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

    print()
    for ident, desc, break_sql, restore_sql in DDL_INVERSIONS:
        br = psql_c(break_sql)
        if br.returncode != 0:
            print(f'✖ {ident}: عبارة الكسر نفسها فشلت — {br.stderr[:140]}')
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
                print(f'  ⚠ الاسترجاع فشل: {rs.stderr[:180]}')
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
