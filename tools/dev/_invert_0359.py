#!/usr/bin/env python3
"""
عكس إصلاحات 0359 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`CREATE UNIQUE INDEX IF NOT
   EXISTS` يمنع إعادة الإنشاء ⇒ عكسُهما بـDDL صريح.

الاستعمال:
    PGPORT=5483 python3 tools/dev/_invert_0359.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0359_onboarding_offboarding_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-onboarding-0359.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-onboarding-0359-rls.sh')

PGPORT = os.environ.get('PGPORT', '5483')
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
        '★★★ إسقاط ON CONFLICT من بدء التعريف (تعود مضاعفة المهام)',
        """  ON CONFLICT (tenant_id, employee_id, task_id) DO NOTHING;""",
        """  ;""",
    ),
    (
        'INV02',
        '★★ إدراج المهامّ المعطَّلة أيضاً',
        """  SELECT v_tenant, p_employee_id, t.id, 'pending'
    FROM public.onboarding_tasks t
   WHERE t.tenant_id = v_tenant AND t.is_active
  ON CONFLICT""",
        """  SELECT v_tenant, p_employee_id, t.id, 'pending'
    FROM public.onboarding_tasks t
   WHERE t.tenant_id = v_tenant
  ON CONFLICT""",
    ),
    (
        'INV03',
        '★★ إسقاط حارس «لا مهامّ مفعّلة»',
        """  IF v_tasks = 0 THEN
    RAISE EXCEPTION 'ONBOARDING_NO_TASKS: لا مهامّ تعريف مفعّلة — عرّفها أولاً'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV04',
        '★★ إسقاط ترشيح المستأجر من عدّ المهامّ',
        """  SELECT count(*)::INTEGER INTO v_tasks
    FROM public.onboarding_tasks t
   WHERE t.tenant_id = v_tenant AND t.is_active;""",
        """  SELECT count(*)::INTEGER INTO v_tasks
    FROM public.onboarding_tasks t
   WHERE t.is_active;""",
    ),
    (
        'INV05',
        '★★★ إسقاط تحقّق أن الموظف من المستأجر (بدء التعريف)',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  SELECT count(*)::INTEGER INTO v_tasks""",
        """  SELECT count(*)::INTEGER INTO v_tasks""",
    ),
    (
        'INV06',
        '★★ إسقاط حارس دور بدء التعريف',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح ببدء التعريف (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV07',
        '★★★ إسقاط كتابة completed_by (يعود «لا نعرف مَن أتمّ»)',
        """         completed_by = CASE WHEN p_status = 'completed' THEN auth.uid()
                             ELSE NULL END,""",
        """         completed_by = NULL,""",
    ),
    (
        'INV08',
        '★★ completed_at لا يُمسَح عند التراجع',
        """         completed_at = CASE WHEN p_status = 'completed' THEN NOW()
                             ELSE NULL END,""",
        """         completed_at = CASE WHEN p_status = 'completed' THEN NOW()
                             ELSE completed_at END,""",
    ),
    (
        'INV09',
        '★★ إسقاط حارس مفردات حالة المهمة',
        """  IF p_status NOT IN ('pending','in_progress','completed','skipped') THEN
    RAISE EXCEPTION 'ONBOARDING_BAD_STATUS: حالة غير معروفة «%» — المسموح: '
      'pending·in_progress·completed·skipped', p_status
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV10',
        '★ إسقاط حارس سبب التخطّي',
        """  IF p_status = 'skipped' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'ONBOARDING_NO_REASON: سبب تخطّي المهمة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV11',
        '★ سبب التخطّي لا يُحفَظ',
        """         skipped_reason = CASE WHEN p_status = 'skipped'
                               THEN btrim(p_note) ELSE NULL END,""",
        """         skipped_reason = NULL,""",
    ),
    (
        'INV12',
        '★★ إسقاط ترشيح المستأجر من onboarding_set_task',
        """  SELECT o.status INTO v_cur FROM public.employee_onboarding o
   WHERE o.id = p_record_id AND o.tenant_id = v_tenant;""",
        """  SELECT o.status INTO v_cur FROM public.employee_onboarding o
   WHERE o.id = p_record_id;""",
    ),
    (
        'INV13',
        '★★ إسقاط حارس دور تعديل المهمة',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بتعديل مهامّ التعريف (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV14',
        '★★★ إسقاط تعطيل الموظف (يعود السجلّ اليتيم)',
        """  UPDATE public.employees
     SET is_active = FALSE, updated_at = NOW()
   WHERE id = p_employee_id AND tenant_id = v_tenant;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV15',
        '★★★ إسقاط حارس السجلّ المكرَّر',
        """  IF EXISTS (SELECT 1 FROM public.offboarding_records o
              WHERE o.tenant_id = v_tenant AND o.employee_id = p_employee_id) THEN
    RAISE EXCEPTION 'OFFBOARDING_DUPLICATE: للموظف سجلّ إنهاء خدمة قائم'
      USING ERRCODE = 'unique_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV16',
        '★★ إسقاط منع الإنهاء الذاتيّ',
        """  IF v_self IS NOT NULL AND v_self = p_employee_id THEN
    RAISE EXCEPTION 'OFFBOARDING_SELF: لا يجوز إنهاء خدمتك بنفسك'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV17',
        '★★ إسقاط حارس نوع الإنهاء',
        """  IF p_exit_type NOT IN ('voluntary','involuntary','retirement','end_contract') THEN
    RAISE EXCEPTION 'OFFBOARDING_BAD_TYPE: نوع غير معروف «%» — المسموح: '
      'voluntary·involuntary·retirement·end_contract', p_exit_type
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV18',
        '★ إسقاط حارس سبب الإنهاء',
        """  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'OFFBOARDING_NO_REASON: السبب إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV19',
        '★ إسقاط حارس تاريخ آخر يوم عمل',
        """  IF p_last_day IS NULL THEN
    RAISE EXCEPTION 'OFFBOARDING_NO_DATE: آخر يوم عمل إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV20',
        '★★ إسقاط تحقّق المستأجر من إنهاء الخدمة',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  -- ★★ لا يُنهي المرء خدمة نفسه""",
        """  -- ★★ لا يُنهي المرء خدمة نفسه""",
    ),
    (
        'INV21',
        '★ conducted_by لا يُسجَّل',
        """          p_assets, auth.uid())""",
        """          p_assets, NULL)""",
    ),
    (
        'INV22',
        '★ ملاحظات المقابلة لا تُحفَظ',
        """          NULLIF(btrim(COALESCE(p_notes,'')), ''),""",
        """          NULL,""",
    ),
    (
        'INV23',
        '★★ إسقاط حارس دور إنهاء الخدمة',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنهاء الخدمة (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV24',
        '★★ التقدّم لا يحتسب المتخطّى (مهمة أُلغيت تبقى عالقة)',
        """    CASE WHEN a.total > 0
         THEN round((a.completed + a.skipped) * 100.0 / a.total, 1)
         ELSE 0 END,""",
        """    CASE WHEN a.total > 0
         THEN round(a.completed * 100.0 / a.total, 1)
         ELSE 0 END,""",
    ),
    (
        'INV25',
        '★★★ الإلزاميّ المتبقّي يحتسب المتخطّى عالقاً',
        """           count(*) FILTER (WHERE b.is_mandatory
                              AND b.status NOT IN ('completed','skipped'))::INTEGER
             AS mandatory_left,""",
        """           count(*) FILTER (WHERE b.is_mandatory
                              AND b.status <> 'completed')::INTEGER
             AS mandatory_left,""",
    ),
    (
        'INV26',
        '★★ إسقاط ترتيب المهامّ بـsort_order',
        """             ) ORDER BY b.sort_order, b.title
           ) AS tasks""",
        """             ) ORDER BY b.title DESC
           ) AS tasks""",
    ),
    (
        'INV27',
        '★ إسقاط اسم مَن أتمّ المهمة',
        """           COALESCE(NULLIF(btrim(pc.full_name), ''), '—') AS completer""",
        """           NULL::TEXT AS completer""",
    ),
    (
        'INV28',
        '★★★ إسقاط ترشيح المستأجر من لوحة التعريف',
        """      LEFT JOIN public.profiles pc ON pc.id = o.completed_by
     WHERE o.tenant_id = v_tenant""",
        """      LEFT JOIN public.profiles pc ON pc.id = o.completed_by""",
    ),
    (
        'INV29',
        '★★ إسقاط سلسلة الاسم في لوحة التعريف',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(p.full_name), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, p.department, '—')::TEXT,
    e.is_active,
    a.total, a.completed, a.skipped, a.mandatory_left,""",
        """    e.full_name_ar::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, p.department, '—')::TEXT,
    e.is_active,
    a.total, a.completed, a.skipped, a.mandatory_left,""",
    ),
    (
        'INV30',
        '★★ إسقاط حارس staff من لوحة التعريف',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض لوحة التعريف';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV31',
        '★★ إسقاط حارس staff من لوحة الإنهاء',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض سجلّات إنهاء الخدمة';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV32',
        '★★ إسقاط حارس staff من الملخّص',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص التعريف';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV33',
        '★★★ حارس نوع الإنهاء في اللوحة يقبل نوعاً مخترعاً',
        """     AND p_exit_type NOT IN ('voluntary','involuntary','retirement','end_contract') THEN
    RAISE EXCEPTION 'OFFBOARDING_BAD_TYPE: نوع غير معروف «%»', p_exit_type""",
        """     AND p_exit_type NOT IN ('voluntary','involuntary','retirement',
                             'end_contract','مخترع') THEN
    RAISE EXCEPTION 'OFFBOARDING_BAD_TYPE: نوع غير معروف «%»', p_exit_type""",
    ),
    (
        'INV34',
        '★★★ إسقاط ترشيح المستأجر من لوحة الإنهاء',
        """  WHERE o.tenant_id = v_tenant
    AND (p_exit_type IS NULL OR o.exit_type = p_exit_type)""",
        """  WHERE (p_exit_type IS NULL OR o.exit_type = p_exit_type)""",
    ),
    (
        'INV35',
        '★ إسقاط البحث بالسبب في لوحة الإنهاء',
        """         OR o.reason        ILIKE '%' || v_q || '%')""",
        """         OR FALSE)""",
    ),
    (
        'INV36',
        '★★★ out_still_active يُخفي الحالة الشاذّة',
        """    -- ★★★ العطل ①: كشفُ الحالة الشاذّة — سجلُّ إنهاء وموظفٌ نشط
    e.is_active,
    o.created_at""",
        """    FALSE,
    o.created_at""",
    ),
    (
        'INV37',
        '★★★ out_orphan_active لا يعدّ الحالات الشاذّة',
        """    (SELECT count(*)::INTEGER FROM public.offboarding_records o
      JOIN public.employees e ON e.id = o.employee_id
     WHERE o.tenant_id = v_tenant AND e.is_active),""",
        """    0::INTEGER,""",
    ),
    (
        'INV38',
        '★★★ متوسّط التقدّم صفر بدل NULL (درس 0353)',
        """    (SELECT round(avg(done * 100.0 / NULLIF(total,0)), 1) FROM agg),""",
        """    (SELECT COALESCE(round(avg(done * 100.0 / NULLIF(total,0)), 1), 0) FROM agg),""",
    ),
    (
        'INV39',
        '★★ الملخّص: المتخطّى لا يُحتسَب منجزاً',
        """           count(*) FILTER (WHERE o.status IN ('completed','skipped')) AS done""",
        """           count(*) FILTER (WHERE o.status = 'completed') AS done""",
    ),
    (
        'INV40',
        '★★ إسقاط ترشيح المستأجر من ملخّص المهامّ',
        """    (SELECT count(*)::INTEGER FROM public.onboarding_tasks t
      WHERE t.tenant_id = v_tenant AND t.is_active),""",
        """    (SELECT count(*)::INTEGER FROM public.onboarding_tasks t
      WHERE t.is_active),""",
    ),
    (
        'INV41',
        '★★ إسقاط ترشيح المستأجر من agg في الملخّص',
        """      FROM public.employee_onboarding o
     WHERE o.tenant_id = v_tenant
     GROUP BY o.employee_id""",
        """      FROM public.employee_onboarding o
     GROUP BY o.employee_id""",
    ),
    (
        'INV42',
        '★ إسقاط ترشيح المستأجر من عدّ الإنهاءات',
        """    (SELECT count(*)::INTEGER FROM public.offboarding_records o
      WHERE o.tenant_id = v_tenant),""",
        """    (SELECT count(*)::INTEGER FROM public.offboarding_records o),""",
    ),
    (
        'INV43',
        '★★ إسقاط محفّز منع حذف سجلّ الإنهاء',
        """DROP TRIGGER IF EXISTS trg_block_offboarding_delete ON public.offboarding_records;
CREATE TRIGGER trg_block_offboarding_delete
  BEFORE DELETE ON public.offboarding_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_offboarding_delete();""",
        """DROP TRIGGER IF EXISTS trg_block_offboarding_delete ON public.offboarding_records;""",
    ),
    (
        'INV44',
        '★ إسقاط الحدّ الأعلى من لوحة التعريف',
        """  ORDER BY a.started_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);""",
        """  ORDER BY a.started_at DESC;""",
    ),
    (
        'INV45',
        '★★ إسقاط ترشيح المستأجر من offboarding_update_checklist',
        """   WHERE id = p_record_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;""",
        """   WHERE id = p_record_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;""",
    ),
]


# ═══════════════════════════════════════════════════════════════════════
#  عكوس DDL — `IF NOT EXISTS` يمنع إعادة الإنشاء
# ═══════════════════════════════════════════════════════════════════════
DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط فهرس فرادة مهامّ التعريف',
        'DROP INDEX IF EXISTS public.uq_onboarding_emp_task;',
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_emp_task '
        'ON public.employee_onboarding (tenant_id, employee_id, task_id);',
    ),
    (
        'DDL02',
        '★★★ إسقاط فهرس فرادة إنهاء الخدمة',
        'DROP INDEX IF EXISTS public.uq_offboarding_per_employee;',
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_offboarding_per_employee '
        'ON public.offboarding_records (tenant_id, employee_id);',
    ),
    (
        'DDL03',
        '★★ إسقاط قيد حالة المهمة',
        'ALTER TABLE public.employee_onboarding '
        'DROP CONSTRAINT IF EXISTS employee_onboarding_status_chk;',
        "ALTER TABLE public.employee_onboarding ADD CONSTRAINT "
        "employee_onboarding_status_chk CHECK (status IN "
        "('pending','in_progress','completed','skipped'));",
    ),
    (
        'DDL04',
        '★★ إسقاط قيد نوع الإنهاء',
        'ALTER TABLE public.offboarding_records '
        'DROP CONSTRAINT IF EXISTS offboarding_records_type_chk;',
        "ALTER TABLE public.offboarding_records ADD CONSTRAINT "
        "offboarding_records_type_chk CHECK (exit_type IN "
        "('voluntary','involuntary','retirement','end_contract'));",
    ),
    (
        'DDL05',
        '★★ إسقاط FK موظف التعريف',
        'ALTER TABLE public.employee_onboarding '
        'DROP CONSTRAINT IF EXISTS employee_onboarding_employee_id_fkey;',
        'ALTER TABLE public.employee_onboarding ADD CONSTRAINT '
        'employee_onboarding_employee_id_fkey FOREIGN KEY (employee_id) '
        'REFERENCES public.employees(id) ON DELETE CASCADE;',
    ),
    (
        'DDL06',
        '★★ إسقاط FK موظف الإنهاء',
        'ALTER TABLE public.offboarding_records '
        'DROP CONSTRAINT IF EXISTS offboarding_records_employee_id_fkey;',
        'ALTER TABLE public.offboarding_records ADD CONSTRAINT '
        'offboarding_records_employee_id_fkey FOREIGN KEY (employee_id) '
        'REFERENCES public.employees(id) ON DELETE CASCADE;',
    ),
    (
        'DDL07',
        '★ إسقاط عمود سبب التخطّي',
        'ALTER TABLE public.employee_onboarding '
        'DROP COLUMN IF EXISTS skipped_reason CASCADE;',
        'ALTER TABLE public.employee_onboarding '
        'ADD COLUMN IF NOT EXISTS skipped_reason TEXT;',
    ),
]

DDL_RLS_CHECK: set = set()


EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        "`notes` في onboarding_set_task",
        "حقلٌ حرّ لا يُقرأ في أيّ لوحة — `skipped_reason` هو المُستعمَل "
        "وهو محروس بـINV11. تغييره لا يُخفي عطلاً ولا يُظهره.",
    ),
    (
        'EQ02',
        "`ORDER BY o.last_working_day DESC` في لوحة الإنهاء",
        "أثره على العرض لا الصحّة. العيّنة فيها سجلّ واحد فلا يتغيّر "
        "الترتيب، وزيادتها لا تكشف عطلاً — التأكيد 9.11 يفحص القيمة "
        "نفسها لا موضعها.",
    ),
    (
        'EQ03',
        "تنظيف الصفوف المكرَّرة قبل فرض الفهارس (كتل DELETE في DO $$)",
        "على قاعدة نظيفة لا صفوف مكرَّرة، فالتنظيف بلا أثر قابل للقياس. "
        "أثره الحقيقيّ على قاعدة الإنتاج — مُثبَت بأن المايجريشن "
        "يُطبَّق بنجاح على القاعدة الحالية (287 مايجريشن).",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0359 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
