#!/usr/bin/env python3
"""
عكس إصلاحات 0367 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

الاستعمال:
    PGPORT=5503 python3 tools/dev/_invert_0367.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0367_hr_service_center_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-hr-service-center-0367.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-hr-service-center-0367-rls.sh')

PGPORT = os.environ.get('PGPORT', '5503')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   السبب مُثبَت لا مُفترَض: ملف SQL يعمل بدور postgres (BYPASSRLS)
#   فلا يمرّ من سياسات RLS إطلاقاً — وكل إصلاحات السياسات هنا.
RLS_CHECK = {'POL01', 'POL02', 'POL03', 'POL04'}
DDL_RLS_CHECK = {'POL01', 'POL02', 'POL03', 'POL04'}


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
    # ── محفّز hr_cases ────────────────────────────────────────────
    (
        'INV01',
        '★★★ sla_due_at يعود عموداً ميتاً (العطل ⑮)',
        """    IF NEW.sla_due_at IS NULL THEN
      NEW.sla_due_at := NEW.created_at + CASE NEW.priority
        WHEN 'urgent' THEN INTERVAL '4 hours'
        WHEN 'normal' THEN INTERVAL '2 days'
        ELSE               INTERVAL '5 days'
      END;
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV02',
        '★★ مهلة العاجل تصير يوماً بدل أربع ساعات',
        """      NEW.sla_due_at := NEW.created_at + CASE NEW.priority
        WHEN 'urgent' THEN INTERVAL '4 hours'
        WHEN 'normal' THEN INTERVAL '2 days'
        ELSE               INTERVAL '5 days'
      END;
    END IF;
  ELSE""",
        """      NEW.sla_due_at := NEW.created_at + CASE NEW.priority
        WHEN 'urgent' THEN INTERVAL '1 day'
        WHEN 'normal' THEN INTERVAL '2 days'
        ELSE               INTERVAL '5 days'
      END;
    END IF;
  ELSE""",
    ),
    (
        'INV03',
        '★★ تغيّر الأولوية لا يُعيد حساب الاستحقاق',
        """    IF NEW.priority <> OLD.priority THEN
      NEW.sla_due_at := NEW.created_at + CASE NEW.priority
        WHEN 'urgent' THEN INTERVAL '4 hours'
        WHEN 'normal' THEN INTERVAL '2 days'
        ELSE               INTERVAL '5 days'
      END;
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV04',
        '★★★ first_response_at يتوقّف عن الامتلاء',
        """    IF NEW.first_response_at IS NULL
       AND (NEW.status <> 'open'
            OR (NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL)
            OR btrim(COALESCE(NEW.resolution_summary,'')) <> '') THEN
      NEW.first_response_at := now();
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV05',
        '★★★ resolved_at يتوقّف عن الامتلاء آلياً ⇒ القيد يرفض',
        """    IF NEW.status IN ('resolved','closed') AND OLD.status NOT IN ('resolved','closed') THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV06',
        '★★ closed_at يتوقّف عن الامتلاء',
        """    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := COALESCE(NEW.closed_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV07',
        '★★★ إعادة الفتح تتوقّف عن العدّ وعن إفراغ الحلّ',
        """      NEW.reopened_count := OLD.reopened_count + 1;
      NEW.resolved_at    := NULL;
      NEW.closed_at      := NULL;""",
        """      NULL;""",
    ),
    (
        'INV08',
        '★★★ تجميد المستأجر والموظف يسقط',
        """    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    NEW.created_at  := OLD.created_at;

    -- ★ أول ردٍّ فعليّ""",
        """    NULL;

    -- ★ أول ردٍّ فعليّ""",
    ),
    # ── محفّز الخطابات ────────────────────────────────────────────
    (
        'INV09',
        '★★★ issued_at يتوقّف عن الامتلاء',
        """    IF NEW.status = 'ready' AND OLD.status <> 'ready' THEN
      NEW.issued_at := COALESCE(NEW.issued_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV10',
        '★★★ delivered_at يتوقّف عن الامتلاء ⇒ القيد يرفض',
        """    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
      NEW.delivered_at := COALESCE(NEW.delivered_at, now());
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV11',
        '★★★ الخروج من «مرفوض» لا يُفرغ السبب ⇒ القيد يرفض',
        """    IF NEW.status <> 'rejected' THEN
      NEW.rejection_reason := NULL;
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV12',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطلان ④/⑥)',
        """  RAISE EXCEPTION 'SERVICE_CENTER_DELETE_BLOCKED: سجلّات مركز الخدمات لا تُحذف — استعمل الإغلاق أو الرفض (%s id=%)',
    TG_TABLE_NAME, OLD.id;""",
        """  RETURN OLD;""",
    ),
    # ── اللوح ─────────────────────────────────────────────────────
    (
        'INV13',
        '★★★ الاسم المُركَّب يسقط — full_name_ar فارغٌ بنيوياً',
        """    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,
    e.employee_code::TEXT,
    c.case_type::TEXT,""",
        """    e.full_name_ar::TEXT,
    e.employee_code::TEXT,
    c.case_type::TEXT,""",
    ),
    (
        'INV14',
        '★★★ is_overdue يتجاهل الحالة ⇒ المُغلق المتأخّر يُعدّ متأخّراً',
        """    (c.sla_due_at IS NOT NULL
       AND c.sla_due_at < now()
       AND c.status NOT IN ('resolved','closed')),""",
        """    (c.sla_due_at IS NOT NULL AND c.sla_due_at < now()),""",
    ),
    (
        'INV15',
        '★★★ ترتيب اللوح يسقط — المُغلق يختلط بالمفتوح',
        """  ORDER BY
    CASE WHEN c.status IN ('resolved','closed') THEN 1 ELSE 0 END,
    CASE c.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
    c.sla_due_at ASC NULLS LAST,
    c.created_at DESC,
    c.id DESC""",
        """  ORDER BY c.created_at ASC""",
    ),
    (
        'INV16',
        '★★ ترشيح الحالة في لوح الطلبات يصير بلا أثر',
        """  WHERE (p_status   IS NULL OR c.status   = p_status)""",
        """  WHERE (p_status   IS NULL OR TRUE)""",
    ),
    (
        'INV17',
        '★★ ترشيح الأولوية يصير بلا أثر',
        """    AND (p_priority IS NULL OR c.priority = p_priority)""",
        """    AND (p_priority IS NULL OR TRUE)""",
    ),
    (
        'INV18',
        '★★★ البحث بالاسم المُركَّب يسقط (يبقى full_name_ar وهو NULL)',
        """      OR COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
           ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(e.employee_code,'') ILIKE '%' || btrim(p_search) || '%'
    )
  -- ★★★ ترتيبٌ حتميّ""",
        """      OR FALSE
    )
  -- ★★★ ترتيبٌ حتميّ""",
    ),
    (
        'INV19',
        '★★★ waiting_days يسقط توقيت بغداد',
        """    CASE WHEN l.status IN ('delivered','rejected') THEN NULL
         ELSE (v_today - (l.created_at AT TIME ZONE 'Asia/Baghdad')::DATE)
    END::INTEGER,""",
        """    CASE WHEN l.status IN ('delivered','rejected') THEN NULL
         ELSE (v_today - (l.created_at AT TIME ZONE 'Asia/Baghdad')::DATE + 3)
    END::INTEGER,""",
    ),
    (
        'INV20',
        '★★ شرط «المُنجز بلا انتظار» يسقط ⇒ يُحسب للمُسلَّم أيضاً',
        # ★ سقط أوّلاً بـNO_MATCH: كتبتُ سطرَي DECLARE/BEGIN بمسافتين
        #   بادئتين والأصل `DECLARE v_today …` على سطرٍ واحد.
        #   الحارس `if old not in original` أمسك زيف العكس.
        """    CASE WHEN l.status IN ('delivered','rejected') THEN NULL
         ELSE (v_today - (l.created_at AT TIME ZONE 'Asia/Baghdad')::DATE)
    END::INTEGER,
    l.created_at""",
        """    (v_today - (l.created_at AT TIME ZONE 'Asia/Baghdad')::DATE)::INTEGER,
    l.created_at""",
    ),
    # ── الملخّص ───────────────────────────────────────────────────
    (
        'INV21',
        '★★★ عدّاد المتأخّرات يصير صفراً بنيوياً',
        """    (SELECT count(*) FROM public.hr_cases
      WHERE sla_due_at IS NOT NULL AND sla_due_at < now()
        AND status NOT IN ('resolved','closed'))::INTEGER,""",
        """    0::INTEGER,""",
    ),
    (
        'INV22',
        '★★ عدّاد إعادة الفتح يصير صفراً',
        """    (SELECT count(*) FROM public.hr_cases WHERE reopened_count > 0)::INTEGER,""",
        """    0::INTEGER,""",
    ),
    (
        'INV23',
        '★★ عدّاد المعلّق يُسقط in_review',
        """    (SELECT count(*) FROM public.employee_letter_requests
      WHERE status IN ('submitted','in_review'))::INTEGER,""",
        """    (SELECT count(*) FROM public.employee_letter_requests
      WHERE status = 'submitted')::INTEGER,""",
    ),
    (
        'INV24',
        '★★ cases_open يُسقط waiting_employee',
        """    (SELECT count(*) FROM public.hr_cases
      WHERE status IN ('open','in_review','waiting_employee'))::INTEGER,""",
        """    (SELECT count(*) FROM public.hr_cases
      WHERE status IN ('open','in_review'))::INTEGER,""",
    ),
    # ── حرّاس الدوال ──────────────────────────────────────────────
    (
        'INV25',
        '★★★ حارس ملكية الطلب يسقط (الموظف يفتح باسم غيره)',
        """  IF NOT public.current_user_is_staff() AND v_target IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'CASE_NOT_OWNER: لا تفتح طلباً باسم موظفٍ آخر';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV26',
        '★★ حارس الموضوع والوصف في hr_case_open يسقط',
        """  IF btrim(COALESCE(p_subject,'')) = '' OR btrim(COALESCE(p_description,'')) = '' THEN
    RAISE EXCEPTION 'CASE_SUBJECT_REQUIRED: الموضوع والوصف مطلوبان';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV27',
        '★★ btrim على الموضوع والوصف يسقط',
        """  VALUES (v_tenant, v_target, COALESCE(p_case_type,'general_inquiry'),
          btrim(p_subject), btrim(p_description),""",
        """  VALUES (v_tenant, v_target, COALESCE(p_case_type,'general_inquiry'),
          p_subject, p_description,""",
    ),
    (
        'INV28',
        '★★★ حارس الدور في الإسناد يسقط (العطل ③)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CASE_NOT_STAFF: الإسناد للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV29',
        '★★ الإسناد يتوقّف عن نقل الحالة إلى in_review',
        """     SET assigned_to = COALESCE(p_assignee, auth.uid()),
         status = CASE WHEN status = 'open' THEN 'in_review' ELSE status END""",
        """     SET assigned_to = COALESCE(p_assignee, auth.uid())""",
    ),
    (
        'INV30',
        '★★★ حارس الدور في تغيير الحالة يسقط (العطل ②)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CASE_NOT_STAFF: تغيير حالة الطلب للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV31',
        '★★★ حارس ملخّص الحلّ يسقط (العطل ⑫)',
        """  IF p_status IN ('resolved','closed')
     AND btrim(COALESCE(p_summary, v_sum, '')) = '' THEN
    RAISE EXCEPTION 'CASE_SUMMARY_REQUIRED: ملخّص الحلّ مطلوب عند الإغلاق';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV32',
        '★★ ترشيح المستأجر في تغيير الحالة يسقط',
        """  SELECT status, resolution_summary INTO v_old, v_sum
    FROM public.hr_cases WHERE id = p_id AND tenant_id = v_tenant;""",
        """  SELECT status, resolution_summary INTO v_old, v_sum
    FROM public.hr_cases WHERE id = p_id;""",
    ),
    (
        'INV33',
        '★★★★ حارس الدور في إصدار الخطاب يسقط — العطل ① بعينه',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LETTER_NOT_STAFF: إصدار الخطابات للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV34',
        '★★★ حارس ملفّ الخطاب يسقط',
        """  IF btrim(COALESCE(p_document_url,'')) = '' THEN
    RAISE EXCEPTION 'LETTER_DOCUMENT_REQUIRED: ملفّ الخطاب مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV35',
        '★★ حارس «الطلب مُنجزٌ سلفاً» يسقط',
        """  IF v_status IN ('delivered','rejected') THEN
    RAISE EXCEPTION 'LETTER_ALREADY_CLOSED: الطلب مُنجزٌ سلفاً (%)', v_status;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV36',
        '★★★ حارس الدور في التسليم يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LETTER_NOT_STAFF: التسليم للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV37',
        '★★★ حارس «لا تسليمَ لخطابٍ لم يُصدَر» يسقط (العطل ⑬)',
        """  IF btrim(COALESCE(v_url,'')) = '' THEN
    RAISE EXCEPTION 'LETTER_NOT_ISSUED: لا يُسلَّم خطابٌ بلا ملفّ — أصدره أولاً';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV38',
        '★★ التسليم المكرَّر يُعيد TRUE بدل FALSE',
        """  IF v_status = 'delivered' THEN RETURN FALSE; END IF;""",
        """  NULL;""",
    ),
    (
        'INV39',
        '★★★ حارس الدور في الرفض يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'LETTER_NOT_STAFF: الرفض للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV40',
        '★★★ حارس سبب الرفض يسقط (العطل ⑭)',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'LETTER_REJECT_REASON_REQUIRED: سبب الرفض مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV41',
        '★★ حارس «لا رفضَ لخطابٍ سُلِّم» يسقط',
        """  IF v_status = 'delivered' THEN
    RAISE EXCEPTION 'LETTER_ALREADY_DELIVERED: لا يُرفض خطابٌ سُلِّم';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV42',
        '★★★ حارس ملكية طلب الخطاب يسقط',
        """  IF NOT public.current_user_is_staff() AND v_target IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'LETTER_NOT_OWNER: لا تطلب خطاباً باسم موظفٍ آخر';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV43',
        '★★ btrim على رابط الخطاب يسقط',
        """         document_url = btrim(p_document_url),""",
        """         document_url = p_document_url,""",
    ),
]

DDL_INVERSIONS = [
    # ── المفاتيح ──────────────────────────────────────────────────
    (
        'DDL01',
        '★★★ إسقاط FK الموظف على hr_cases (العطل ⑦)',
        'ALTER TABLE public.hr_cases '
        'DROP CONSTRAINT IF EXISTS fk_hr_cases_employee_tenant;',
        'ALTER TABLE public.hr_cases ADD CONSTRAINT fk_hr_cases_employee_tenant '
        'FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL02',
        '★★★ استبدال FK المركَّب بمفرد ⇒ العبور يعود (العطل ⑧)',
        'ALTER TABLE public.hr_cases '
        'DROP CONSTRAINT IF EXISTS fk_hr_cases_employee_tenant; '
        'ALTER TABLE public.hr_cases ADD CONSTRAINT fk_hr_cases_employee_tenant '
        'FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE RESTRICT;',
        'ALTER TABLE public.hr_cases '
        'DROP CONSTRAINT IF EXISTS fk_hr_cases_employee_tenant; '
        'ALTER TABLE public.hr_cases ADD CONSTRAINT fk_hr_cases_employee_tenant '
        'FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL03',
        '★★ إسقاط FK المُسنَد إليه (العطل ⑩)',
        'ALTER TABLE public.hr_cases '
        'DROP CONSTRAINT IF EXISTS fk_hr_cases_assignee_tenant;',
        'ALTER TABLE public.hr_cases ADD CONSTRAINT fk_hr_cases_assignee_tenant '
        'FOREIGN KEY (assigned_to, tenant_id) '
        'REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL04',
        '★★★ إسقاط FK الموظف على الخطابات (العطل ⑨)',
        'ALTER TABLE public.employee_letter_requests '
        'DROP CONSTRAINT IF EXISTS fk_letter_employee_tenant;',
        'ALTER TABLE public.employee_letter_requests '
        'ADD CONSTRAINT fk_letter_employee_tenant '
        'FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL05',
        '★★ إسقاط FK المُراجِع',
        'ALTER TABLE public.employee_letter_requests '
        'DROP CONSTRAINT IF EXISTS fk_letter_reviewer_tenant;',
        'ALTER TABLE public.employee_letter_requests '
        'ADD CONSTRAINT fk_letter_reviewer_tenant '
        'FOREIGN KEY (reviewed_by, tenant_id) '
        'REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;',
    ),
    # ── القيود ────────────────────────────────────────────────────
    (
        'DDL06',
        '★★★ إسقاط CHECK الموضوع والوصف (العطل ⑪)',
        'ALTER TABLE public.hr_cases '
        'DROP CONSTRAINT IF EXISTS chk_hr_cases_subject_present;',
        "ALTER TABLE public.hr_cases ADD CONSTRAINT chk_hr_cases_subject_present "
        "CHECK (btrim(subject) <> '' AND btrim(description) <> '');",
    ),
    (
        'DDL07',
        '★★★ إسقاط CHECK اكتمال الحلّ (العطل ⑫)',
        'ALTER TABLE public.hr_cases '
        'DROP CONSTRAINT IF EXISTS chk_hr_cases_resolved_complete;',
        "ALTER TABLE public.hr_cases ADD CONSTRAINT chk_hr_cases_resolved_complete "
        "CHECK (status NOT IN ('resolved','closed') OR (resolved_at IS NOT NULL "
        "AND btrim(COALESCE(resolution_summary,'')) <> ''));",
    ),
    (
        'DDL08',
        '★★★ إسقاط CHECK ملفّ الخطاب (العطل ⑬)',
        'ALTER TABLE public.employee_letter_requests '
        'DROP CONSTRAINT IF EXISTS chk_letter_ready_needs_document;',
        "ALTER TABLE public.employee_letter_requests "
        "ADD CONSTRAINT chk_letter_ready_needs_document "
        "CHECK (status NOT IN ('ready','delivered') "
        "OR btrim(COALESCE(document_url,'')) <> '');",
    ),
    (
        'DDL09',
        '★★★ إسقاط CHECK سبب الرفض (العطل ⑭)',
        'ALTER TABLE public.employee_letter_requests '
        'DROP CONSTRAINT IF EXISTS chk_letter_rejected_needs_reason;',
        "ALTER TABLE public.employee_letter_requests "
        "ADD CONSTRAINT chk_letter_rejected_needs_reason "
        "CHECK ((status = 'rejected' AND btrim(COALESCE(rejection_reason,'')) <> '') "
        "OR (status <> 'rejected' AND rejection_reason IS NULL));",
    ),
    (
        'DDL10',
        '★★ إسقاط CHECK لحظة التسليم',
        'ALTER TABLE public.employee_letter_requests '
        'DROP CONSTRAINT IF EXISTS chk_letter_delivered_complete;',
        "ALTER TABLE public.employee_letter_requests "
        "ADD CONSTRAINT chk_letter_delivered_complete "
        "CHECK ((status = 'delivered' AND delivered_at IS NOT NULL) "
        "OR (status <> 'delivered' AND delivered_at IS NULL));",
    ),
    # ── المحفّزات ─────────────────────────────────────────────────
    (
        'DDL11',
        '★★★ تعطيل محفّز hr_cases كاملاً',
        'DROP TRIGGER IF EXISTS trg_hr_case_guard ON public.hr_cases;',
        'CREATE TRIGGER trg_hr_case_guard BEFORE INSERT OR UPDATE '
        'ON public.hr_cases FOR EACH ROW EXECUTE FUNCTION public.tg_hr_case_guard();',
    ),
    (
        'DDL12',
        '★★★ تعطيل محفّز الخطابات كاملاً',
        'DROP TRIGGER IF EXISTS trg_letter_guard ON public.employee_letter_requests;',
        'CREATE TRIGGER trg_letter_guard BEFORE INSERT OR UPDATE '
        'ON public.employee_letter_requests FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_letter_guard();',
    ),
    (
        'DDL13',
        '★★★ تعطيل منع الحذف على hr_cases',
        'DROP TRIGGER IF EXISTS trg_block_hr_case_delete ON public.hr_cases;',
        'CREATE TRIGGER trg_block_hr_case_delete BEFORE DELETE ON public.hr_cases '
        'FOR EACH ROW EXECUTE FUNCTION public.tg_block_service_center_delete();',
    ),
    (
        'DDL14',
        '★★★ تعطيل منع الحذف على الخطابات',
        'DROP TRIGGER IF EXISTS trg_block_letter_delete ON public.employee_letter_requests;',
        'CREATE TRIGGER trg_block_letter_delete BEFORE DELETE '
        'ON public.employee_letter_requests FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_block_service_center_delete();',
    ),
    # ── الصلاحيات ─────────────────────────────────────────────────
    (
        'DDL15',
        '★★★ anon يستعيد EXECUTE على letter_request_issue',
        'GRANT EXECUTE ON FUNCTION public.letter_request_issue(UUID, TEXT) TO anon;',
        'REVOKE ALL ON FUNCTION public.letter_request_issue(UUID, TEXT) FROM anon;',
    ),
    (
        'DDL16',
        '★★★ anon يستعيد EXECUTE على hr_case_set_status',
        'GRANT EXECUTE ON FUNCTION public.hr_case_set_status(UUID, TEXT, TEXT) TO anon;',
        'REVOKE ALL ON FUNCTION public.hr_case_set_status(UUID, TEXT, TEXT) FROM anon;',
    ),
    # ── ★★★★ السياسات — يمسكها سكربت RLS وحده ────────────────────
    (
        'POL01',
        '★★★★ [RLS] سياسة ALL تعود على الخطابات — العطل ① بعينه',
        'DROP POLICY IF EXISTS kyvzon_letter_requests_update '
        'ON public.employee_letter_requests; '
        'DROP POLICY IF EXISTS kyvzon_letter_requests_insert '
        'ON public.employee_letter_requests; '
        'CREATE POLICY kyvzon_letter_requests_write '
        'ON public.employee_letter_requests FOR ALL '
        'USING (tenant_id = public.current_user_tenant_id() '
        '  AND (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id())) '
        'WITH CHECK (tenant_id = public.current_user_tenant_id() '
        '  AND (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id()));',
        'DROP POLICY IF EXISTS kyvzon_letter_requests_write '
        'ON public.employee_letter_requests; '
        'CREATE POLICY kyvzon_letter_requests_insert '
        'ON public.employee_letter_requests FOR INSERT '
        'WITH CHECK (tenant_id = public.current_user_tenant_id() '
        '  AND (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id())); '
        'CREATE POLICY kyvzon_letter_requests_update '
        'ON public.employee_letter_requests FOR UPDATE '
        'USING (tenant_id = public.current_user_tenant_id() '
        '  AND public.current_user_is_staff()) '
        'WITH CHECK (tenant_id = public.current_user_tenant_id() '
        '  AND public.current_user_is_staff());',
    ),
    (
        'POL02',
        '★★★ [RLS] سياسة UPDATE على hr_cases تعود مفتوحةً للموظف — العطلان ②/③',
        'DROP POLICY IF EXISTS kyvzon_hr_cases_update ON public.hr_cases; '
        'CREATE POLICY kyvzon_hr_cases_update ON public.hr_cases FOR UPDATE '
        'USING (tenant_id = public.current_user_tenant_id() '
        '  AND (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id())) '
        'WITH CHECK (tenant_id = public.current_user_tenant_id());',
        'DROP POLICY IF EXISTS kyvzon_hr_cases_update ON public.hr_cases; '
        'CREATE POLICY kyvzon_hr_cases_update ON public.hr_cases FOR UPDATE '
        'USING (tenant_id = public.current_user_tenant_id() '
        '  AND public.current_user_is_staff()) '
        'WITH CHECK (tenant_id = public.current_user_tenant_id() '
        '  AND public.current_user_is_staff());',
    ),
    (
        'POL03',
        '★★★ [RLS] ترشيح المستأجر يسقط من سياسة قراءة الطلبات',
        'DROP POLICY IF EXISTS kyvzon_hr_cases_select ON public.hr_cases; '
        'CREATE POLICY kyvzon_hr_cases_select ON public.hr_cases FOR SELECT '
        'USING (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id());',
        'DROP POLICY IF EXISTS kyvzon_hr_cases_select ON public.hr_cases; '
        'CREATE POLICY kyvzon_hr_cases_select ON public.hr_cases FOR SELECT '
        'USING (tenant_id = public.current_user_tenant_id() '
        '  AND (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id()));',
    ),
    (
        'POL04',
        '★★★ [RLS] الموظف يرى طلبات زملائه (شرط الملكية يسقط)',
        'DROP POLICY IF EXISTS kyvzon_hr_cases_select ON public.hr_cases; '
        'CREATE POLICY kyvzon_hr_cases_select ON public.hr_cases FOR SELECT '
        'USING (tenant_id = public.current_user_tenant_id());',
        'DROP POLICY IF EXISTS kyvzon_hr_cases_select ON public.hr_cases; '
        'CREATE POLICY kyvzon_hr_cases_select ON public.hr_cases FOR SELECT '
        'USING (tenant_id = public.current_user_tenant_id() '
        '  AND (public.current_user_is_staff() '
        '       OR employee_id = public.current_user_employee_id()));',
    ),
]

EQUIVALENT_INVERSIONS: list = []


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0367 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
