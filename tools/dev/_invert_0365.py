#!/usr/bin/env python3
"""
عكس إصلاحات 0365 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّ `IF NOT EXISTS (pg_constraint)` و`ADD COLUMN IF NOT EXISTS`
   و`CREATE UNIQUE INDEX IF NOT EXISTS` يمنع إعادة الإنشاء ⇒ عكسُها
   بـDDL صريح (DDL_INVERSIONS).

الاستعمال:
    PGPORT=5500 python3 tools/dev/_invert_0365.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0365_disciplinary_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-disciplinary-0365.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-disciplinary-0365-rls.sh')

PGPORT = os.environ.get('PGPORT', '5500')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   السبب مُثبَت لا مُفترَض:
#   · ملف SQL يعمل بدور postgres (BYPASSRLS) ⇒ كلُّ ما يتعلّق بترشيح
#     RLS داخل اللوح والملخّص لا يظهر فيه إطلاقاً.
#   · REVOKE عن anon: الأثر على anon وحده و postgres لا يمرّ منه…
#     **إلّا** أن التأكيد ⑪ في ملف SQL يفحص has_function_privilege
#     نصّاً فيمسكه — لذا ليس هنا.
RLS_CHECK = {'INV20', 'INV21', 'INV32'}
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
        '★★★ حارس الواقعة المستقبلية يسقط من المحفّز (العطل ⑧)',
        """  IF NEW.incident_date > v_today THEN
    RAISE EXCEPTION 'DISCIPLINARY_FUTURE_INCIDENT: تاريخ الواقعة % في المستقبل (اليوم في بغداد %)',
      NEW.incident_date, v_today;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV02',
        '★★★ توقيت بغداد يسقط من المحفّز — v_today يُزاح ألف يوم',
        """  v_today      DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_issuer_emp UUID;""",
        """  v_today      DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1000);
  v_issuer_emp UUID;""",
    ),
    (
        'INV03',
        '★★★ حارس العقاب الذاتيّ يسقط (العطل ⑪)',
        """  IF v_issuer_emp IS NOT NULL AND v_issuer_emp = NEW.employee_id THEN
    RAISE EXCEPTION 'DISCIPLINARY_SELF_ISSUE: لا يجوز أن يُصدر الموظف إجراءً تأديبياً بحقّ نفسه (employee_id=%)',
      NEW.employee_id;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV04',
        '★★★ ترجمة profiles.id ← employees.id تسقط — المقارنة المباشرة لا تكفي',
        """  SELECT e.id INTO v_issuer_emp
    FROM public.employees e
   WHERE e.user_id = NEW.issued_by
     AND e.tenant_id = NEW.tenant_id
   LIMIT 1;""",
        """  v_issuer_emp := NEW.issued_by;""",
    ),
    (
        'INV05',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑮)',
        """  RAISE EXCEPTION 'DISCIPLINARY_DELETE_BLOCKED: السجلّ التأديبيّ لا يُحذف. استعمل disciplinary_revoke() للإلغاء الإداريّ (id=%)',
    OLD.id;""",
        """  RETURN OLD;""",
    ),

    # ── الانتهاء التلقائيّ ─────────────────────────────────────────
    (
        'INV06',
        '★★★ disciplinary_expire_due تتوقّف عن الترحيل (العطل ⑭)',
        """  UPDATE public.disciplinary_actions
     SET status = 'expired',
         expired_at = now(),
         updated_at = now()
   WHERE tenant_id = v_tenant
     AND status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < v_today;""",
        """  UPDATE public.disciplinary_actions SET updated_at = updated_at WHERE FALSE;""",
    ),
    (
        'INV07',
        '★★★ ترشيح المستأجر في الترحيل يسقط — دالةُ ألف تمسّ باء',
        """   WHERE tenant_id = v_tenant
     AND status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < v_today;""",
        """   WHERE status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < v_today;""",
    ),
    (
        'INV08',
        '★★ حدُّ الترحيل يصير <= بدل < ⇒ أجلُ اليوم ينتهي قبل أوانه',
        """     AND valid_until IS NOT NULL
     AND valid_until < v_today;

  GET DIAGNOSTICS v_n = ROW_COUNT;""",
        """     AND valid_until IS NOT NULL
     AND valid_until <= v_today;

  GET DIAGNOSTICS v_n = ROW_COUNT;""",
    ),
    (
        'INV09',
        '★★ expired_at يتوقّف عن الامتلاء ⇒ القيد يرفض',
        """     SET status = 'expired',
         expired_at = now(),
         updated_at = now()""",
        """     SET status = 'expired',
         updated_at = now()""",
    ),

    # ── اللوح ─────────────────────────────────────────────────────
    (
        'INV10',
        '★★★ الاسم المُركَّب يسقط — full_name_ar فارغٌ بنيوياً (العطل: PROBE_16)',
        """    COALESCE(
      NULLIF(btrim(e.full_name_ar), ''),
      NULLIF(btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
      'موظف غير معروف'
    )::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV11',
        '★★★ can_appeal يسقط حارسَ الملكية ⇒ الجميع يتظلّم على الجميع',
        """    (v_me IS NOT NULL AND v_me = d.employee_id
       AND d.status = 'active' AND d.is_appealed = FALSE),""",
        """    (d.status = 'active' AND d.is_appealed = FALSE),""",
    ),
    (
        'INV12',
        '★★ can_appeal يتجاهل التظلّم السابق ⇒ يُعرض مرّتين',
        """    (v_me IS NOT NULL AND v_me = d.employee_id
       AND d.status = 'active' AND d.is_appealed = FALSE),
    d.created_at""",
        """    (v_me IS NOT NULL AND v_me = d.employee_id
       AND d.status = 'active'),
    d.created_at""",
    ),
    (
        'INV13',
        '★★★ الترتيب الحتميّ يسقط — بلا incident_date DESC',
        """  ORDER BY d.incident_date DESC, d.created_at DESC, d.id DESC""",
        """  ORDER BY d.created_at DESC""",
    ),
    (
        'INV14',
        '★★ توقيت بغداد يسقط من days_remaining في اللوح',
        """  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_me    UUID := public.current_user_employee_id();""",
        """  v_today DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 7);
  v_me    UUID := public.current_user_employee_id();""",
    ),
    (
        'INV15',
        '★★ ترشيح الحالة في اللوح يصير بلا أثر',
        """  WHERE (p_status IS NULL OR d.status = p_status)""",
        """  WHERE (p_status IS NULL OR TRUE)""",
    ),
    (
        'INV16',
        '★★ ترشيح النوع في اللوح يصير بلا أثر',
        """    AND (p_type   IS NULL OR d.type   = p_type)""",
        """    AND (p_type   IS NULL OR TRUE)""",
    ),
    (
        'INV17',
        '★★★ البحث بالاسم المُركَّب يسقط — يبقى full_name_ar وحده (وهو NULL)',
        """      OR COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
           ILIKE '%' || btrim(p_search) || '%'""",
        """      OR FALSE""",
    ),
    (
        'INV18',
        '★★ اسم المُصدِر يُقرأ من employees بدل profiles (العنوان الخطأ — PROBE_17)',
        """  LEFT JOIN public.profiles  pi ON pi.id = d.issued_by""",
        """  LEFT JOIN public.profiles  pi ON pi.id = d.employee_id""",
    ),

    # ── الملخّص ───────────────────────────────────────────────────
    (
        'INV19',
        '★★★ عدّاد overdue_expiry يصير صفراً بنيوياً',
        """    count(*) FILTER (WHERE d.status = 'active' AND d.valid_until IS NOT NULL
                       AND d.valid_until < v_today)::INTEGER
  FROM public.disciplinary_actions d;""",
        """    0::INTEGER
  FROM public.disciplinary_actions d;""",
    ),

    # ── حرّاس الدور (RLS فقط: ملف SQL يعمل بسياق هدى وهي staff) ────
    (
        'INV20',
        '★★★ [RLS] حارس صاحب الشأن في disciplinary_appeal يسقط',
        """  IF v_me IS NULL OR v_me <> v_owner THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_OWNER: التظلّم لصاحب الشأن وحده';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV21',
        '★★★ [RLS] حارس الدور في disciplinary_appeal_decide يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_STAFF: البتّ في التظلّم للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),

    # ── حرّاس الدوال التي يمسكها ملف SQL ──────────────────────────
    (
        'INV22',
        '★★★ حارس الدور في disciplinary_issue يسقط (الموظف يعاقب زملاءه)',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_STAFF: إصدار الإجراءات التأديبية للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV23',
        '★★ حارس السبب في disciplinary_issue يسقط (يبقى القيد وحده)',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_REASON_REQUIRED: السبب مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV24',
        '★★ btrim على السبب يسقط في الإصدار',
        # ★ سقط أوّلاً بـNO_MATCH: كتبتُ خمس مسافاتٍ بادئة والأصل أربع.
        #   الحارس `if old not in original` أمسك زيف العكس — وهو الغرض منه.
        """    (v_tenant, p_employee_id, p_type, btrim(p_reason), NULLIF(btrim(COALESCE(p_description,'')),''),""",
        """    (v_tenant, p_employee_id, p_type, p_reason, NULLIF(btrim(COALESCE(p_description,'')),''),""",
    ),
    (
        'INV25',
        '★★★ حارس التظلّم المكرَّر يسقط',
        """  IF v_app THEN
    RAISE EXCEPTION 'DISCIPLINARY_ALREADY_APPEALED: سبق تقديم تظلّم على هذا الإجراء';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV26',
        '★★ حارس سبب التظلّم يسقط',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_APPEAL_REASON_REQUIRED: سبب التظلّم مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV27',
        '★★★ التظلّم يتوقّف عن تغيير الحالة إلى appealed',
        """     SET is_appealed  = TRUE,
         appealed_at  = now(),
         appeal_reason = btrim(p_reason),
         status       = 'appealed',
         updated_at   = now()""",
        """     SET is_appealed  = TRUE,
         appealed_at  = now(),
         appeal_reason = btrim(p_reason),
         updated_at   = now()""",
    ),
    (
        'INV28',
        '★★★ التعليل الإلزاميّ للبتّ يسقط (درس العطل ⑲ في 0363)',
        """  IF btrim(COALESCE(p_response,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_RESPONSE_REQUIRED: تعليل القرار مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV29',
        '★★★ «مُخفَّف» يتوقّف عن إنزال الخطورة فعلياً',
        """         severity = CASE
           WHEN p_decision = 'reduced' THEN
             CASE v_severity WHEN 'critical' THEN 'high'
                             WHEN 'high'     THEN 'medium'
                             ELSE 'low' END
           ELSE v_severity END,""",
        """         severity = v_severity,""",
    ),
    (
        'INV31',
        '★★★ حارس «لا تظلّم قائماً» يسقط',
        """  IF NOT v_app OR v_status <> 'appealed' THEN
    RAISE EXCEPTION 'DISCIPLINARY_NO_PENDING_APPEAL: لا تظلّم قائماً على هذا الإجراء (الحالة %)', v_status;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV32',
        '★★ ترشيح المستأجر في البتّ يسقط',
        """    FROM public.disciplinary_actions d
   WHERE d.id = p_id AND d.tenant_id = v_tenant;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_FOUND: الإجراء غير موجود';
  END IF;
  IF NOT v_app OR v_status <> 'appealed' THEN""",
        """    FROM public.disciplinary_actions d
   WHERE d.id = p_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_FOUND: الإجراء غير موجود';
  END IF;
  IF NOT v_app OR v_status <> 'appealed' THEN""",
    ),
    (
        'INV33',
        '★★★ حارس صاحب الشأن في الإقرار بالاطّلاع يسقط',
        """  IF v_me IS NULL OR v_me <> v_owner THEN
    RAISE EXCEPTION 'DISCIPLINARY_NOT_OWNER: الإقرار بالاطّلاع لصاحب الشأن وحده';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV34',
        '★★★ الإقرار المكرَّر يدهس الطابع الأول',
        """  IF v_ack IS NOT NULL THEN
    RETURN FALSE;  -- أقرَّ سابقاً — لا نُغيّر الطابع الأول
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV35',
        '★★★ حارس سبب الإلغاء يسقط',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'DISCIPLINARY_REVOKE_REASON_REQUIRED: سبب الإلغاء مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV36',
        '★★ الإلغاء المكرَّر يعيد TRUE بدل FALSE',
        """  IF v_status = 'revoked' THEN
    RETURN FALSE;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV37',
        '★★★ الإلغاء يتوقّف عن ملء revoked_by ⇒ القيد يرفض',
        """     SET status = 'revoked',
         revoked_at = now(),
         revoked_by = auth.uid(),
         revocation_reason = btrim(p_reason),
         updated_at = now()""",
        """     SET status = 'revoked',
         revoked_at = now(),
         revocation_reason = btrim(p_reason),
         updated_at = now()""",
    ),
    (
        'INV38',
        '★★ الملخّص يعدّ severe بالنوعين لا الثلاثة',
        """    count(*) FILTER (WHERE d.type IN ('suspension','demotion','termination'))::INTEGER,""",
        """    count(*) FILTER (WHERE d.type IN ('suspension','demotion'))::INTEGER,""",
    ),
    (
        'INV39',
        '★★ unacknowledged يتجاهل شرط active',
        """    count(*) FILTER (WHERE d.acknowledged_at IS NULL AND d.status = 'active')::INTEGER,""",
        """    count(*) FILTER (WHERE d.acknowledged_at IS NULL)::INTEGER,""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط FK المركَّب على الموظف (الأعطال ①/③)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS fk_disciplinary_employee_tenant;',
        'ALTER TABLE public.disciplinary_actions ADD CONSTRAINT '
        'fk_disciplinary_employee_tenant FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL02',
        '★★★ استبدال FK المركَّب بمفرد ⇒ العبور بين المستأجرين يعود (العطل ③)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS fk_disciplinary_employee_tenant; '
        'ALTER TABLE public.disciplinary_actions ADD CONSTRAINT '
        'fk_disciplinary_employee_tenant FOREIGN KEY (employee_id) '
        'REFERENCES public.employees (id) ON DELETE RESTRICT;',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS fk_disciplinary_employee_tenant; '
        'ALTER TABLE public.disciplinary_actions ADD CONSTRAINT '
        'fk_disciplinary_employee_tenant FOREIGN KEY (employee_id, tenant_id) '
        'REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL03',
        '★★★ إسقاط FK المُصدِر (العطل ②)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS fk_disciplinary_issuer_tenant;',
        'ALTER TABLE public.disciplinary_actions ADD CONSTRAINT '
        'fk_disciplinary_issuer_tenant FOREIGN KEY (issued_by, tenant_id) '
        'REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL04',
        '★★★ tenant_id يعود قابلاً للعدم (العطل ④)',
        'ALTER TABLE public.disciplinary_actions ALTER COLUMN tenant_id DROP NOT NULL;',
        'ALTER TABLE public.disciplinary_actions ALTER COLUMN tenant_id SET NOT NULL;',
    ),
    (
        'DDL05',
        '★★★ إسقاط CHECK النوع (العطل ⑤)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_type;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_type "
        "CHECK (type IN ('verbal_warning','written_warning','suspension','demotion','termination'));",
    ),
    (
        'DDL06',
        '★★★ إسقاط CHECK الخطورة (العطل ⑥)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_severity;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_severity "
        "CHECK (severity IN ('low','medium','high','critical'));",
    ),
    (
        'DDL07',
        '★★★ إسقاط CHECK الحالة (العطل ⑦)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_status;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT chk_disciplinary_status "
        "CHECK (status IN ('active','appealed','overturned','expired','revoked'));",
    ),
    (
        'DDL08',
        '★★★ إسقاط CHECK السبب (العطل ⑩)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_reason_present;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_reason_present CHECK (btrim(reason) <> '');",
    ),
    (
        'DDL09',
        '★★★ إسقاط CHECK تسلسل التواريخ (العطل ⑨)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_valid_until_after_incident;',
        'ALTER TABLE public.disciplinary_actions ADD CONSTRAINT '
        'chk_disciplinary_valid_until_after_incident '
        'CHECK (valid_until IS NULL OR valid_until >= incident_date);',
    ),
    (
        'DDL10',
        '★★★ إسقاط CHECK اتّساق التظلّم (العطل ⑫)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_appeal_coherent;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_appeal_coherent CHECK ("
        "(btrim(COALESCE(appeal_response,'')) = '' "
        "AND btrim(COALESCE(appeal_reason,'')) = '' "
        "AND appeal_decision IS NULL AND appeal_decided_by IS NULL "
        "AND appeal_decided_at IS NULL AND appealed_at IS NULL) "
        "OR is_appealed = TRUE);",
    ),
    (
        'DDL11',
        '★★★ إسقاط CHECK اكتمال الإلغاء',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_revoked_complete;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_revoked_complete CHECK ("
        "(status <> 'revoked' AND revoked_at IS NULL AND revoked_by IS NULL "
        "AND revocation_reason IS NULL) OR (status = 'revoked' "
        "AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL "
        "AND btrim(COALESCE(revocation_reason,'')) <> ''));",
    ),
    (
        'DDL12',
        '★★★ إسقاط CHECK «لا إلغاء بلا قرار تظلّم»',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_overturned_needs_appeal;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_overturned_needs_appeal CHECK (status <> 'overturned' "
        "OR appeal_decision IS NOT DISTINCT FROM 'overturned');",
    ),
    (
        'DDL13',
        '★★★★ الثغرة الثلاثية تعود: `=` بدل IS NOT DISTINCT FROM '
        '(أسقطها التأكيد 5.6 — NULL يمرّ من CHECK)',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_overturned_needs_appeal; '
        'ALTER TABLE public.disciplinary_actions ADD CONSTRAINT '
        "chk_disciplinary_overturned_needs_appeal CHECK (status <> 'overturned' "
        "OR appeal_decision = 'overturned');",
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_overturned_needs_appeal; '
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_overturned_needs_appeal CHECK (status <> 'overturned' "
        "OR appeal_decision IS NOT DISTINCT FROM 'overturned');",
    ),
    (
        'DDL14',
        '★★ إسقاط CHECK اكتمال الانتهاء',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_expired_complete;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_expired_complete CHECK ("
        "(status <> 'expired' AND expired_at IS NULL) OR (status = 'expired' "
        "AND expired_at IS NOT NULL AND valid_until IS NOT NULL));",
    ),
    (
        'DDL15',
        '★★ إسقاط CHECK اكتمال البتّ',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_appeal_decided_complete;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_appeal_decided_complete CHECK (appeal_decision IS NULL "
        "OR (appeal_decided_by IS NOT NULL AND appeal_decided_at IS NOT NULL));",
    ),
    (
        'DDL16',
        '★★ إسقاط CHECK مفردات قرار التظلّم',
        'ALTER TABLE public.disciplinary_actions '
        'DROP CONSTRAINT IF EXISTS chk_disciplinary_appeal_decision;',
        "ALTER TABLE public.disciplinary_actions ADD CONSTRAINT "
        "chk_disciplinary_appeal_decision CHECK (appeal_decision IS NULL "
        "OR appeal_decision IN ('upheld','reduced','overturned'));",
    ),
    (
        'DDL17',
        '★★★ محفّز الحراسة يُعطَّل كاملاً',
        'DROP TRIGGER IF EXISTS trg_disciplinary_guard ON public.disciplinary_actions;',
        'CREATE TRIGGER trg_disciplinary_guard BEFORE INSERT OR UPDATE '
        'ON public.disciplinary_actions FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_disciplinary_guard();',
    ),
    (
        'DDL18',
        '★★★ محفّز منع الحذف يُعطَّل كاملاً',
        'DROP TRIGGER IF EXISTS trg_block_disciplinary_delete '
        'ON public.disciplinary_actions;',
        'CREATE TRIGGER trg_block_disciplinary_delete BEFORE DELETE '
        'ON public.disciplinary_actions FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_block_disciplinary_delete();',
    ),
    (
        'DDL19',
        '★★★ anon يستعيد EXECUTE على disciplinary_appeal (يمسكه التأكيد ⑪)',
        'GRANT EXECUTE ON FUNCTION public.disciplinary_appeal(UUID, TEXT) TO anon;',
        'REVOKE ALL ON FUNCTION public.disciplinary_appeal(UUID, TEXT) FROM anon;',
    ),
    (
        'DDL20',
        '★★★ anon يستعيد EXECUTE على disciplinary_revoke',
        'GRANT EXECUTE ON FUNCTION public.disciplinary_revoke(UUID, TEXT) TO anon;',
        'REVOKE ALL ON FUNCTION public.disciplinary_revoke(UUID, TEXT) FROM anon;',
    ),
]

# أعكاسٌ مُصنَّفةٌ مكافئة — لا تُغيّر السلوك، والسبب **مُثبَت لا مُفترَض**.
EQUIVALENT_INVERSIONS = [
    (
        'INV30',
        'حارس DISCIPLINARY_APPEAL_ALREADY_DECIDED **غيرُ قابلٍ للوصول**',
        'الحارس الذي يسبقه يشترط status = \'appealed\'، وقيدي '
        '`chk_disciplinary_appealed_state` يشترط عندئذٍ appeal_decision IS NULL:\n'
        '     CHECK (status <> \'appealed\' OR (is_appealed = true '
        'AND appealed_at IS NOT NULL AND appeal_decision IS NULL))\n'
        '   ⇒ لا يمكن أن يجتمع status=appealed مع appeal_decision غير معدوم،\n'
        '     فالسطر 898 شيفرةٌ ميتة. تركتُه دفاعاً في العمق لا حارساً حيّاً.\n'
        '   ★ أثبته العكس نفسه: INV31 (الحارس السابق) سقط برسالة\n'
        '     ALREADY_DECIDED — أي أن الحارسَين متعاقبان لا متوازيان.',
    ),
    (
        'DDL10',
        'CHECK اتّساق التظلّم `chk_disciplinary_appeal_coherent` مكافئٌ عملياً',
        'كلُّ مسارٍ يكتب appeal_reason/appeal_response يمرّ عبر '
        'disciplinary_appeal() أو disciplinary_appeal_decide()، وكلتاهما '
        'ترفعان is_appealed=TRUE أو تشترطانه. ⇒ لا يوجد في الاختبار '
        'مسارٌ يُنتج التناقض بعد الإصلاح.\n'
        '   ★ لكنّ القيد **ليس زائداً**: العطل ⑫ (PROBE_12) أُثبت بكتابةٍ '
        'مباشرة على الجدول، وهي ما يحرسه القيد. أضفتُ التأكيد 1.8 '
        'ليُغطّيه بكتابةٍ مباشرة — انظره في ملف verify.',
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0365 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
