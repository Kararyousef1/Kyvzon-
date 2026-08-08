#!/usr/bin/env python3
"""
عكس إصلاحات 0364 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`ADD COLUMN IF NOT EXISTS`
   و`CREATE UNIQUE INDEX IF NOT EXISTS` يمنع إعادة الإنشاء ⇒ عكسُها
   بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5497 python3 tools/dev/_invert_0364.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0364_employee_contracts_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-employee-contracts-0364.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-employee-contracts-0364-rls.sh')

PGPORT = os.environ.get('PGPORT', '5497')
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
# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   ★ تصحيحٌ لتصنيفي: وضعتُ INV01 هنا ظنّاً أن أثره أمنيّ فقط —
#     **خطأ**: التأكيد 1.1 يفحص نصّ السياسة في SQL مباشرةً فيمسكه.
RLS_CHECK = {'INV42'}
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
        '★★★ الشرط الميّت auth.uid() يعود إلى السياسة (العطل ①)',
        """      OR employee_id = public.current_user_employee_id()
    )
  );""",
        """      OR employee_id = auth.uid()
      OR employee_id = public.current_user_employee_id()
    )
  );""",
    ),
    (
        'INV02',
        '★★★ المحفّز يتوقّف عن ملء created_by (العطل ⑰)',
        """    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.updated_by := NEW.created_by;""",
        """    NULL;""",
    ),
    (
        'INV03',
        '★★ المحفّز يتوقّف عن تجميد الموظف والمستأجر',
        """    NEW.created_by  := OLD.created_by;
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;""",
        """    NULL;""",
    ),
    (
        'INV04',
        '★★ المحفّز يتوقّف عن ملء terminated_at (العطل ⑫)',
        """    IF NEW.status = 'terminated' AND OLD.status <> 'terminated' THEN
      NEW.terminated_at := COALESCE(NEW.terminated_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV05',
        '★★ المحفّز يتوقّف عن تطبيع رقم العقد (العطل ⑱)',
        """  NEW.contract_number := NULLIF(btrim(COALESCE(NEW.contract_number,'')), '');""",
        """  NULL;""",
    ),
    (
        'INV06',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑩)',
        """  RAISE EXCEPTION
    'CONTRACT_DELETE_BLOCKED: عقد العمل لا يُحذف — استخدم الإنهاء';""",
        """  RETURN OLD;""",
    ),
    (
        'INV07',
        '★★★ contract_expire_due تتوقّف عن الترحيل (العطل ⑦)',
        """  UPDATE public.employee_contracts
     SET status = 'expired', updated_at = now()
   WHERE tenant_id = v_tenant
     AND status = 'active'
     AND end_date IS NOT NULL
     AND end_date < v_today;""",
        """  UPDATE public.employee_contracts SET updated_at = updated_at WHERE FALSE;""",
    ),
    (
        'INV08',
        '★★★ توقيت بغداد يسقط من الترحيل — يُزاح v_today يوماً',
        """  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_n      INTEGER;""",
        """  v_today  DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE - 1000);
  v_n      INTEGER;""",
    ),
    (
        'INV09',
        '★★★ حارس الدور في الترحيل يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بترحيل حالة العقود';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV10',
        '★★★ ترشيح المستأجر في الترحيل يسقط',
        """   WHERE tenant_id = v_tenant
     AND status = 'active'
     AND end_date IS NOT NULL
     AND end_date < v_today;""",
        """   WHERE status = 'active'
     AND end_date IS NOT NULL
     AND end_date < v_today;""",
    ),
    (
        'INV11',
        '★★★ حساب الأيام يعود بلا توقيت بغداد في اللوح (العطل ⑮)',
        """  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);""",
        """  v_today  DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1);
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);""",
    ),
    (
        'INV12',
        '★★ نافذة التنبيه تصير ثابتة 7 بدل renewal_notice_days',
        """      WHEN c.end_date <= v_today + c.renewal_notice_days   THEN 'expiring'""",
        """      WHEN c.end_date <= v_today + 7                       THEN 'expiring'""",
    ),
    (
        'INV13',
        '★★ الاحتياطيّ لاسم الموظف يسقط (full_name_ar فارغ)',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
             'موظف ' || e.employee_code)::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV14',
        '★★★ ترشيح المستأجر في اللوح يسقط',
        """ WHERE c.tenant_id = v_tenant
   -- ★ الموظف يرى عقوده هو""",
        """ WHERE (c.tenant_id = v_tenant OR TRUE)
   -- ★ الموظف يرى عقوده هو""",
    ),
    (
        'INV15',
        '★★★ الموظف يرى عقود زملائه في اللوح',
        """   AND (v_staff OR c.employee_id = v_me)""",
        """   AND (v_staff OR TRUE)""",
    ),
    (
        'INV16',
        '★★ ترشيح الحالة في اللوح يصير بلا أثر',
        """   AND (p_status IS NULL OR c.status = p_status)""",
        """   AND (p_status IS NULL OR TRUE)""",
    ),
    (
        'INV17',
        '★★ ترشيح النوع في اللوح يصير بلا أثر',
        """   AND (p_type IS NULL OR c.contract_type = p_type)""",
        """   AND (p_type IS NULL OR TRUE)""",
    ),
    (
        'INV18',
        '★★ الترتيب الحتميّ في اللوح يسقط (درس 0357)',
        """ ORDER BY (c.status = 'active') DESC,
          c.end_date ASC NULLS LAST, c.id DESC""",
        """ ORDER BY c.contract_type""",
    ),
    (
        'INV19',
        '★★ الحدّ الأعلى في اللوح يصير بلا أثر',
        """  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY
  SELECT
    c.id, c.employee_id,""",
        """  v_lim    INTEGER := 500;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY
  SELECT
    c.id, c.employee_id,""",
    ),
    (
        'INV20',
        '★★★ عدّاد المتناقض يسقط من الملخّص (العطل ⑦)',
        """    (SELECT count(*)::INTEGER FROM c
      WHERE status = 'active' AND end_date IS NOT NULL AND end_date < v_today),""",
        """    0,""",
    ),
    (
        'INV21',
        '★★ عدّاد «بلا عقدٍ نشط» يسقط',
        """    (SELECT count(*)::INTEGER FROM public.employees e
      WHERE e.tenant_id = v_tenant AND e.is_active
        AND NOT EXISTS (SELECT 1 FROM c
                         WHERE c.employee_id = e.id AND c.status = 'active')),""",
        """    0,""",
    ),
    (
        'INV22',
        '★★★ ترشيح المستأجر في الملخّص يسقط',
        """  WITH c AS (SELECT * FROM public.employee_contracts WHERE tenant_id = v_tenant)""",
        """  WITH c AS (SELECT * FROM public.employee_contracts)""",
    ),
    (
        'INV23',
        '★★★ حارس الدور في الملخّص يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص العقود';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV24',
        '★★★ حارس المستأجر في contract_upsert يسقط (العطلان ②/③)',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'CONTRACT_EMPLOYEE_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV25',
        '★★★ حارس نهايةٍ قبل بداية يسقط (العطل ④)',
        """  IF p_end IS NOT NULL AND p_end < v_start THEN
    RAISE EXCEPTION 'CONTRACT_END_BEFORE_START';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV26',
        '★★★ حارس محدد المدة بلا نهاية يسقط (العطل ⑥)',
        """  IF p_type IN ('fixed_term','probation') AND p_end IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_TERM_NEEDS_END: % يحتاج تاريخ نهاية', p_type;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV27',
        '★★ حارس مدّة التنبيه يسقط (العطل ⑧)',
        """  IF COALESCE(p_notice, 0) <= 0 OR p_notice > 365 THEN
    RAISE EXCEPTION 'CONTRACT_NOTICE_INVALID';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV28',
        '★★ حارس الراتب يسقط (العطل ⑨)',
        """  IF p_salary IS NOT NULL AND p_salary <= 0 THEN
    RAISE EXCEPTION 'CONTRACT_SALARY_INVALID';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV29',
        '★★ حارس العملة يسقط',
        """  IF p_currency IS NOT NULL
     AND p_currency NOT IN ('IQD','USD','EUR','SAR','AED') THEN
    RAISE EXCEPTION 'CONTRACT_CURRENCY_INVALID: %', p_currency;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV30',
        '★★ حارس النوع يسقط',
        """  IF p_type NOT IN ('permanent','fixed_term','probation',
                    'part_time','consultant','other') THEN
    RAISE EXCEPTION 'CONTRACT_TYPE_INVALID: %', p_type;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV31',
        '★★★ حارس العقد النشط الواحد يسقط (العطل ⑤)',
        """  IF p_status = 'active' AND EXISTS (
       SELECT 1 FROM public.employee_contracts x
        WHERE x.tenant_id = v_tenant AND x.employee_id = p_employee
          AND x.status = 'active' AND (p_id IS NULL OR x.id <> p_id)) THEN
    RAISE EXCEPTION
      'CONTRACT_ACTIVE_EXISTS: للموظف عقدٌ نشطٌ بالفعل — جدّده أو أنهِه';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV32',
        '★★★ حارس الدور في contract_upsert يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CONTRACT_NOT_AUTHORIZED';
  END IF;

  -- ★★★ العطلان ②/③: الموظف من المستأجر نفسه""",
        """  NULL;

  -- ★★★ العطلان ②/③: الموظف من المستأجر نفسه""",
    ),
    (
        'INV33',
        '★★★ التجديد يكتب فوق القديم بدل إنشاء عقد (العطل ⑪)',
        """  UPDATE public.employee_contracts
     SET status = 'renewed', updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;""",
        """  UPDATE public.employee_contracts
     SET end_date = p_new_end, updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;""",
    ),
    (
        'INV34',
        '★★★ التجديد لا يحفظ السلسلة (renewed_from/previous/count)',
        """     p_id, v_old.end_date, v_old.renewal_count + 1)""",
        """     NULL, NULL, 0)""",
    ),
    (
        'INV35',
        '★★ حارس «النهاية الجديدة بعد القديمة» يسقط',
        """  IF p_new_end <= COALESCE(v_old.end_date, v_old.start_date) THEN
    RAISE EXCEPTION 'CONTRACT_RENEW_NOT_LATER: النهاية الجديدة ليست بعد القديمة';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV36',
        '★★ حارس «النهاية مطلوبة» في التجديد يسقط',
        """  IF p_new_end IS NULL THEN RAISE EXCEPTION 'CONTRACT_RENEW_NEEDS_END'; END IF;""",
        """  NULL;""",
    ),
    (
        'INV37',
        '★★ حارس «المنهى لا يُجدَّد» يسقط',
        """  IF v_old.status NOT IN ('active','expired') THEN
    RAISE EXCEPTION 'CONTRACT_NOT_RENEWABLE: %', v_old.status;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV38',
        '★★★ حارس سبب الإنهاء يسقط (العطل ⑫)',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'CONTRACT_TERMINATION_REASON_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV39',
        '★★ حارس «الإنهاء قبل البداية» يسقط',
        """  IF COALESCE(p_date, v_today) < v_start THEN
    RAISE EXCEPTION 'CONTRACT_TERMINATION_BEFORE_START';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV40',
        '★★ حارس «لا إنهاءَ مرّتين» يسقط',
        """  IF v_old = 'terminated' THEN RAISE EXCEPTION 'CONTRACT_ALREADY_TERMINATED'; END IF;""",
        """  NULL;""",
    ),
    (
        'INV41',
        '★★★ ترشيح المستأجر في contract_terminate يسقط',
        """  SELECT status, start_date INTO v_old, v_start
    FROM public.employee_contracts
   WHERE id = p_id AND tenant_id = v_tenant;""",
        """  SELECT status, start_date INTO v_old, v_start
    FROM public.employee_contracts
   WHERE id = p_id;""",
    ),
    (
        'INV42',
        '★★★ REVOKE عن anon يسقط عن اللوح',
        """REVOKE ALL ON FUNCTION public.contract_board(TEXT, TEXT, INTEGER) FROM anon;""",
        """GRANT EXECUTE ON FUNCTION public.contract_board(TEXT, TEXT, INTEGER) TO anon;""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط FK المركَّب (employee_id, tenant_id)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_employee_tenant_fkey;',
        'ALTER TABLE public.employee_contracts ADD CONSTRAINT '
        'employee_contracts_employee_tenant_fkey FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL02',
        '★★★ إسقاط قيد التواريخ (العطل ④)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_dates_chk;',
        'ALTER TABLE public.employee_contracts ADD CONSTRAINT '
        'employee_contracts_dates_chk CHECK (end_date IS NULL OR end_date >= start_date);',
    ),
    (
        'DDL03',
        '★★★ إسقاط قيد محدد المدة (العطل ⑥)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_term_chk;',
        "ALTER TABLE public.employee_contracts ADD CONSTRAINT "
        "employee_contracts_term_chk CHECK (contract_type NOT IN "
        "('fixed_term','probation') OR end_date IS NOT NULL);",
    ),
    (
        'DDL04',
        '★★ إسقاط قيد مدّة التنبيه (العطل ⑧)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_notice_chk;',
        'ALTER TABLE public.employee_contracts ADD CONSTRAINT '
        'employee_contracts_notice_chk CHECK (renewal_notice_days > 0 '
        'AND renewal_notice_days <= 365);',
    ),
    (
        'DDL05',
        '★★ إسقاط قيد الراتب (العطل ⑨)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_salary_chk;',
        'ALTER TABLE public.employee_contracts ADD CONSTRAINT '
        'employee_contracts_salary_chk CHECK (salary_amount IS NULL OR salary_amount > 0);',
    ),
    (
        'DDL06',
        '★★ إسقاط قيد العملة',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_currency_chk;',
        "ALTER TABLE public.employee_contracts ADD CONSTRAINT "
        "employee_contracts_currency_chk CHECK (salary_currency IS NULL "
        "OR salary_currency IN ('IQD','USD','EUR','SAR','AED'));",
    ),
    (
        'DDL07',
        '★★ إسقاط قيد رقم العقد غير الفارغ (العطل ⑱)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_number_chk;',
        "ALTER TABLE public.employee_contracts ADD CONSTRAINT "
        "employee_contracts_number_chk CHECK (contract_number IS NULL "
        "OR btrim(contract_number) <> '');",
    ),
    (
        'DDL08',
        '★★★ إسقاط قيد الإنهاء (العطل ⑫)',
        'ALTER TABLE public.employee_contracts '
        'DROP CONSTRAINT IF EXISTS employee_contracts_termination_chk;',
        "ALTER TABLE public.employee_contracts ADD CONSTRAINT "
        "employee_contracts_termination_chk CHECK (status <> 'terminated' "
        "OR (terminated_at IS NOT NULL AND termination_reason IS NOT NULL "
        "AND btrim(termination_reason) <> ''));",
    ),
    (
        'DDL09',
        '★★★ إسقاط فهرس العقد النشط الواحد (العطل ⑤)',
        'DROP INDEX IF EXISTS public.uq_employee_contracts_one_active;',
        'CREATE UNIQUE INDEX uq_employee_contracts_one_active '
        "ON public.employee_contracts (tenant_id, employee_id) WHERE status = 'active';",
    ),
    (
        'DDL10',
        '★★★ إسقاط أعمدة التجديد (العطل ⑪)',
        'ALTER TABLE public.employee_contracts '
        'DROP COLUMN IF EXISTS renewed_from CASCADE, '
        'DROP COLUMN IF EXISTS previous_end_date CASCADE, '
        'DROP COLUMN IF EXISTS renewal_count CASCADE;',
        'ALTER TABLE public.employee_contracts '
        'ADD COLUMN IF NOT EXISTS renewed_from UUID, '
        'ADD COLUMN IF NOT EXISTS previous_end_date DATE, '
        'ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0;',
    ),
    (
        'DDL11',
        '★★ إسقاط أعمدة الإنهاء (العطل ⑫)',
        'ALTER TABLE public.employee_contracts '
        'DROP COLUMN IF EXISTS terminated_at CASCADE, '
        'DROP COLUMN IF EXISTS termination_reason CASCADE;',
        'ALTER TABLE public.employee_contracts '
        'ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ, '
        'ADD COLUMN IF NOT EXISTS termination_reason TEXT;',
    ),
    (
        'DDL12',
        '★★ إسقاط أعمدة الربط (العطل ⑬)',
        'ALTER TABLE public.employee_contracts '
        'DROP COLUMN IF EXISTS job_application_id CASCADE, '
        'DROP COLUMN IF EXISTS offboarding_id CASCADE;',
        'ALTER TABLE public.employee_contracts '
        'ADD COLUMN IF NOT EXISTS job_application_id UUID, '
        'ADD COLUMN IF NOT EXISTS offboarding_id UUID;',
    ),
]

EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        'إسقاط `GRANT EXECUTE … TO authenticated` عن أيٍّ من الدوال الستّ',
        '★★★ `0268` نفّذ `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON '
        'FUNCTIONS`، و`pg_default_acl` = `f | postgres | anon=X '
        'authenticated=X service_role=X` ⇒ المنحة تحصيل حاصل (أُثبت '
        'بمسبار في 0360/EQ04). ★ أمّا `REVOKE … FROM anon` فعكسه '
        '(INV42) أسقط سكربت RLS فعلاً.'
    ),
    (
        'EQ02',
        'إسقاط `idx_employee_contracts_expiring`',
        'فهرس أداءٍ محض لا يغيّر نتيجة أيّ استعلام — الخطة تسقط إلى '
        'Seq Scan على عيّنة من سبعة صفوف. ★ ولا `LIMIT` بلا `ORDER BY` '
        '(درس 0357): الترتيب حتميّ بثلاثة مفاتيح. عكسُه مغطًّى ضمنياً '
        'بالتأكيدين 10.6 و10.10.'
    ),
]

def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0364 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
