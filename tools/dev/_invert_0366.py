#!/usr/bin/env python3
"""
عكس إصلاحات 0366 واحداً واحداً وإثبات أن الاختبار يسقط.

الاستعمال:
    PGPORT=5501 python3 tools/dev/_invert_0366.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0366_loan_rejection_reason.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-loan-rejection-0366.sql')

PGPORT = os.environ.get('PGPORT', '5501')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT


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


INVERSIONS = [
    (
        'INV01',
        '★★★ المحفّز يتوقّف عن ملء السبب — العطل الأصليّ يعود بالضبط',
        """    IF v_req IS NOT NULL THEN
      NEW.rejection_reason := public.loan_apply_rejection_reason(v_req);
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV02',
        '★★★ ترشيح request_type يسقط ⇒ يلتقط طلب إجازةٍ أو نفقةٍ للقرض نفسه',
        """     WHERE r.related_id = NEW.id
       AND r.tenant_id = NEW.tenant_id
       AND r.request_type = 'loan'""",
        """     WHERE r.related_id = NEW.id
       AND r.tenant_id = NEW.tenant_id""",
    ),
    (
        'INV03',
        '★★ ترشيح المستأجر في المحفّز يسقط',
        """     WHERE r.related_id = NEW.id
       AND r.tenant_id = NEW.tenant_id
       AND r.request_type = 'loan'
     ORDER BY r.created_at DESC, r.id DESC""",
        """     WHERE r.related_id = NEW.id
       AND r.request_type = 'loan'
     ORDER BY r.created_at DESC, r.id DESC""",
    ),
    (
        'INV04',
        '★★★ حارس «لا تدهس سبباً موجوداً» يسقط',
        """  IF NEW.status = 'rejected'
     AND (NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '') THEN""",
        """  IF NEW.status = 'rejected' THEN""",
    ),
    (
        'INV05',
        '★★★ الاحتياطيّ يعود NULL ⇒ رفضٌ بلا تعليقٍ يُسقط القيد',
        """  RETURN COALESCE(v_reason, 'رُفض عبر صندوق الموافقات بلا تعليق');""",
        """  RETURN v_reason;""",
    ),
    (
        'INV06',
        '★★ شرط «تعليقٌ غير فارغ» يسقط ⇒ يلتقط خطوةً بتعليقٍ معدوم',
        """     AND s.status = 'rejected'
     AND NULLIF(btrim(s.comments), '') IS NOT NULL""",
        """     AND s.status = 'rejected'""",
    ),
    (
        'INV07',
        '★★ شرط «خطوةٌ رافضة» يسقط ⇒ يلتقط تعليق خطوةٍ موافِقة',
        """    FROM public.hr_approval_steps s
   WHERE s.request_id = p_request_id
     AND s.status = 'rejected'""",
        """    FROM public.hr_approval_steps s
   WHERE s.request_id = p_request_id""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط القيد — الغياب الذي استتر به العطل حتى 0366',
        'ALTER TABLE public.employee_loans '
        'DROP CONSTRAINT IF EXISTS chk_employee_loans_rejection_reason;',
        "ALTER TABLE public.employee_loans ADD CONSTRAINT "
        "chk_employee_loans_rejection_reason CHECK (status <> 'rejected' "
        "OR btrim(COALESCE(rejection_reason, '')) <> '');",
    ),
    (
        'DDL02',
        '★★★ تعطيل المحفّز كاملاً',
        'DROP TRIGGER IF EXISTS trg_loan_sync_reason ON public.employee_loans;',
        'CREATE TRIGGER trg_loan_sync_reason BEFORE INSERT OR UPDATE OF status '
        'ON public.employee_loans FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_loan_sync_reason();',
    ),
    (
        'DDL03',
        '★★★ anon يستعيد EXECUTE على loan_apply_rejection_reason',
        'GRANT EXECUTE ON FUNCTION public.loan_apply_rejection_reason(UUID) TO anon;',
        'REVOKE ALL ON FUNCTION public.loan_apply_rejection_reason(UUID) FROM anon;',
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0366 — إثبات أن كل إصلاح مُختبَر فعلاً')
    print('═' * 74)

    psql(MIG)
    base = psql(VERIFY)
    if base.returncode != 0:
        print('✖ خطّ الأساس فاشل — أوقف')
        print((base.stdout + base.stderr)[-2000:])
        return 1
    print('✔ خطّ الأساس ينجح قبل أي عكس\n')

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
            m = re.search(r'ERROR:\s*([^\n]{0,70})', ver.stdout + ver.stderr)
            tag = m.group(1).strip() if m else '؟'
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
            ver = psql(VERIFY)
            m = re.search(r'ERROR:\s*([^\n]{0,70})', ver.stdout + ver.stderr)
            tag = m.group(1).strip() if m else '؟'
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

    print('\n' + '═' * 74)
    ok = sum(1 for _, _, s in results if s == 'FAILED_AS_EXPECTED')
    bad = [r for r in results if r[2] != 'FAILED_AS_EXPECTED']
    print(f'  النتيجة: {ok}/{len(results)} عكساً أسقط الاختبار')
    for ident, desc, st in bad:
        print(f'    ✖ {ident} [{st}] {desc}')
    print(f'  الاسترجاع: {"✔ ينجح" if final.returncode == 0 else "✖ فشل"}')
    print('═' * 74)
    return 0 if (not bad and final.returncode == 0) else 1


if __name__ == '__main__':
    sys.exit(main())
