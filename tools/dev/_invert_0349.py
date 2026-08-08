#!/usr/bin/env python3
"""
عكس إصلاحات 0349 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ القاعدة: «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
    الإصلاح الذي لا يُسقط عكسُه أيّ تأكيد = إصلاح غير مُختبَر.

لكل عكس:
  · نتحقق أن نصّ الاستبدال **طابق فعلاً** (assert) — وإلا فالعكس وهمي
  · نُعيد تطبيق المايجريشن المعكوس
  · نُشغّل ملف التحقق ونتوقّع فشلاً
  · نُصنّف: FAILED_AS_EXPECTED · SURVIVED · EQUIVALENT

الاستعمال:
    PGPORT=5456 python3 tools/dev/_invert_0349.py
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0349_hr_analytics_real_metrics.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-hr-analytics-0349.sql')

PGPORT = os.environ.get('PGPORT', '5456')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get(
    'PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP


def psql(path):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV, timeout=180)


# ───────────────────────────────────────────────────────────────────────────
# قائمة العكوس: (المعرّف, الوصف, النصّ الأصلي, النصّ المعكوس)
# ───────────────────────────────────────────────────────────────────────────

INVERSIONS = [
    (
        'INV01',
        'العطل ① — إعادة ربط الصحة بـ profiles.id بدل employees.id (overview)',
        """  well AS (
    SELECT w.score
      FROM public.wellness_entries w
      JOIN emp ON emp.id = w.employee_id
     WHERE w.tenant_id = v_tenant""",
        """  well AS (
    SELECT w.score
      FROM public.wellness_entries w
      JOIN public.profiles emp ON emp.id = w.employee_id
     WHERE w.tenant_id = v_tenant""",
    ),
    (
        'INV02',
        'العطل ① — إعادة الربط الخاطئ في دالة الأقسام',
        """      FROM public.wellness_entries w
      JOIN emp e ON e.id = w.employee_id
     WHERE w.tenant_id = v_tenant""",
        """      FROM public.wellness_entries w
      JOIN public.profiles pr ON pr.id = w.employee_id
      JOIN emp e ON e.id = pr.id
     WHERE w.tenant_id = v_tenant""",
    ),
    (
        'INV03',
        'العطل ② — إعادة updated_at بلا سنة بدل closed_at في النطاق',
        """       AND i.closed_at   IS NOT NULL
       AND i.closed_at  >= p_from::timestamptz
       AND i.closed_at   < (p_to + 1)::timestamptz""",
        """       AND i.closed_at   IS NOT NULL
       AND EXTRACT(MONTH FROM i.updated_at)
           = EXTRACT(MONTH FROM p_to::timestamptz)""",
    ),
    (
        'INV04',
        'العطل ④ — إعادة الثابت المُختلَق 2.4 بدل الحساب',
        """    COALESCE((
      SELECT round(avg(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0), 2)
        FROM inc_closed
    ), 0),""",
        """    2.4::NUMERIC,""",
    ),
    (
        'INV05',
        'العطل ⑥ — إعادة «كل ما ليس غائب = حاضر» والمقام الكامل',
        """      count(*) FILTER (WHERE status NOT IN ('عطلة','مجاز'))::INTEGER AS working_days,
      count(*) FILTER (
        WHERE status IN ('حضور_بوقت','متأخر','زمنية_معتمدة','زمنية_انتظار')
      )::INTEGER AS present_days,""",
        """      count(*)::INTEGER AS working_days,
      count(*) FILTER (WHERE status <> 'غائب')::INTEGER AS present_days,""",
    ),
    (
        'INV06',
        'العطل ⑦ — إعادة عدّ المؤرشف ضمن المفتوح',
        """  inc_open AS (
    SELECT 1 AS n
      FROM public.incidents i
     WHERE i.tenant_id   = v_tenant
       AND i.archived_at IS NULL
       AND i.status NOT IN ('resolved','closed')
  ),""",
        """  inc_open AS (
    SELECT 1 AS n
      FROM public.incidents i
     WHERE i.tenant_id   = v_tenant
       AND i.status NOT IN ('resolved','closed')
  ),""",
    ),
    (
        'INV07',
        'العطل ⑥ (أقسام) — إعادة المقام الكامل في دالة الأقسام',
        """           count(*) FILTER (WHERE s.status NOT IN ('عطلة','مجاز'))::INTEGER AS working_days,""",
        """           count(*)::INTEGER AS working_days,""",
    ),
    (
        'INV08',
        'العطل ⑤ — طيّ الأشهر الخالية (INNER بدل LEFT) في اتجاه الصحة',
        """  SELECT months.m,
         COALESCE(round(w.avg_score, 1), 0),
         COALESCE(w.samples, 0),
         COALESCE(w.employees, 0)
    FROM months
    LEFT JOIN w ON w.m = months.m
   ORDER BY months.m;""",
        """  SELECT months.m,
         COALESCE(round(w.avg_score, 1), 0),
         COALESCE(w.samples, 0),
         COALESCE(w.employees, 0)
    FROM months
    JOIN w ON w.m = months.m
   ORDER BY months.m;""",
    ),
    (
        'INV09',
        'عزل المستأجر — إسقاط ترشيح tenant من اتجاه البلاغات (الوارد)',
        """    SELECT date_trunc('month', i.created_at)::DATE AS m, count(*)::INTEGER AS n
      FROM public.incidents i
     WHERE i.tenant_id = v_tenant AND i.archived_at IS NULL
     GROUP BY 1""",
        """    SELECT date_trunc('month', i.created_at)::DATE AS m, count(*)::INTEGER AS n
      FROM public.incidents i
     WHERE i.archived_at IS NULL
     GROUP BY 1""",
    ),
    (
        'INV10',
        'حراسة الصلاحية — إسقاط شرط current_user_is_staff من overview',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active""",
        """  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active""",
    ),
    (
        'INV11',
        'حراسة النطاق — قبول النطاق المعكوس في overview',
        """  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active""",
        """  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active""",
    ),
    (
        'INV12',
        'حدود p_months — قبول 0 و37 في اتجاه الصحة',
        """  IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
    RAISE EXCEPTION 'عدد الأشهر يجب أن يكون بين 1 و36، ووصل: %', p_months;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
             date_trunc('month', CURRENT_DATE)::DATE
               - ((p_months - 1) || ' months')::INTERVAL,
             date_trunc('month', CURRENT_DATE)::DATE,
             '1 month'::INTERVAL
           )::DATE AS m
  ),
  emp AS (""",
        """  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
             date_trunc('month', CURRENT_DATE)::DATE
               - ((p_months - 1) || ' months')::INTERVAL,
             date_trunc('month', CURRENT_DATE)::DATE,
             '1 month'::INTERVAL
           )::DATE AS m
  ),
  emp AS (""",
    ),
    (
        'INV13',
        'خصائص الدوال — إسقاط SET search_path من overview',
        """LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active""",
        """LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد المستأجر الحالي';
  END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الموارد البشرية';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.is_active""",
    ),
    (
        'INV14',
        'الأقسام — إسقاط استثناء المؤرشف من بلاغات القسم',
        """      JOIN emp e ON e.id = i.employee_id
     WHERE i.tenant_id   = v_tenant
       AND i.archived_at IS NULL
       AND i.created_at >= p_from::timestamptz""",
        """      JOIN emp e ON e.id = i.employee_id
     WHERE i.tenant_id   = v_tenant
       AND i.created_at >= p_from::timestamptz""",
    ),
    (
        'INV15',
        'الأقسام — LEFT JOIN ⇒ INNER فيُخفي القسم بلا موظفين',
        """    FROM d
    LEFT JOIN emp_cnt ON emp_cnt.department_id = d.id""",
        """    FROM d
    JOIN emp_cnt ON emp_cnt.department_id = d.id""",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0349 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    # خطّ الأساس: يجب أن ينجح قبل أي عكس
    psql(MIG)
    base = psql(VERIFY)
    if base.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print(base.stdout[-2000:], base.stderr[-2000:])
        return 1
    print('✔ خطّ الأساس: الاختبار ينجح قبل أي عكس\n')

    for ident, desc, old, new in INVERSIONS:
        # ★ التحقّق أن نصّ الاستبدال طابق فعلاً — وإلا فالعكس وهمي
        if old not in original:
            print(f'✖ {ident}: النصّ الأصلي لم يُطابَق — العكس وهمي!')
            print(f'   {desc}')
            results.append((ident, desc, 'NO_MATCH'))
            continue
        if original.count(old) != 1:
            print(f'⚠ {ident}: النصّ تكرّر {original.count(old)} مرة — '
                  f'العكس سيصيب الأول فقط')

        broken = original.replace(old, new, 1)
        assert broken != original, f'{ident}: الاستبدال لم يُغيّر شيئاً'

        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False,
                                         encoding='utf-8') as fh:
            fh.write(broken)
            tmp = fh.name
        try:
            apply_r = psql(tmp)
            if apply_r.returncode != 0:
                # المايجريشن المعكوس نفسه لا يُطبَّق — وهذا أيضاً كشفٌ صالح
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
                print(f'✔ {ident}  FAILED_AS_EXPECTED (رفضته القاعدة عند التطبيق)')
                print(f'   {desc}')
                continue

            ver = psql(VERIFY)
            if ver.returncode != 0:
                sentinel = re.search(r'SENTINEL_\w+', ver.stdout + ver.stderr)
                tag = sentinel.group(0) if sentinel else '؟'
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
                print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {tag}')
                print(f'   {desc}')
            else:
                results.append((ident, desc, 'SURVIVED'))
                print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
                print(f'   {desc}')
        finally:
            os.unlink(tmp)
            psql(MIG)  # استرجاع

    # استرجاع نهائي والتحقق
    open(MIG, 'w', encoding='utf-8').write(original)
    psql(MIG)
    final = psql(VERIFY)

    print('\n' + '═' * 74)
    ok = sum(1 for _, _, s in results if s == 'FAILED_AS_EXPECTED')
    bad = [r for r in results if r[2] != 'FAILED_AS_EXPECTED']
    print(f'  النتيجة: {ok}/{len(results)} عكساً أسقط الاختبار')
    for ident, desc, st in bad:
        print(f'    ✖ {ident} [{st}] {desc}')
    print(f'  الاسترجاع: {"✔ الاختبار ينجح" if final.returncode == 0 else "✖ فشل"}')
    print('═' * 74)
    return 0 if (not bad and final.returncode == 0) else 1


if __name__ == '__main__':
    sys.exit(main())
