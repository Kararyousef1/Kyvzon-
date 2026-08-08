#!/usr/bin/env python3
"""
عكس إصلاحات 0351 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

الاستعمال:
    PGPORT=5460 python3 tools/dev/_invert_0351.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0351_training_reports_real_metrics.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-training-reports-0351.sql')
# ★ العكسان INV22/INV23 يمسّان دالة من جولة 0327 صُحّح انحدارها هنا،
#   فيُقاسان بملف تحققها لا بملف 0351.
VERIFY_0327 = os.path.join(REPO, 'tools/dev/verify-tech-metrics-0327.sql')
CROSS_CHECK = {'INV22', 'INV23'}

PGPORT = os.environ.get('PGPORT', '5460')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
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


INVERSIONS = [
    (
        'INV01',
        'العطل ①: متوسط التقدّم يعود صفراً (كأن progress_percent يُقرأ)',
        """      round(avg(progress), 1)                                  AS avg_progress,""",
        """      0::NUMERIC                                               AS avg_progress,""",
    ),
    (
        'INV02',
        'العطل ①: قراءة عمود وهمي بدل status',
        """    -- ★ العطل ①: `status` هو العمود الموجود — لا `active`
    c.status::TEXT,""",
        """    'active'::TEXT,""",
    ),
    (
        'INV03',
        'العطل ③: إسقاط الترشيح الزمني من إحصاءات الدورات',
        """     WHERE cp.tenant_id = v_tenant
       AND (p_from IS NULL OR cp.started_at >= p_from)
       AND (p_to   IS NULL OR cp.started_at <= p_to)
  ),
  agg AS (""",
        """     WHERE cp.tenant_id = v_tenant
  ),
  agg AS (""",
    ),
    (
        'INV04',
        'العطل ①: عدّ «قيد التنفيذ» يتجاهل progress',
        """      count(*) FILTER (WHERE NOT completed AND progress > 0)::INTEGER AS in_prog,
      count(*) FILTER (WHERE NOT completed AND progress = 0)::INTEGER AS not_started,""",
        """      0::INTEGER AS in_prog,
      count(*) FILTER (WHERE NOT completed)::INTEGER AS not_started,""",
    ),
    (
        'INV05',
        'الدورات الخالية تُخفى (LEFT JOIN ⇒ INNER)',
        """    FROM public.courses c
    LEFT JOIN agg ON agg.course_id = c.id
   WHERE c.tenant_id = v_tenant""",
        """    FROM public.courses c
    JOIN agg ON agg.course_id = c.id
   WHERE c.tenant_id = v_tenant""",
    ),
    (
        'INV06',
        'العزل: إسقاط ترشيح المستأجر من إحصاءات الدورات',
        """    FROM public.courses c
    LEFT JOIN agg ON agg.course_id = c.id
   WHERE c.tenant_id = v_tenant
   ORDER BY COALESCE(agg.enrolled,0) DESC, c.title;""",
        """    FROM public.courses c
    LEFT JOIN agg ON agg.course_id = c.id
   ORDER BY COALESCE(agg.enrolled,0) DESC, c.title;""",
    ),
    (
        'INV07',
        'العطل ⑦: الأقسام الخالية تُخفى',
        """    FROM public.departments d
    LEFT JOIN emp_cnt ON emp_cnt.department_id = d.id
    LEFT JOIN agg     ON agg.department_id     = d.id""",
        """    FROM public.departments d
    JOIN emp_cnt ON emp_cnt.department_id = d.id
    LEFT JOIN agg     ON agg.department_id     = d.id""",
    ),
    (
        'INV08',
        'العزل: إسقاط ترشيح المستأجر من الأقسام',
        """    LEFT JOIN agg     ON agg.department_id     = d.id
   WHERE d.tenant_id = v_tenant
   ORDER BY COALESCE(emp_cnt.n,0) DESC, d.name_ar;""",
        """    LEFT JOIN agg     ON agg.department_id     = d.id
   ORDER BY COALESCE(emp_cnt.n,0) DESC, d.name_ar;""",
    ),
    (
        'INV09',
        'من لم يلتحق يختفي (LEFT JOIN ⇒ INNER على course_progress)',
        """    LEFT JOIN public.course_progress cp
           ON cp.employee_id = emp.id""",
        """    JOIN public.course_progress cp
           ON cp.employee_id = emp.id""",
    ),
    (
        'INV10',
        'الاسم: إسقاط السلسلة الاحتياطية (full_name_ar فارغ)',
        """           COALESCE(
             NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
             NULLIF(btrim(p.full_name), ''),
             'موظف بلا اسم'
           ) AS display_name""",
        """           COALESCE(NULLIF(btrim(e.full_name_ar), ''), 'موظف بلا اسم')
             AS display_name""",
    ),
    (
        'INV11',
        'البحث في المشاركين لا يُرشِّح',
        """   WHERE (
     v_q IS NULL
     OR emp.display_name ILIKE '%' || v_q || '%'
     OR COALESCE(d.name_ar,'') ILIKE '%' || v_q || '%'
     OR COALESCE(c.title,'')   ILIKE '%' || v_q || '%'
   )""",
        """   WHERE TRUE""",
    ),
    (
        'INV12',
        'العطل ⑤: الأرشفة تحذف سجلّات التقدّم (سلوك DELETE القديم)',
        """  UPDATE public.courses c
     SET status = p_status, updated_at = NOW()
   WHERE c.id = p_course_id AND c.tenant_id = v_tenant;""",
        """  DELETE FROM public.course_progress cp
   WHERE cp.course_id = p_course_id AND cp.tenant_id = v_tenant;
  UPDATE public.courses c
     SET status = p_status, updated_at = NOW()
   WHERE c.id = p_course_id AND c.tenant_id = v_tenant;""",
    ),
    # ★★★ INV13 نُقل إلى EQUIVALENT_INVERSIONS — انظر الشرح هناك.
    # كان يُصنَّف SURVIVED، والسبب حراسة مزدوجة مُثبتة لا نقص تغطية.
    (
        'INV14',
        'العزل: قبول أرشفة دورة أجنبية',
        """  SELECT EXISTS (
    SELECT 1 FROM public.courses c
     WHERE c.id = p_course_id AND c.tenant_id = v_tenant
  ) INTO v_exists;""",
        """  SELECT EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = p_course_id
  ) INTO v_exists;""",
    ),
    (
        'INV15',
        'الصلاحية: إسقاط شرط staff من إحصاءات الدورات',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تقارير التدريب';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH prog AS (""",
        """  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH prog AS (""",
    ),
    (
        'INV16',
        'الصلاحية: إسقاط شرط staff من المشاركين',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض المشاركين';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV17',
        'الصلاحية: إسقاط شرط staff من الأرشفة',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل حالة الدورة';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV18',
        'حراسة النطاق المعكوس في إحصاءات الدورات',
        """  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  WITH prog AS (""",
        """  RETURN QUERY
  WITH prog AS (""",
    ),
    (
        'INV19',
        'حدود p_months في الاتجاه الشهري',
        """  IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
    RAISE EXCEPTION 'عدد الأشهر يجب أن يكون بين 1 و36، ووصل: %', p_months;
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV20',
        'الأشهر الخالية تُطوى (LEFT JOIN ⇒ INNER)',
        """    FROM months
    LEFT JOIN enr ON enr.m = months.m
    LEFT JOIN cmp ON cmp.m = months.m""",
        """    FROM months
    JOIN enr ON enr.m = months.m
    LEFT JOIN cmp ON cmp.m = months.m""",
    ),
    (
        'INV22',
        'انحدار 0327: إعادة توقيت الخادم لبصمات اليوم (بدل Asia/Baghdad)',
        """  v_day_start TIMESTAMPTZ :=
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Baghdad')) AT TIME ZONE 'Asia/Baghdad';""",
        """  v_day_start TIMESTAMPTZ := date_trunc('day', NOW());""",
    ),
    (
        'INV23',
        'الصلاحية: إسقاط REVOKE فيعود anon يقرأ صحّة الأجهزة',
        """REVOKE ALL ON FUNCTION public.biometric_devices_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.biometric_devices_health() FROM anon;""",
        """-- (أُسقط)""",
    ),
    (
        'INV21',
        'الخصائص: إسقاط search_path من إحصاءات الدورات',
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تقارير التدريب';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN""",
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تقارير التدريب';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN""",
    ),
]


# ───────────────────────────────────────────────────────────────────────────
# ★★★ عكوس مُصنَّفة EQUIVALENT — لا تُحتسب فشلاً، لكن لا تُخفى
# ───────────────────────────────────────────────────────────────────────────
#
# «حراسة مزدوجة»: شرطان يحرسان الحالة نفسها. عكس أحدهما لا يُسقط شيئاً
# لأن الثاني يلتقط الخطأ. تصنيفها EQUIVALENT مشروط بـ**إثبات** انعدام
# الأثر — لا بالافتراض.
#
# INV13 — حارس `p_status NOT IN (...)` في training_course_set_status:
#
#   مُثبَت بالتشغيل أن القاعدة تمنع القيمة نفسها بلا الحارس:
#     مع الحارس  ⇒ «حالة غير مسموحة: deleted — المسموح active·inactive·archived»
#     بلا الحارس ⇒ ERROR: new row … violates check constraint "courses_status_check"
#     ومع NULL:
#     مع الحارس  ⇒ «حالة غير مسموحة: <NULL> …»
#     بلا الحارس ⇒ ERROR: null value in column "status" … violates not-null
#
#   ⇒ **لا قيمة غير مسموحة تمرّ في الحالتين.** الفارق رسالة الخطأ فقط:
#     رسالة عربية مفهومة للمستخدم مقابل رسالة Postgres الإنجليزية.
#   ⇒ الحارس يبقى (قيمة تجربة المستخدم حقيقية) لكنه لا يُحتسب تغطيةً
#     أمنية، ولا يجوز الادّعاء بأنه «مُختبَر» — فهو ليس كذلك.
EQUIVALENT_INVERSIONS = [
    (
        'INV13',
        'حارس p_status — مُكافئ لـ courses_status_check (مُثبَت)',
        'القاعدة تمنع القيمة نفسها؛ الفارق رسالة الخطأ فقط',
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0351 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql(MIG)
    base = psql(VERIFY)
    if base.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print((base.stdout + base.stderr)[-2000:])
        return 1
    print('✔ خطّ الأساس: الاختبار ينجح قبل أي عكس\n')

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
            ver = psql(VERIFY_0327 if ident in CROSS_CHECK else VERIFY)
            if ver.returncode != 0:
                m = re.search(r'SENTINEL_\w+', ver.stdout + ver.stderr)
                print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {m.group(0) if m else "؟"}')
                print(f'   {desc}')
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
            else:
                print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
                print(f'   {desc}')
                results.append((ident, desc, 'SURVIVED'))
        finally:
            os.unlink(tmp)
            psql(MIG)

    open(MIG, 'w', encoding='utf-8').write(original)
    psql(MIG)
    final = psql(VERIFY)

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
    print(f'  الاسترجاع: {"✔ الاختبار ينجح" if final.returncode == 0 else "✖ فشل"}')
    print('═' * 74)
    return 0 if (not bad and final.returncode == 0) else 1


if __name__ == '__main__':
    sys.exit(main())
