#!/usr/bin/env python3
"""عكس كل إصلاح في 0347 وإثبات سقوط الاختبار."""
import os, re, shutil, subprocess, sys

REPO = '/home/user/Kyvzon'
MIG = os.path.join(REPO, 'supabase/migrations/0347_kiosk_punch_and_summary.sql')
TEST = os.path.join(REPO, 'tools/dev/verify-kiosk-punch-0347.sql')
SOCK, PORT, PGR = '/home/user/.pgtest/sock', '5451', '/home/user/.pgtest/root'

ENV = dict(os.environ)
ENV['PATH'] = f'{PGR}/usr/lib/postgresql/17/bin:' + ENV['PATH']
ENV['LD_LIBRARY_PATH'] = f'{PGR}/usr/lib/x86_64-linux-gnu:{PGR}/usr/lib'


def psql(path):
    return subprocess.run(
        ['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-X', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV)


INVERSIONS = [
    # ① الوردية
    ("①.1 الساعة بمنطقة الخادم لا بغداد (عطل اكتشفه الاختبار)",
     "FROM (SELECT EXTRACT(HOUR FROM (p_at AT TIME ZONE 'Asia/Baghdad'))::INT AS h) q;",
     "FROM (SELECT EXTRACT(HOUR FROM p_at)::INT AS h) q;"),
    ("①.2 الليلي لا يُختبَر أولاً (نافذة تعبر منتصف الليل)",
     "    WHEN h >= 22 OR h < 6 THEN 'ليلي'\n    WHEN h < 14           THEN 'صباحي'",
     "    WHEN h < 14           THEN 'صباحي'\n    WHEN h >= 22 OR h < 6 THEN 'ليلي'"),
    ("①.3 الدالة VOLATILE بدل IMMUTABLE",
     "RETURNS TEXT\nLANGUAGE sql\nIMMUTABLE\nPARALLEL SAFE",
     "RETURNS TEXT\nLANGUAGE sql\nVOLATILE\nPARALLEL SAFE"),

    # ② البصمة
    ("②.1 punch_type لا يُمرَّر (العطل الأصلي)",
     "    (v_tenant, p_employee_id, v_now, v_type, v_shift,\n     v_day, p_device_id, COALESCE(p_verification,'finger'), 'ADMS');",
     "    (v_tenant, p_employee_id, v_now, DEFAULT, v_shift,\n     v_day, p_device_id, COALESCE(p_verification,'finger'), 'ADMS');"),
    ("②.2 shift_type لا يُمرَّر (كان NULL أبداً)",
     "     shift_date, device_id, verification_type, source)\n  VALUES\n    (v_tenant, p_employee_id, v_now, v_type, v_shift,",
     "     shift_date, device_id, verification_type, source)\n  VALUES\n    (v_tenant, p_employee_id, v_now, v_type, NULL,"),
    ("②.3 النوع دائماً check-in",
     "  v_type := CASE\n    WHEN v_lastty IS NULL                        THEN 'check-in'\n    WHEN v_lastty IN ('in','check-in')           THEN 'check-out'\n    ELSE                                              'check-in'\n  END;",
     "  v_type := 'check-in';"),
    ("②.4 نافذة الارتداد محذوفة",
     "  IF v_last IS NOT NULL AND (v_now - v_last) < INTERVAL '60 seconds' THEN",
     "  IF FALSE THEN"),
    ("②.5 الارتداد يُدرج صفّاً رغم ذلك",
     "    RETURN QUERY SELECT v_lastty, v_last,\n                        public.shift_for_punch(v_last), v_day, v_n, TRUE;\n    RETURN;",
     "    RETURN QUERY SELECT v_lastty, v_last,\n                        public.shift_for_punch(v_last), v_day, v_n, FALSE;"),
    ("②.6 فحص الدور محذوف",
     "  IF v_role IS NULL OR v_role NOT IN\n     ('admin','hr','developer','it_admin','manager','supervisor',\n      'direct_manager','gatekeeper','security') THEN\n    RAISE EXCEPTION 'غير مصرَّح بتسجيل البصمات (الدور: %)', COALESCE(v_role,'—');\n  END IF;",
     "  -- (فحص الدور محذوف)"),
    ("②.7 فحص المستأجر/النشاط محذوف",
     "  IF NOT EXISTS (\n    SELECT 1 FROM public.employees e\n     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant AND e.is_active\n  ) THEN\n    RAISE EXCEPTION 'الموظف غير موجود أو غير نشط في هذا المستأجر';\n  END IF;",
     "  -- (فحص الموظف محذوف)"),
    ("②.8 غير النشط مقبول",
     "     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant AND e.is_active",
     "     WHERE e.id = p_employee_id AND e.tenant_id = v_tenant"),
    ("②.9 kiosk_punch تعمل INVOKER (سياسة staff تصدّ الحارس)",
     "  out_debounced    BOOLEAN\n)\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER",
     "  out_debounced    BOOLEAN\n)\nLANGUAGE plpgsql\nVOLATILE\nSECURITY INVOKER"),

    # ③ الملخّص
    ("③.1 المحفّز محذوف (العطل الأصلي: حاضر=0)",
     "DROP TRIGGER IF EXISTS trg_refresh_attendance_summary ON public.attendance_logs;\nCREATE TRIGGER trg_refresh_attendance_summary\n  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_logs\n  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_attendance_summary();",
     "DROP TRIGGER IF EXISTS trg_refresh_attendance_summary ON public.attendance_logs;"),
    ("③.2 المحفّز على INSERT فقط",
     "  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_logs",
     "  AFTER INSERT ON public.attendance_logs"),
    ("③.3 الإجازة تُمحى بالبصمة",
     "  IF COALESCE(v_locked, FALSE) THEN RETURN; END IF;",
     "  -- (حماية الإجازة محذوفة)"),
    ("③.4 السماح 15 دقيقة مُهمَل",
     "    )) / 60)::INTEGER - 15,\n    0);",
     "    )) / 60)::INTEGER - 0,\n    0);"),
    ("③.5 بداية الوردية بمنطقة الخادم",
     "                                 END) AT TIME ZONE 'Asia/Baghdad')",
     "                                 END))"),
    ("③.6 الحالة دائماً حضور_بوقت",
     "  v_status := CASE WHEN v_late > 0 THEN 'متأخر' ELSE 'حضور_بوقت' END;",
     "  v_status := 'حضور_بوقت';"),
    ("③.7 الخروج يُختلَق من بصمة واحدة",
     "  IF v_out IS NULL AND v_count > 1 THEN v_out := v_last; END IF;",
     "  IF v_out IS NULL THEN v_out := v_last; END IF;"),
    ("③.8 الساعات تُحتسب بلا خروج",
     "  v_hours := CASE\n    WHEN v_out IS NULL THEN 0\n    ELSE round(EXTRACT(EPOCH FROM (v_out - v_first)) / 3600.0, 2)\n  END;",
     "  v_hours := round(EXTRACT(EPOCH FROM (COALESCE(v_out, NOW()) - v_first)) / 3600.0, 2);"),
    ("③.9 refresh تعمل INVOKER",
     ") RETURNS VOID\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER",
     ") RETURNS VOID\nLANGUAGE plpgsql\nVOLATILE\nSECURITY INVOKER"),

    # ④ اللوحة
    ("④.1 الإجراء التالي من عدّ البصمات (العطل الأصلي)",
     "         CASE\n           WHEN p.last_type IS NULL              THEN 'check-in'\n           WHEN p.last_type IN ('in','check-in') THEN 'check-out'\n           ELSE                                       'check-in'\n         END::TEXT,",
     "         CASE WHEN COALESCE(p.n,0) % 2 = 0 THEN 'check-in'\n              ELSE 'check-out' END::TEXT,"),
    ("④.2 الحالة من وجود بصمة خروج لا من آخر بصمة",
     "           WHEN p.last_type IN ('out','check-out')    THEN 'منصرف'\n           WHEN p.last_type IN ('in','check-in')      THEN 'مداوم'",
     "           WHEN p.out_at IS NOT NULL                  THEN 'منصرف'\n           WHEN p.last_type IN ('in','check-in')      THEN 'مداوم'"),
    ("④.3 غير النشطين يظهرون",
     "   WHERE e.tenant_id = v_tenant\n     AND e.is_active\n     AND (v_q IS NULL",
     "   WHERE e.tenant_id = v_tenant\n     AND (v_q IS NULL"),
    ("④.4 اللوحة بلا ترشيح مستأجر",
     "    LEFT JOIN p ON p.employee_id = e.id\n   WHERE e.tenant_id = v_tenant",
     "    LEFT JOIN p ON p.employee_id = e.id\n   WHERE TRUE"),
    ("④.5 البصمات بلا ترشيح مستأجر",
     "     WHERE l.tenant_id = v_tenant AND l.shift_date = v_day\n     GROUP BY l.employee_id",
     "     WHERE l.shift_date = v_day\n     GROUP BY l.employee_id"),
    ("④.6 الاسم من full_name_ar وحده (درس 0346)",
     "         COALESCE(\n           NULLIF(btrim(e.full_name_ar), ''),\n           NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.first_name), ''),\n                                       NULLIF(btrim(e.last_name), ''))), ''),\n           NULLIF(btrim(pr.full_name), ''),\n           'بدون اسم')::TEXT,",
     "         COALESCE(NULLIF(btrim(e.full_name_ar), ''), 'بدون اسم')::TEXT,"),
    ("④.7 البحث معطّل",
     "     AND (v_q IS NULL\n          OR e.full_name_ar  ILIKE '%' || v_q || '%'",
     "     AND (TRUE\n          OR e.full_name_ar  ILIKE '%' || v_q || '%'"),
    ("④.8 البحث بمسافات لا يُعامَل كلا بحث",
     "  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');\nBEGIN\n  IF v_tenant IS NULL THEN RETURN; END IF;",
     "  v_q      TEXT := p_search;\nBEGIN\n  IF v_tenant IS NULL THEN RETURN; END IF;"),
    ("④.9 حدّ اللوحة بلا قصّ",
     "  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);",
     "  v_lim    INTEGER := p_limit;"),

    # ⑤ الإحصائيات
    ("⑤.1 الغائب يشمل المُجاز",
     "         count(*) FILTER (\n           WHERE out_status = 'غائب'\n             AND out_employee_id NOT IN (SELECT employee_id FROM lv)\n         )::INTEGER",
     "         count(*) FILTER (WHERE out_status = 'غائب')::INTEGER"),
    ("⑤.2 الإجازة لا تُحتسب",
     "         count(*) FILTER (WHERE out_employee_id IN (SELECT employee_id FROM lv))::INTEGER,",
     "         0::INTEGER,"),
    ("⑤.3 الإجازة بلا ترشيح يوم",
     "     WHERE a.tenant_id = v_tenant AND a.shift_date = v_day\n       AND a.status IN ('مجاز','إجازة_انتظار','عطلة')",
     "     WHERE a.tenant_id = v_tenant\n       AND a.status IN ('مجاز','إجازة_انتظار','عطلة')"),
    ("⑤.4 صفّ الأصفار محذوف",
     "    RETURN QUERY SELECT 0,0,0,0,0;\n    RETURN;",
     "    RETURN;"),
    ("⑤.5 «حاضر» يشمل المنصرف",
     "         count(*) FILTER (WHERE out_status = 'مداوم')::INTEGER,",
     "         count(*) FILTER (WHERE out_status IN ('مداوم','منصرف'))::INTEGER,"),

    # ⑥ الأمان
    ("⑥.1 anon يُمنح EXECUTE على kiosk_punch",
     "REVOKE ALL ON FUNCTION public.kiosk_punch(UUID,TEXT,TEXT) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.kiosk_punch(UUID,TEXT,TEXT) TO anon;"),
    ("⑥.2 anon يُمنح EXECUTE على kiosk_board",
     "REVOKE ALL ON FUNCTION public.kiosk_board(TEXT,INTEGER) FROM anon;",
     "GRANT EXECUTE ON FUNCTION public.kiosk_board(TEXT,INTEGER) TO anon;"),
    ("⑥.3 search_path غير مثبَّت على kiosk_punch",
     ") RETURNS TABLE(\n  out_punch_type   TEXT,\n  out_punch_time   TIMESTAMPTZ,\n  out_shift_type   TEXT,\n  out_shift_date   DATE,\n  out_punch_count  INTEGER,\n  out_debounced    BOOLEAN\n)\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER\nSET search_path = public",
     ") RETURNS TABLE(\n  out_punch_type   TEXT,\n  out_punch_time   TIMESTAMPTZ,\n  out_shift_type   TEXT,\n  out_shift_date   DATE,\n  out_punch_count  INTEGER,\n  out_debounced    BOOLEAN\n)\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER"),
    ("⑥.4 kiosk_board تعمل DEFINER (تتجاوز RLS)",
     "  out_status        TEXT\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER",
     "  out_status        TEXT\n)\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER"),
]


def rebuild_db():
    drop = """
DROP TRIGGER IF EXISTS trg_refresh_attendance_summary ON public.attendance_logs;
DROP FUNCTION IF EXISTS public.tg_refresh_attendance_summary() CASCADE;
DROP FUNCTION IF EXISTS public.kiosk_stats();
DROP FUNCTION IF EXISTS public.kiosk_board(TEXT,INTEGER);
DROP FUNCTION IF EXISTS public.kiosk_punch(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.refresh_attendance_summary(UUID,DATE);
DROP FUNCTION IF EXISTS public.shift_for_punch(TIMESTAMPTZ) CASCADE;
"""
    p = os.path.join(REPO, '.drop0347.sql')
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
