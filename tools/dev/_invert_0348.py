#!/usr/bin/env python3
"""عكس كل إصلاح في 0348 وإثبات سقوط الاختبار."""
import os, re, shutil, subprocess, sys

REPO = '/home/user/Kyvzon'
MIG = os.path.join(REPO, 'supabase/migrations/0348_payroll_run_integrity.sql')
TEST = os.path.join(REPO, 'tools/dev/verify-payroll-run-0348.sql')
SOCK, PORT, PGR = '/home/user/.pgtest/sock', '5454', '/home/user/.pgtest/root'

ENV = dict(os.environ)
ENV['PATH'] = f'{PGR}/usr/lib/postgresql/17/bin:' + ENV['PATH']
ENV['LD_LIBRARY_PATH'] = f'{PGR}/usr/lib/x86_64-linux-gnu:{PGR}/usr/lib'


def psql(path):
    return subprocess.run(
        ['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-X', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV)


INVERSIONS = [
    # ① مصدر الراتب — العطل ②
    ("①.1 الراتب من الملف وحده (يتجاهل العقد)",
     "  SELECT c.salary_amount INTO v_sal\n    FROM public.employee_contracts c\n   WHERE c.employee_id = p_employee_id",
     "  SELECT c.salary_amount INTO v_sal\n    FROM public.employee_contracts c\n   WHERE FALSE AND c.employee_id = p_employee_id"),
    ("①.2 العقد المنتهي يُقبل",
     "     AND (c.end_date IS NULL OR c.end_date >= v_day)",
     "     AND TRUE"),
    ("①.3 العقد لا يُقيَّد بتاريخ البدء",
     "     AND c.start_date <= v_day\n     AND (c.end_date IS NULL OR c.end_date >= v_day)",
     "     AND (c.end_date IS NULL OR c.end_date >= v_day)"),
    ("①.4 لا احتياطي افتراضي (صفر)",
     "  SELECT s.default_basic_salary INTO v_sal\n    FROM public.payroll_settings s WHERE s.id = 1;\n\n  RETURN COALESCE(v_sal, 0);",
     "  RETURN 0;"),
    ("①.5 الملف يسبق العقد (أولوية مقلوبة)",
     "  IF v_sal IS NOT NULL AND v_sal > 0 THEN RETURN v_sal; END IF;\n\n  -- ② الملف الشخصي",
     "  -- ② الملف الشخصي"),

    # ② الحضور — العطل ③
    ("②.1 أيام العمل مُثبَّتة 26 (الرقم المكتوب يدوياً)",
     "  v_wdays := COALESCE(v_wdays, 26);",
     "  v_wdays := 26;"),
    ("②.2 الحضور بلا ترشيح فترة",
     "     WHERE a.tenant_id = v_tenant\n       AND a.shift_date >= v_start\n       AND a.shift_date <= v_end\n     GROUP BY a.employee_id",
     "     WHERE a.tenant_id = v_tenant\n     GROUP BY a.employee_id"),
    ("②.3 الحضور بلا ترشيح مستأجر",
     "      FROM public.attendance_summary a\n     WHERE a.tenant_id = v_tenant\n       AND a.shift_date >= v_start",
     "      FROM public.attendance_summary a\n     WHERE a.shift_date >= v_start"),
    ("②.4 الغياب لا يُحتسب (صفر أبداً)",
     "           count(*) FILTER (\n             WHERE public.attendance_status_bucket(a.status) = 'absent')::INTEGER  AS absent,",
     "           0::INTEGER AS absent,"),
    ("②.5 الحضور = أيام العمل دائماً",
     "           COALESCE(a.present, 0) AS present_d,",
     "           v_wdays AS present_d,"),

    # ③ الخصومات — العطل ④
    ("③.1 الضريبة مُهمَلة",
     "           round(e.basic * v_tax / 100.0, 2) AS tax_cut,",
     "           0::NUMERIC AS tax_cut,"),
    ("③.2 الضمان مُهمَل",
     "           round(e.basic * v_ss  / 100.0, 2) AS ss_cut,",
     "           0::NUMERIC AS ss_cut,"),
    ("③.3 خصم الغياب مُهمَل",
     "           round(COALESCE(a.absent, 0) * v_pen, 2) AS absence_cut,",
     "           0::NUMERIC AS absence_cut,"),
    ("③.4 الأوفرتايم مُهمَل",
     "           round(COALESCE(a.ot_hours, 0)\n                 * (e.basic / NULLIF(v_wdays * 8, 0)) * v_otr, 2) AS ot_pay,",
     "           0::NUMERIC AS ot_pay,"),
    ("③.5 معدّل الأوفرتايم مُهمَل (×1 بدل ×2)",
     "* (e.basic / NULLIF(v_wdays * 8, 0)) * v_otr, 2) AS ot_pay,",
     "* (e.basic / NULLIF(v_wdays * 8, 0)), 2) AS ot_pay,"),

    # ④ القروض — العطل ⑤
    ("④.1 أقساط القروض لا تُخصم",
     "           round(COALESCE(l.installment, 0), 2) AS loan_cut",
     "           0::NUMERIC AS loan_cut"),
    # ★★★ ④.2 مُصنَّف EQUIVALENT — مُثبَت بالتحليل: القصّ لكل قرض
    #   يُصفّر المُسدَّد تلقائياً (LEAST(قسط, 0) = 0)، فالشرط والقصّ
    #   يحرسان الحالة نفسها. حراسة مزدوجة لا ثغرة تغطية
    #   (نفس نمط ③.2 في 0344). العكس المركّب يُسقط الاثنين معاً.
    ("④.2 القرض المُسدَّد يُخصم [EQUIVALENT — مع القصّ]",
     "           SUM(LEAST(\n             COALESCE(l.monthly_installment, 0),\n             COALESCE(l.remaining_amount, 0)\n           )) AS installment\n      FROM public.employee_loans l\n     WHERE l.tenant_id = v_tenant\n       -- ★ القيم المسموحة مُحقَّقة من employee_loans_status_chk:\n       --   pending·approved·rejected·paid·cancelled — **لا 'active'**\n       AND l.status = 'approved'\n       AND COALESCE(l.remaining_amount, 0) > 0",
     "           SUM(COALESCE(l.monthly_installment, 0)) AS installment\n      FROM public.employee_loans l\n     WHERE l.tenant_id = v_tenant\n       AND l.status = 'approved'"),
    ("④.3 القسط لا يُقصّ بالمتبقّي",
     "           SUM(LEAST(\n             COALESCE(l.monthly_installment, 0),\n             COALESCE(l.remaining_amount, 0)\n           )) AS installment",
     "           SUM(COALESCE(l.monthly_installment, 0)) AS installment"),
    ("④.3b القصّ بمجموع المتبقّي لا لكل قرض (العيب الذي كشفه العكس)",
     "           SUM(LEAST(\n             COALESCE(l.monthly_installment, 0),\n             COALESCE(l.remaining_amount, 0)\n           )) AS installment",
     "           LEAST(SUM(COALESCE(l.monthly_installment, 0)),\n                 SUM(COALESCE(l.remaining_amount, 0))) AS installment"),
    ("④.4 القروض بلا ترشيح مستأجر",
     "      FROM public.employee_loans l\n     WHERE l.tenant_id = v_tenant",
     "      FROM public.employee_loans l\n     WHERE TRUE"),

    # ⑤ القصّ والصافي — العطل ⑥
    ("⑤.1 الخصم لا يُقصّ (صافٍ سالب)",
     "           LEAST(f.deduct_raw, f.basic + f.ot_pay) AS deduct",
     "           f.deduct_raw AS deduct"),
    ("⑤.2 قيد المعادلة محذوف",
     "      CHECK (\n        round(net_salary, 2) = round(\n          basic_salary + total_allowances + overtime_pay\n          + bonus_amount - total_deductions, 2)\n      ) NOT VALID;",
     "      CHECK (TRUE) NOT VALID;"),
    ("⑤.3 قيد عدم السالب محذوف",
     "      CHECK (net_salary >= 0) NOT VALID;",
     "      CHECK (TRUE) NOT VALID;"),

    # ⑥ الموظفون
    ("⑥.1 غير النشطين يدخلون الكشف",
     "     WHERE e.tenant_id = v_tenant AND e.is_active",
     "     WHERE e.tenant_id = v_tenant"),
    ("⑥.2 الموظفون بلا ترشيح مستأجر",
     "      FROM public.employees e\n     WHERE e.tenant_id = v_tenant AND e.is_active",
     "      FROM public.employees e\n     WHERE e.is_active"),

    # ⑦ حراسة الحالة — العطل ⑦
    ("⑦.1 التشغيل على فترة معتمَدة مسموح",
     "  IF v_status IN ('approved','paid','cancelled') THEN\n    RAISE EXCEPTION 'الفترة بحالة «%» — لا يمكن إعادة تشغيل الرواتب', v_status;\n  END IF;",
     "  -- (حراسة الحالة محذوفة)"),
    ("⑦.2 الاعتماد بلا حراسة انتقال",
     "  IF v_status <> 'pending_approval' THEN\n    RAISE EXCEPTION 'الفترة بحالة «%» — الاعتماد يتطلّب pending_approval', v_status;\n  END IF;",
     "  -- (حراسة الانتقال محذوفة)"),
    ("⑦.3 اعتماد فترة بلا سجلّات مسموح",
     "  IF v_n = 0 THEN\n    RAISE EXCEPTION 'لا سجلّات رواتب في هذه الفترة — شغّل الرواتب أولاً';\n  END IF;",
     "  -- (فحص السجلّات محذوف)"),
    ("⑦.4 أثر التدقيق محذوف",
     "     SET status = 'approved', approved_by = v_uid,\n         approved_at = NOW(), locked_at = NOW()",
     "     SET status = 'approved'"),
    ("⑦.5 قيد حالة الفترة محذوف",
     "      CHECK (status IN ('draft','pending_approval','approved','paid','cancelled'))\n      NOT VALID;",
     "      CHECK (TRUE) NOT VALID;"),
    ("⑦.6 قيد نطاق التاريخ محذوف",
     "      CHECK (end_date >= start_date) NOT VALID;",
     "      CHECK (TRUE) NOT VALID;"),

    # ⑧ التكرار — العطل ⑧
    ("⑧.1 القيد الفريد محذوف",
     "      ADD CONSTRAINT payroll_records_unique_run\n      UNIQUE (period_id, employee_id);",
     "      ADD CONSTRAINT payroll_records_unique_run\n      UNIQUE (id);"),
    ("⑧.2 ON CONFLICT يتجاهل بدل التحديث",
     "  ON CONFLICT (period_id, employee_id) DO UPDATE",
     "  ON CONFLICT (period_id, employee_id) DO NOTHING; -- "),

    # ⑨ الأعمدة — العطلان ① و⑨
    ("⑨.1 عمود frequency محذوف",
     "  ADD COLUMN IF NOT EXISTS frequency    TEXT NOT NULL DEFAULT 'monthly',",
     ""),
    ("⑨.2 عمود updated_at محذوف (كل UPDATE يفشل)",
     "  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
     ""),
    ("⑨.3 أعمدة التدقيق محذوفة",
     "  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,\n  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,",
     ""),

    # ⑩ الصلاحيات
    ("⑩.1 فحص دور التشغيل محذوف",
     "  IF v_role IS NULL OR v_role NOT IN ('admin','hr','developer','it_admin') THEN\n    RAISE EXCEPTION 'غير مصرَّح بتشغيل الرواتب (الدور: %)', COALESCE(v_role,'—');\n  END IF;",
     "  -- (فحص الدور محذوف)"),
    ("⑩.2 فحص دور الاعتماد محذوف",
     "  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN\n    RAISE EXCEPTION 'غير مصرَّح باعتماد الرواتب (الدور: %)', COALESCE(v_role,'—');\n  END IF;",
     "  -- (فحص الدور محذوف)"),
    ("⑩.3 فحص المستأجر للفترة محذوف",
     "   WHERE p.id = p_period_id AND p.tenant_id = v_tenant;\n\n  IF v_start IS NULL THEN",
     "   WHERE p.id = p_period_id;\n\n  IF v_start IS NULL THEN"),
    ("⑩.4 anon يُمنح EXECUTE على payroll_run",
     "REVOKE ALL ON FUNCTION public.payroll_run(UUID) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.payroll_run(UUID) TO anon;"),
    ("⑩.5 الملخّص يعمل DEFINER (يتجاوز RLS)",
     "  out_overtime   NUMERIC\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER",
     "  out_overtime   NUMERIC\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER"),
    ("⑩.6 search_path غير مثبَّت على payroll_run",
     "  out_net         NUMERIC\n)\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER\nSET search_path = public",
     "  out_net         NUMERIC\n)\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER"),

    # ⑪ الملخّص
    ("⑪.1 الملخّص بلا ترشيح مستأجر",
     "   WHERE r.tenant_id = v_tenant AND r.period_id = p_period_id;\nEND $$;\n\nCOMMENT ON FUNCTION public.payroll_period_summary",
     "   WHERE r.period_id = p_period_id;\nEND $$;\n\nCOMMENT ON FUNCTION public.payroll_period_summary"),
    ("⑪.2 صفّ الأصفار محذوف",
     "    RETURN QUERY SELECT 0, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0, 0::NUMERIC;\n    RETURN;",
     "    RETURN;"),
    ("⑪.3 فهرس سجلّات الرواتب محذوف",
     "CREATE INDEX IF NOT EXISTS idx_payroll_records_tenant_period\n  ON public.payroll_records (tenant_id, period_id);",
     ""),
]


def rebuild_db():
    drop = """
DROP FUNCTION IF EXISTS public.payroll_period_summary(UUID);
DROP FUNCTION IF EXISTS public.payroll_approve(UUID);
DROP FUNCTION IF EXISTS public.payroll_run(UUID);
DROP FUNCTION IF EXISTS public.employee_monthly_salary(UUID,DATE);
ALTER TABLE public.payroll_records
  DROP CONSTRAINT IF EXISTS payroll_records_unique_run,
  DROP CONSTRAINT IF EXISTS payroll_records_net_check,
  DROP CONSTRAINT IF EXISTS payroll_records_net_nonneg,
  DROP CONSTRAINT IF EXISTS payroll_records_days_check;
ALTER TABLE public.payroll_periods
  DROP CONSTRAINT IF EXISTS payroll_periods_status_check,
  DROP CONSTRAINT IF EXISTS payroll_periods_frequency_check,
  DROP CONSTRAINT IF EXISTS payroll_periods_range_check;
ALTER TABLE public.payroll_periods
  DROP COLUMN IF EXISTS frequency,
  DROP COLUMN IF EXISTS payment_date,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS locked_at;
DROP INDEX IF EXISTS public.idx_payroll_records_tenant_period;
DROP INDEX IF EXISTS public.idx_payroll_periods_tenant_status;
DROP INDEX IF EXISTS public.idx_emp_contracts_emp_dates;
DROP INDEX IF EXISTS public.idx_emp_loans_tenant_status;
"""
    p = os.path.join(REPO, '.drop0348.sql')
    with open(p, 'w') as f:
        f.write(drop)
    subprocess.run(['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres',
                    '-X', '-q', '-f', p], capture_output=True, text=True, env=ENV)
    os.remove(p)


def main():
    original = open(MIG, encoding='utf-8').read()
    shutil.copy(MIG, MIG + '.bak')
    results = []

    for name, old, new in INVERSIONS:
        cnt = original.count(old)
        if cnt != 1:
            results.append((name, 'BAD_PATTERN', f'مطابقات={cnt}'))
            print(f'✗✗ [{name}] النمط غير فريد (مطابقات={cnt}) — عكس باطل')
            continue
        mutated = original.replace(old, new, 1)
        assert mutated != original, f'{name}: الاستبدال لم يغيّر شيئاً'
        with open(MIG, 'w', encoding='utf-8') as f:
            f.write(mutated)
        rebuild_db()
        ap = psql(MIG)
        if ap.returncode != 0:
            err = (ap.stderr or '').strip().split('\n')[0][:110]
            results.append((name, 'APPLY_FAIL', err))
            print(f'✅ [{name}] المايجريشن المعكوس لا يُطبَّق: {err}')
        else:
            tr = psql(TEST)
            if tr.returncode != 0:
                err = (tr.stderr or '').strip().split('\n')[0]
                err = re.sub(r'^psql:\S+:\d+: ERROR:\s*', '', err)[:115]
                results.append((name, 'TEST_FAIL', err))
                print(f'✅ [{name}] الاختبار سقط: {err}')
            else:
                results.append((name, 'NOT_COVERED', '—'))
                print(f'❌❌ [{name}] الاختبار مرّ رغم العكس — غير مُغطّى!')

    with open(MIG, 'w', encoding='utf-8') as f:
        f.write(original)
    assert open(MIG, encoding='utf-8').read() == original, 'الاسترجاع فشل!'
    os.remove(MIG + '.bak')
    rebuild_db()
    assert psql(MIG).returncode == 0, 'إعادة التطبيق فشلت'
    ft = psql(TEST)
    assert ft.returncode == 0, f'الاختبار الأصلي سقط: {ft.stderr}'

    covered = sum(1 for _, s, _ in results if s in ('TEST_FAIL', 'APPLY_FAIL'))
    bad = [r for r in results if r[1] in ('NOT_COVERED', 'BAD_PATTERN')]
    print(f'\n════ النتيجة: {covered}/{len(results)} عكساً مُغطّى ════')
    for n, s, e in bad:
        print(f'  ❌ {n} — {s} {e}')
    print('✅ الأصل مُسترجَع والاختبار يمرّ')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
