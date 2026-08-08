#!/usr/bin/env python3
"""
عكس إصلاحات 0360 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`CREATE UNIQUE INDEX IF NOT
   EXISTS` يمنع إعادة الإنشاء ⇒ عكسُهما بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5485 python3 tools/dev/_invert_0360.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0360_employee_documents_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-employee-documents-0360.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-employee-documents-0360-rls.sh')

PGPORT = os.environ.get('PGPORT', '5485')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#
#   السبب مُثبَت لا مُفترَض — نمطان اكتشفهما أول تشغيل
#   للسكربت (نجَت جميعها ثم صُنِّفت):
#
#   · INV14  حارس `current_user_is_staff()` في `document_upload`:
#            ملف SQL يستدعيها بسياق **هدى (hr)** وهي staff فعلاً،
#            فالحارس لا يُلمَس. الموظف والمدير لا يظهران إلا في RLS.
#   · INV29  إسقاط `REVOKE … FROM anon`: الأثر على anon وحده، و`postgres`
#            لا يمرّ من هناك أبداً.
RLS_CHECK = {'INV01', 'INV14', 'INV29'}

# ★ القيدان يُختبَران بالكتابة المباشرة بدور authenticated — وملف SQL
#   لا يحاول تجاوزهما لأن `document_upload` تمنع القيمة قبل الوصول
#   إلى الجدول (INV13/INV10 يغطّيان الحارس، وهذان يغطّيان القيد).
DDL_RLS_CHECK = {'DDL03', 'DDL04'}


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


INVERSIONS = [
    (
        'INV01',
        '★★★ سياسة القراءة تعود بلا شرط السرّية (الموظف يقرأ ملفّه الطبّي)',
        """      OR (employee_id = public.current_user_employee_id()
          AND NOT is_confidential)""",
        """      OR (employee_id = public.current_user_employee_id())""",
    ),
    (
        'INV02',
        '★★★ اللوح يعود بلا شرط السرّية',
        """   AND (v_staff OR (d.employee_id = v_me AND NOT d.is_confidential))""",
        """   AND (v_staff OR d.employee_id = v_me)""",
    ),
    (
        'INV03',
        '★★★ اللوح يعود بلا فلتر الأرشفة (العطل ⑥: الأرشفة لا تُخفي)',
        """   AND d.is_archived = COALESCE(p_archived, FALSE)""",
        """   AND (p_archived IS NOT NULL OR TRUE)""",
    ),
    (
        'INV04',
        '★★★ المحفّز يتوقّف عن ملء uploaded_by (العطل ⑧)',
        """    NEW.uploaded_by := COALESCE(auth.uid(), NEW.uploaded_by);""",
        """    NEW.uploaded_by := NEW.uploaded_by;""",
    ),
    (
        'INV05',
        '★★★ الطبّي والتوصية لا يُرفَعان سرّيَّين تلقائياً',
        """    IF NEW.document_type IN ('medical','recommendation') THEN
      NEW.is_confidential := TRUE;
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV06',
        '★★ الرافع/المستأجر/الموظف لا يُجمَّدون بعد الإنشاء',
        """    NEW.uploaded_by := OLD.uploaded_by;
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;""",
        """    NULL;""",
    ),
    (
        'INV07',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑦)',
        """  RAISE EXCEPTION
    'DOCUMENT_DELETE_BLOCKED: وثيقة الموظف لا تُحذف — استخدم الأرشفة';""",
        """  RETURN OLD;""",
    ),
    (
        'INV08',
        '★★ document_upload يقبل موظفاً من مستأجر آخر (العطل ④)',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DOCUMENT_EMPLOYEE_NOT_FOUND';
  END IF;""",
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id) THEN
    RAISE EXCEPTION 'DOCUMENT_EMPLOYEE_NOT_FOUND';
  END IF;""",
    ),
    (
        'INV09',
        '★★ حارس النوع في الدالة يسقط (العطل ②)',
        """  IF p_type NOT IN ('contract','certificate','id_copy','cv',
                    'medical','degree','recommendation','other') THEN
    RAISE EXCEPTION 'DOCUMENT_TYPE_INVALID: %', p_type;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV10',
        '★★ حارس العنوان الفارغ يسقط',
        """  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'DOCUMENT_TITLE_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV11',
        '★★ حارس الملف الفارغ يسقط',
        """  IF btrim(COALESCE(p_file_url,'')) = '' THEN
    RAISE EXCEPTION 'DOCUMENT_FILE_REQUIRED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV12',
        '★★ حارس تاريخ الانتهاء الماضي يسقط',
        """  IF p_expires_at IS NOT NULL AND p_expires_at < v_today THEN
    RAISE EXCEPTION 'DOCUMENT_EXPIRY_IN_PAST';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV13',
        '★★ حارس الحجم في الدالة يسقط',
        """  IF p_file_size IS NOT NULL AND (p_file_size <= 0 OR p_file_size > 26214400) THEN
    RAISE EXCEPTION 'DOCUMENT_SIZE_INVALID';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV14',
        '★★★ حارس الدور في document_upload يسقط (الموظف يرفع لنفسه)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED: رفع مستندات الموظفين للموارد البشرية';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV15',
        '★★★ حارس الدور في document_set_confidential يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV16',
        '★★ قفل سرّية الطبّي/التوصية يسقط',
        """  IF p_value IS FALSE AND v_type IN ('medical','recommendation') THEN
    RAISE EXCEPTION 'DOCUMENT_CONFIDENTIAL_LOCKED: % سرّيٌّ دائماً', v_type;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV17',
        '★★ ترشيح المستأجر في document_set_confidential يسقط (تسريب عبر الشركات)',
        """  SELECT d.document_type INTO v_type
    FROM public.employee_documents d
   WHERE d.id = p_document_id AND d.tenant_id = v_tenant;""",
        """  SELECT d.document_type INTO v_type
    FROM public.employee_documents d
   WHERE d.id = p_document_id;""",
    ),
    (
        'INV18',
        '★★ ترشيح المستأجر في اللوح يسقط',
        """ WHERE d.tenant_id = v_tenant
   -- ★ العطل ①: غير الموظّف لا يرى السرّي""",
        """ WHERE (d.tenant_id = v_tenant OR TRUE)
   -- ★ العطل ①: غير الموظّف لا يرى السرّي""",
    ),
    (
        'INV19',
        '★★ ترشيح المستأجر في الملخّص يسقط',
        """  FROM public.employee_documents d
 WHERE d.tenant_id = v_tenant;
END $$;

COMMENT ON FUNCTION public.employee_documents_summary()""",
        """  FROM public.employee_documents d
 WHERE (d.tenant_id = v_tenant OR TRUE);
END $$;

COMMENT ON FUNCTION public.employee_documents_summary()""",
    ),
    (
        'INV20',
        '★★★ حارس الدور في الملخّص يسقط (الموظف يقرأ إحصاء الشركة)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص المستندات';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV21',
        '★★★ توقيت بغداد يسقط من اللوح — يُزاح v_today يوماً كاملاً',
        """  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY""",
        """  v_today  DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY""",
    ),
    (
        'INV22',
        '★★ نافذة الثلاثين يوماً تصير خمسة عشر (يوم 30 يخرج من expiring)',
        """      WHEN d.expires_at <= v_today + 30               THEN 'expiring'""",
        """      WHEN d.expires_at <= v_today + 15               THEN 'expiring'""",
    ),
    (
        'INV23',
        '★★ نافذة الثلاثين في الملخّص تصير خمسة عشر',
        """                       AND d.expires_at <= v_today + 30)::INTEGER,""",
        """                       AND d.expires_at <= v_today + 15)::INTEGER,""",
    ),
    (
        'INV24',
        '★★★ الترتيب الحتميّ يسقط (JOIN بلا ORDER BY — درس 0357)',
        """ ORDER BY d.created_at DESC, d.id DESC;""",
        """ ;""",
    ),
    (
        'INV25',
        '★★ الاحتياطيّ لاسم الموظف يسقط (full_name_ar = NULL لكل موظف)',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
             'موظف ' || e.employee_code)::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV27',
        '★★ ترشيح النوع في اللوح يصير بلا أثر',
        """   AND (p_type IS NULL OR d.document_type = p_type)""",
        """   AND (p_type IS NULL OR TRUE)""",
    ),
    (
        'INV29',
        '★★★ REVOKE عن anon يسقط عن اللوح (0268 يمنح كل شيء)',
        """REVOKE ALL ON FUNCTION public.employee_documents_board(TEXT, BOOLEAN) FROM anon;""",
        """GRANT EXECUTE ON FUNCTION public.employee_documents_board(TEXT, BOOLEAN) TO anon;""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط FK المركَّب (employee_id, tenant_id)',
        'ALTER TABLE public.employee_documents '
        'DROP CONSTRAINT IF EXISTS employee_documents_employee_tenant_fkey;',
        'ALTER TABLE public.employee_documents ADD CONSTRAINT '
        'employee_documents_employee_tenant_fkey FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL02',
        '★★★ إسقاط قيد نوع المستند',
        'ALTER TABLE public.employee_documents '
        'DROP CONSTRAINT IF EXISTS employee_documents_type_chk;',
        "ALTER TABLE public.employee_documents ADD CONSTRAINT "
        "employee_documents_type_chk CHECK (document_type IN "
        "('contract','certificate','id_copy','cv','medical','degree',"
        "'recommendation','other'));",
    ),
    (
        'DDL03',
        '★★ إسقاط قيد الحجم',
        'ALTER TABLE public.employee_documents '
        'DROP CONSTRAINT IF EXISTS employee_documents_size_chk;',
        'ALTER TABLE public.employee_documents ADD CONSTRAINT '
        'employee_documents_size_chk CHECK (file_size IS NULL OR '
        '(file_size > 0 AND file_size <= 26214400));',
    ),
    (
        'DDL04',
        '★★ إسقاط قيد العنوان/الرابط غير الفارغين',
        'ALTER TABLE public.employee_documents '
        'DROP CONSTRAINT IF EXISTS employee_documents_title_chk;',
        "ALTER TABLE public.employee_documents ADD CONSTRAINT "
        "employee_documents_title_chk CHECK (btrim(title) <> '' "
        "AND btrim(file_url) <> '');",
    ),
    (
        'DDL05',
        '★★ إعادة tenant_id إلى NULLABLE',
        'ALTER TABLE public.employee_documents ALTER COLUMN tenant_id DROP NOT NULL;',
        'ALTER TABLE public.employee_documents ALTER COLUMN tenant_id SET NOT NULL;',
    ),
]

# ★ عكسٌ لا يُسقط الاختبار لسببٍ **مُثبَت بنيوياً** لا لأنّ الشرط غير مختبَر.
EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        'إسقاط `uq_employees_id_tenant` وحده',
        'الفهرس الفريد ليس إصلاحاً في ذاته — هو **شرطُ وجود** لـDDL01. '
        'إسقاطه بلا إسقاط FK مستحيل: Postgres يرفض '
        '`DROP INDEX` بـ«cannot drop index … because constraint '
        'employee_documents_employee_tenant_fkey requires it». '
        'مُثبَت تشغيلياً: أثرُه مغطّى كاملاً بـDDL01.'
    ),
    (
        'EQ04',
        'إسقاط `GRANT EXECUTE … TO authenticated` عن `employee_documents_board`',
        '★★★ نجا حتى بفحص RLS، والسبب مُثبَت بالاستعلام لا بالتخمين: '
        '`0268` نفّذ `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS`، '
        'و`pg_default_acl` يُظهر الآن حرفياً: '
        '`f | postgres | anon=X/postgres authenticated=X/postgres '
        'service_role=X/postgres`. ⇒ **كل دالة جديدة تُولَد ومعها EXECUTE '
        'لـauthenticated تلقائياً.** أثبتُّه بمسبار: دالة أُنشئت ثم '
        '`REVOKE ALL … FROM PUBLIC` و`FROM anon` **بلا أيّ GRANT** ⇒ '
        "`has_function_privilege('authenticated', …, 'EXECUTE') = true`. "
        '★ فالمنحة الصريحة **تحصيل حاصل** لا يمكن لاختبارٍ أن يُسقطه. '
        '★★ وتبقى في الشيفرة عمداً: إن أُلغيت الصلاحية الافتراضية يوماً '
        'صارت هي المصدر الوحيد. ★★★ أمّا `REVOKE … FROM anon` فليس تحصيل '
        'حاصل إطلاقاً — نفس المسبار أعطى `anon = false` **بعد** الـREVOKE، '
        'وعكسه (INV29) أسقط سكربت RLS فعلاً.'
    ),
    (
        'EQ03',
        'إسقاط شرط المستأجر من JOIN الموظف داخل اللوح '
        '(`ON e.id = d.employee_id AND e.tenant_id = d.tenant_id` ⇒ '
        '`ON e.id = d.employee_id`)',
        '★ نجا في أول تشغيل، والسبب **بنيويّ مُثبَت** لا نقصٌ في التغطية: '
        '`employees_pkey` مفتاحٌ أساسيّ على `id` **وحده** (مُحقَّق: '
        "conkey = {attnum(id)}) ⇒ `e.id = d.employee_id` يحدّد صفّاً واحداً "
        'لا غير، فإضافة `AND e.tenant_id = d.tenant_id` لا تستطيع تغيير '
        'أيّ صفٍّ يُنتَقى. ★★ وأكثر: `employee_documents_employee_tenant_fkey` '
        'مُصادَق (`convalidated = true`) ويضمن أنّ `(employee_id, tenant_id)` '
        'موجودة في `employees` بالزوج نفسه ⇒ الشرط **صحيحٌ حتماً** لكل صفّ. '
        '★★★ فلا يمكن أن توجد بيانات تخالفه ما دام FK قائماً — وإسقاط FK '
        'مُغطًّى بـDDL01. أي أنّ الشرط دفاعٌ عميق لا منطق: لو سقط FK يوماً '
        'لصار الشرط هو الحارس الوحيد، ولذلك يبقى في الشيفرة.'
    ),
    (
        'EQ02',
        'إسقاط الفهرسين الجزئيَّين idx_employee_documents_active/_expiry',
        'فهارس أداءٍ محضة لا تغيّر نتيجة أي استعلام — الخطط تسقط إلى Seq Scan '
        'على عيّنة من سبعة صفوف. ★ ولا يوجد في اللوح `LIMIT` بلا `ORDER BY` '
        '(درس 0357: `ORDER BY d.created_at DESC, d.id DESC` حتميّ) ⇒ لا قلبَ '
        'للنتيجة. عكسُهما مغطّى ضمنياً بالتأكيد 13.4.'
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0360 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
