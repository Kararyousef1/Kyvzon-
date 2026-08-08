#!/usr/bin/env python3
"""
عكس إصلاحات 0368 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

الاستعمال:
    PGPORT=5506 python3 tools/dev/_invert_0368.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0368_shift_scheduling_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-shift-scheduling-0368.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-shift-scheduling-0368-rls.sh')

PGPORT = os.environ.get('PGPORT', '5506')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   السبب مُثبَت: ملف SQL يستدعي الدوال بسياق **هدى (hr)** وهي staff
#   فعلاً، فحرّاس الدور لا تظهر إلّا بدور موظفٍ حقيقيّ.
RLS_CHECK: set = set()
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
    # ── المحفّز ───────────────────────────────────────────────────
    (
        'INV01',
        '★★★★ حارس الإجازة المعتمدة يسقط — العطل ⑨ بعينه',
        """  IF FOUND THEN
    RAISE EXCEPTION 'SHIFT_ON_APPROVED_LEAVE: الموظف في إجازةٍ معتمدة من % إلى % — لا تُجدول وردية يوم %',
      v_leave.date_from, v_leave.date_to, NEW.shift_date;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV02',
        '★★★ شرط «الإجازة معتمدة» يسقط ⇒ إجازةٌ منتظرة تمنع أيضاً',
        """     AND l.status      = 'موافق'
     AND NEW.shift_date BETWEEN l.date_from AND l.date_to""",
        """     AND NEW.shift_date BETWEEN l.date_from AND l.date_to""",
    ),
    (
        'INV03',
        '★★★ شرط صاحب الإجازة يسقط ⇒ إجازةُ زميلٍ تمنع',
        """    FROM public.leaves l
   WHERE l.employee_id = NEW.employee_id
     AND l.tenant_id   = NEW.tenant_id""",
        """    FROM public.leaves l
   WHERE l.tenant_id   = NEW.tenant_id""",
    ),
    (
        'INV04',
        '★★★ حارس الراحة (صباحية بعد ليلية) يسقط — العطل ⑩',
        """  IF v_prev = 'night' AND NEW.shift_type = 'morning' THEN
    RAISE EXCEPTION 'SHIFT_NO_REST: وردية ليلية يوم % تنتهي الثامنة صباحاً — لا تُسند صباحية يوم %',
      NEW.shift_date - 1, NEW.shift_date;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV05',
        '★★★ الاتّجاه المعاكس لحارس الراحة يسقط',
        """  IF NEW.shift_type = 'night' AND v_next = 'morning' THEN
    RAISE EXCEPTION 'SHIFT_NO_REST: وردية صباحية مُسندةٌ يوم % — لا تُسند ليلية يوم %',
      NEW.shift_date + 1, NEW.shift_date;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV06',
        '★★ حارس الراحة يصير عامّاً ⇒ يمنع المسائية بعد الليلية أيضاً',
        """  IF v_prev = 'night' AND NEW.shift_type = 'morning' THEN""",
        """  IF v_prev = 'night' THEN""",
    ),
    (
        'INV07',
        '★★★ حدُّ الماضي يسقط — العطل ⑧',
        """  IF NEW.shift_date < v_today - 90 THEN
    RAISE EXCEPTION 'SHIFT_DATE_TOO_OLD: لا تُجدول وردية قبل تسعين يوماً من اليوم (% مقابل %)',
      NEW.shift_date, v_today;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV08',
        '★★★ حدُّ المستقبل يسقط',
        """  IF NEW.shift_date > v_today + 365 THEN
    RAISE EXCEPTION 'SHIFT_DATE_TOO_FAR: لا تُجدول وردية بعد سنةٍ من اليوم (% مقابل %)',
      NEW.shift_date, v_today;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV09',
        '★★ الحدّ يصير صارماً بلا داعٍ (< بدل <=) ⇒ يرفض اليوم -90 نفسه',
        """  IF NEW.shift_date < v_today - 90 THEN""",
        """  IF NEW.shift_date <= v_today - 90 THEN""",
    ),
    (
        'INV10',
        '★★★ توقيت بغداد يسقط من المحفّز — v_today يُزاح ألف يوم',
        """  v_today   DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_leave   RECORD;""",
        """  v_today   DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1000);
  v_leave   RECORD;""",
    ),
    (
        'INV11',
        '★★ ملءُ assigned_by يسقط — العطل ⑦',
        """  IF NEW.assigned_by IS NULL THEN
    NEW.assigned_by := auth.uid();
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV12',
        '★★★ تجميد المستأجر والموظف يسقط',
        """    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.created_at  := OLD.created_at;""",
        """    NULL;""",
    ),
    (
        'INV13',
        '★★★ محفّز منع الحذف يصير بلا أثر — العطل ⑪',
        """  RAISE EXCEPTION 'SHIFT_DELETE_BLOCKED: الوردية المُسندة لا تُحذف — استعمل shift_cancel() (id=%)',
    OLD.id;""",
        """  RETURN OLD;""",
    ),
    (
        'INV14',
        '★★ الملغاة تُحرَس أيضاً ⇒ إحياءٌ مستحيلٌ بعد إجازة',
        """  IF NEW.status = 'cancelled' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;""",
        """  NULL;""",
    ),
    # ── اللوح ─────────────────────────────────────────────────────
    (
        'INV15',
        '★★★★ اسم الوردية يعود من نصّ الجدول لا من structure_shifts',
        """    COALESCE(NULLIF(btrim(s.name_ar), ''), a.shift_type)::TEXT,
    to_char(s.start_time, 'HH24:MI')::TEXT,
    to_char(s.end_time,   'HH24:MI')::TEXT,""",
        """    a.shift_type::TEXT,
    NULL::TEXT,
    NULL::TEXT,""",
    ),
    (
        'INV16',
        '★★★ الانضمام بـstructure_shifts يُسقط ترشيح المستأجر',
        """         ON s.code = a.shift_type
        AND (s.tenant_id IS NULL OR s.tenant_id = a.tenant_id)""",
        """         ON s.code = a.shift_type""",
    ),
    (
        'INV17',
        '★★★ الاسم المُركَّب يسقط — full_name_ar فارغٌ بنيوياً',
        """    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    e.employee_code::TEXT,
    a.shift_date,""",
        """    e.full_name_ar::TEXT,
    e.employee_code::TEXT,
    a.shift_date,""",
    ),
    (
        'INV18',
        '★★★ نافذة اللوح تسقط ⇒ يعود كلَّ شيء (العطل ⑭)',
        """  WHERE a.shift_date >= v_from
    AND a.shift_date <  v_from + v_days""",
        """  WHERE TRUE""",
    ),
    (
        'INV19',
        '★★★ is_past يسقط توقيت بغداد',
        """    (a.shift_date < v_today),""",
        """    (a.shift_date < v_today + 1000),""",
    ),
    (
        'INV20',
        '★★★★ on_leave يتجاهل حالة الإجازة',
        """             WHERE l.employee_id = a.employee_id
               AND l.tenant_id   = a.tenant_id
               AND l.status      = 'موافق'
               AND a.shift_date BETWEEN l.date_from AND l.date_to),""",
        """             WHERE l.employee_id = a.employee_id
               AND l.tenant_id   = a.tenant_id
               AND a.shift_date BETWEEN l.date_from AND l.date_to
               AND FALSE),""",
    ),
    (
        'INV21',
        '★★★ ترتيب اللوح يسقط',
        """  ORDER BY a.shift_date, e.employee_code NULLS LAST, a.id;""",
        """  ORDER BY a.id;""",
    ),
    # ── الملخّص ───────────────────────────────────────────────────
    (
        'INV22',
        '★★★ عدّاد الملغاة يصير صفراً بنيوياً',
        """    (SELECT count(*) FROM win WHERE status = 'cancelled')::INTEGER,""",
        """    0::INTEGER,""",
    ),
    (
        'INV23',
        '★★★ scheduled يعدّ الملغاة أيضاً',
        """    (SELECT count(*) FROM win WHERE status = 'scheduled')::INTEGER,""",
        """    (SELECT count(*) FROM win)::INTEGER,""",
    ),
    (
        'INV24',
        '★★ morning يعدّ الملغاة',
        """    (SELECT count(*) FROM win WHERE shift_type='morning'  AND status='scheduled')::INTEGER,""",
        """    (SELECT count(*) FROM win WHERE shift_type='morning')::INTEGER,""",
    ),
    (
        'INV25',
        '★★★ covered_days يعدّ الملغاة',
        """    (SELECT count(DISTINCT shift_date) FROM win WHERE status='scheduled')::INTEGER,""",
        """    (SELECT count(DISTINCT shift_date) FROM win)::INTEGER,""",
    ),
    (
        'INV26',
        '★★★ staffed يعدّ الملغاة',
        """    (SELECT count(DISTINCT employee_id) FROM win WHERE status='scheduled')::INTEGER,""",
        """    (SELECT count(DISTINCT employee_id) FROM win)::INTEGER,""",
    ),
    (
        'INV27',
        '★★★★ عدّاد leave_conflict يصير صفراً بنيوياً',
        """    (SELECT count(*) FROM win w
      WHERE w.status='scheduled'
        AND EXISTS (SELECT 1 FROM public.leaves l
                     WHERE l.employee_id = w.employee_id
                       AND l.tenant_id   = w.tenant_id
                       AND l.status      = 'موافق'
                       AND w.shift_date BETWEEN l.date_from AND l.date_to))::INTEGER;""",
        """    0::INTEGER;""",
    ),
    (
        'INV28',
        '★★ نافذة الملخّص تسقط',
        """     WHERE a.shift_date >= v_from AND a.shift_date < v_from + v_days""",
        """     WHERE TRUE""",
    ),
    # ── shift_assign ─────────────────────────────────────────────
    (
        'INV29',
        '★★★★ العطل ①: schedule_id يعود معدوماً في الإسناد',
        """  VALUES (v_tenant, COALESCE(p_batch, gen_random_uuid()), p_employee_id,
          p_shift_type, p_shift_date,
          NULLIF(btrim(COALESCE(p_notes,'')),''), auth.uid())""",
        """  VALUES (v_tenant, p_batch, p_employee_id,
          p_shift_type, p_shift_date,
          NULLIF(btrim(COALESCE(p_notes,'')),''), auth.uid())""",
    ),
    (
        'INV30',
        '★★★ حارس الدور في الإسناد يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SHIFT_NOT_STAFF: جدولة الورديات للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV31',
        '★★★ حارس النوع في الإسناد يسقط (يبقى القيد وحده)',
        """  IF p_shift_type NOT IN ('morning','evening','night','flexible') THEN
    RAISE EXCEPTION 'SHIFT_BAD_TYPE: نوع وردية غير معروف %', p_shift_type;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV32',
        '★★★ ON CONFLICT يسقط ⇒ إعادة الإسناد ترمي',
        """  ON CONFLICT (employee_id, shift_date) DO UPDATE
     SET shift_type = EXCLUDED.shift_type,
         notes      = EXCLUDED.notes,
         status     = 'scheduled',
         cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL,
         updated_at = now()""",
        """  ON CONFLICT (employee_id, shift_date) DO NOTHING""",
    ),
    (
        'INV33',
        '★★★ إعادة الإسناد لا تُفرغ حقول الإلغاء ⇒ القيد يرفض',
        """         status     = 'scheduled',
         cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL,""",
        """         status     = 'scheduled',""",
    ),
    (
        'INV34',
        '★★ btrim على الملاحظات يسقط',
        """          NULLIF(btrim(COALESCE(p_notes,'')),''), auth.uid())""",
        """          p_notes, auth.uid())""",
    ),
    (
        'INV35',
        '★★★ المُسنِد يعود معدوماً في الإسناد',
        """          NULLIF(btrim(COALESCE(p_notes,'')),''), auth.uid())
  -- ★ إعادة الإسناد لليوم نفسه تُحدّث بدل أن ترمي (الفهرس الفريد)""",
        """          NULLIF(btrim(COALESCE(p_notes,'')),''), NULL)
  -- ★ إعادة الإسناد لليوم نفسه تُحدّث بدل أن ترمي (الفهرس الفريد)""",
    ),
    # ── shift_cancel ─────────────────────────────────────────────
    (
        'INV36',
        '★★★ حارس الدور في الإلغاء يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'SHIFT_NOT_STAFF: الإلغاء للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV37',
        '★★★ حارس سبب الإلغاء يسقط',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'SHIFT_CANCEL_REASON_REQUIRED: سبب الإلغاء مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV38',
        '★★ الإلغاء المكرَّر يعيد TRUE',
        """  IF v_status = 'cancelled' THEN RETURN FALSE; END IF;""",
        """  NULL;""",
    ),
    (
        'INV39',
        '★★ ترشيح المستأجر في الإلغاء يسقط',
        """  SELECT status INTO v_status FROM public.shift_assignments
   WHERE id = p_id AND tenant_id = v_tenant;""",
        """  SELECT status INTO v_status FROM public.shift_assignments
   WHERE id = p_id;""",
    ),
    (
        'INV40',
        '★★★ الإلغاء يتوقّف عن ملء cancelled_by ⇒ القيد يرفض',
        """     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),""",
        """     SET status = 'cancelled',
         cancelled_at = now(),""",
    ),
    # ── shift_leave_conflicts ────────────────────────────────────
    (
        'INV41',
        '★★★ كاشف التعارضات يتجاهل حالة الإجازة',
        """   AND l.status      = 'موافق'
   AND a.shift_date BETWEEN l.date_from AND l.date_to
  LEFT JOIN public.employees e""",
        """   AND a.shift_date BETWEEN l.date_from AND l.date_to
   AND FALSE
  LEFT JOIN public.employees e""",
    ),
    (
        'INV42',
        '★★ كاشف التعارضات يشمل الملغاة',
        """  WHERE a.status = 'scheduled'
    AND a.shift_date >= v_from
    AND a.shift_date <  v_from + v_days""",
        """  WHERE a.shift_date >= v_from
    AND a.shift_date <  v_from + v_days""",
    ),
    (
        'INV43',
        '★★ نافذة كاشف التعارضات تسقط',
        """    AND a.shift_date >= v_from
    AND a.shift_date <  v_from + v_days
  ORDER BY a.shift_date, a.id;""",
        """    AND TRUE
  ORDER BY a.shift_date, a.id;""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★★ العطل ①: schedule_id يفقد افتراضيّه — كلُّ إدراجٍ يفشل',
        'ALTER TABLE public.shift_assignments ALTER COLUMN schedule_id DROP DEFAULT;',
        'ALTER TABLE public.shift_assignments '
        'ALTER COLUMN schedule_id SET DEFAULT gen_random_uuid();',
    ),
    (
        'DDL02',
        '★★★ إسقاط FK الموظف المركَّب',
        'ALTER TABLE public.shift_assignments '
        'DROP CONSTRAINT IF EXISTS fk_shift_employee_tenant;',
        'ALTER TABLE public.shift_assignments ADD CONSTRAINT fk_shift_employee_tenant '
        'FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL03',
        '★★★ استبدال FK المركَّب بمفرد ⇒ العبور يعود (العطل ④)',
        'ALTER TABLE public.shift_assignments '
        'DROP CONSTRAINT IF EXISTS fk_shift_employee_tenant; '
        'ALTER TABLE public.shift_assignments ADD CONSTRAINT fk_shift_employee_tenant '
        'FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE RESTRICT;',
        'ALTER TABLE public.shift_assignments '
        'DROP CONSTRAINT IF EXISTS fk_shift_employee_tenant; '
        'ALTER TABLE public.shift_assignments ADD CONSTRAINT fk_shift_employee_tenant '
        'FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL04',
        '★★★ tenant_id يعود قابلاً للعدم (العطل ⑤)',
        'ALTER TABLE public.shift_assignments ALTER COLUMN tenant_id DROP NOT NULL;',
        'ALTER TABLE public.shift_assignments ALTER COLUMN tenant_id SET NOT NULL;',
    ),
    (
        'DDL05',
        '★★★★ إسقاط CHECK المفردات (العطل ⑥) — ومفردات الصفحة القديمة تعود',
        'ALTER TABLE public.shift_assignments '
        'DROP CONSTRAINT IF EXISTS chk_shift_type_vocab;',
        "ALTER TABLE public.shift_assignments ADD CONSTRAINT chk_shift_type_vocab "
        "CHECK (shift_type IN ('morning','evening','night','flexible'));",
    ),
    (
        'DDL06',
        '★★★ إسقاط CHECK اكتمال الإلغاء',
        'ALTER TABLE public.shift_assignments '
        'DROP CONSTRAINT IF EXISTS chk_shift_cancelled_complete;',
        "ALTER TABLE public.shift_assignments ADD CONSTRAINT chk_shift_cancelled_complete "
        "CHECK ((status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL "
        "AND cancel_reason IS NULL) OR (status = 'cancelled' AND cancelled_at IS NOT NULL "
        "AND cancelled_by IS NOT NULL AND btrim(COALESCE(cancel_reason,'')) <> ''));",
    ),
    (
        'DDL07',
        '★★ إسقاط CHECK الحالة',
        'ALTER TABLE public.shift_assignments '
        'DROP CONSTRAINT IF EXISTS chk_shift_status;',
        "ALTER TABLE public.shift_assignments ADD CONSTRAINT chk_shift_status "
        "CHECK (status IN ('scheduled','cancelled'));",
    ),
    (
        'DDL08',
        '★★★ تعطيل محفّز الحراسة كاملاً',
        'DROP TRIGGER IF EXISTS trg_shift_assignment_guard ON public.shift_assignments;',
        'CREATE TRIGGER trg_shift_assignment_guard BEFORE INSERT OR UPDATE '
        'ON public.shift_assignments FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_shift_assignment_guard();',
    ),
    (
        'DDL09',
        '★★★ تعطيل منع الحذف',
        'DROP TRIGGER IF EXISTS trg_block_shift_delete ON public.shift_assignments;',
        'CREATE TRIGGER trg_block_shift_delete BEFORE DELETE '
        'ON public.shift_assignments FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_block_shift_delete();',
    ),
    (
        'DDL10',
        '★★★ إسقاط الفهرس الفريد ⇒ ورديتان في اليوم نفسه',
        'DROP INDEX IF EXISTS public.idx_unique_employee_shift_date;',
        'CREATE UNIQUE INDEX idx_unique_employee_shift_date '
        'ON public.shift_assignments USING btree (employee_id, shift_date);',
    ),
    (
        'DDL11',
        '★★★ anon يستعيد EXECUTE على shift_assign',
        'GRANT EXECUTE ON FUNCTION public.shift_assign(UUID, TEXT, DATE, TEXT, UUID) TO anon;',
        'REVOKE ALL ON FUNCTION public.shift_assign(UUID, TEXT, DATE, TEXT, UUID) FROM anon;',
    ),
    (
        'DDL12',
        '★★★ anon يستعيد EXECUTE على shift_cancel',
        'GRANT EXECUTE ON FUNCTION public.shift_cancel(UUID, TEXT) TO anon;',
        'REVOKE ALL ON FUNCTION public.shift_cancel(UUID, TEXT) FROM anon;',
    ),
]

EQUIVALENT_INVERSIONS: list = []


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0368 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
            if ident in DDL_RLS_CHECK:
                ver = run_rls()
                tag = 'RLS'
            else:
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
