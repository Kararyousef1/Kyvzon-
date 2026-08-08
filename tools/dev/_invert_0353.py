#!/usr/bin/env python3
"""
عكس إصلاحات 0353 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ تنبيه بنيوي (درس 0350): عناصر DDL — `ADD COLUMN` و`CREATE TABLE`
   و`ADD CONSTRAINT` — **لا تُعكَس بإعادة تطبيق المايجريشن** لأنها
   `IF NOT EXISTS`. لذلك عكوسها تُنفَّذ بـSQL صريح ثم تُسترجَع.

الاستعمال:
    PGPORT=5466 python3 tools/dev/_invert_0353.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0353_training_missing_columns.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-training-columns-0353.sql')

PGPORT = os.environ.get('PGPORT', '5466')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP


def psql_file(path):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV, timeout=180)


def psql_sql(sql):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-c', sql],
        capture_output=True, text=True, env=ENV, timeout=180)


# ───────────────────────────────────────────────────────────────────────────
# (أ) عكوس نصّية — أجسام الدوال
# ───────────────────────────────────────────────────────────────────────────

TEXT_INVERSIONS = [
    (
        'INV01',
        '★★★ المتوسط يُدخل غير المُختبَرين بصفر (العطل الأصلي بثوب جديد)',
        """      round(avg(score), 1)                                     AS avg_score,""",
        """      round(avg(COALESCE(score, 0)), 1)                        AS avg_score,""",
    ),
    (
        'INV02',
        'avg_score تعود صفراً بدل NULL حين لا عيّنة',
        """    agg.avg_score,
    COALESCE(agg.scored_count, 0),""",
        """    COALESCE(agg.avg_score, 0),
    COALESCE(agg.scored_count, 0),""",
    ),
    (
        'INV03',
        'عدّ المُختبَرين يعدّ الكلّ بدل count(score)',
        """      count(score)::INTEGER                                    AS scored_count,""",
        """      count(*)::INTEGER                                        AS scored_count,""",
    ),
    (
        'INV04',
        'الوقت الكلّي يعود صفراً',
        """      sum(time_spent)::BIGINT                                  AS total_time""",
        """      0::BIGINT                                                AS total_time""",
    ),
    (
        'INV05',
        'المشاركون: score تُحوَّل صفراً فيضيع تمييز «لم يُختبَر»',
        """    -- ★ NULL محفوظة: «لم يُختبَر» ≠ «صفر»
    cp.score,""",
        """    COALESCE(cp.score, 0),""",
    ),
    (
        'INV06',
        '★★★ نبضة الوقت تستبدل بدل أن تُراكم',
        """    SET time_spent     = cp.time_spent + EXCLUDED.time_spent,""",
        """    SET time_spent     = EXCLUDED.time_spent,""",
    ),
    (
        'INV07',
        '★★★ التقدّم يتراجع بنبضة متأخّرة (لا GREATEST)',
        """        progress       = GREATEST(cp.progress, COALESCE(p_progress, cp.progress)),""",
        """        progress       = COALESCE(p_progress, cp.progress),""",
    ),
    (
        'INV08',
        'last_access_at لا يُكتب',
        """        last_access_at = NOW(),
        updated_at     = NOW();""",
        """        updated_at     = NOW();""",
    ),
    (
        'INV09',
        'حدّ النبضة العلوي (3600) مُسقَط',
        """  IF p_seconds > 3600 THEN
    RAISE EXCEPTION 'نبضة وقت غير معقولة (% ثانية) — الحدّ 3600', p_seconds;
  END IF;""",
        """  -- (أُسقط)""",
    ),
    # ★ INV10 نُقل إلى EQUIVALENT_INVERSIONS — حراسة مزدوجة مُثبتة.
    (
        'INV11',
        'العزل: النبضة تُقبل على دورة أجنبية',
        """  IF NOT EXISTS (
    SELECT 1 FROM public.courses c
     WHERE c.id = p_course_id AND c.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV12',
        '★★★ آخر درجة بدل أفضل درجة',
        """  SELECT max(a.score) INTO v_best
    FROM public.quiz_attempts a
   WHERE a.tenant_id = v_tenant AND a.quiz_id = p_quiz_id
     AND a.employee_id = v_emp;""",
        """  v_best := p_score;""",
    ),
    (
        'INV13',
        'رقم المحاولة ثابت 1 (سباق التزامن)',
        """  SELECT COALESCE(max(a.attempt_number), 0) + 1 INTO v_n
    FROM public.quiz_attempts a
   WHERE a.tenant_id = v_tenant AND a.quiz_id = p_quiz_id
     AND a.employee_id = v_emp;""",
        """  v_n := 1;""",
    ),
    (
        'INV14',
        'النجاح يتجاهل passing_score',
        """  v_passed := p_score >= v_pass;""",
        """  v_passed := TRUE;""",
    ),
    # ★ INV15 نُقل إلى EQUIVALENT_INVERSIONS — حراسة مزدوجة مُثبتة.
    (
        'INV16',
        '★★★ الخصوصية: موظف يقرأ محاولات زميله',
        """  IF NOT v_staff AND p_employee_id IS NOT NULL AND p_employee_id <> v_self THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض محاولات موظف آخر';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV17',
        'العزل: إسقاط ترشيح المستأجر من المحاولات',
        """   WHERE a.tenant_id = v_tenant
     AND (p_quiz_id IS NULL OR a.quiz_id = p_quiz_id)""",
        """   WHERE (p_quiz_id IS NULL OR a.quiz_id = p_quiz_id)""",
    ),
    (
        'INV18',
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
        'INV19',
        'الخصائص: إسقاط search_path من نبضة الوقت',
        """LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();""",
        """LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();""",
    ),
    (
        'INV26',
        '★★★ rich_content لا يُكتب عند الإنشاء (يعود «الحفظ في الفراغ»)',
        """      p_status, v_rich, NOW(), NOW())""",
        """      p_status, '{"blocks":[]}'::jsonb, NOW(), NOW())""",
    ),
    (
        'INV27',
        '★★★ التعديل بـNULL يمحو المحتوى بدل «لا تُغيّر»',
        """           rich_content   = COALESCE(p_rich_content, c.rich_content),""",
        """           rich_content   = COALESCE(p_rich_content, '{"blocks":[]}'::jsonb),""",
    ),
    # ★ INV28 نُقل إلى EQUIVALENT_INVERSIONS — حراسة مزدوجة مُثبتة.
]

# ───────────────────────────────────────────────────────────────────────────
# (ب) عكوس بنيوية — DDL لا يُعكَس بإعادة التطبيق
# ───────────────────────────────────────────────────────────────────────────


# ───────────────────────────────────────────────────────────────────────────
# ★★★ عكوس مُصنَّفة EQUIVALENT — لا تُحتسب فشلاً، لكن لا تُخفى
# ───────────────────────────────────────────────────────────────────────────
#
# «حراسة مزدوجة»: شرطان يحرسان الحالة نفسها. تصنيفها EQUIVALENT مشروط
# بـ**إثبات** انعدام الأثر — لا بالافتراض.
#
# INV10 — حارس `p_seconds < 0` في training_progress_touch:
#   مُثبَت بالتشغيل أن القاعدة ترفض القيمة نفسها بلا الحارس:
#     INSERT INTO course_progress(…, time_spent) VALUES (…, -5)
#       ⇒ ERROR: new row … violates check constraint
#                "course_progress_time_spent_nonneg"
#
# INV15 — حارس `p_score` خارج 0..100 في training_quiz_submit:
#     INSERT INTO quiz_attempts(…, score) VALUES (…, 150)
#       ⇒ ERROR: new row … violates check constraint
#                "quiz_attempts_score_range"
#
#   ⇒ **لا قيمة مستحيلة تمرّ في الحالتين.** الفارق رسالة عربية مفهومة
#     مقابل رسالة Postgres. الحارسان يبقيان لقيمة تجربة المستخدم لكنهما
#     **لا يُحتسبان تغطية أمنية** — والقيدان هما الحارس الفعلي،
#     وعكسهما (INV25 و INV21) يُسقط الاختبار فعلاً.
EQUIVALENT_INVERSIONS = [
    ('INV10', 'حارس p_seconds — مُكافئ لـ course_progress_time_spent_nonneg',
     'القاعدة ترفض القيمة نفسها؛ الفارق رسالة الخطأ فقط'),
    ('INV15', 'حارس p_score — مُكافئ لـ quiz_attempts_score_range',
     'القاعدة ترفض القيمة نفسها؛ الفارق رسالة الخطأ فقط'),
    # INV28 — حارس شكل rich_content في training_course_upsert:
    #   مُثبَت بالتشغيل بلا الحارس:
    #     INSERT INTO courses(…, rich_content) VALUES (…, '[]'::jsonb)
    #       ⇒ ERROR: new row … violates check constraint
    #                "courses_rich_content_shape"
    ('INV28', 'حارس شكل rich_content — مُكافئ لـ courses_rich_content_shape',
     'القاعدة ترفض الشكل نفسه؛ الفارق رسالة الخطأ فقط'),
]

DDL_INVERSIONS = [
    (
        'INV20',
        '★★★ score يصير NOT NULL DEFAULT 0 (يضيع تمييز «لم يُختبَر»)',
        """UPDATE public.course_progress SET score = 0 WHERE score IS NULL;
           ALTER TABLE public.course_progress ALTER COLUMN score SET DEFAULT 0;
           ALTER TABLE public.course_progress ALTER COLUMN score SET NOT NULL;""",
        """ALTER TABLE public.course_progress ALTER COLUMN score DROP NOT NULL;
           ALTER TABLE public.course_progress ALTER COLUMN score DROP DEFAULT;""",
    ),
    (
        'INV21',
        'قيد مدى الدرجة مُسقَط',
        """ALTER TABLE public.course_progress DROP CONSTRAINT course_progress_score_range;""",
        """ALTER TABLE public.course_progress
             ADD CONSTRAINT course_progress_score_range
             CHECK (score IS NULL OR (score >= 0 AND score <= 100));""",
    ),
    (
        'INV22',
        'قيد شكل rich_content مُسقَط',
        """ALTER TABLE public.courses DROP CONSTRAINT courses_rich_content_shape;""",
        """ALTER TABLE public.courses
             ADD CONSTRAINT courses_rich_content_shape
             CHECK (jsonb_typeof(rich_content) = 'object'
                    AND jsonb_typeof(rich_content -> 'blocks') = 'array');""",
    ),
    (
        'INV23',
        'قيد مدى التقدّم مُسقَط',
        """ALTER TABLE public.course_progress DROP CONSTRAINT course_progress_progress_range;""",
        """ALTER TABLE public.course_progress
             ADD CONSTRAINT course_progress_progress_range
             CHECK (progress >= 0 AND progress <= 100);""",
    ),
    (
        'INV24',
        '★★★ سياسة تعديل على المحاولات (سجلّ اختبار يُعدَّل)',
        """CREATE POLICY kyvzon_quiz_attempts_update ON public.quiz_attempts
             FOR UPDATE USING (tenant_id = public.current_user_tenant_id());""",
        """DROP POLICY IF EXISTS kyvzon_quiz_attempts_update ON public.quiz_attempts;""",
    ),
    (
        'INV25',
        'قيد الوقت غير السالب مُسقَط',
        """ALTER TABLE public.course_progress DROP CONSTRAINT course_progress_time_spent_nonneg;""",
        """ALTER TABLE public.course_progress
             ADD CONSTRAINT course_progress_time_spent_nonneg CHECK (time_spent >= 0);""",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0353 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql_file(MIG)
    base = psql_file(VERIFY)
    if base.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print((base.stdout + base.stderr)[-2000:])
        return 1
    print('✔ خطّ الأساس: الاختبار ينجح قبل أي عكس\n')

    for ident, desc, old, new in TEXT_INVERSIONS:
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
            ap = psql_file(tmp)
            if ap.returncode != 0:
                results.append((ident, desc, 'FAILED_AS_EXPECTED'))
                print(f'✔ {ident}  FAILED_AS_EXPECTED (رفضته القاعدة عند التطبيق)')
                print(f'   {desc}')
                continue
            ver = psql_file(VERIFY)
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
            psql_file(MIG)

    for ident, desc, break_sql, restore_sql in DDL_INVERSIONS:
        br = psql_sql(break_sql)
        if br.returncode != 0:
            print(f'✖ {ident}: تعذّر تنفيذ العكس البنيوي — '
                  f'{br.stderr.strip()[:120]}')
            results.append((ident, desc, 'NO_MATCH'))
            continue

        ver = psql_file(VERIFY)
        if ver.returncode != 0:
            m = re.search(r'SENTINEL_\w+', ver.stdout + ver.stderr)
            print(f'✔ {ident}  FAILED_AS_EXPECTED  ⇒ {m.group(0) if m else "؟"}')
            print(f'   {desc}')
            results.append((ident, desc, 'FAILED_AS_EXPECTED'))
        else:
            print(f'✖ {ident}  SURVIVED — الاختبار نجح رغم العكس!')
            print(f'   {desc}')
            results.append((ident, desc, 'SURVIVED'))

        rs = psql_sql(restore_sql)
        assert rs.returncode == 0, f'{ident}: تعذّر الاسترجاع — {rs.stderr}'

    open(MIG, 'w', encoding='utf-8').write(original)
    psql_file(MIG)
    final = psql_file(VERIFY)

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
