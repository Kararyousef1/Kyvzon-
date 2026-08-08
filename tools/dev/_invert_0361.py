#!/usr/bin/env python3
"""
عكس إصلاحات 0361 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`CREATE UNIQUE INDEX IF NOT
   EXISTS` يمنع إعادة الإنشاء ⇒ عكسُهما بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5490 python3 tools/dev/_invert_0361.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0361_succession_planning_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-succession-planning-0361.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-succession-planning-0361-rls.sh')

PGPORT = os.environ.get('PGPORT', '5490')
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
#   السبب مُثبَت لا مُفترَض (درس 0360):
#   · INV_ROLE_*  ملف SQL يستدعي الدوال بسياق **هدى (hr)** وهي staff
#                 فعلاً، فحارس الدور لا يُلمَس. الموظف والمدير لا
#                 يظهران إلا في سكربت RLS.
#   · INV_ANON    الأثر على anon وحده، و`postgres` لا يمرّ من هناك.
RLS_CHECK = {'INV19', 'INV20', 'INV21', 'INV22'}
DDL_RLS_CHECK: set = set()


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
        '★★★ رتبة الجاهزية تعود أبجدية — «جاهز الآن» يُقصى من العرض',
        """  SELECT CASE p_level
    WHEN 'ready_now'       THEN 1
    WHEN 'ready_6_months'  THEN 2
    WHEN 'ready_12_months' THEN 3
    WHEN 'future_potential' THEN 4
    ELSE 9 END;""",
        """  SELECT CASE p_level
    WHEN 'future_potential' THEN 1
    WHEN 'ready_12_months' THEN 2
    WHEN 'ready_6_months'  THEN 3
    WHEN 'ready_now'       THEN 4
    ELSE 9 END;""",
    ),
    (
        'INV02',
        '★★★ ترتيب المرشّحين داخل اللوح يعود أبجدياً (العطل ①)',
        """             ORDER BY public.succession_readiness_rank(c.readiness_level),
                      c.readiness_score DESC, c.id""",
        """             ORDER BY c.readiness_level""",
    ),
    (
        'INV03',
        '★★★ اللوح يعود بلا فلتر status (العطل ⑫ — تناقض مع الملخّص)',
        """       AND (p_status IS NULL OR p.status = p_status)""",
        """       AND (p_status IS NULL OR TRUE)""",
    ),
    (
        'INV04',
        '★★★ اللوح يعود يعدّ المرشّح المعطَّل (العطل ⑬)',
        """     WHERE c.tenant_id = v_tenant AND c.status = 'active'
     GROUP BY c.critical_position_id""",
        """     WHERE c.tenant_id = v_tenant
     GROUP BY c.critical_position_id""",
    ),
    (
        'INV05',
        '★★★ الملخّص يعود يعدّ المنصب المغلق (العطل ⑫)',
        """  act AS (SELECT * FROM pos WHERE status = 'active'),""",
        """  act AS (SELECT * FROM pos),""",
    ),
    (
        'INV06',
        '★★★ الملخّص يعود يعدّ المرشّح المعطَّل (العطل ⑬)',
        """     WHERE c.tenant_id = v_tenant AND c.status = 'active'
  )""",
        """     WHERE c.tenant_id = v_tenant
  )""",
    ),
    (
        'INV07',
        '★★★ محفّز خلافة النفس يصير بلا أثر (العطل ⑦)',
        """  IF v_incumbent IS NOT NULL AND v_incumbent = NEW.employee_id THEN
    RAISE EXCEPTION
      'SUCCESSION_SELF_NOMINATION: الشاغل الحالي لا يكون خليفة نفسه';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV08',
        '★★ الحارس المعاكس يسقط (المرشّح النشط يصير شاغلاً)',
        """  IF NEW.incumbent_employee_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.succession_candidates c
                  WHERE c.critical_position_id = NEW.id
                    AND c.employee_id = NEW.incumbent_employee_id
                    AND c.status = 'active') THEN
    RAISE EXCEPTION
      'SUCCESSION_INCUMBENT_IS_CANDIDATE: المرشّح النشط لا يصير شاغلاً بلا إلغاء ترشيحه';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV09',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑩)',
        """  RAISE EXCEPTION
    'SUCCESSION_DELETE_BLOCKED: خطة التعاقب لا تُحذف — استخدم الإلغاء أو الإغلاق';""",
        """  RETURN OLD;""",
    ),
    (
        'INV10',
        '★★ حارس الشاغل في upsert يسقط (العطل ③)',
        """  IF p_incumbent IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e
                      WHERE e.id = p_incumbent AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_INCUMBENT_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV11',
        '★★ حارس القسم في upsert يسقط (العطل ②)',
        """  IF p_department IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d
                      WHERE d.id = p_department AND d.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_DEPARTMENT_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV12',
        '★★★ حارس المرشّح في nominate يسقط (العطلان ④/⑤)',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_EMPLOYEE_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV13',
        '★★★ ترشيح المستأجر في حارس المنصب يسقط (العطل ⑥)',
        """  IF NOT EXISTS (SELECT 1 FROM public.critical_positions p
                  WHERE p.id = p_position AND p.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'SUCCESSION_POSITION_NOT_FOUND';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV14',
        '★★ حارس اتّساق الدرجة/المستوى في الدالة يسقط (العطل ⑧)',
        """  IF p_score < v_min THEN
    RAISE EXCEPTION 'SUCCESSION_SCORE_LEVEL_MISMATCH: % يحتاج % فأعلى',
      p_level, v_min;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV15',
        '★★ حارس مدى الدرجة يسقط',
        """  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'SUCCESSION_SCORE_RANGE';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV16',
        '★★ حارس مفردات المستوى يسقط',
        """  IF p_level NOT IN ('ready_now','ready_6_months','ready_12_months','future_potential') THEN
    RAISE EXCEPTION 'SUCCESSION_LEVEL_INVALID: %', p_level;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV17',
        '★★★ ترشيح المستأجر في اللوح يسقط',
        """      FROM public.critical_positions p
     WHERE p.tenant_id = v_tenant
       AND (p_risk IS NULL OR p.risk_level = p_risk)""",
        """      FROM public.critical_positions p
     WHERE (p.tenant_id = v_tenant OR TRUE)
       AND (p_risk IS NULL OR p.risk_level = p_risk)""",
    ),
    (
        'INV18',
        '★★★ ترشيح المستأجر في الملخّص يسقط',
        """    SELECT p.id, p.risk_level, p.status
      FROM public.critical_positions p
     WHERE p.tenant_id = v_tenant
  ),""",
        """    SELECT p.id, p.risk_level, p.status
      FROM public.critical_positions p
     WHERE (p.tenant_id = v_tenant OR TRUE)
  ),""",
    ),
    (
        'INV19',
        '★★★ حارس الدور في اللوح يسقط (الموظف يقرأ خطط الشركة)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بلوح التعاقب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV20',
        '★★★ حارس الدور في الملخّص يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص التعاقب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV21',
        '★★★ حارس الدور في upsert يسقط (المدير يُنشئ مناصب)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SUCCESSION_NOT_AUTHORIZED';
  END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN""",
        """  NULL;
  IF btrim(COALESCE(p_title,'')) = '' THEN""",
    ),
    (
        'INV22',
        '★★★ REVOKE عن anon يسقط عن اللوح (0268 يمنح كل شيء)',
        """REVOKE ALL ON FUNCTION public.succession_board(TEXT, TEXT, TEXT, INTEGER) FROM anon;""",
        """GRANT EXECUTE ON FUNCTION public.succession_board(TEXT, TEXT, TEXT, INTEGER) TO anon;""",
    ),
    (
        'INV23',
        '★★ الترتيب الحتميّ في اللوح يسقط (درس 0357)',
        """ ORDER BY (COALESCE(c.total,0) = 0) DESC,
          CASE b.risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                            WHEN 'medium' THEN 3 ELSE 4 END,
          b.created_at DESC, b.id DESC""",
        """ ORDER BY b.title""",
    ),
    (
        'INV24',
        '★★ الاحتياطيّ لاسم المرشّح يسقط (full_name_ar = NULL لكل موظف)',
        """               'employeeName', COALESCE(
                 NULLIF(btrim(e.full_name_ar), ''),
                 NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
                 'موظف ' || e.employee_code),""",
        """               'employeeName', e.full_name_ar,""",
    ),
    (
        'INV25',
        '★★ الاحتياطيّ لاسم الشاغل يسقط',
        """    COALESCE(
      NULLIF(btrim(ie.full_name_ar), ''),
      NULLIF(btrim(ie.first_name || ' ' || ie.last_name), ''),
      NULLIF('موظف ' || ie.employee_code, 'موظف '),
      '—')::TEXT,""",
        """    COALESCE(ie.full_name_ar, '—')::TEXT,""",
    ),
    (
        'INV26',
        '★★ ON CONFLICT يسقط ⇒ إعادة الترشيح تفشل بدل أن تُحدِّث',
        """  ON CONFLICT (tenant_id, critical_position_id, employee_id) DO UPDATE""",
        """  ON CONFLICT (tenant_id, critical_position_id, employee_id) DO NOTHING; -- """,
    ),
    (
        'INV27',
        '★★ الملخّص يعود يخلط المكشوف بالمكشوف-الحرج',
        """    (SELECT count(*)::INTEGER FROM act a
      WHERE a.risk_level IN ('critical','high')
        AND NOT EXISTS (SELECT 1 FROM cnd WHERE cnd.pid = a.id)),""",
        """    (SELECT count(*)::INTEGER FROM act a
      WHERE NOT EXISTS (SELECT 1 FROM cnd WHERE cnd.pid = a.id)),""",
    ),
    (
        'INV28',
        '★★ ترشيح المستأجر في succession_position_close يسقط',
        """  UPDATE public.critical_positions
     SET status = p_status, updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;""",
        """  UPDATE public.critical_positions
     SET status = p_status, updated_at = now()
   WHERE id = p_id;""",
    ),
    (
        'INV29',
        '★★ الحدّ الأعلى في اللوح يصير بلا أثر',
        """  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);""",
        """  v_lim    INTEGER := 500;""",
    ),
    (
        'INV30',
        '★★ ترشيح p_risk يصير بلا أثر',
        """       AND (p_risk IS NULL OR p.risk_level = p_risk)
       -- ★★★ العطل ⑫""",
        """       AND (p_risk IS NULL OR TRUE)
       -- ★★★ العطل ⑫""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط FK الشاغل المركَّب',
        'ALTER TABLE public.critical_positions '
        'DROP CONSTRAINT IF EXISTS critical_positions_incumbent_tenant_fkey;',
        'ALTER TABLE public.critical_positions ADD CONSTRAINT '
        'critical_positions_incumbent_tenant_fkey FOREIGN KEY '
        '(incumbent_employee_id, tenant_id) REFERENCES '
        'public.employees (id, tenant_id) ON DELETE SET NULL;',
    ),
    (
        'DDL02',
        '★★ إسقاط FK القسم المركَّب',
        'ALTER TABLE public.critical_positions '
        'DROP CONSTRAINT IF EXISTS critical_positions_department_tenant_fkey;',
        'ALTER TABLE public.critical_positions ADD CONSTRAINT '
        'critical_positions_department_tenant_fkey FOREIGN KEY '
        '(department_id, tenant_id) REFERENCES '
        'public.departments (id, tenant_id) ON DELETE SET NULL;',
    ),
    (
        'DDL03',
        '★★★ إسقاط FK المرشّح المركَّب',
        'ALTER TABLE public.succession_candidates '
        'DROP CONSTRAINT IF EXISTS succession_candidates_employee_tenant_fkey;',
        'ALTER TABLE public.succession_candidates ADD CONSTRAINT '
        'succession_candidates_employee_tenant_fkey FOREIGN KEY '
        '(employee_id, tenant_id) REFERENCES '
        'public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL04',
        '★★★ إسقاط FK المنصب المركَّب (يعود الباب للعطلين ⑥ و⑪)',
        'ALTER TABLE public.succession_candidates '
        'DROP CONSTRAINT IF EXISTS succession_candidates_position_tenant_fkey;',
        'ALTER TABLE public.succession_candidates ADD CONSTRAINT '
        'succession_candidates_position_tenant_fkey FOREIGN KEY '
        '(critical_position_id, tenant_id) REFERENCES '
        'public.critical_positions (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL05',
        '★★ إسقاط قيد اتّساق الدرجة/المستوى',
        'ALTER TABLE public.succession_candidates '
        'DROP CONSTRAINT IF EXISTS succession_candidates_score_level_chk;',
        "ALTER TABLE public.succession_candidates ADD CONSTRAINT "
        "succession_candidates_score_level_chk CHECK ("
        "(readiness_level = 'ready_now' AND readiness_score >= 80) OR "
        "(readiness_level = 'ready_6_months' AND readiness_score >= 60) OR "
        "(readiness_level = 'ready_12_months' AND readiness_score >= 40) OR "
        "(readiness_level = 'future_potential'));",
    ),
    (
        'DDL06',
        '★★ إعادة readiness_score إلى NULLABLE (العطل ⑨)',
        'ALTER TABLE public.succession_candidates '
        'ALTER COLUMN readiness_score DROP NOT NULL;',
        'ALTER TABLE public.succession_candidates '
        'ALTER COLUMN readiness_score SET NOT NULL;',
    ),
    (
        'DDL07',
        '★ إسقاط قيد العنوان غير الفارغ',
        'ALTER TABLE public.critical_positions '
        'DROP CONSTRAINT IF EXISTS critical_positions_title_chk;',
        "ALTER TABLE public.critical_positions ADD CONSTRAINT "
        "critical_positions_title_chk CHECK (btrim(title) <> '');",
    ),
]

# ★ عكسٌ لا يُسقط الاختبار لسببٍ **مُثبَت** لا لأنّ الشرط غير مختبَر.
EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        'إسقاط `uq_critical_positions_id_tenant` / `uq_departments_id_tenant` وحدها',
        'الفهرسان الفريدان ليسا إصلاحاً في ذاتهما — هما **شرطُ وجودٍ** '
        'لـDDL04 وDDL02. إسقاطهما بلا إسقاط FK مستحيل: Postgres يرفض '
        '`DROP INDEX` بـ«cannot drop index … because constraint … '
        'requires it» (مُثبَت تشغيلياً في 0360 على الفهرس النظير). '
        'أثرُهما مغطًّى كاملاً بـDDL04 وDDL02.'
    ),
    (
        'EQ02',
        'إسقاط `GRANT EXECUTE … TO authenticated` عن أيٍّ من الدوال السبع',
        '★★★ `0268` نفّذ `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON '
        'FUNCTIONS`، و`pg_default_acl` يُظهر حرفياً: '
        '`f | postgres | anon=X/postgres authenticated=X/postgres '
        'service_role=X/postgres` ⇒ **كل دالة جديدة تُولَد ومعها EXECUTE '
        'لـauthenticated تلقائياً** (أُثبت بمسبار في 0361/EQ04: دالةٌ بلا '
        'أيّ GRANT أعطت `has_function_privilege(authenticated) = true`). '
        'فالمنحة الصريحة تحصيل حاصل لا يمكن لاختبارٍ أن يُسقطه — وتبقى في '
        'الشيفرة إن أُلغيت الصلاحية الافتراضية يوماً. ★ أمّا `REVOKE … '
        'FROM anon` فليس كذلك: عكسه (INV22) أسقط سكربت RLS فعلاً.'
    ),
    (
        'EQ03',
        'إسقاط `idx_critical_positions_active`',
        'فهرس أداءٍ محض لا يغيّر نتيجة أيّ استعلام — الخطة تسقط إلى '
        'Seq Scan على عيّنة من ثلاثة صفوف. ★ ولا يوجد في اللوح `LIMIT` '
        'بلا `ORDER BY` (درس 0357): `ORDER BY … b.created_at DESC, '
        'b.id DESC` حتميّ ⇒ لا قلبَ للنتيجة. عكسُه مغطًّى ضمنياً '
        'بالتأكيدين 11.1 و11.8.'
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0361 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
