#!/usr/bin/env python3
"""
عكس إصلاحات 0369 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

الاستعمال:
    PGPORT=5508 python3 tools/dev/_invert_0369.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0369_health_safety_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-health-safety-0369.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-health-safety-0369-rls.sh')

PGPORT = os.environ.get('PGPORT', '5508')
PGSOCK = os.environ.get('PGSOCK', '/home/user/.pgtest/sock')
PGBIN = os.environ.get('PGBIN', '/home/user/.pgtest/root/usr/lib/postgresql/17/bin')
LDP = ('/home/user/.pgtest/root/usr/lib/x86_64-linux-gnu:'
       '/home/user/.pgtest/root/usr/lib')

ENV = dict(os.environ)
ENV['PATH'] = PGBIN + os.pathsep + ENV.get('PATH', '')
ENV['LD_LIBRARY_PATH'] = LDP
ENV['PGPORT'] = PGPORT

# ★★★ أعكاسٌ لا يمسكها ملف SQL ⇒ يُتحقَّق بسكربت RLS.
#   السبب مُثبَت: ملف SQL يعمل بدور postgres (BYPASSRLS) فلا يمرّ من
#   سياسات RLS، وكلُّ إصلاحات السياسات هنا.
RLS_CHECK = {'POL02'}
DDL_RLS_CHECK = {'POL02'}


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
        '★★ حارس الاستحقاق القديم يسقط (العطل ⑧)',
        """  IF NEW.due_date IS NOT NULL AND NEW.due_date < v_today - 365 THEN
    RAISE EXCEPTION 'CAPA_DUE_TOO_OLD: تاريخ استحقاقٍ قبل سنةٍ من اليوم (% مقابل %)',
      NEW.due_date, v_today;
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV02',
        '★★ الحدّ يصير صارماً بلا داعٍ (<= بدل <)',
        """  IF NEW.due_date IS NOT NULL AND NEW.due_date < v_today - 365 THEN""",
        """  IF NEW.due_date IS NOT NULL AND NEW.due_date <= v_today - 365 THEN""",
    ),
    (
        'INV03',
        '★★★ توقيت بغداد يسقط من المحفّز',
        """  v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id  := OLD.tenant_id;""",
        """  v_today DATE := ((now() AT TIME ZONE 'Asia/Baghdad')::DATE + 1000);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id  := OLD.tenant_id;""",
    ),
    (
        'INV04',
        '★★★ تجميد المستأجر والمُنشئ يسقط',
        """    NEW.tenant_id  := OLD.tenant_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := COALESCE(OLD.created_by, NEW.created_by);""",
        """    NULL;""",
    ),
    (
        'INV05',
        '★★ ملءُ created_by آلياً يسقط',
        """    NEW.created_by := COALESCE(NEW.created_by, auth.uid());""",
        """    NULL;""",
    ),
    (
        'INV06',
        '★★★ started_at يتوقّف عن الامتلاء',
        """  IF NEW.status = 'in_progress' AND COALESCE(OLD.status,'') <> 'in_progress'
     AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV07',
        '★★★ completed_at و completed_by يتوقّفان ⇒ القيد يرفض',
        """  IF NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV08',
        '★★★ الخروج من «مكتمل» لا يُفرغ حقوله ⇒ القيد يرفض',
        """    IF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL;
      NEW.completed_by := NULL;
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV09',
        '★★★★ إفراغُ الحقول يعود إلى INSERT أيضاً ⇒ التناقض يُبتلع صامتاً',
        """  IF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL;
      NEW.completed_by := NULL;
    END IF;
    IF NEW.status <> 'cancelled' THEN
      NEW.cancelled_at  := NULL;
      NEW.cancelled_by  := NULL;
      NEW.cancel_reason := NULL;
    END IF;
  END IF;""",
        """  IF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  IF NEW.status <> 'cancelled' THEN
    NEW.cancelled_at  := NULL;
    NEW.cancelled_by  := NULL;
    NEW.cancel_reason := NULL;
  END IF;""",
    ),
    (
        'INV10',
        '★★★ محفّز منع الحذف يصير بلا أثر (العطل ⑪)',
        """  RAISE EXCEPTION 'CAPA_DELETE_BLOCKED: سجلّ الإجراء التصحيحيّ وثيقةٌ تدقيقية — استعمل capa_cancel() (id=%)',
    OLD.id;""",
        """  RETURN OLD;""",
    ),
    # ── لوح الحوادث ───────────────────────────────────────────────
    (
        'INV11',
        '★★★★ needs_capa يتجاهل الإجراءات ⇒ عَلَمٌ دائم',
        """    (i.severity IN ('high','critical')
      AND i.status NOT IN ('resolved','closed')
      AND NOT EXISTS (SELECT 1 FROM public.corrective_actions a
                       WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id
                         AND a.status <> 'cancelled')),""",
        """    (i.severity IN ('high','critical')
      AND i.status NOT IN ('resolved','closed')),""",
    ),
    (
        'INV12',
        '★★★ الإجراء الملغى يُسقط needs_capa',
        """                       WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id
                         AND a.status <> 'cancelled')),""",
        """                       WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id)),""",
    ),
    (
        'INV13',
        '★★★★ الإبلاغ المجهول يتسرّب (درس 0338)',
        """    CASE WHEN i.is_anonymous THEN 'مُبلِّغ مجهول'
         ELSE COALESCE(""",
        """    CASE WHEN FALSE THEN 'مُبلِّغ مجهول'
         ELSE COALESCE(""",
    ),
    (
        'INV14',
        '★★★ ترشيح تصنيفات السلامة يسقط ⇒ كلُّ الحوادث تظهر',
        """  WHERE i.category IN ('safety','work_injury','near_miss','security_incident')
    AND i.archived_at IS NULL""",
        """  WHERE i.archived_at IS NULL""",
    ),
    (
        'INV15',
        '★★ المؤرشفة تظهر في اللوح',
        """    AND i.archived_at IS NULL
    AND (p_status   IS NULL OR i.status   = p_status)""",
        """    AND (p_status   IS NULL OR i.status   = p_status)""",
    ),
    (
        'INV16',
        '★★ actions_open يعدّ المُنجَزة أيضاً',
        """    (SELECT count(*) FROM public.corrective_actions a
      WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id
        AND a.status IN ('open','in_progress'))::INTEGER,""",
        """    (SELECT count(*) FROM public.corrective_actions a
      WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id)::INTEGER,""",
    ),
    (
        'INV17',
        '★★ عدّاد actions_total يُسقط ترشيح المستأجر',
        """    (SELECT count(*) FROM public.corrective_actions a
      WHERE a.incident_id = i.id AND a.tenant_id = i.tenant_id)::INTEGER,
    (SELECT count(*) FROM public.corrective_actions a""",
        """    (SELECT count(*) FROM public.corrective_actions a
      WHERE a.incident_id = i.id)::INTEGER,
    (SELECT count(*) FROM public.corrective_actions a""",
    ),
    (
        'INV18',
        '★★★ ترتيب لوح الحوادث يسقط',
        """  ORDER BY
    CASE WHEN i.status IN ('resolved','closed') THEN 1 ELSE 0 END,
    CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3 END,
    i.created_at DESC,
    i.id DESC""",
        """  ORDER BY i.created_at ASC""",
    ),
    # ── لوح CAPA ──────────────────────────────────────────────────
    (
        'INV19',
        '★★★ is_overdue يتجاهل الحالة ⇒ المُنجَز المتأخّر يُعدّ متأخّراً',
        """    (a.due_date IS NOT NULL AND a.due_date < v_today
       AND a.status IN ('open','in_progress')),""",
        """    (a.due_date IS NOT NULL AND a.due_date < v_today),""",
    ),
    (
        'INV20',
        '★★★ days_to_due يسقط توقيت بغداد',
        """  RETURN QUERY
  SELECT
    a.id,
    a.incident_id,""",
        """  v_today := v_today + 7;
  RETURN QUERY
  SELECT
    a.id,
    a.incident_id,""",
    ),
    (
        'INV21',
        '★★ ترشيح الحادث في لوح CAPA يصير بلا أثر',
        """    AND (p_incident IS NULL OR a.incident_id = p_incident)""",
        """    AND (p_incident IS NULL OR TRUE)""",
    ),
    (
        'INV22',
        '★★ ترشيح الحالة في لوح CAPA يصير بلا أثر',
        """  WHERE (p_status   IS NULL OR a.status = p_status)""",
        """  WHERE (p_status   IS NULL OR TRUE)""",
    ),
    (
        'INV23',
        '★★★ ترتيب لوح CAPA يسقط',
        """  ORDER BY
    CASE WHEN a.status IN ('completed','cancelled') THEN 1 ELSE 0 END,
    CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3 END,
    a.due_date ASC NULLS LAST,
    a.created_at DESC,
    a.id DESC""",
        """  ORDER BY a.created_at ASC""",
    ),
    # ── الملخّص ───────────────────────────────────────────────────
    (
        'INV24',
        '★★★★ عدّاد فجوة CAPA يصير صفراً بنيوياً',
        """    (SELECT count(*) FROM si
      WHERE severity IN ('high','critical')
        AND status NOT IN ('resolved','closed')
        AND NOT EXISTS (SELECT 1 FROM public.corrective_actions a
                         WHERE a.incident_id = si.id AND a.tenant_id = si.tenant_id
                           AND a.status <> 'cancelled'))::INTEGER,""",
        """    0::INTEGER,""",
    ),
    (
        'INV25',
        '★★★ عدّاد المتأخّرات يصير صفراً',
        """    (SELECT count(*) FROM public.corrective_actions
      WHERE due_date IS NOT NULL AND due_date < v_today
        AND status IN ('open','in_progress'))::INTEGER,""",
        """    0::INTEGER,""",
    ),
    (
        'INV26',
        '★★ عدّاد الملغاة يصير صفراً',
        """    (SELECT count(*) FROM public.corrective_actions WHERE status='cancelled')::INTEGER,""",
        """    0::INTEGER,""",
    ),
    (
        'INV27',
        '★★ الملخّص يشمل الحوادث المؤرشفة',
        """     WHERE category IN ('safety','work_injury','near_miss','security_incident')
       AND archived_at IS NULL""",
        """     WHERE category IN ('safety','work_injury','near_miss','security_incident')""",
    ),
    # ── الدوال ────────────────────────────────────────────────────
    (
        'INV28',
        '★★★ حارس الدور في capa_open يسقط',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'CAPA_NOT_STAFF: الإجراءات التصحيحية للموارد البشرية والإدارة فقط';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV29',
        '★★ حارس العنوان يسقط (يبقى القيد وحده)',
        """  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'CAPA_TITLE_REQUIRED: عنوان الإجراء مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV30',
        '★★ btrim على العنوان يسقط',
        """  VALUES (v_tenant, p_incident_id, btrim(p_title),""",
        """  VALUES (v_tenant, p_incident_id, p_title,""",
    ),
    (
        'INV31',
        '★★ created_by يعود معدوماً في capa_open',
        """          COALESCE(p_priority,'medium'), p_owner_id, p_due_date, auth.uid())""",
        """          COALESCE(p_priority,'medium'), p_owner_id, p_due_date, NULL)""",
    ),
    (
        'INV32',
        '★★ capa_start المكرَّر يعيد TRUE',
        """  IF v_status <> 'open' THEN RETURN FALSE; END IF;""",
        """  NULL;""",
    ),
    (
        'INV33',
        '★★★ حارس «لا إنجازَ لمُلغى» يسقط',
        """  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'CAPA_CANCELLED: لا يُنجَز إجراءٌ مُلغى';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV34',
        '★★ الإنجاز المكرَّر يعيد TRUE',
        """  IF v_status = 'completed' THEN RETURN FALSE; END IF;

  UPDATE public.corrective_actions
     SET status = 'completed',""",
        """  NULL;

  UPDATE public.corrective_actions
     SET status = 'completed',""",
    ),
    (
        'INV35',
        '★★ btrim على ملاحظة التحقّق يسقط',
        """         verification_note = NULLIF(btrim(COALESCE(p_verification,'')),'')""",
        """         verification_note = p_verification""",
    ),
    (
        'INV36',
        '★★★ حارس سبب الإلغاء يسقط',
        """  IF btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'CAPA_CANCEL_REASON_REQUIRED: سبب الإلغاء مطلوب';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV37',
        '★★★ حارس «لا إلغاءَ لمُنجَز» يسقط',
        """  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'CAPA_ALREADY_COMPLETED: لا يُلغى إجراءٌ أُنجز';
  END IF;""",
        """  NULL;""",
    ),
    (
        'INV38',
        '★★ الإلغاء المكرَّر يعيد TRUE',
        """  IF v_status = 'cancelled' THEN RETURN FALSE; END IF;

  UPDATE public.corrective_actions
     SET status = 'cancelled',""",
        """  NULL;

  UPDATE public.corrective_actions
     SET status = 'cancelled',""",
    ),
    (
        'INV39',
        '★★ ترشيح المستأجر في capa_cancel يسقط',
        """  SELECT status INTO v_status FROM public.corrective_actions
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_status IS NULL THEN RAISE EXCEPTION 'CAPA_NOT_FOUND: الإجراء غير موجود'; END IF;
  IF v_status = 'completed' THEN""",
        """  SELECT status INTO v_status FROM public.corrective_actions
   WHERE id = p_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'CAPA_NOT_FOUND: الإجراء غير موجود'; END IF;
  IF v_status = 'completed' THEN""",
    ),
]

DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★★ التصنيفات الثلاثة تُسقط من CHECK — العطل ① يعود',
        'ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_category_check; '
        "ALTER TABLE public.incidents ADD CONSTRAINT incidents_category_check "
        "CHECK (category IN ('technical','hr','management','workplace','salary','safety','other'));",
        'ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_category_check; '
        "ALTER TABLE public.incidents ADD CONSTRAINT incidents_category_check "
        "CHECK (category IN ('technical','hr','management','workplace','salary','safety',"
        "'other','work_injury','near_miss','security_incident'));",
    ),
    (
        'DDL02',
        '★★★★ القيد يُفتح على مصراعيه ⇒ مفردةٌ مخترعة تُقبل',
        'ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_category_check;',
        "ALTER TABLE public.incidents ADD CONSTRAINT incidents_category_check "
        "CHECK (category IN ('technical','hr','management','workplace','salary','safety',"
        "'other','work_injury','near_miss','security_incident'));",
    ),
    (
        'DDL03',
        '★★★ إسقاط FK المالك',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_owner_tenant;',
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_owner_tenant '
        'FOREIGN KEY (owner_id, tenant_id) '
        'REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL04',
        '★★★★ FK الحادث يعود مفرداً ⇒ العبور بين المستأجرين',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_incident_tenant; '
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_incident_tenant '
        'FOREIGN KEY (incident_id) REFERENCES public.incidents (id) ON DELETE RESTRICT;',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_incident_tenant; '
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_incident_tenant '
        'FOREIGN KEY (incident_id, tenant_id) '
        'REFERENCES public.incidents (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL05',
        '★★★ FK الحادث يعود SET NULL ⇒ إجراءاتٌ يتيمة (العطل ⑫)',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_incident_tenant; '
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_incident_tenant '
        'FOREIGN KEY (incident_id, tenant_id) '
        'REFERENCES public.incidents (id, tenant_id) ON DELETE SET NULL;',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_incident_tenant; '
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_incident_tenant '
        'FOREIGN KEY (incident_id, tenant_id) '
        'REFERENCES public.incidents (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL06',
        '★★ إسقاط FK المُنشئ والمُنجِز',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_creator_tenant; '
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS fk_capa_completer_tenant;',
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_creator_tenant '
        'FOREIGN KEY (created_by, tenant_id) '
        'REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT; '
        'ALTER TABLE public.corrective_actions ADD CONSTRAINT fk_capa_completer_tenant '
        'FOREIGN KEY (completed_by, tenant_id) '
        'REFERENCES public.profiles (id, tenant_id) ON DELETE RESTRICT;',
    ),
    (
        'DDL07',
        '★★★ إسقاط CHECK العنوان',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS chk_capa_title_present;',
        "ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_capa_title_present "
        "CHECK (btrim(title) <> '');",
    ),
    (
        'DDL08',
        '★★★ إسقاط CHECK اكتمال الإنجاز',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS chk_capa_completed_complete;',
        "ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_capa_completed_complete "
        "CHECK ((status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL) "
        "OR (status = 'completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL));",
    ),
    (
        'DDL09',
        '★★★ إسقاط CHECK اكتمال الإلغاء',
        'ALTER TABLE public.corrective_actions DROP CONSTRAINT IF EXISTS chk_capa_cancelled_complete;',
        "ALTER TABLE public.corrective_actions ADD CONSTRAINT chk_capa_cancelled_complete "
        "CHECK ((status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL "
        "AND cancel_reason IS NULL) OR (status = 'cancelled' AND cancelled_at IS NOT NULL "
        "AND cancelled_by IS NOT NULL AND btrim(COALESCE(cancel_reason,'')) <> ''));",
    ),
    (
        'DDL10',
        '★★★ تعطيل محفّز الحراسة',
        'DROP TRIGGER IF EXISTS trg_capa_guard ON public.corrective_actions;',
        'CREATE TRIGGER trg_capa_guard BEFORE INSERT OR UPDATE '
        'ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.tg_capa_guard();',
    ),
    (
        'DDL11',
        '★★★ تعطيل منع الحذف',
        'DROP TRIGGER IF EXISTS trg_block_capa_delete ON public.corrective_actions;',
        'CREATE TRIGGER trg_block_capa_delete BEFORE DELETE '
        'ON public.corrective_actions FOR EACH ROW '
        'EXECUTE FUNCTION public.tg_block_capa_delete();',
    ),
    (
        'DDL12',
        '★★★ anon يستعيد EXECUTE على capa_open',
        'GRANT EXECUTE ON FUNCTION public.capa_open(UUID, TEXT, TEXT, TEXT, UUID, DATE) TO anon;',
        'REVOKE ALL ON FUNCTION public.capa_open(UUID, TEXT, TEXT, TEXT, UUID, DATE) FROM anon;',
    ),
    (
        'DDL13',
        '★★★ anon يستعيد EXECUTE على capa_cancel',
        'GRANT EXECUTE ON FUNCTION public.capa_cancel(UUID, TEXT) TO anon;',
        'REVOKE ALL ON FUNCTION public.capa_cancel(UUID, TEXT) FROM anon;',
    ),
    # ── السياسات ──────────────────────────────────────────────────
    (
        'POL02',
        '★★★ [RLS] المالك يفقد رؤية إجراءه (العطل ⑭ يعود)',
        'DROP POLICY IF EXISTS kyvzon_corrective_actions_select ON public.corrective_actions; '
        'CREATE POLICY kyvzon_corrective_actions_select ON public.corrective_actions '
        'FOR SELECT USING (tenant_id = public.current_user_tenant_id() '
        'AND public.current_user_is_staff());',
        'DROP POLICY IF EXISTS kyvzon_corrective_actions_select ON public.corrective_actions; '
        'CREATE POLICY kyvzon_corrective_actions_select ON public.corrective_actions '
        'FOR SELECT USING (tenant_id = public.current_user_tenant_id() '
        'AND (public.current_user_is_staff() OR owner_id = auth.uid()));',
    ),
]

EQUIVALENT_INVERSIONS = [
    (
        'POL01',
        'تغييرُ وحدة `hybrid_gate` من hr إلى admin **لا أثر سلوكيّ له**',
        '`tenants.module_enforcement_mode` افتراضيّه \'off\'، و\n'
        '   `subscription_allows_module()` تُعيد TRUE فوراً في هذا الوضع:\n'
        '       IF v_mode = \'off\' THEN RETURN TRUE; END IF;\n'
        '   ⇒ البوّابة تمرّ دائماً مهما كانت الوحدة، فلا سبيل إلى إثبات\n'
        '     العكس بسلوكٍ إلّا بتفعيل الإنفاذ (خارج نطاق الجولة).\n'
        '   ★ لكنّ الإصلاح **ليس زائداً**: متى فُعّل الإنفاذ صار مستأجرٌ\n'
        '     مشتركٌ في hr دون admin يرى الحوادث ولا يرى إجراءاتها —\n'
        '     والصفحة تنكسر نصفين. الحارس الممكن فحصٌ نصّيّ، وهو\n'
        '     مكتوبٌ في التأكيد 6.1.',
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0369 — إثبات أن كل إصلاح مُختبَر فعلاً')
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
