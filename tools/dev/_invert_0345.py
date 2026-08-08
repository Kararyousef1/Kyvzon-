#!/usr/bin/env python3
"""عكس كل إصلاح في 0345 وإثبات سقوط الاختبار.

★ كل استبدال يُتحقَّق بـassert على فرادة النمط: نمطٌ غير فريد أو مفقود
  يعني «عكساً وهمياً» يمرّ لأن شيئاً لم يتغيّر.
"""
import os, re, shutil, subprocess, sys

REPO = '/home/user/Kyvzon'
MIG = os.path.join(REPO, 'supabase/migrations/0345_hr_dashboard_summary.sql')
TEST = os.path.join(REPO, 'tools/dev/verify-hr-dashboard-0345.sql')
SOCK = '/home/user/.pgtest/sock'
PORT = '5447'
PGR = '/home/user/.pgtest/root'

ENV = dict(os.environ)
ENV['PATH'] = f'{PGR}/usr/lib/postgresql/17/bin:' + ENV['PATH']
ENV['LD_LIBRARY_PATH'] = f'{PGR}/usr/lib/x86_64-linux-gnu:{PGR}/usr/lib'


def psql(path):
    return subprocess.run(
        ['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-X', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV)


INVERSIONS = [
    # ① العطل الأصلي: status بدل is_active
    ("①.1 active يرشّح status (العمود غير الموجود)",
     "(SELECT count(*) FILTER (WHERE is_active)::INTEGER FROM emp),",
     "(SELECT count(*)::INTEGER FROM emp),"),
    ("①.2 active = total (إهمال الترشيح)",
     "    -- ★★★ is_active لا status (العطل ①)\n    (SELECT count(*) FILTER (WHERE is_active)::INTEGER FROM emp),",
     "    -- ★★★ is_active لا status (العطل ①)\n    (SELECT count(*) FILTER (WHERE NOT is_active)::INTEGER FROM emp),"),

    # ② العافية
    ("②.1 العافية بلا نافذة زمنية (تبتلع القديم)",
     "     WHERE e.tenant_id = v_tenant\n       AND w.date >= current_date - INTERVAL '30 days'\n  ),\n  inc AS (",
     "     WHERE e.tenant_id = v_tenant\n  ),\n  inc AS ("),
    ("②.2 العافية بلا ترشيح مستأجر",
     "      JOIN public.employees e ON e.id = w.employee_id\n     WHERE e.tenant_id = v_tenant\n       AND w.date >= current_date - INTERVAL '30 days'\n  ),\n  inc AS (",
     "      JOIN public.employees e ON e.id = w.employee_id\n     WHERE w.date >= current_date - INTERVAL '30 days'\n  ),\n  inc AS ("),
    ("②.3 عدد العيّنات يعود صفراً (إخفاء السياق)",
     "    (SELECT count(*)::INTEGER FROM well),",
     "    0::INTEGER,"),

    # ③ البلاغات
    ("③.1 البلاغ المؤرشَف يُحتسب (summary)",
     "     WHERE i.tenant_id = v_tenant\n       AND i.archived_at IS NULL\n  )\n  SELECT",
     "     WHERE i.tenant_id = v_tenant\n  )\n  SELECT"),
    ("③.2 critical يشمل المُغلقة",
     "       WHERE severity = 'critical' AND status IN ('pending','in_progress')",
     "       WHERE severity = 'critical'"),
    ("③.3 unassigned يشمل المُغلقة (العطل ④ مقلوباً)",
     "       WHERE assigned_to IS NULL AND status IN ('pending','in_progress')",
     "       WHERE assigned_to IS NULL"),
    ("③.4 resolved_month بلا حدّ زمني",
     "         AND updated_at >= date_trunc('month', current_date)",
     ""),
    ("③.5 summary بلا ترشيح مستأجر للبلاغات",
     "    SELECT i.status, i.severity, i.assigned_to, i.updated_at\n      FROM public.incidents i\n     WHERE i.tenant_id = v_tenant",
     "    SELECT i.status, i.severity, i.assigned_to, i.updated_at\n      FROM public.incidents i\n     WHERE TRUE"),
    ("③.6 summary بلا ترشيح مستأجر للموظفين",
     "    SELECT e.is_active\n      FROM public.employees e\n     WHERE e.tenant_id = v_tenant",
     "    SELECT e.is_active\n      FROM public.employees e\n     WHERE TRUE"),
    ("③.7 صفّ الأصفار محذوف (NaN في الواجهة)",
     "    RETURN QUERY SELECT 0,0,0,0,0,0,0,0,0,0,0,0,0;\n    RETURN;",
     "    RETURN;"),

    # ④ الأقسام — العطل ③ الأصلي
    ("④.1 reported_by يُربط بـemployees.id (العطل الأصلي)",
     "             (SELECT e3.department_id FROM public.employees e3\n               WHERE e3.user_id = i.reported_by AND e3.tenant_id = v_tenant)",
     "             (SELECT e3.department_id FROM public.employees e3\n               WHERE e3.id = i.reported_by AND e3.tenant_id = v_tenant)"),
    ("④.2 مسار reported_by محذوف كلياً",
     "             (SELECT e2.department_id FROM public.employees e2\n               WHERE e2.id = i.employee_id),\n             (SELECT e3.department_id FROM public.employees e3\n               WHERE e3.user_id = i.reported_by AND e3.tenant_id = v_tenant)\n           ) AS dept_id",
     "             (SELECT e2.department_id FROM public.employees e2\n               WHERE e2.id = i.employee_id)\n           ) AS dept_id"),
    ("④.3 مسار employee_id محذوف",
     "             i.department_id,\n             (SELECT e2.department_id FROM public.employees e2\n               WHERE e2.id = i.employee_id),",
     "             i.department_id,"),
    ("④.4 العافية على الإدخالات لا الموظفين (80 ⇒ 77)",
     "     GROUP BY e.department_id, e.id\n  )",
     "     GROUP BY e.department_id, e.id, w.id\n  )"),
    ("④.5 القسم الفارغ يعود 75 مُختلَقة",
     "         (SELECT COALESCE(round(avg(emp_avg))::INTEGER, 0) FROM emp_well ew\n           WHERE ew.department_id = d.id),",
     "         (SELECT COALESCE(round(avg(emp_avg))::INTEGER, 75) FROM emp_well ew\n           WHERE ew.department_id = d.id),"),
    ("④.6 المؤرشَف يُحتسب في الأقسام",
     "     WHERE i.tenant_id = v_tenant\n       AND i.archived_at IS NULL\n  ),\n  emp_well AS (",
     "     WHERE i.tenant_id = v_tenant\n  ),\n  emp_well AS ("),
    ("④.7 الأقسام بلا ترشيح مستأجر",
     "    FROM public.departments d\n   WHERE d.tenant_id = v_tenant\n   ORDER BY d.name_ar",
     "    FROM public.departments d\n   ORDER BY d.name_ar"),
    ("④.8 active_count يهمل is_active",
     "         (SELECT count(*)::INTEGER FROM public.employees e\n           WHERE e.tenant_id = v_tenant AND e.department_id = d.id\n             AND e.is_active),",
     "         (SELECT count(*)::INTEGER FROM public.employees e\n           WHERE e.tenant_id = v_tenant AND e.department_id = d.id),"),
    ("④.9 open_problems يشمل المُغلقة",
     "           WHERE x.dept_id = d.id AND x.status IN ('pending','in_progress')),",
     "           WHERE x.dept_id = d.id),"),
    ("④.10 الحدّ بلا قصّ",
     "  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);",
     "  v_lim    INTEGER := p_limit;"),

    # ⑤ الاتجاه الشهري
    ("⑤.1 الترشيح بالشهر وحده (عطل getMonth بلا سنة)",
     "             AND i.created_at >= m.m_start\n             AND i.created_at <  (m.m_start + INTERVAL '1 month')),\n         (SELECT count(*)::INTEGER FROM public.incidents i\n           WHERE i.tenant_id = v_tenant\n             AND i.archived_at IS NULL\n             AND i.created_at >= m.m_start\n             AND i.created_at <  (m.m_start + INTERVAL '1 month')\n             AND i.status IN ('resolved','closed')),",
     "             AND EXTRACT(MONTH FROM i.created_at) = EXTRACT(MONTH FROM m.m_start)),\n         (SELECT count(*)::INTEGER FROM public.incidents i\n           WHERE i.tenant_id = v_tenant\n             AND i.archived_at IS NULL\n             AND i.created_at >= m.m_start\n             AND i.created_at <  (m.m_start + INTERVAL '1 month')\n             AND i.status IN ('resolved','closed')),"),
    ("⑤.2 الترتيب تنازلي (الرسم مقلوب)",
     "    FROM months m\n   ORDER BY m.m_start;",
     "    FROM months m\n   ORDER BY m.m_start DESC;"),
    ("⑤.3 الأشهر الفارغة تختفي",
     "  WITH months AS (\n    SELECT generate_series(",
     "  WITH months AS (\n    SELECT DISTINCT date_trunc('month', i2.created_at)::DATE AS m_start\n      FROM public.incidents i2 WHERE i2.tenant_id = v_tenant\n    ), months_unused AS (\n    SELECT generate_series("),
    ("⑤.4 المؤرشَف يُحتسب في الاتجاه",
     "         (SELECT count(*)::INTEGER FROM public.incidents i\n           WHERE i.tenant_id = v_tenant\n             AND i.archived_at IS NULL\n             AND i.created_at >= m.m_start\n             AND i.created_at <  (m.m_start + INTERVAL '1 month')),",
     "         (SELECT count(*)::INTEGER FROM public.incidents i\n           WHERE i.tenant_id = v_tenant\n             AND i.created_at >= m.m_start\n             AND i.created_at <  (m.m_start + INTERVAL '1 month')),"),
    ("⑤.5 حدّ الأشهر بلا قصّ",
     "  v_n      INTEGER := LEAST(GREATEST(COALESCE(p_months, 6), 1), 36);",
     "  v_n      INTEGER := COALESCE(p_months, 6);"),

    # ⑥ اتجاه العافية
    ("⑥.1 اليوم الفارغ يعود صفراً لا NULL",
     "         (SELECT round(avg(w.score))::INTEGER\n            FROM public.wellness_entries w\n            JOIN public.employees e ON e.id = w.employee_id\n           WHERE e.tenant_id = v_tenant AND w.date = dd.d),",
     "         (SELECT COALESCE(round(avg(w.score))::INTEGER, 0)\n            FROM public.wellness_entries w\n            JOIN public.employees e ON e.id = w.employee_id\n           WHERE e.tenant_id = v_tenant AND w.date = dd.d),"),
    ("⑥.2 اتجاه العافية بلا ترشيح مستأجر",
     "           WHERE e.tenant_id = v_tenant AND w.date = dd.d),\n         (SELECT count(*)::INTEGER",
     "           WHERE w.date = dd.d),\n         (SELECT count(*)::INTEGER"),
    ("⑥.3 حدّ الأيام بلا قصّ",
     "  v_n      INTEGER := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);",
     "  v_n      INTEGER := COALESCE(p_days, 7);"),
    ("⑥.4 نافذة الأيام تبدأ من اليوم (يوم واحد دائماً)",
     "             current_date - (v_n - 1),\n             current_date,",
     "             current_date,\n             current_date,"),

    # ⑦ الأمان
    ("⑦.1 summary تعمل DEFINER (تتجاوز RLS)",
     "  out_incidents_total   INTEGER\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER",
     "  out_incidents_total   INTEGER\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER"),
    ("⑦.2 anon يُمنح EXECUTE على summary",
     "REVOKE ALL ON FUNCTION public.hr_dashboard_summary() FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.hr_dashboard_summary() TO anon;"),
    ("⑦.3 anon يُمنح EXECUTE على departments",
     "REVOKE ALL ON FUNCTION public.hr_dashboard_departments(INTEGER) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.hr_dashboard_departments(INTEGER) TO anon;"),
    ("⑦.4 search_path غير مثبَّت على departments",
     "  out_wellness_count  INTEGER\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER\nSET search_path = public",
     "  out_wellness_count  INTEGER\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER"),

    # ⑧ الفهارس
    ("⑧.1 فهرس البلاغات محذوف",
     "CREATE INDEX IF NOT EXISTS idx_incidents_tenant_created\n  ON public.incidents (tenant_id, created_at DESC);",
     ""),
    ("⑧.2 فهرس العافية محذوف",
     "CREATE INDEX IF NOT EXISTS idx_wellness_emp_date\n  ON public.wellness_entries (employee_id, date DESC);",
     ""),
]


def rebuild_db():
    drop = """
DROP FUNCTION IF EXISTS public.hr_dashboard_summary();
DROP FUNCTION IF EXISTS public.hr_dashboard_departments(INTEGER);
DROP FUNCTION IF EXISTS public.hr_dashboard_monthly_trend(INTEGER);
DROP FUNCTION IF EXISTS public.hr_dashboard_wellness_trend(INTEGER);
DROP INDEX IF EXISTS public.idx_incidents_tenant_created;
DROP INDEX IF EXISTS public.idx_incidents_tenant_status_sev;
DROP INDEX IF EXISTS public.idx_wellness_emp_date;
DROP INDEX IF EXISTS public.idx_employees_tenant_dept;
"""
    p = os.path.join(REPO, '.drop0345.sql')
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
        apply_r = psql(MIG)
        if apply_r.returncode != 0:
            err = (apply_r.stderr or '').strip().split('\n')[0][:110]
            results.append((name, 'APPLY_FAIL', err))
            print(f'✅ [{name}] المايجريشن المعكوس لا يُطبَّق: {err}')
        else:
            test_r = psql(TEST)
            if test_r.returncode != 0:
                err = (test_r.stderr or '').strip().split('\n')[0]
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
    final = psql(MIG)
    assert final.returncode == 0, f'إعادة التطبيق فشلت: {final.stderr}'
    final_test = psql(TEST)
    assert final_test.returncode == 0, f'الاختبار الأصلي سقط: {final_test.stderr}'

    covered = sum(1 for _, s, _ in results if s in ('TEST_FAIL', 'APPLY_FAIL'))
    bad = [r for r in results if r[1] in ('NOT_COVERED', 'BAD_PATTERN')]
    print(f'\n════ النتيجة: {covered}/{len(results)} عكساً مُغطّى ════')
    for n, s, e in bad:
        print(f'  ❌ {n} — {s} {e}')
    print('✅ الأصل مُسترجَع والاختبار يمرّ')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
