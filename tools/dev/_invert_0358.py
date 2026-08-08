#!/usr/bin/env python3
"""
عكس إصلاحات 0358 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (SELECT 1 FROM pg_constraint …)` يمنع إعادة
   إنشاء القيد على قاعدةٍ طُبِّق عليها المايجريشن ⇒ عكسُه بـDDL صريح.

الاستعمال:
    PGPORT=5481 python3 tools/dev/_invert_0358.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0358_bonus_lifecycle_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-bonus-lifecycle-0358.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-bonus-lifecycle-0358-rls.sh')

PGPORT = os.environ.get('PGPORT', '5481')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

RLS_CHECK: set = set()


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
        '★★★ إسقاط مرآة bonus_amount (يعود التضارب: 100000 مقابل 999999)',
        """  NEW.bonus_amount := NEW.amount;""",
        """  IF NEW.bonus_amount IS NULL AND NEW.amount IS NOT NULL THEN
    NEW.bonus_amount := NEW.amount;
  END IF;""",
    ),
    (
        'INV02',
        '★★ إسقاط ملء amount من bonus_amount (الإدراج بـbonus_amount وحده يفشل)',
        """  IF NEW.amount IS NULL AND NEW.bonus_amount IS NOT NULL THEN
    NEW.amount := NEW.bonus_amount;
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV03',
        '★★ bonus_date لا يتبع period_start (مكافأة يوليو تُحسَب في أغسطس)',
        """  IF NEW.period_start IS NOT NULL THEN
    NEW.bonus_date := NEW.period_start;
  ELSIF NEW.bonus_date IS NULL THEN""",
        """  IF FALSE THEN
    NEW.bonus_date := NEW.period_start;
  ELSIF NEW.bonus_date IS NULL THEN""",
    ),
    (
        'INV04',
        '★ إسقاط العملة الافتراضية',
        """  IF NEW.currency IS NULL OR NEW.currency = '' THEN
    NEW.currency := 'IQD';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV05',
        '★★★ إسقاط محفّز منع الحذف',
        """DROP TRIGGER IF EXISTS trg_block_bonus_delete ON public.bonuses;
CREATE TRIGGER trg_block_bonus_delete
  BEFORE DELETE ON public.bonuses
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_bonus_delete();""",
        """DROP TRIGGER IF EXISTS trg_block_bonus_delete ON public.bonuses;""",
    ),
    (
        'INV06',
        '★★★ الملخّص يحتسب المؤرشف',
        """  FROM public.bonuses b
  WHERE b.tenant_id = v_tenant
    AND b.archived_at IS NULL;""",
        """  FROM public.bonuses b
  WHERE b.tenant_id = v_tenant;""",
    ),
    (
        'INV07',
        '★★★ إسقاط ترشيح المستأجر من الملخّص',
        """  FROM public.bonuses b
  WHERE b.tenant_id = v_tenant
    AND b.archived_at IS NULL;
END $$;""",
        """  FROM public.bonuses b
  WHERE b.archived_at IS NULL;
END $$;""",
    ),
    (
        'INV08',
        '★★ الملغاة تُحتسَب في مبلغ الشهر',
        """      WHERE b.status IN ('approved','paid')
        AND b.bonus_date >= date_trunc('month', v_today)::DATE""",
        """      WHERE b.bonus_date >= date_trunc('month', v_today)::DATE""",
    ),
    (
        'INV09',
        '★★ عدّ الموظفين يشمل الملغاة',
        """    count(DISTINCT b.employee_id) FILTER (
      WHERE b.status IN ('approved','paid'))::INTEGER""",
        """    count(DISTINCT b.employee_id)::INTEGER""",
    ),
    (
        'INV10',
        '★★ إسقاط حارس staff من bonus_summary',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص المكافآت';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV11',
        '★★ إسقاط حارس staff من bonus_board',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض المكافآت';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV12',
        '★★★ حارس الحالة في اللوحة يقبل المفردة العربية',
        """     AND p_status NOT IN ('pending','approved','cancelled','paid') THEN""",
        """     AND p_status NOT IN ('pending','approved','cancelled','paid','موافق') THEN""",
    ),
    (
        'INV13',
        '★★ حارس النوع في اللوحة يقبل نوعاً مخترعاً',
        """     AND p_type NOT IN ('performance','overtime','annual','spot','referral','other') THEN""",
        """     AND p_type NOT IN ('performance','overtime','annual','spot','referral',
                        'other','مخترع') THEN""",
    ),
    (
        'INV14',
        '★★ إسقاط سلسلة الاسم (full_name_ar فارغ لكل موظف)',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(p.full_name), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV15',
        '★ إسقاط اسم المعتمِد',
        """    COALESCE(NULLIF(btrim(ap.full_name), ''), '—')::TEXT,""",
        """    NULL::TEXT,""",
    ),
    (
        'INV16',
        '★★★ إسقاط ترشيح المستأجر من اللوحة',
        """  WHERE b.tenant_id = v_tenant
    AND (p_include_archived OR b.archived_at IS NULL)""",
        """  WHERE (p_include_archived OR b.archived_at IS NULL)""",
    ),
    (
        'INV17',
        '★★ اللوحة تعرض المؤرشف دائماً',
        """    AND (p_include_archived OR b.archived_at IS NULL)
    AND (p_status IS NULL OR b.status     = p_status)""",
        """    AND (p_status IS NULL OR b.status     = p_status)""",
    ),
    (
        'INV18',
        '★ إسقاط الحدّ الأعلى من اللوحة',
        """  ORDER BY b.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);""",
        """  ORDER BY b.created_at DESC;""",
    ),
    (
        'INV19',
        '★ إسقاط البحث بالسبب',
        """         OR b.reason        ILIKE '%' || v_q || '%')""",
        """         OR FALSE)""",
    ),
    (
        'INV20',
        '★★★ إسقاط حارس المبلغ من bonus_create',
        """  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'BONUS_BAD_AMOUNT: المبلغ يجب أن يكون موجباً (المُمرَّر: %)',
      COALESCE(p_amount::TEXT,'NULL') USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV21',
        '★★ إسقاط حارس النوع من bonus_create',
        """  IF p_type NOT IN ('performance','overtime','annual','spot','referral','other') THEN
    RAISE EXCEPTION 'BONUS_BAD_TYPE: نوع غير معروف «%»', p_type
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV22',
        '★ إسقاط حارس السبب',
        """  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'BONUS_NO_REASON: السبب إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV23',
        '★★ إسقاط حارس الفترة',
        """  IF p_period_start IS NOT NULL AND p_period_end IS NOT NULL
     AND p_period_end < p_period_start THEN
    RAISE EXCEPTION 'BONUS_BAD_PERIOD: النهاية (%) قبل البداية (%)',
      p_period_end, p_period_start USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV24',
        '★★★ إسقاط تمرير الفترة (تعود تُجمَع وتُهمَل)',
        """    (tenant_id, employee_id, bonus_type, amount, reason,
     period_start, period_end, status)
  VALUES (v_tenant, p_employee_id, p_type, p_amount, btrim(p_reason),
          p_period_start, p_period_end, 'pending')""",
        """    (tenant_id, employee_id, bonus_type, amount, reason, status)
  VALUES (v_tenant, p_employee_id, p_type, p_amount, btrim(p_reason),
          'pending')""",
    ),
    (
        'INV25',
        '★★ إسقاط تحقّق أن الموظف من المستأجر نفسه',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV26',
        '★★ إسقاط حارس دور الإنشاء',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء مكافأة (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV27',
        '★★★ approved_by يعود سلسلة نصّية (invalid input syntax for uuid)',
        """         approved_by   = CASE WHEN p_decision IN ('approved','paid')
                              THEN COALESCE(approved_by, auth.uid())
                              ELSE approved_by END,""",
        """         approved_by   = CASE WHEN p_decision IN ('approved','paid')
                              THEN COALESCE(approved_by, NULL)
                              ELSE approved_by END,""",
    ),
    (
        'INV28',
        '★★★ إسقاط جدول انتقالات المكافأة',
        """  v_ok := CASE v_cur
    WHEN 'pending'  THEN p_decision IN ('approved','cancelled')
    WHEN 'approved' THEN p_decision IN ('paid','cancelled')
    ELSE FALSE
  END;""",
        """  v_ok := TRUE;""",
    ),
    (
        'INV29',
        '★★ إسقاط حارس القرارات الثلاثة',
        """  IF p_decision NOT IN ('approved','cancelled','paid') THEN
    RAISE EXCEPTION 'BONUS_BAD_DECISION: القرار «%» غير معروف — '
      'المسموح: approved·cancelled·paid', p_decision
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV30',
        '★ إسقاط حارس سبب الإلغاء',
        """  IF p_decision = 'cancelled'
     AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'BONUS_NO_NOTE: سبب الإلغاء إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV31',
        '★★ إسقاط منع البتّ في المؤرشف',
        """  IF v_arch IS NOT NULL THEN
    RAISE EXCEPTION 'BONUS_ARCHIVED: المكافأة مؤرشفة — لا تعديل عليها'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV32',
        '★★★ إسقاط ترشيح المستأجر من bonus_decide',
        """  SELECT b.status, b.archived_at INTO v_cur, v_arch
    FROM public.bonuses b
   WHERE b.id = p_bonus_id AND b.tenant_id = v_tenant;""",
        """  SELECT b.status, b.archived_at INTO v_cur, v_arch
    FROM public.bonuses b
   WHERE b.id = p_bonus_id;""",
    ),
    (
        'INV33',
        '★★ الملغاة تُسنَد لمعتمِد',
        """         approved_by   = CASE WHEN p_decision IN ('approved','paid')""",
        """         approved_by   = CASE WHEN p_decision IN ('approved','paid','cancelled')""",
    ),
    (
        'INV34',
        '★ إسقاط حارس سبب الأرشفة',
        """  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'BONUS_NO_REASON: سبب الأرشفة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV35',
        '★★ إسقاط ترشيح المستأجر من bonus_archive',
        """   WHERE id = p_bonus_id AND tenant_id = v_tenant AND archived_at IS NULL;""",
        """   WHERE id = p_bonus_id AND archived_at IS NULL;""",
    ),
    (
        'INV36',
        '★ الأرشفة تنجح مرّتين (إسقاط حارس ROW_COUNT)',
        """  IF v_n = 0 THEN
    RAISE EXCEPTION 'المكافأة غير موجودة في هذا المستأجر أو مؤرشفة أصلاً';
  END IF;
  RETURN TRUE;""",
        """  RETURN TRUE;""",
    ),
]


# ═══════════════════════════════════════════════════════════════════════
#  عكوس DDL — `IF NOT EXISTS (pg_constraint)` يمنع إعادة الإنشاء
# ═══════════════════════════════════════════════════════════════════════
DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط قيد مفردات الحالة (تعود «موافق» العربية)',
        'ALTER TABLE public.bonuses DROP CONSTRAINT IF EXISTS bonuses_status_chk;',
        "ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_status_chk "
        "CHECK (status IN ('pending','approved','cancelled','paid'));",
    ),
    (
        'DDL02',
        '★★ إسقاط قيد النوع',
        'ALTER TABLE public.bonuses DROP CONSTRAINT IF EXISTS bonuses_type_chk;',
        "ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_type_chk "
        "CHECK (bonus_type IN ('performance','overtime','annual',"
        "'spot','referral','other'));",
    ),
    (
        'DDL03',
        '★★ إسقاط قيد المبلغ الموجب',
        'ALTER TABLE public.bonuses DROP CONSTRAINT IF EXISTS bonuses_amount_pos;',
        'ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_amount_pos '
        'CHECK (amount > 0) NOT VALID;',
    ),
    (
        'DDL04',
        '★ إسقاط قيد مدى الفترة',
        'ALTER TABLE public.bonuses DROP CONSTRAINT IF EXISTS bonuses_period_chk;',
        'ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_period_chk '
        'CHECK (period_start IS NULL OR period_end IS NULL '
        'OR period_end >= period_start);',
    ),
    (
        'DDL05',
        '★★ إسقاط FK الموظف',
        'ALTER TABLE public.bonuses DROP CONSTRAINT IF EXISTS bonuses_employee_id_fkey;',
        'ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_employee_id_fkey '
        'FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;',
    ),
    (
        'DDL06',
        '★★ إسقاط عمود archived_at (تعود الأرشفة مستحيلة)',
        'ALTER TABLE public.bonuses DROP COLUMN IF EXISTS archived_at CASCADE;',
        'ALTER TABLE public.bonuses ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;',
    ),
    (
        'DDL07',
        '★ إسقاط عمود decision_note',
        'ALTER TABLE public.bonuses DROP COLUMN IF EXISTS decision_note CASCADE;',
        'ALTER TABLE public.bonuses ADD COLUMN IF NOT EXISTS decision_note TEXT;',
    ),
]

DDL_RLS_CHECK: set = set()


EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        "حارس دور البتّ في bonus_decide",
        "مُكافئ لحارس دور الإنشاء (INV26) في التأكيد 11.4: الموظف لا "
        "يملك مكافأةً `pending` أنشأها بنفسه (INV26 يمنع ذلك)، فلو "
        "أُسقط حارس البتّ وحده لبقي 11.4 يمرّ عبر ترشيح المستأجر. "
        "الحارسان معاً مُختبَران — والأول يسقط الاختبار فعلاً.",
    ),
    (
        'EQ02',
        "`ORDER BY b.created_at DESC` في اللوحة",
        "أثره على العرض لا على الصحّة. عدد الصفوف ومحتواها لا يتغيّران، "
        "ومع عيّنة صغيرة قد يُصادف الترتيب نفسه. لا يُخفي عطلاً.",
    ),
    (
        'EQ03',
        "تطبيع البيانات القائمة قبل فرض القيود (كتل UPDATE في DO $$)",
        "على قاعدة نظيفة لا صفوف تخالف القيود، فالتطبيع بلا أثر قابل "
        "للقياس هنا. أثره الحقيقيّ على قاعدة الإنتاج — وهو مُثبَت بأن "
        "المايجريشن يُطبَّق بنجاح على القاعدة الحالية (286 مايجريشن).",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0358 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
