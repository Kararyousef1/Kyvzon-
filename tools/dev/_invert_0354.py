#!/usr/bin/env python3
"""
عكس إصلاحات 0354 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ العطل ① (تسريب السِيَر) يُقاس بملفَّين:
   · verify-talent-market-0354.sql      — حارس الدور داخل الدالة
   · verify-talent-market-0354-rls.sh   — الإثبات بدور authenticated
   بعض العكوس تُقاس بالثاني لأن الأول يعمل بدور postgres (BYPASSRLS).

الاستعمال:
    PGPORT=5470 python3 tools/dev/_invert_0354.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0354_talent_market_privacy.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-talent-market-0354.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-talent-market-0354-rls.sh')

PGPORT = os.environ.get('PGPORT', '5470')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★ العكوس التي لا يراها ملف الـSQL (يعمل بـBYPASSRLS) تُقاس بسكربت RLS
RLS_CHECK = {'INV01', 'INV02', 'INV12'}


def psql(path):
    return subprocess.run(
        ['psql', '-h', PGSOCK, '-p', PGPORT, '-U', 'postgres', '-q',
         '-v', 'ON_ERROR_STOP=1', '-f', path],
        capture_output=True, text=True, env=ENV, timeout=180)


def run_rls():
    return subprocess.run(['bash', VERIFY_RLS],
                          capture_output=True, text=True, env=ENV, timeout=300)


INVERSIONS = [
    (
        'INV01',
        '★★★ إسقاط حارس الدور من القائمة (يعود تسريب السِيَر للجميع)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض سجل مؤهلات الموظفين';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV02',
        '★★★ الموظف يقرأ سيرة زميله (إسقاط حارس التفاصيل)',
        """  IF NOT v_staff AND p_profile_id IS DISTINCT FROM v_self THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض السيرة الذاتية لموظف آخر';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV03',
        'إسقاط حارس الدور من الإحصاءات',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض إحصاءات المؤهلات';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV04',
        '★★★ الأرشيف يعود ظاهراً في القائمة',
        """           (COALESCE(p.cv_data, '{}'::jsonb) - '__archived') AS cv,
           public.cv_skill_names(p.cv_data) AS skills""",
        """           COALESCE(p.cv_data, '{}'::jsonb) AS cv,
           public.cv_skill_names(p.cv_data) AS skills""",
    ),
    (
        'INV05',
        'الأرشيف يتسرّب في التفاصيل',
        """         (COALESCE(p.cv_data, '{}'::jsonb) - '__archived')
    FROM public.profiles p
   WHERE p.id = p_profile_id""",
        """         COALESCE(p.cv_data, '{}'::jsonb)
    FROM public.profiles p
   WHERE p.id = p_profile_id""",
    ),
    (
        'INV06',
        'العطل ②: بحث المهارة لا يُرشِّح (يعود إلى المتصفح)',
        """       v_q IS NULL
       OR EXISTS (SELECT 1 FROM unnest(b.skills) AS s(nm)
                   WHERE s.nm ILIKE '%' || v_q || '%')""",
        """       TRUE""",
    ),
    (
        'INV07',
        'البحث النصّي بالاسم/المنصب لا يُرشِّح',
        """       v_txt IS NULL
       OR COALESCE(b.full_name, '') ILIKE '%' || v_txt || '%'
       OR COALESCE(b.position, '')  ILIKE '%' || v_txt || '%'""",
        """       TRUE""",
    ),
    (
        'INV08b',
        '★★★ توسيع p_skill ليشمل الاسم (يُطابق سيرةً مؤرشفة)',
        """       OR EXISTS (SELECT 1 FROM unnest(b.skills) AS s(nm)
                   WHERE s.nm ILIKE '%' || v_q || '%')
     )
     AND (""",
        """       OR EXISTS (SELECT 1 FROM unnest(b.skills) AS s(nm)
                   WHERE s.nm ILIKE '%' || v_q || '%')
       OR COALESCE(b.full_name, '') ILIKE '%' || v_q || '%'
     )
     AND (""",
    ),
    (
        'INV08',
        'العدد الكلّي يعود عدد الصفحة لا الإجمالي',
        """  counted AS (SELECT count(*) AS n FROM filtered)""",
        """  counted AS (SELECT LEAST(count(*), 2) AS n FROM filtered)""",
    ),
    (
        'INV09',
        '★★★ حارس نوع languages مُسقَط (تسقط الدالة على شكل شاذّ)',
        """             CASE WHEN jsonb_typeof(b.cv -> 'languages') = 'array'
                  THEN b.cv -> 'languages' ELSE '[]'::jsonb END) AS l(value)""",
        """             COALESCE(b.cv -> 'languages', '[]'::jsonb)) AS l(value)""",
    ),
    (
        'INV10',
        'الإحصاءات تعدّ مهارات الأرشيف',
        """           public.cv_skill_names(p.cv_data) AS skills
      FROM public.profiles p
     WHERE p.tenant_id = v_tenant
  ),
  sk AS (""",
        """           public.cv_skill_names(
             COALESCE(p.cv_data, '{}'::jsonb) #> '{__archived,cv}') AS skills
      FROM public.profiles p
     WHERE p.tenant_id = v_tenant
  ),
  sk AS (""",
    ),
    (
        'INV11',
        'العزل: إسقاط ترشيح المستأجر من القائمة',
        """      FROM public.profiles p
     WHERE p.tenant_id = v_tenant
  ),
  filtered AS (""",
        """      FROM public.profiles p
  ),
  filtered AS (""",
    ),
    (
        'INV12',
        '★★★ العزل: التفاصيل بلا ترشيح مستأجر (تسريب عابر)',
        """   WHERE p.id = p_profile_id
     AND p.tenant_id = v_tenant;""",
        """   WHERE p.id = p_profile_id;""",
    ),
    (
        'INV13',
        'العزل: إسقاط ترشيح المستأجر من الإحصاءات',
        """      FROM public.profiles p
     WHERE p.tenant_id = v_tenant
  ),
  sk AS (""",
        """      FROM public.profiles p
  ),
  sk AS (""",
    ),
    # ★ INV14 نُقل إلى EQUIVALENT_INVERSIONS — تكافؤ دلالي مُثبَت.
    (
        'INV15',
        'الخصائص: إسقاط SECURITY DEFINER من القائمة',
        """LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID    := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));""",
        """LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant UUID    := public.current_user_tenant_id();
  v_lim    INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));""",
    ),
    (
        'INV16',
        'الخصائص: إسقاط REVOKE فيعود anon ينفّذ',
        """REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_talent_profiles(TEXT,INTEGER,INTEGER,TEXT) FROM anon;""",
        """-- (أُسقط)""",
    ),
]


# ───────────────────────────────────────────────────────────────────────────
# ★★★ عكوس مُصنَّفة EQUIVALENT — لا تُحتسب فشلاً، لكن لا تُخفى
# ───────────────────────────────────────────────────────────────────────────
#
# INV14 — اشتقاق أسماء المهارات من `f.cv` (بعد حذف `__archived`) بدل
#   `f.skills` المحسوبة من `cv_data` الكامل.
#
#   ظننتُه يُعيد تسريب الأرشيف. **الفحص أثبت العكس**:
#     cv_skill_names('{"__archived":{"cv":{"skills":[…]}}}')  ⇒ {}
#     cv_skill_names('{"__archived":…}' - '__archived')       ⇒ {}
#
#   السبب: `cv_skill_names` تقرأ المفتاح `skills` في **الجذر** فقط
#   (مُحقَّق من جسمها)، وحذف `__archived` لا يمسّ الجذر إطلاقاً. فالصيغتان
#   تُنتجان النتيجة نفسها لكل شكل سيرة ممكن.
#
#   ⇒ تكافؤ دلاليّ حقيقي لا نقص تغطية. الصيغة الحالية أوضح (تُعيد
#     استعمال القيمة المحسوبة مرّة واحدة في `base`) وأسرع، لكن لا يجوز
#     الادّعاء بأنها «مُختبَرة» — فهي ليست كذلك.
EQUIVALENT_INVERSIONS = [
    ('INV14', 'اشتقاق المهارات من cv بدل skills — تكافؤ دلاليّ',
     'cv_skill_names تقرأ الجذر فقط؛ حذف __archived لا يُغيّر النتيجة'),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0354 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql(MIG)
    base = psql(VERIFY)
    base_rls = run_rls()
    if base.returncode != 0 or base_rls.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print((base.stdout + base.stderr)[-1500:])
        print((base_rls.stdout + base_rls.stderr)[-1500:])
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
                m = re.search(r'SENTINEL_\w+', ver.stdout + ver.stderr)
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
