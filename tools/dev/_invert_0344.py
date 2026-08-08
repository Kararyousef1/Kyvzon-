#!/usr/bin/env python3
"""عكس كل إصلاح في 0344 وإثبات سقوط الاختبار — واحداً واحداً.

القاعدة: كل عكس يجب أن **يسقط** الاختبار. عكس لا يُسقطه يعني أن
الإصلاح غير مُغطّى — وهذا بالضبط ما حدث مع 0337.

★ كل استبدال يُتحقَّق منه بـassert: لو لم يطابق النصّ لظننّا العكس
  ناجحاً بينما لم يتغيّر شيء (فيمرّ الاختبار لسبب خاطئ).
"""
import os, re, shutil, subprocess, sys

REPO = '/home/user/Kyvzon'
MIG = os.path.join(REPO, 'supabase/migrations/0344_attendance_status_vocabulary.sql')
TEST = os.path.join(REPO, 'tools/dev/verify-attendance-vocabulary-0344.sql')
SOCK = '/home/user/.pgtest/sock'
PORT = '5444'
PGR = '/home/user/.pgtest/root'

ENV = dict(os.environ)
ENV['PATH'] = f'{PGR}/usr/lib/postgresql/17/bin:' + ENV['PATH']
ENV['LD_LIBRARY_PATH'] = f'{PGR}/usr/lib/x86_64-linux-gnu:{PGR}/usr/lib'


def psql(path):
    return subprocess.run(
        ['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-X', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV)


# ── عكوس: (اسم, نصّ أصلي, نصّ بديل) ──────────────────────────────────
INVERSIONS = [
    # ① التصنيف المركزي
    ("①.1 حضور_بوقت ⇒ unknown",
     "WHEN 'حضور_بوقت'     THEN 'present'",
     "WHEN 'حضور_بوقت'     THEN 'unknown'"),
    ("①.2 زمنية_معتمدة ⇒ leave (كما لو كانت إجازة)",
     "WHEN 'زمنية_معتمدة'  THEN 'present'",
     "WHEN 'زمنية_معتمدة'  THEN 'leave'"),
    ("①.3 زمنية_انتظار ⇒ leave (بصم لكن نعدّها إجازة)",
     "WHEN 'زمنية_انتظار'  THEN 'present'",
     "WHEN 'زمنية_انتظار'  THEN 'leave'"),
    ("①.4 مجاز ⇒ present (الإجازة حضور)",
     "WHEN 'مجاز'           THEN 'leave'",
     "WHEN 'مجاز'           THEN 'present'"),
    ("①.5 إجازة_انتظار ⇒ present",
     "WHEN 'إجازة_انتظار'  THEN 'leave'",
     "WHEN 'إجازة_انتظار'  THEN 'present'"),
    ("①.6 عطلة ⇒ absent",
     "WHEN 'عطلة'           THEN 'leave'",
     "WHEN 'عطلة'           THEN 'absent'"),
    ("①.7 غائب ⇒ present",
     "WHEN 'غائب'           THEN 'absent'",
     "WHEN 'غائب'           THEN 'present'"),
    ("①.8 المجهول ⇒ present (ابتلاع صامت — سلوك 0337)",
     "    ELSE 'unknown'\n  END;",
     "    ELSE 'present'\n  END;"),
    ("①.9 عودة مفردات 0337 المختلقة إلى present",
     "  SELECT CASE p_status\n    WHEN 'حضور_بوقت'     THEN 'present'",
     "  SELECT CASE p_status\n    WHEN 'في الوقت'      THEN 'present'\n"
     "    WHEN 'حاضر'          THEN 'present'\n"
     "    WHEN 'حضور_بوقت'     THEN 'present'"),
    ("①.10 الدالة VOLATILE بدل IMMUTABLE",
     "RETURNS TEXT\nLANGUAGE sql\nIMMUTABLE\nPARALLEL SAFE",
     "RETURNS TEXT\nLANGUAGE sql\nVOLATILE\nPARALLEL SAFE"),

    # ② الإحصاءات
    ("②.1 present يعدّ الكلّ",
     "count(*) FILTER (WHERE bucket = 'present')::INTEGER,\n         -- ★ 'متأخر' وحدها",
     "count(*)::INTEGER,\n         -- ★ 'متأخر' وحدها"),
    ("②.2 late يشمل زمنية_معتمدة",
     "count(*) FILTER (WHERE status = 'متأخر')::INTEGER,",
     "count(*) FILTER (WHERE status IN ('متأخر','زمنية_معتمدة'))::INTEGER,"),
    ("②.3 leave يعود صفراً دائماً (سلوك 0337)",
     "count(*) FILTER (WHERE bucket = 'leave')::INTEGER,",
     "0::INTEGER,"),
    ("②.4 المتوسط على كل الأيام لا أيام الحضور",
     "sum(total_hours) FILTER (WHERE bucket = 'present')\n             / NULLIF(count(*) FILTER (WHERE bucket = 'present'), 0),",
     "sum(total_hours)\n             / NULLIF(count(*), 0),"),
    ("②.5 المتوسط يشمل ساعات المجهول",
     "sum(total_hours) FILTER (WHERE bucket = 'present')\n             / NULLIF(count(*) FILTER (WHERE bucket = 'present'), 0),",
     "sum(total_hours) FILTER (WHERE bucket <> 'absent')\n             / NULLIF(count(*) FILTER (WHERE bucket = 'present'), 0),"),
    ("②.6 unknown يعود صفراً دائماً (إخفاء)",
     "count(*) FILTER (WHERE bucket = 'unknown')::INTEGER\n    FROM m;",
     "0::INTEGER\n    FROM m;"),
    ("②.7 إسقاط ترشيح المستأجر",
     "      FROM public.attendance_summary a\n     WHERE a.tenant_id = v_tenant\n       AND a.employee_id = v_emp\n       AND a.shift_date >= v_from\n       AND a.shift_date <  v_to\n  )\n  SELECT count(*)::INTEGER,",
     "      FROM public.attendance_summary a\n     WHERE a.employee_id = v_emp\n       AND a.shift_date >= v_from\n       AND a.shift_date <  v_to\n  )\n  SELECT count(*)::INTEGER,"),
    ("②.8 إسقاط الحدّ الأعلى للشهر (يبتلع الشهر التالي)",
     "  v_to   := (v_from + INTERVAL '1 month')::DATE;\n\n  RETURN QUERY\n  WITH m AS (",
     "  v_to   := (v_from + INTERVAL '2 month')::DATE;\n\n  RETURN QUERY\n  WITH m AS ("),
    ("②.9 الشهر الفارغ يعود بلا صفّ (NaN في الواجهة)",
     "    RETURN QUERY SELECT 0,0,0,0,0, 0::NUMERIC, 0::NUMERIC, 0, 0, 0;\n    RETURN;",
     "    RETURN;"),

    # ③ التتابع
    ("③.1 الإجازة تُحتسب حضوراً في التتابع",
     "AND public.attendance_status_bucket(a.status) IN ('present','absent')",
     "AND public.attendance_status_bucket(a.status) IN ('present','absent','leave')"),
    # ★★★ ③.2 مُصنَّف EQUIVALENT لا NOT_COVERED — مُثبَت تشغيلياً:
    #   الحلقة لا ترى 'leave' أبداً لأن WHERE يُقصيه قبلها
    #   (AND ...bucket IN ('present','absent')). فتغيير شرط الحلقة
    #   وحده **لا أثر له سلوكياً** — حراسة مزدوجة لا ثغرة تغطية.
    #   الإثبات: ③.1+③.2 معاً ⇒ سقط عند «3.3 lastAbsence»
    #            ③.2 وحده      ⇒ مرّ (بلا أثر)
    #   وهذا الشرط مُغطّى فعلاً عبر ③.1 و③.3 و3.5c.
    ("③.2 الإجازة تكسر السلسلة [EQUIVALENT — مع ③.1]",
     "AND public.attendance_status_bucket(a.status) IN ('present','absent')\n     ORDER BY a.shift_date DESC\n     LIMIT 400\n  LOOP\n    IF r.bucket = 'absent' THEN",
     "AND public.attendance_status_bucket(a.status) IN ('present','absent','leave')\n     ORDER BY a.shift_date DESC\n     LIMIT 400\n  LOOP\n    IF r.bucket IN ('absent','leave') THEN"),
    ("③.3 الغياب لا يكسر (عدٌّ لا تتابع — عطل 0337 الأصلي)",
     "      IF v_running > v_best THEN v_best := v_running; END IF;\n      v_running := 0;\n    ELSE",
     "      IF v_running > v_best THEN v_best := v_running; END IF;\n    ELSE"),
    ("③.4 الترتيب تصاعدي (التتابع الحالي يصير الأقدم)",
     "     ORDER BY a.shift_date DESC\n     LIMIT 400",
     "     ORDER BY a.shift_date ASC\n     LIMIT 400"),
    ("③.5 التتابع لا يُقيَّد بالموظف",
     "      FROM public.attendance_summary a\n     WHERE a.tenant_id = v_tenant\n       AND a.employee_id = v_emp\n       -- ★ الإجازة والعطلة تُتخطّى",
     "      FROM public.attendance_summary a\n     WHERE a.tenant_id = v_tenant\n       -- ★ الإجازة والعطلة تُتخطّى"),
    ("③.6 آخر غياب لا يُسجَّل",
     "      IF v_last IS NULL THEN v_last := r.shift_date; END IF;",
     "      NULL;"),

    # ④ تطبيق الإجازة
    ("④.1 حذف فحص الدور (الموظف يطبّق إجازته)",
     "  IF v_role IS NULL OR v_role NOT IN\n     ('admin','hr','developer','it_admin','manager','supervisor','direct_manager') THEN\n    RAISE EXCEPTION 'غير مصرَّح بتطبيق الإجازة على الحضور (الدور: %)', COALESCE(v_role,'—');\n  END IF;",
     "  -- (فحص الدور محذوف)"),
    ("④.2 حذف فحص المستأجر (عبور المستأجرات)",
     "  IF NOT EXISTS (\n    SELECT 1 FROM public.employees e\n     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant\n  ) THEN\n    RAISE EXCEPTION 'الموظف ليس ضمن هذا المستأجر';\n  END IF;\n\n  IF p_date_to < p_date_from THEN",
     "  IF p_date_to < p_date_from THEN"),
    ("④.3 القيد الثنائي (عطل leaveAttendanceLink الأصلي)",
     "ON CONFLICT (tenant_id, employee_id, shift_date) DO UPDATE",
     "ON CONFLICT (employee_id, shift_date) DO UPDATE"),
    ("④.4 إسقاط tenant_id من الإدراج (العطل الأصلي)",
     "      VALUES (v_tenant, p_employee_id, d, 'مجاز', 0, 0, 0, 0)",
     "      VALUES (NULL, p_employee_id, d, 'مجاز', 0, 0, 0, 0)"),
    ("④.5 الجمعة لا تُتخطّى",
     "    IF EXTRACT(DOW FROM d) <> 5",
     "    IF TRUE"),
    ("④.6 العطلة الرسمية لا تُتخطّى",
     "       AND NOT EXISTS (\n         SELECT 1 FROM public.holidays h\n          WHERE h.tenant_id = v_tenant AND h.date = d\n       )\n    THEN",
     "    THEN"),
    ("④.7 النطاق المعكوس يُقبل",
     "  IF p_date_to < p_date_from THEN\n    RAISE EXCEPTION 'نطاق التاريخ معكوس';\n  END IF;",
     "  -- (فحص النطاق محذوف)"),
    ("④.8 الحدّ الأعلى للنطاق محذوف",
     "  IF p_date_to - p_date_from > 400 THEN\n    RAISE EXCEPTION 'نطاق الإجازة يتجاوز 400 يوم';\n  END IF;",
     "  -- (الحدّ محذوف)"),
    ("④.9 التطبيق يطمس البصمة والساعات",
     "        SET status = 'مجاز', updated_at = NOW()\n        -- ★ لا نطمس يوماً حضره الموظف فعلاً بلا داعٍ\n        WHERE public.attendance_summary.status <> 'مجاز';",
     "        SET status = 'مجاز', check_in = NULL, total_hours = 0, updated_at = NOW();"),
    ("④.10 الدالة INVOKER (سياسة staff تصدّ المدير)",
     "  p_date_to     DATE\n) RETURNS INTEGER\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_tenant UUID := public.current_user_tenant_id();\n  v_role   TEXT := public.current_user_role();\n  v_days   INTEGER := 0;\n  d        DATE;",
     "  p_date_to     DATE\n) RETURNS INTEGER\nLANGUAGE plpgsql\nVOLATILE\nSECURITY INVOKER\nSET search_path = public\nAS $$\nDECLARE\n  v_tenant UUID := public.current_user_tenant_id();\n  v_role   TEXT := public.current_user_role();\n  v_days   INTEGER := 0;\n  d        DATE;"),

    # ⑤ التراجع
    ("⑤.1 التراجع يحذف نهائياً (العطل الأصلي)",
     "  UPDATE public.attendance_summary a\n     SET status = 'غائب', updated_at = NOW()\n   WHERE a.tenant_id = v_tenant",
     "  DELETE FROM public.attendance_summary a\n   WHERE a.tenant_id = v_tenant"),
    ("⑤.2 التراجع يطال يوم البصمة",
     "     AND a.status = 'مجاز'\n     -- ★ يومٌ فيه بصمة يعني حضوراً فعلياً — لا نُعلنه غياباً\n     AND a.check_in IS NULL;",
     "     AND a.status = 'مجاز';"),
    ("⑤.3 التراجع بلا فحص مستأجر",
     "  IF NOT EXISTS (\n    SELECT 1 FROM public.employees e\n     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant\n  ) THEN\n    RAISE EXCEPTION 'الموظف ليس ضمن هذا المستأجر';\n  END IF;\n\n  -- ★★★ لا DELETE.",
     "  -- ★★★ لا DELETE."),

    # ⑥ طلبات التصحيح
    ("⑥.1 لا ترشيح بنوع القضية",
     "     AND c.case_type = 'attendance_correction'",
     "     AND TRUE"),
    ("⑥.2 لا ترشيح بالموظف (يرى طلبات الزملاء)",
     "     AND (c.employee_id = v_emp OR c.employee_id = v_uid)",
     "     AND TRUE"),
    ("⑥.3 لا ترشيح بالمستأجر",
     "   WHERE c.tenant_id = v_tenant\n     AND c.case_type = 'attendance_correction'",
     "   WHERE TRUE\n     AND c.case_type = 'attendance_correction'"),
    ("⑥.4 الحدّ بلا قصّ (limit سالب يُسقط الاستعلام)",
     "  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);",
     "  v_lim    INTEGER := p_limit;"),
    ("⑥.5 الحالة لا تُعاد (الموظف لا يعرف المصير)",
     "         c.status::TEXT,",
     "         'open'::TEXT,"),

    # ⑦ القيد
    ("⑦.1 حذف قيد المفردات",
     "      CHECK (status IN (\n        'حضور_بوقت','متأخر','زمنية_معتمدة','زمنية_انتظار',\n        'غائب','مجاز','إجازة_انتظار','عطلة'\n      )) NOT VALID;",
     "      CHECK (TRUE) NOT VALID;"),
    ("⑦.2 القيد يقبل مفردات 0337",
     "        'غائب','مجاز','إجازة_انتظار','عطلة'\n      )) NOT VALID;",
     "        'غائب','مجاز','إجازة_انتظار','عطلة',\n        'في الوقت','حاضر','إجازة'\n      )) NOT VALID;"),
    ("⑦.3 القيد VALID (يُبطل التطبيق على بيانات قديمة)",
     "        'غائب','مجاز','إجازة_انتظار','عطلة'\n      )) NOT VALID;",
     "        'غائب','مجاز','إجازة_انتظار','عطلة'\n      ));"),

    # ⑧ الفهرس
    ("⑧.1 الفهرس غير جزئي",
     "  ON public.hr_cases (tenant_id, employee_id, created_at DESC)\n  WHERE case_type = 'attendance_correction';",
     "  ON public.hr_cases (tenant_id, employee_id, created_at DESC);"),

    # ⑨ الصلاحيات
    ("⑨.1 anon يُمنح EXECUTE على الإحصاءات",
     "REVOKE ALL ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.my_attendance_month_stats(INTEGER,INTEGER) TO anon;"),
    ("⑨.2 anon يُمنح EXECUTE على التصحيحات",
     "REVOKE ALL ON FUNCTION public.my_attendance_corrections(INTEGER) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.my_attendance_corrections(INTEGER) TO anon;"),
    ("⑨.3 search_path غير مثبَّت على apply_leave",
     "  p_date_to     DATE\n) RETURNS INTEGER\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_tenant UUID := public.current_user_tenant_id();\n  v_role   TEXT := public.current_user_role();\n  v_days   INTEGER := 0;\n  d        DATE;",
     "  p_date_to     DATE\n) RETURNS INTEGER\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER\nAS $$\nDECLARE\n  v_tenant UUID := public.current_user_tenant_id();\n  v_role   TEXT := public.current_user_role();\n  v_days   INTEGER := 0;\n  d        DATE;"),
    ("⑨.4 my_attendance_streak صارت DEFINER (تتجاوز RLS)",
     "RETURNS TABLE(\n  out_current_streak INTEGER,\n  out_longest_streak INTEGER,\n  out_last_absence   DATE\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER",
     "RETURNS TABLE(\n  out_current_streak INTEGER,\n  out_longest_streak INTEGER,\n  out_last_absence   DATE\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER"),
]


def rebuild_db():
    """★ IF NOT EXISTS يمنع إعادة الإنشاء ⇒ العناصر البنيوية (القيد/الفهرس)
    تحتاج قاعدة نظيفة. نُسقط ما يُنشئه 0344 ثم نعيد تطبيقه."""
    drop = """
DROP FUNCTION IF EXISTS public.attendance_status_bucket(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.apply_leave_to_attendance(UUID,DATE,DATE);
DROP FUNCTION IF EXISTS public.revert_leave_from_attendance(UUID,DATE,DATE);
DROP FUNCTION IF EXISTS public.my_attendance_corrections(INTEGER);
ALTER TABLE public.attendance_summary
  DROP CONSTRAINT IF EXISTS attendance_summary_status_vocab;
DROP INDEX IF EXISTS public.idx_hr_cases_attendance_correction;
"""
    p = os.path.join(REPO, '.drop0344.sql')
    with open(p, 'w') as f:
        f.write(drop)
    r = subprocess.run(['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres',
                        '-X', '-q', '-f', p], capture_output=True, text=True, env=ENV)
    os.remove(p)
    return r


def main():
    original = open(MIG, encoding='utf-8').read()
    shutil.copy(MIG, MIG + '.bak')

    results = []
    for name, old, new in INVERSIONS:
        # ★ التحقّق أن النصّ موجود فعلاً — وإلا كان "العكس" وهماً
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
            # المايجريشن المعكوس لا يُطبَّق أصلاً ⇒ الإصلاح مُغطّى بنيوياً
            err = (apply_r.stderr or '').strip().split('\n')[0][:110]
            results.append((name, 'APPLY_FAIL', err))
            print(f'✅ [{name}] المايجريشن المعكوس لا يُطبَّق: {err}')
        else:
            test_r = psql(TEST)
            if test_r.returncode != 0:
                err = (test_r.stderr or '').strip().split('\n')[0]
                err = re.sub(r'^psql:\S+:\d+: ERROR:\s*', '', err)[:110]
                results.append((name, 'TEST_FAIL', err))
                print(f'✅ [{name}] الاختبار سقط: {err}')
            else:
                results.append((name, 'NOT_COVERED', '—'))
                print(f'❌❌ [{name}] الاختبار مرّ رغم العكس — غير مُغطّى!')

    # الاسترجاع
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
    print('✅ الأصل مُسترجَع والاختبار يمرّ' if final_test.returncode == 0 else '✗')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
