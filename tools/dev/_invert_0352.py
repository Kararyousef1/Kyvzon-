#!/usr/bin/env python3
"""
عكس إصلاحات 0352 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

الاستعمال:
    PGPORT=5463 python3 tools/dev/_invert_0352.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0352_training_management_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-training-management-0352.sql')

PGPORT = os.environ.get('PGPORT', '5463')
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
        'العطل ②: قراءة عمود خاطئ بدل certification_name',
        """    -- ★ العطل ②: `certification_name` لا `title`
    ec.certification_name::TEXT,""",
        """    COALESCE(ec.notes, '')::TEXT,""",
    ),
    (
        'INV02',
        'العطل ④: إسقاط تصنيف الصلاحية (كل شيء «سارية»)',
        """    CASE
      WHEN ec.expiry_date IS NULL                          THEN 'بلا انتهاء'
      WHEN ec.expiry_date <  CURRENT_DATE                  THEN 'منتهية'
      WHEN ec.expiry_date <= CURRENT_DATE + 30             THEN 'تنتهي قريباً'
      ELSE                                                      'سارية'
    END::TEXT,""",
        """    'سارية'::TEXT,""",
    ),
    (
        'INV03',
        'العطل ④: أيام الانتهاء تعود صفراً بدل الفرق الحقيقي',
        """    CASE WHEN ec.expiry_date IS NULL THEN NULL
         ELSE (ec.expiry_date - CURRENT_DATE)::INTEGER END,""",
        """    0::INTEGER,""",
    ),
    (
        'INV04',
        'العطل ⑤: إسقاط السلسلة الاحتياطية للاسم (full_name_ar فارغ)',
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
        'INV05',
        'العزل: إسقاط ترشيح المستأجر من قائمة الشهادات',
        """   WHERE ec.tenant_id = v_tenant
     AND (
       v_q IS NULL
       OR ec.certification_name ILIKE '%' || v_q || '%'""",
        """   WHERE (
       v_q IS NULL
       OR ec.certification_name ILIKE '%' || v_q || '%'""",
    ),
    (
        'INV06',
        'البحث في الشهادات لا يُرشِّح',
        """     AND (
       v_q IS NULL
       OR ec.certification_name ILIKE '%' || v_q || '%'
       OR COALESCE(ec.issued_by,'')      ILIKE '%' || v_q || '%'
       OR COALESCE(emp.display_name,'')  ILIKE '%' || v_q || '%'
     )""",
        """     AND TRUE""",
    ),
    (
        'INV07',
        'الترتيب: المنتهية لم تعد أولاً',
        """   ORDER BY
     CASE WHEN ec.expiry_date IS NULL THEN 2
          WHEN ec.expiry_date < CURRENT_DATE THEN 0
          ELSE 1 END,
     ec.expiry_date NULLS LAST,
     ec.issue_date DESC;""",
        """   ORDER BY ec.issue_date ASC;""",
    ),
    (
        'INV08',
        'العطل ③: «السارية» تعود مساوية للعدد الكلّي (approved:true)',
        """    (SELECT count(*)::INTEGER FROM public.employee_certifications ec
      WHERE ec.tenant_id = v_tenant
        AND (ec.expiry_date IS NULL OR ec.expiry_date > CURRENT_DATE + 30)),""",
        """    (SELECT count(*)::INTEGER FROM public.employee_certifications ec
      WHERE ec.tenant_id = v_tenant),""",
    ),
    (
        'INV09',
        'العطل ①: عدّ الدورات النشطة من عمود معدوم (سلوك active القديم)',
        """    (SELECT count(*)::INTEGER FROM public.courses c
      WHERE c.tenant_id = v_tenant AND c.status = 'active'),""",
        """    (SELECT count(*)::INTEGER FROM public.courses c
      WHERE c.tenant_id = v_tenant),""",
    ),
    (
        'INV10',
        'العطل ①: الإنشاء يتجاهل الحقول المُرسَلة',
        """      COALESCE(p_points, 0), COALESCE(p_mandatory, FALSE),
      NULLIF(btrim(COALESCE(p_instructor,'')),''),
      COALESCE(p_tags,'{}'), COALESCE(p_objectives,'{}'),""",
        """      0, FALSE,
      NULLIF(btrim(COALESCE(p_instructor,'')),''),
      '{}', '{}',""",
    ),
    (
        'INV11',
        'التعديل: إسقاط ترشيح المستأجر فيُعدَّل دورة أجنبية',
        """     WHERE c.id = p_id AND c.tenant_id = v_tenant
    RETURNING c.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
    END IF;""",
        """     WHERE c.id = p_id
    RETURNING c.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'الدورة غير موجودة أو لا تخصّ مستأجرك';
    END IF;""",
    ),
    (
        'INV12',
        'حراسة العنوان الفارغ في إنشاء الدورة',
        """  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'عنوان الدورة مطلوب';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV13',
        'حراسة النقاط السالبة',
        """  IF COALESCE(p_points, 0) < 0 THEN
    RAISE EXCEPTION 'النقاط لا تكون سالبة: %', p_points;
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV14',
        'حراسة النطاق المعكوس في الشهادة (انتهاء قبل إصدار)',
        """  IF p_issue_date IS NOT NULL AND p_expiry_date IS NOT NULL
     AND p_expiry_date < p_issue_date THEN
    RAISE EXCEPTION 'تاريخ الانتهاء (%) قبل تاريخ الإصدار (%)',
      p_expiry_date, p_issue_date;
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV15',
        'العزل: قبول نسب شهادة لموظف أجنبي',
        """    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = p_employee_id AND e.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'الموظف غير موجود أو لا يخصّ مستأجرك';
    END IF;""",
        """    -- (أُسقط)""",
    ),
    (
        'INV16',
        'حراسة اسم الشهادة الفارغ',
        """  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'اسم الشهادة مطلوب';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV17',
        'الصلاحية: إسقاط شرط staff من قائمة الشهادات',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض الشهادات';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV18',
        'الصلاحية: إسقاط شرط staff من المؤشّرات',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض مؤشّرات التدريب';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV19',
        'الصلاحية: إسقاط شرط staff من إنشاء الدورة',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة الدورات';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV20',
        'الصلاحية: إسقاط شرط staff من إضافة الشهادة',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية إدارة الشهادات';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV21',
        'الخصائص: إسقاط search_path من قائمة الشهادات',
        """LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');""",
        """LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');""",
    ),
]

# ───────────────────────────────────────────────────────────────────────────
# ★★★ عكوس مُصنَّفة EQUIVALENT — لا تُحتسب فشلاً، لكن لا تُخفى
# ───────────────────────────────────────────────────────────────────────────
#
# «حراسة مزدوجة»: شرطان يحرسان الحالة نفسها. تصنيفها EQUIVALENT مشروط
# بـ**إثبات** انعدام الأثر — لا بالافتراض.
#
# INV-EQ1 — حارس `p_level NOT IN (…)`:
#   المخطط فيه CHECK مُحقَّق:
#     CHECK (level = ANY (ARRAY['مبتدئ','متوسط','متقدم','خبير']))
#   ⇒ القيمة الخاطئة مرفوضة في الحالتين. الفارق رسالة عربية مفهومة
#     مقابل رسالة Postgres. الحارس يبقى لقيمة تجربة المستخدم، لكنه
#     **لا يُحتسب تغطية أمنية**.
#
# INV-EQ2 — حارس `p_status NOT IN (…)`:
#   نفس المنطق مع `courses_status_check` (أُثبت في 0351).
EQUIVALENT_INVERSIONS = [
    ('INV-EQ1', 'حارس p_level — مُكافئ لـ CHECK على courses.level',
     'المخطط يمنع القيمة نفسها؛ الفارق رسالة الخطأ فقط'),
    ('INV-EQ2', 'حارس p_status — مُكافئ لـ courses_status_check',
     'أُثبت في 0351؛ الفارق رسالة الخطأ فقط'),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0352 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
            ver = psql(VERIFY)
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
