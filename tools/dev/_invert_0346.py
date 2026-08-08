#!/usr/bin/env python3
"""عكس كل إصلاح في 0346 وإثبات سقوط الاختبار."""
import os, re, shutil, subprocess, sys

REPO = '/home/user/Kyvzon'
MIG = os.path.join(REPO, 'supabase/migrations/0346_hr_daily_attendance_board.sql')
TEST = os.path.join(REPO, 'tools/dev/verify-hr-daily-attendance-0346.sql')
SOCK, PORT, PGR = '/home/user/.pgtest/sock', '5449', '/home/user/.pgtest/root'

ENV = dict(os.environ)
ENV['PATH'] = f'{PGR}/usr/lib/postgresql/17/bin:' + ENV['PATH']
ENV['LD_LIBRARY_PATH'] = f'{PGR}/usr/lib/x86_64-linux-gnu:{PGR}/usr/lib'


def psql(path):
    return subprocess.run(
        ['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-X', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV)


INVERSIONS = [
    # ① العطل الأصلي: الاعتماد على punch_type
    ("①.1 الدخول من punch_type بدل أول بصمة (العطل الأصلي)",
     "min(a.punch_time) AS first_punch,",
     "min(a.punch_time) FILTER (WHERE a.punch_type = 'check_in') AS first_punch,"),
    ("①.2 الخروج من punch_type='check_out' وحده",
     "           CASE\n             WHEN p.explicit_out IS NOT NULL THEN p.explicit_out\n             WHEN p.punch_count > 1          THEN p.last_punch\n             ELSE NULL\n           END AS check_out,",
     "           p.explicit_out AS check_out,"),
    ("①.3 الخروج من آخر بصمة دائماً (يختلق خروجاً من بصمة واحدة)",
     "             WHEN p.punch_count > 1          THEN p.last_punch",
     "             WHEN TRUE                       THEN p.last_punch"),
    ("①.4 تجاهل بصمة الخروج الصريحة",
     "           max(a.punch_time) FILTER (\n             WHERE a.punch_type IN ('out', 'check-out')\n           ) AS explicit_out",
     "           NULL::TIMESTAMPTZ AS explicit_out"),

    # ② التاريخ
    ("②.1 لا ترشيح بالتاريخ (كل البصمات)",
     "     WHERE a.tenant_id = v_tenant\n       AND a.shift_date = v_day\n     GROUP BY a.employee_id",
     "     WHERE a.tenant_id = v_tenant\n     GROUP BY a.employee_id"),
    ("②.2 البصمات بلا ترشيح مستأجر",
     "      FROM public.attendance_logs a\n     WHERE a.tenant_id = v_tenant\n       AND a.shift_date = v_day",
     "      FROM public.attendance_logs a\n     WHERE a.shift_date = v_day"),

    # ③ الاستراحات
    ("③.1 الاستراحات بلا ترشيح يوم",
     "     WHERE b.tenant_id = v_tenant\n       AND b.created_at >= v_day::TIMESTAMPTZ\n       AND b.created_at <  (v_day + 1)::TIMESTAMPTZ",
     "     WHERE b.tenant_id = v_tenant"),
    ("③.2 المدة المصرّح بها بدل الفعلية (15 بدل 20)",
     "             CASE\n               WHEN b.out_time IS NOT NULL AND b.return_time IS NOT NULL\n                 THEN GREATEST(\n                        round(EXTRACT(EPOCH FROM (b.return_time - b.out_time)) / 60)::INTEGER,\n                        0)\n               ELSE b.duration_minutes\n             END",
     "             b.duration_minutes"),
    ("③.3 on_break يتجاهل return_time",
     "           bool_or(b.status = 'active' AND b.return_time IS NULL) AS on_break,",
     "           bool_or(b.status = 'active') AS on_break,"),
    ("③.4 الوجهة تُعرض للاستراحات المنتهية أيضاً",
     "           (array_agg(b.destination ORDER BY b.created_at DESC)\n              FILTER (WHERE b.status = 'active' AND b.return_time IS NULL)\n           )[1] AS destination",
     "           (array_agg(b.destination ORDER BY b.created_at DESC))[1] AS destination"),
    ("③.5 الاستراحات بلا ترشيح مستأجر",
     "      FROM public.employee_breaks b\n     WHERE b.tenant_id = v_tenant",
     "      FROM public.employee_breaks b\n     WHERE TRUE"),

    # ④ الموظفون
    ("④.1 غير النشطين يظهرون (العطل ①: e.status غير موجود)",
     "       AND e.is_active\n       AND (p_department_id IS NULL",
     "       AND (p_department_id IS NULL"),
    ("④.2 الموظفون بلا ترشيح مستأجر",
     "     WHERE e.tenant_id = v_tenant\n       -- ★ is_active لا status — العمود الأخير غير موجود (درس 0345)",
     "     WHERE TRUE\n       -- ★ is_active لا status — العمود الأخير غير موجود (درس 0345)"),
    ("④.3 ترشيح القسم معطّل",
     "       AND (p_department_id IS NULL OR e.department_id = p_department_id)",
     "       AND TRUE"),
    ("④.4 البحث معطّل",
     "       AND (v_q IS NULL\n            OR e.full_name_ar  ILIKE '%' || v_q || '%'",
     "       AND (TRUE\n            OR e.full_name_ar  ILIKE '%' || v_q || '%'"),
    ("④.5 البحث في full_name_ar وحده (العمود فارغ للجميع)",
     "            OR e.first_name    ILIKE '%' || v_q || '%'\n            OR e.last_name     ILIKE '%' || v_q || '%'\n            OR pr.full_name    ILIKE '%' || v_q || '%'\n            OR e.employee_code ILIKE '%' || v_q || '%')",
     "            OR e.employee_code ILIKE '%' || v_q || '%')"),

    # ⑤ الاسم — العطل ⑥
    ("⑤.1 الاسم من full_name_ar وحده (العطل ⑥ الأصلي)",
     "           COALESCE(\n             NULLIF(btrim(e.full_name_ar), ''),\n             NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.first_name), ''),\n                                         NULLIF(btrim(e.last_name), ''))), ''),\n             NULLIF(btrim(pr.full_name), ''),\n             'بدون اسم'\n           )::TEXT AS full_name,",
     "           COALESCE(NULLIF(btrim(e.full_name_ar), ''), 'بدون اسم')::TEXT AS full_name,"),
    ("⑤.2 الأولوية مقلوبة (first+last يسبق full_name_ar)",
     "             NULLIF(btrim(e.full_name_ar), ''),\n             NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.first_name), ''),\n                                         NULLIF(btrim(e.last_name), ''))), ''),",
     "             NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.first_name), ''),\n                                         NULLIF(btrim(e.last_name), ''))), ''),\n             NULLIF(btrim(e.full_name_ar), ''),"),

    # ⑥ الحالة
    ("⑥.1 «في استراحة» لا تُميَّز",
     "             WHEN b.on_break                THEN 'في استراحة'\n",
     ""),
    ("⑥.2 «منصرف» تسبق «في استراحة»",
     "             WHEN b.on_break                THEN 'في استراحة'\n             WHEN b.check_out IS NOT NULL   THEN 'منصرف'",
     "             WHEN b.check_out IS NOT NULL   THEN 'منصرف'\n             WHEN b.on_break                THEN 'في استراحة'"),
    ("⑥.3 من بلا بصمة يُعدّ مداوماً",
     "             WHEN b.first_punch IS NULL     THEN 'غائب'",
     "             WHEN FALSE                     THEN 'غائب'"),

    # ⑦ دقائق العمل
    ("⑦.1 لا تُخصم الاستراحات",
     "               )) / 60)::INTEGER - b.break_minutes,",
     "               )) / 60)::INTEGER - 0,"),
    ("⑦.2 يوم ماضٍ بلا انصراف يُحتسب حتى الآن",
     "                   CASE WHEN v_day = current_date THEN now() ELSE b.first_punch END",
     "                   now()"),
    ("⑦.3 السالب لا يُقصّ إلى صفر",
     "             ELSE GREATEST(\n               round(EXTRACT(EPOCH FROM (",
     "             ELSE (\n               round(EXTRACT(EPOCH FROM ("),

    # ⑧ الترتيب والحدّ
    ("⑧.1 الغائبون لا يُؤخَّرون",
     "   ORDER BY (s.first_punch IS NULL), s.first_punch, s.full_name",
     "   ORDER BY s.full_name"),
    ("⑧.2 ترشيح الحالة معطّل",
     "   WHERE p_status IS NULL OR s.status_label = p_status",
     "   WHERE TRUE"),
    ("⑧.3 الحدّ بلا قصّ",
     "  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);",
     "  v_lim    INTEGER := p_limit;"),
    ("⑧.4 البحث بمسافات لا يُعامَل كلا بحث",
     "  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');",
     "  v_q      TEXT := p_search;"),

    # ⑨ الملخّص
    ("⑨.1 «حاضر» يُقصي من في استراحة",
     "         count(*) FILTER (WHERE out_status IN ('مداوم','في استراحة','منصرف'))::INTEGER,",
     "         count(*) FILTER (WHERE out_status IN ('مداوم','منصرف'))::INTEGER,"),
    ("⑨.2 المتوسط على الجميع لا الحاضرين",
     "           round(avg(out_worked_minutes) FILTER (WHERE out_status <> 'غائب'))::INTEGER,",
     "           round(avg(out_worked_minutes))::INTEGER,"),
    ("⑨.3 الملخّص لا يمرّر مُرشِّح القسم",
     "      p_date, p_department_id, NULL, NULL, 1000",
     "      p_date, NULL, NULL, NULL, 1000"),
    ("⑨.4 الملخّص لا يمرّر التاريخ",
     "    SELECT * FROM public.hr_daily_attendance(\n      p_date, p_department_id, NULL, NULL, 1000\n    )",
     "    SELECT * FROM public.hr_daily_attendance(\n      NULL, p_department_id, NULL, NULL, 1000\n    )"),
    ("⑨.5 صفّ الأصفار محذوف (NaN في الواجهة)",
     "    RETURN QUERY SELECT 0,0,0,0,0,0, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;\n    RETURN;",
     "    RETURN;"),
    ("⑨.6 المتوسط يعود NULL لا صفر",
     "         COALESCE(\n           round(avg(out_worked_minutes) FILTER (WHERE out_status <> 'غائب'))::INTEGER,\n           0),",
     "         round(avg(out_worked_minutes) FILTER (WHERE out_status <> 'غائب'))::INTEGER,"),

    # ⑩ الأمان
    ("⑩.1 hr_daily_attendance تعمل DEFINER",
     "  out_status         TEXT\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER",
     "  out_status         TEXT\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER"),
    ("⑩.2 anon يُمنح EXECUTE",
     "REVOKE ALL ON FUNCTION public.hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.hr_daily_attendance(DATE,UUID,TEXT,TEXT,INTEGER) TO anon;"),
    ("⑩.3 search_path غير مثبَّت على الملخّص",
     "  out_last_out    TIMESTAMPTZ\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER\nSET search_path = public",
     "  out_last_out    TIMESTAMPTZ\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER"),
    ("⑩.4 فهرس البصمات محذوف",
     "CREATE INDEX IF NOT EXISTS idx_att_logs_tenant_shift_date\n  ON public.attendance_logs (tenant_id, shift_date, employee_id);",
     ""),
]


def rebuild_db():
    drop = """
DROP FUNCTION IF EXISTS public.hr_daily_attendance_summary(DATE, UUID);
DROP FUNCTION IF EXISTS public.hr_daily_attendance(DATE, UUID, TEXT, TEXT, INTEGER);
DROP INDEX IF EXISTS public.idx_att_logs_tenant_shift_date;
DROP INDEX IF EXISTS public.idx_emp_breaks_tenant_created;
DROP INDEX IF EXISTS public.idx_emp_breaks_employee;
"""
    p = os.path.join(REPO, '.drop0346.sql')
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
