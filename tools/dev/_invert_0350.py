#!/usr/bin/env python3
"""
عكس إصلاحات 0350 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»
    الإصلاح الذي لا يُسقط عكسُه أيّ تأكيد = إصلاح غير مُختبَر.

★★ تنبيه بنيوي مهمّ لهذه الجولة:
   عناصر DDL (NOT NULL · السياسات) **لا تُعكَس بإعادة تطبيق المايجريشن**
   على قاعدة سبق أن طُبِّق عليها — لأن `ALTER … SET NOT NULL` يبقى.
   لذلك عكوس القسم البنيوي تُنفَّذ بـSQL صريح يُرجِع الحالة القديمة
   (`DROP NOT NULL` وإعادة السياسة المتساهلة) ثم تُسترجَع.

الاستعمال:
    PGPORT=5458 python3 tools/dev/_invert_0350.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO,
                   'supabase/migrations/0350_gatekeeper_tenant_isolation_and_analytics.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-gatekeeper-analytics-0350.sql')

PGPORT = os.environ.get('PGPORT', '5458')
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
# (أ) عكوس نصّية على جسم المايجريشن (الدوال)
# ───────────────────────────────────────────────────────────────────────────

TEXT_INVERSIONS = [
    (
        'INV01',
        'العطل ② — إسقاط الترشيح الزمني من تحليلات الزوّار',
        """     AND v.check_in_time >= p_from
     AND v.check_in_time <= p_to""",
        """     AND (p_from IS NOT NULL OR TRUE)""",
    ),
    (
        'INV02',
        'العطل ③ — إعادة قراءة عمود غير موجود بدل visitor_name',
        """    COALESCE(NULLIF(btrim(v.visitor_name), ''), 'زائر بلا اسم')::TEXT,""",
        """    COALESCE(NULLIF(btrim(v.host_name), ''), '')::TEXT,""",
    ),
    (
        'INV03',
        'العطل ④ — إسقاط الحدّ الأعلى من عدّ حركات الوردية',
        """      WHERE m.tenant_id = v_tenant
        AND m.departure_at >= s.started_at
        AND m.departure_at <  COALESCE(s.ended_at, NOW())),""",
        """      WHERE m.tenant_id = v_tenant
        AND m.departure_at >= s.started_at),""",
    ),
    (
        'INV04',
        'العطل ④ — إسقاط الحدّ الأعلى من gatekeeper_shift_movements',
        """     AND m.departure_at >= v_start
     AND m.departure_at <  v_end      -- ★ العطل ④: الحدّ الأعلى""",
        """     AND m.departure_at >= v_start""",
    ),
    (
        'INV05',
        'العطل ⑤ — إعادة اشتقاق المخالفة من نصّ الملاحظة',
        """    -- ★ العطل ⑤: العمود المنطقي هو المصدر، لا تفتيش نصّ الملاحظة
    m.route_violation,""",
        """    COALESCE(m.notes LIKE '%مخالفة مسار%', false),""",
    ),
    (
        'INV06',
        'العطل ⑧ — إسقاط تنفيذ البحث في الأرشيف',
        """     AND (
       v_q IS NULL
       OR p.full_name ILIKE '%' || v_q || '%'
       OR to_char(s.started_at AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD') ILIKE '%' || v_q || '%'
     )""",
        """     AND TRUE""",
    ),
    (
        'INV07',
        'العزل — إسقاط ترشيح المستأجر من تحليلات الحركة',
        """   WHERE m.tenant_id    = v_tenant
     AND m.departure_at >= p_from
     AND m.departure_at <= p_to""",
        """   WHERE m.departure_at >= p_from
     AND m.departure_at <= p_to""",
    ),
    (
        'INV08',
        'العزل — إسقاط ترشيح المستأجر من أرشيف الورديات',
        """   WHERE s.tenant_id = v_tenant
     AND s.is_active = false""",
        """   WHERE s.is_active = false""",
    ),
    (
        'INV09',
        'العزل — قبول وردية أجنبية في gatekeeper_shift_movements',
        """   WHERE s.id = p_session_id AND s.tenant_id = v_tenant;""",
        """   WHERE s.id = p_session_id;""",
    ),
    (
        'INV10',
        'الصلاحية — إسقاط شرط staff من تحليلات الحركة',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الحركة';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV11',
        'الصلاحية — إسقاط شرط staff من سجلّ الزوّار',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض سجلّ الزوّار';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV12',
        'الصلاحية — إسقاط شرط staff من الأرشيف',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'لا تملك صلاحية عرض أرشيف الورديات';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV13',
        'حراسة النطاق — قبول النطاق المعكوس في تحليلات الحركة',
        """  IF p_from > p_to THEN
    RAISE EXCEPTION 'نطاق تاريخ غير صالح: % بعد %', p_from, p_to;
  END IF;

  RETURN QUERY
  SELECT
    m.id,""",
        """  RETURN QUERY
  SELECT
    m.id,""",
    ),
    (
        'INV14',
        'الخصائص — إسقاط SET search_path من تحليلات الحركة',
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الحركة';""",
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
    RAISE EXCEPTION 'لا تملك صلاحية عرض تحليلات الحركة';""",
    ),
    (
        'INV15',
        'المدة — إعادة صفر بدل NULL لمن لم يعد',
        """    CASE WHEN m.returned_at IS NULL THEN NULL::BIGINT
         ELSE EXTRACT(EPOCH FROM (m.returned_at - m.departure_at))::BIGINT END,
    -- ★ العطل ⑤""",
        """    COALESCE(EXTRACT(EPOCH FROM (m.returned_at - m.departure_at))::BIGINT, 0),
    -- ★ العطل ⑤""",
    ),
]

# ───────────────────────────────────────────────────────────────────────────
# (ب) عكوس بنيوية — DDL لا يُعكَس بإعادة التطبيق
# ───────────────────────────────────────────────────────────────────────────

DDL_INVERSIONS = [
    (
        'INV16',
        'العزل — إرجاع tenant_id إلى NULL-able (الثغرة الأصلية)',
        """ALTER TABLE public.gatekeeper_visitor_logs ALTER COLUMN tenant_id DROP NOT NULL;
           ALTER TABLE public.gatekeeper_sessions     ALTER COLUMN tenant_id DROP NOT NULL;""",
        """ALTER TABLE public.gatekeeper_visitor_logs ALTER COLUMN tenant_id SET NOT NULL;
           ALTER TABLE public.gatekeeper_sessions     ALTER COLUMN tenant_id SET NOT NULL;""",
    ),
    (
        'INV17',
        'العزل — إعادة السياسة المتساهلة (tenant_id IS NULL OR …)',
        """DROP POLICY IF EXISTS kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs;
           CREATE POLICY kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs
             FOR SELECT USING ((tenant_id IS NULL)
                               OR (tenant_id = public.current_user_tenant_id()));""",
        """DROP POLICY IF EXISTS kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs;
           CREATE POLICY kyvzon_gk_vlogs_select ON public.gatekeeper_visitor_logs
             FOR SELECT USING (tenant_id = public.current_user_tenant_id());""",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0350 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql_file(MIG)
    base = psql_file(VERIFY)
    if base.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف كل شيء')
        print((base.stdout + base.stderr)[-2000:])
        return 1
    print('✔ خطّ الأساس: الاختبار ينجح قبل أي عكس\n')

    # ── (أ) العكوس النصّية ────────────────────────────────────────────────
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

    # ── (ب) العكوس البنيوية ───────────────────────────────────────────────
    #   ★ DDL يبقى بعد إعادة تطبيق المايجريشن، فنعكسه بأمر صريح
    #     ثم نسترجعه بأمر صريح مضاد.
    for ident, desc, break_sql, restore_sql in DDL_INVERSIONS:
        br = psql_sql(break_sql)
        if br.returncode != 0:
            print(f'✖ {ident}: تعذّر تنفيذ العكس البنيوي — {br.stderr.strip()[:120]}')
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

    # ── الاسترجاع النهائي ─────────────────────────────────────────────────
    open(MIG, 'w', encoding='utf-8').write(original)
    psql_file(MIG)
    final = psql_file(VERIFY)

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
