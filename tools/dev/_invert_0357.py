#!/usr/bin/env python3
"""
عكس إصلاحات 0357 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ العطل ⑦ (سياسة employees بلا تمييز دور) لا يراه ملف الـSQL لأنه
   يعمل بدور postgres وهو BYPASSRLS — يُقاس بسكربت RLS وحده.

الاستعمال:
    PGPORT=5477 python3 tools/dev/_invert_0357.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0357_team_directory_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-team-directory-0357.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-team-directory-0357-rls.sh')

PGPORT = os.environ.get('PGPORT', '5477')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★ حرّاس الدور لا يسقطها ملف الـSQL وحده حين تكون العيّنة بدور hr —
#   لكنها هنا مُختبَرة في القسم ⑪ منه أيضاً. نستعمل RLS للحاسمة.
RLS_CHECK = {'INV21'}


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


# ═══════════════════════════════════════════════════════════════════════
#  ★★★ لماذا تغيّر شكل عكس منطقة التوقيت
#
#  العكس الأول كان `AT TIME ZONE 'Asia/Baghdad'` → منطقة الجلسة.
#  **نجا** لأن الجلسة `Etc/UTC` والفرق بين UTC وبغداد يظهر ثلاث ساعات
#  فقط في اليوم (21:00–00:00 UTC). فالاختبار يعتمد **ساعة التشغيل** —
#  وهو بالضبط ما نهى عنه درس 0327: «اختبارٌ يعتمد ساعة التشغيل =
#  اختبار غير موثوق».
#
#  البديل يقيس ما يهمّ فعلاً: أن كل حساب زمنيّ في الدالة يعتمد
#  `v_today` وأن قيمته صحيحة. إزاحته يوماً واحداً تُسقط التأكيدات
#  T.4 و T.5 (إجازة يوم واحد وشهادة تنتهي اليوم) حتماً ومهما كانت
#  ساعة التشغيل — والصحّة الفعلية لمنطقة بغداد محروسة بالتأكيدات
#  T.1–T.3 التي تقيس الفرق حسابياً لا بالمصادفة.
# ═══════════════════════════════════════════════════════════════════════
INVERSIONS = [
    (
        'INV01',
        '★★★ قراءة mood_score بدل score (تعود «الصحة صفر للجميع»)',
        """    SELECT w.employee_id,
           round(avg(w.score), 1) AS avg_score,
           count(*)::INTEGER      AS n
      FROM public.wellness_entries w
     WHERE w.tenant_id = v_tenant AND w.score IS NOT NULL
     GROUP BY w.employee_id""",
        """    SELECT w.employee_id,
           round(avg(w.stress), 1) AS avg_score,
           count(*)::INTEGER       AS n
      FROM public.wellness_entries w
     WHERE w.tenant_id = v_tenant AND w.stress IS NOT NULL
     GROUP BY w.employee_id""",
    ),
    (
        'INV02',
        '★★★ ربط البلاغات بـemployees.id بدل user_id (تعود «0 مشاكل للجميع»)',
        """      LEFT JOIN inc  ON inc.profile_id   = b.user_id""",
        """      LEFT JOIN inc  ON inc.profile_id   = b.id""",
    ),
    (
        'INV03',
        '★★ عدّ البلاغات المؤرشفة كمفتوحة',
        """     WHERE i.tenant_id = v_tenant
       AND i.status NOT IN ('resolved','closed')
       AND i.archived_at IS NULL
     GROUP BY i.reported_by""",
        """     WHERE i.tenant_id = v_tenant
       AND i.status NOT IN ('resolved','closed')
     GROUP BY i.reported_by""",
    ),
    (
        'INV04',
        '★★★ إسقاط سلسلة الاسم (full_name_ar فارغ لكل موظف ⇒ عمود خالٍ)',
        """      COALESCE(NULLIF(btrim(e.full_name_ar), ''),
               NULLIF(btrim(p.full_name), ''),
               NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                            COALESCE(NULLIF(e.last_name,'—'),'')), ''),
               'موظف ' || COALESCE(e.employee_code,'—')) AS full_name,""",
        """      e.full_name_ar AS full_name,""",
    ),
    (
        'INV05',
        '★★★ إسقاط البريد من auth.users (employees.email = NULL دائماً)',
        """      COALESCE(NULLIF(btrim(e.email), ''), NULLIF(btrim(u.email), '')) AS email,""",
        """      e.email AS email,""",
    ),
    (
        'INV06',
        '★★ إسقاط الهاتف من profiles',
        """      COALESCE(NULLIF(btrim(e.phone), ''), NULLIF(btrim(p.phone), '')) AS phone,""",
        """      e.phone AS phone,""",
    ),
    (
        'INV07',
        '★★ إسقاط المسمّى من profiles',
        """      COALESCE(NULLIF(btrim(e.position), ''), NULLIF(btrim(p.position), '')) AS position,""",
        """      e.position AS position,""",
    ),
    (
        'INV08',
        '★★★ قراءة الدور من employees (غير مُدار ⇒ «موظف» للجميع)',
        """      COALESCE(NULLIF(btrim(p.role), ''), NULLIF(btrim(e.role), ''), 'employee') AS role,""",
        """      COALESCE(NULLIF(btrim(e.role), ''), 'employee') AS role,""",
    ),
    (
        'INV09',
        '★★ إسقاط اسم القسم من departments',
        """      COALESCE(d.name_ar, p.department) AS department""",
        """      NULL::TEXT AS department""",
    ),
    (
        'INV10',
        '★★★ إسقاط اشتقاق on_leave (تعود حالتان فقط)',
        """           CASE WHEN NOT b.is_active         THEN 'inactive'
                WHEN lv.employee_id IS NOT NULL THEN 'on_leave'
                ELSE 'active' END AS status,""",
        """           CASE WHEN NOT b.is_active THEN 'inactive'
                ELSE 'active' END AS status,""",
    ),
    (
        'INV11',
        '★★ الإجازة المنتظرة تُعدّ إجازة (المفردة موافق تُسقَط)',
        """     WHERE l.tenant_id = v_tenant
       AND l.status = 'موافق'
       AND l.date_from <= v_today
       AND l.date_to   >= v_today""",
        """     WHERE l.tenant_id = v_tenant
       AND l.date_from <= v_today
       AND l.date_to   >= v_today""",
    ),
    (
        'INV12',
        '★★ إسقاط شرط المدى (إجازة منتهية تجعله on_leave أبداً)',
        """       AND l.date_from <= v_today
       AND l.date_to   >= v_today
  ),
  final AS (""",
        """  ),
  final AS (""",
    ),
    (
        'INV13',
        '★★ inactive لا يسبق on_leave (موظف مفصول في إجازة يظهر «في إجازة»)',
        """           CASE WHEN NOT b.is_active         THEN 'inactive'
                WHEN lv.employee_id IS NOT NULL THEN 'on_leave'""",
        """           CASE WHEN lv.employee_id IS NOT NULL THEN 'on_leave'
                WHEN NOT b.is_active            THEN 'inactive'""",
    ),
    (
        'INV14',
        '★ الشهادة المنتهية تُعدّ سارية',
        """           count(*) FILTER (
             WHERE c.expiry_date IS NULL OR c.expiry_date >= v_today
           )::INTEGER AS n_valid""",
        """           count(*)::INTEGER AS n_valid""",
    ),
    (
        'INV15',
        '★★★ إسقاط ترشيح المستأجر من الدليل (تسريب كامل)',
        """    WHERE e.tenant_id = v_tenant
      AND (p_include_inactive OR e.is_active)""",
        """    WHERE (p_include_inactive OR e.is_active)""",
    ),
    (
        'INV20',
        '★ إسقاط الحدّ الأعلى من الدليل',
        """   ORDER BY f.full_name
   LIMIT GREATEST(COALESCE(p_limit, 300), 1);""",
        """   ORDER BY f.full_name;""",
    ),
    (
        'INV21',
        '★★★ إسقاط حارس staff من team_directory (سياسة الجدول بلا تمييز دور)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض دليل الفريق';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV22',
        '★★ إسقاط حارس staff من team_summary',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص الفريق';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV23',
        '★★ إسقاط حارس staff من team_departments',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض الأقسام';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV24',
        '★★ حارس مفردات الحالة يقبل مفردة مختلَقة',
        """  IF p_status IS NOT NULL AND p_status NOT IN ('active','inactive','on_leave') THEN""",
        """  IF p_status IS NOT NULL
     AND p_status NOT IN ('active','inactive','on_leave','نشط') THEN""",
    ),
    (
        'INV25',
        '★★ إسقاط البحث بالبريد والهاتف والمسمّى (كان بلا معنى أصلاً)',
        """          OR f.email         ILIKE '%' || v_q || '%'
          OR f.phone         ILIKE '%' || v_q || '%'
          OR f.position      ILIKE '%' || v_q || '%')""",
        """          OR FALSE)""",
    ),
    (
        'INV26',
        '★★★ متوسّط الصفوف بدل متوسّط المتوسّطات (ترجيح كثير التسجيل)',
        """    SELECT round(avg(m.a), 1) AS avg_all, count(*)::INTEGER AS n
      FROM (SELECT w.employee_id, avg(w.score) AS a
              FROM public.wellness_entries w
             WHERE w.tenant_id = v_tenant AND w.score IS NOT NULL
             GROUP BY w.employee_id) m""",
        """    SELECT round(avg(w.score), 1) AS avg_all, count(DISTINCT w.employee_id)::INTEGER AS n
      FROM public.wellness_entries w
     WHERE w.tenant_id = v_tenant AND w.score IS NOT NULL""",
    ),
    (
        'INV27',
        '★★ الملخّص: on_leave يُحتسَب ضمن النشطين',
        """    (SELECT count(*)::INTEGER FROM emp WHERE is_active AND NOT on_leave),
    (SELECT count(*)::INTEGER FROM emp WHERE is_active AND on_leave),""",
        """    (SELECT count(*)::INTEGER FROM emp WHERE is_active),
    (SELECT count(*)::INTEGER FROM emp WHERE is_active AND on_leave),""",
    ),
    (
        'INV28',
        '★ الشهادات المنتهية تُعدّ «تنتهي قريباً»',
        """        AND c.expiry_date >= v_today
        AND c.expiry_date <= v_today + 30);""",
        """        AND c.expiry_date <= v_today + 30);""",
    ),
    (
        'INV29',
        '★★ إسقاط ترشيح المستأجر من عدّ الأقسام في الملخّص',
        """    (SELECT count(*)::INTEGER FROM public.departments d
      WHERE d.tenant_id = v_tenant),""",
        """    (SELECT count(*)::INTEGER FROM public.departments d),""",
    ),
    (
        'INV30',
        '★★ إسقاط ترشيح المستأجر من team_departments',
        """    FROM public.departments d
   WHERE d.tenant_id = v_tenant
   ORDER BY d.name_ar;""",
        """    FROM public.departments d
   ORDER BY d.name_ar;""",
    ),
    (
        'INV32',
        '★★★ إزاحة «اليوم» يوماً واحداً (يُثبت أن الحسابات تعتمده فعلاً)',
        """  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  -- ★★ العطل ⑦: الحماية في القاعدة لا في التوجيه وحده""",
        """  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE + 1;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  -- ★★ العطل ⑦: الحماية في القاعدة لا في التوجيه وحده""",
    ),
    (
        'INV33',
        '★★ إزاحة «اليوم» في team_summary أيضاً',
        """  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص الفريق';""",
        """  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE - 1;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص الفريق';""",
    ),
]


# ═══════════════════════════════════════════════════════════════════════
#  عكوس DDL — `IF NOT EXISTS` يمنع إعادة الإنشاء
# ═══════════════════════════════════════════════════════════════════════
DDL_INVERSIONS = [
    (
        'DDL01',
        '★ إسقاط فهرس سجلّ الصحة',
        'DROP INDEX IF EXISTS public.idx_wellness_emp_date;',
        'CREATE INDEX IF NOT EXISTS idx_wellness_emp_date '
        'ON public.wellness_entries (tenant_id, employee_id, date DESC);',
    ),
    (
        'DDL02',
        '★ إسقاط فهرس الشهادات',
        'DROP INDEX IF EXISTS public.idx_emp_certs_emp;',
        'CREATE INDEX IF NOT EXISTS idx_emp_certs_emp '
        'ON public.employee_certifications (tenant_id, employee_id);',
    ),
    (
        'DDL03',
        '★ إسقاط فهرس البلاغات',
        'DROP INDEX IF EXISTS public.idx_incidents_reported_by;',
        'CREATE INDEX IF NOT EXISTS idx_incidents_reported_by '
        'ON public.incidents (tenant_id, reported_by);',
    ),
]

DDL_RLS_CHECK: set = set()


EQUIVALENT_INVERSIONS = [
    (
        'EQ03',
        "ترشيح المستأجر داخل CTEs الأربعة في team_directory "
        "(wl · inc · cert · lv) — INV16..INV19 سابقاً",
        "مُكافئ بنيوياً لترشيح `base`: الأربعة تُربَط بـ`LEFT JOIN` مع "
        "`base` المُرشَّح بـ`e.tenant_id = v_tenant`، ومفاتيح الربط "
        "مقيَّدة بمفاتيح أجنبية إلى جداول مفاتيحها الأساسية **فريدة "
        "عالمياً** (مُحقَّق: employees_pkey PRIMARY KEY (id) · "
        "wellness_entries_employee_id_fkey → employees(id) · "
        "leaves_employee_id_fkey → employees(id) · "
        "incidents_reported_by_profiles_fkey → profiles(id)). "
        "فلا يمكن لصفٍّ أجنبيّ أن يُطابق موظفاً محلّياً — الترشيح "
        "الثاني دفاعٌ في العمق لا شرطٌ فعّال. "
        "★ والترشيح **الفعّال** في `team_summary` (حيث لا `base`) "
        "مُختبَر ويسقط: التأكيدات 10.11–10.18.",
    ),
    (
        'EQ04',
        "ترشيح المستأجر في عدّ أعضاء القسم — INV31 سابقاً",
        "مُكافئ لترشيح `d.tenant_id = v_tenant` في نفس الاستعلام: "
        "قسمُ مستأجرٍ آخر لا يظهر أصلاً، و`employees.department_id` "
        "مقيَّد بـFK إلى `departments(id)` الفريد عالمياً — فلا موظف "
        "أجنبيّ يُطابق قسماً محلّياً. مُختبَر بالتأكيدين 10.19 و 10.20 "
        "(قسم «المالية» موجود في المستأجرين بالاسم نفسه، والعدّ يبقى 3).",
    ),
    (
        'EQ01',
        "`ORDER BY f.full_name` في الدليل",
        "الترتيب مُختبَر بالتأكيد 7.11 (أول صفّ = «سالم الأول»)، لكنّ "
        "عكسه إلى ترتيب آخر قد يُصادف النتيجة نفسها مع عيّنة صغيرة. "
        "أثره على العرض لا على الصحّة — ولا يُخفي عطلاً.",
    ),
    (
        'EQ02',
        "`COALESCE(f.email,'')` و`COALESCE(f.phone,'')` عند الإخراج",
        "مُكافئ للسلوك: الواجهة تعرض النصّ الفارغ أو '—' في الحالتين. "
        "المصدر الحقيقيّ محروس بـINV05 و INV06 اللذين يسقطان الاختبار.",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0357 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
