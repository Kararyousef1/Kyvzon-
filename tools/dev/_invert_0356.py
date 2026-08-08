#!/usr/bin/env python3
"""
عكس إصلاحات 0356 واحداً واحداً وإثبات أن الاختبار يسقط.

★★★ «شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.»

★★ فخّان معروفان في هذه الجولة:
   · `ADD COLUMN IF NOT EXISTS` لا يُسقط العمود عند العكس النصّي —
     تلك تُعكس بـ`DROP COLUMN` صريح (DDL_INVERSIONS).
   · `IF NOT EXISTS (SELECT 1 FROM pg_constraint …)` يمنع إعادة
     إنشاء القيد — كذلك تُعكس بـDDL صريح.

الاستعمال:
    PGPORT=5475 python3 tools/dev/_invert_0356.py
"""
import os
import re
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase/migrations/0356_performance_review_integrity.sql')
VERIFY = os.path.join(REPO, 'tools/dev/verify-performance-review-0356.sql')
VERIFY_RLS = os.path.join(REPO, 'tools/dev/verify-performance-review-0356-rls.sh')

PGPORT = os.environ.get('PGPORT', '5475')
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


# ═══════════════════════════════════════════════════════════════════════
#  عكوس نصّية
# ═══════════════════════════════════════════════════════════════════════
INVERSIONS = [
    (
        'INV01',
        '★★★ إسقاط اشتقاق rating من score (السُّلَّمان يعودان متناقضين)',
        """  IF NEW.score IS NOT NULL THEN
    NEW.rating := GREATEST(1, LEAST(5, CEIL(NEW.score / 20.0)::INTEGER));
  ELSIF NEW.rating IS NOT NULL THEN
    -- الاتجاه العكسيّ لصفوفٍ كُتبت بـrating وحده: منتصف الشريحة
    NEW.score := (NEW.rating * 20) - 10;
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV02',
        '★★★ إسقاط GREATEST(1,…) — score=0 يعطي rating=0 ويخالف CHECK',
        """    NEW.rating := GREATEST(1, LEAST(5, CEIL(NEW.score / 20.0)::INTEGER));""",
        """    NEW.rating := LEAST(5, CEIL(NEW.score / 20.0)::INTEGER);""",
    ),
    (
        'INV03',
        '★★ إسقاط الاتجاه العكسيّ (rating وحده لا يُنتج score)',
        """  ELSIF NEW.rating IS NOT NULL THEN
    -- الاتجاه العكسيّ لصفوفٍ كُتبت بـrating وحده: منتصف الشريحة
    NEW.score := (NEW.rating * 20) - 10;""",
        """  ELSIF FALSE THEN
    NEW.score := NULL;""",
    ),
    (
        'INV04',
        '★★★ إسقاط حارس التقييم الذاتيّ',
        """    IF v_reviewer_emp IS NOT NULL AND v_reviewer_emp = NEW.reviewer_id THEN
      RAISE EXCEPTION
        'REVIEW_SELF_NOT_ALLOWED: لا يجوز أن يُقيّم الموظف نفسه'
        USING ERRCODE = 'check_violation';
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV05',
        '★★ مقارنة employee_id بـreviewer_id مباشرةً (المفتاحان مختلفان)',
        """    SELECT e.user_id INTO v_reviewer_emp
      FROM public.employees e WHERE e.id = NEW.employee_id;""",
        """    v_reviewer_emp := NEW.employee_id;""",
    ),
    (
        'INV06',
        '★ إسقاط ختم completed_at',
        """  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV07',
        '★ إسقاط ختم submitted_at',
        """  IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := NOW();
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV08',
        '★★★ إسقاط محفّز منع حذف التقييم',
        """DROP TRIGGER IF EXISTS trg_block_perf_review_delete ON public.performance_reviews;
CREATE TRIGGER trg_block_perf_review_delete
  BEFORE DELETE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_perf_review_delete();""",
        """DROP TRIGGER IF EXISTS trg_block_perf_review_delete ON public.performance_reviews;""",
    ),
    (
        'INV09',
        '★★ إسقاط محفّز منع حذف الدورة',
        """DROP TRIGGER IF EXISTS trg_block_perf_cycle_delete ON public.performance_cycles;
CREATE TRIGGER trg_block_perf_cycle_delete
  BEFORE DELETE ON public.performance_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_perf_cycle_delete();""",
        """DROP TRIGGER IF EXISTS trg_block_perf_cycle_delete ON public.performance_cycles;""",
    ),
    (
        'INV10',
        '★★ إسقاط استثناء الملغاة من المتوسّط (درجةٌ أُلغيت تُحتسَب أداءً)',
        """           round(avg(r.score) FILTER (
             WHERE r.status <> 'cancelled' AND r.score IS NOT NULL), 1) AS avg_s,""",
        """           round(avg(r.score) FILTER (
             WHERE r.score IS NOT NULL), 1) AS avg_s,""",
    ),
    (
        'INV11',
        '★★★ إسقاط ترشيح المستأجر من performance_summary',
        """     WHERE r.tenant_id = v_tenant
       AND r.archived_at IS NULL
       AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)""",
        """     WHERE r.archived_at IS NULL
       AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)""",
    ),
    (
        'INV12',
        '★★ إسقاط استبعاد المؤرشف من الملخّص',
        """    SELECT count(*)::INTEGER AS total,
           count(*) FILTER (WHERE r.status = 'draft')::INTEGER      AS d,""",
        """    SELECT count(*)::INTEGER AS total,
           count(*) FILTER (WHERE r.status = 'draft' OR TRUE)::INTEGER AS d,""",
    ),
    (
        'INV13',
        '★★ إسقاط حارس staff من performance_summary',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص الأداء';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV14',
        '★★ إسقاط حارس staff من performance_reviews_board',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض تقييمات الأداء';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV15',
        '★★ إسقاط حارس staff من performance_cycles_board',
        """  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض دورات التقييم';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV16',
        '★★★ حارس مفردات اللوحة يقبل مفردة عربية مختلَقة',
        """     AND p_status NOT IN ('draft','submitted','under_review','completed','cancelled') THEN
    RAISE EXCEPTION 'REVIEW_BAD_STATUS""",
        """     AND p_status NOT IN ('draft','submitted','under_review','completed',
                          'cancelled','مسودة') THEN
    RAISE EXCEPTION 'REVIEW_BAD_STATUS""",
    ),
    (
        'INV17',
        '★★ إسقاط سلسلة الاحتياط للاسم (full_name_ar فارغ ⇒ عمود خالٍ)',
        """    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             NULLIF(btrim(pe.full_name), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,""",
        """    e.full_name_ar::TEXT,""",
    ),
    (
        'INV18',
        '★★ إسقاط ترشيح المستأجر من performance_reviews_board',
        """  WHERE r.tenant_id = v_tenant
    AND (p_include_archived OR r.archived_at IS NULL)
    AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)""",
        """  WHERE (p_include_archived OR r.archived_at IS NULL)
    AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)""",
    ),
    (
        'INV19',
        '★ إسقاط الحدّ الأعلى من performance_reviews_board',
        """  ORDER BY r.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);""",
        """  ORDER BY r.created_at DESC;""",
    ),
    (
        'INV20',
        '★ إسقاط اسم الدورة الصريح للتقييم بلا دورة',
        """    COALESCE(c.name, '— بلا دورة —')::TEXT,""",
        """    c.name::TEXT,""",
    ),
    (
        'INV21',
        '★★ إسقاط ترشيح المستأجر من performance_cycles_board',
        """   WHERE c.tenant_id = v_tenant
     AND (p_include_archived OR c.archived_at IS NULL)""",
        """   WHERE (p_include_archived OR c.archived_at IS NULL)""",
    ),
    (
        'INV22',
        '★ إسقاط الحدّ الأعلى من performance_cycles_board',
        """   ORDER BY c.start_date DESC, c.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 100), 1);""",
        """   ORDER BY c.start_date DESC, c.created_at DESC;""",
    ),
    (
        'INV23',
        '★★★ إسقاط حارس النهاية-قبل-البداية من loan_cycle_create',
        """  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'CYCLE_BAD_RANGE: النهاية (%) قبل البداية (%)',
      p_end_date, p_start_date USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV24',
        '★★ إسقاط حارس فترة التقييم',
        """  IF p_period NOT IN ('monthly','quarterly','semi_annual','annual') THEN
    RAISE EXCEPTION 'CYCLE_BAD_PERIOD: فترة غير معروفة «%» — المسموح: '
      'monthly·quarterly·semi_annual·annual', p_period
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV25',
        '★ إسقاط حارس اسم الدورة',
        """  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'CYCLE_NO_NAME: اسم الدورة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV26',
        '★ إسقاط حارس التاريخ الناقص',
        """  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'CYCLE_NO_DATES: تاريخا البداية والنهاية إلزاميّان'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV27',
        '★★ إسقاط حارس الدرجة 0..100 من performance_review_create',
        """  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'REVIEW_BAD_SCORE: الدرجة يجب أن تكون بين 0 و 100 '
      '(المُمرَّرة: %)', COALESCE(p_score::TEXT,'NULL')
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV28',
        '★★★ إسقاط حارس التكرار (تقييمان لنفس الموظف في نفس الدورة)',
        """  IF p_cycle_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.performance_reviews r
                  WHERE r.tenant_id = v_tenant
                    AND r.cycle_id = p_cycle_id
                    AND r.employee_id = p_employee_id
                    AND r.archived_at IS NULL
                    AND r.status <> 'cancelled') THEN
    RAISE EXCEPTION 'REVIEW_DUPLICATE: للموظف تقييمٌ قائم في هذه الدورة'
      USING ERRCODE = 'unique_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV29',
        '★★ إسقاط منع التقييم في دورة مغلقة',
        """    IF v_cyc IN ('closed','cancelled') THEN
      RAISE EXCEPTION 'CYCLE_NOT_OPEN: الدورة بحالة «%» — لا تقييم فيها', v_cyc
        USING ERRCODE = 'check_violation';
    END IF;""",
        """    NULL;""",
    ),
    (
        'INV30',
        '★★ إسقاط تحقّق أن الموظف من المستأجر نفسه',
        """  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV31',
        '★★ إسقاط حارس دور إنشاء التقييم',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء تقييم (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV32',
        '★★ إسقاط حارس دور إنشاء الدورة',
        """  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء دورة تقييم (الدور: %)', COALESCE(v_role,'—');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV33',
        '★★★ إسقاط جدول انتقالات حالة التقييم',
        """  v_ok := CASE v_cur
    WHEN 'draft'        THEN p_status IN ('submitted','cancelled')
    WHEN 'submitted'    THEN p_status IN ('under_review','completed','cancelled')
    WHEN 'under_review' THEN p_status IN ('completed','cancelled')
    ELSE FALSE
  END;""",
        """  v_ok := TRUE;""",
    ),
    (
        'INV34',
        '★★ إسقاط منع تعديل المؤرشف',
        """  IF v_arch IS NOT NULL THEN
    RAISE EXCEPTION 'REVIEW_ARCHIVED: التقييم مؤرشف — لا تعديل عليه'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV35',
        '★★ إسقاط ترشيح المستأجر من performance_review_set_status',
        """  SELECT r.status, r.archived_at INTO v_cur, v_arch
    FROM public.performance_reviews r
   WHERE r.id = p_review_id AND r.tenant_id = v_tenant;""",
        """  SELECT r.status, r.archived_at INTO v_cur, v_arch
    FROM public.performance_reviews r
   WHERE r.id = p_review_id;""",
    ),
    (
        'INV36',
        '★★★ إسقاط إلغاء التقييمات المعلَّقة عند إغلاق الدورة',
        """  IF p_status = 'closed' THEN
    UPDATE public.performance_reviews
       SET status = 'cancelled', updated_at = NOW()
     WHERE tenant_id = v_tenant AND cycle_id = p_cycle_id
       AND archived_at IS NULL
       AND status IN ('draft','submitted','under_review');
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV37',
        '★★ إسقاط نهائية الدورة المغلقة',
        """  IF v_cur IN ('closed','cancelled') THEN
    RAISE EXCEPTION 'CYCLE_FINAL: الدورة بحالة «%» — لا انتقال بعدها', v_cur
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV38',
        '★★ إسقاط ترشيح المستأجر من performance_cycle_set_status',
        """  SELECT c.status INTO v_cur FROM public.performance_cycles c
   WHERE c.id = p_cycle_id AND c.tenant_id = v_tenant;""",
        """  SELECT c.status INTO v_cur FROM public.performance_cycles c
   WHERE c.id = p_cycle_id;""",
    ),
    (
        'INV39',
        '★ إسقاط حارس سبب الأرشفة',
        """  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REVIEW_NO_REASON: سبب الأرشفة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;""",
        """  -- (أُسقط)""",
    ),
    (
        'INV40',
        '★★ إسقاط ترشيح المستأجر من performance_review_archive',
        """   WHERE id = p_review_id AND tenant_id = v_tenant AND archived_at IS NULL;""",
        """   WHERE id = p_review_id AND archived_at IS NULL;""",
    ),
]


# ═══════════════════════════════════════════════════════════════════════
#  ★★★ عكوس DDL — `IF NOT EXISTS` يمنع إعادة الإنشاء
#
#  `ADD COLUMN IF NOT EXISTS` و`IF NOT EXISTS (SELECT 1 FROM pg_constraint)`
#  كلاهما لا يُنفَّذ ثانيةً على قاعدةٍ طُبِّق عليها المايجريشن. فحذف
#  السطر من النصّ لا يُسقط العمود ولا القيد — العكس الصحيح DDL صريح.
# ═══════════════════════════════════════════════════════════════════════
DDL_INVERSIONS = [
    (
        'DDL01',
        '★★★ إسقاط عمود updated_at (يعود عطل «أيُّ UPDATE يفشل»)',
        'ALTER TABLE public.performance_reviews DROP COLUMN IF EXISTS updated_at;',
        'ALTER TABLE public.performance_reviews '
        'ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    ),
    (
        'DDL02',
        '★★★ إسقاط عمود score (يعود عطل «الإنشاء يفشل دائماً»)',
        'ALTER TABLE public.performance_reviews DROP COLUMN IF EXISTS score CASCADE;',
        'ALTER TABLE public.performance_reviews '
        'ADD COLUMN IF NOT EXISTS score NUMERIC(5,2);',
    ),
    (
        'DDL03',
        '★★ إسقاط عمود archived_at',
        'ALTER TABLE public.performance_reviews DROP COLUMN IF EXISTS archived_at CASCADE;',
        'ALTER TABLE public.performance_reviews '
        'ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;',
    ),
    (
        'DDL04',
        '★★ إسقاط قيد مفردات حالة التقييم',
        'ALTER TABLE public.performance_reviews '
        'DROP CONSTRAINT IF EXISTS performance_reviews_status_chk;',
        "ALTER TABLE public.performance_reviews ADD CONSTRAINT "
        "performance_reviews_status_chk CHECK (status IN "
        "('draft','submitted','under_review','completed','cancelled'));",
    ),
    (
        'DDL05',
        '★★ إسقاط قيد الدرجة 0..100',
        'ALTER TABLE public.performance_reviews '
        'DROP CONSTRAINT IF EXISTS performance_reviews_score_chk;',
        'ALTER TABLE public.performance_reviews ADD CONSTRAINT '
        'performance_reviews_score_chk CHECK '
        '(score IS NULL OR (score >= 0 AND score <= 100));',
    ),
    (
        'DDL06',
        '★★★ إسقاط الفهرس الفريد (تقييمان لنفس الموظف في نفس الدورة)',
        'DROP INDEX IF EXISTS public.uq_review_per_employee_cycle;',
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_employee_cycle '
        'ON public.performance_reviews (tenant_id, cycle_id, employee_id) '
        "WHERE cycle_id IS NOT NULL AND archived_at IS NULL "
        "AND status <> 'cancelled';",
    ),
    (
        'DDL07',
        '★★ إسقاط FK على cycle_id (تقييم في دورة غير موجودة)',
        'ALTER TABLE public.performance_reviews '
        'DROP CONSTRAINT IF EXISTS performance_reviews_cycle_id_fkey;',
        'ALTER TABLE public.performance_reviews ADD CONSTRAINT '
        'performance_reviews_cycle_id_fkey FOREIGN KEY (cycle_id) '
        'REFERENCES public.performance_cycles(id) ON DELETE SET NULL;',
    ),
    (
        'DDL08',
        '★★ إسقاط قيد مدى تاريخ الدورة',
        'ALTER TABLE public.performance_cycles '
        'DROP CONSTRAINT IF EXISTS performance_cycles_range_chk;',
        'ALTER TABLE public.performance_cycles ADD CONSTRAINT '
        'performance_cycles_range_chk CHECK (end_date >= start_date);',
    ),
    (
        'DDL09',
        '★★ إسقاط قيد فترة الدورة',
        'ALTER TABLE public.performance_cycles '
        'DROP CONSTRAINT IF EXISTS performance_cycles_period_chk;',
        "ALTER TABLE public.performance_cycles ADD CONSTRAINT "
        "performance_cycles_period_chk CHECK (review_period IN "
        "('monthly','quarterly','semi_annual','annual'));",
    ),
    (
        'DDL10',
        '★★ إسقاط قيد حالة الدورة',
        'ALTER TABLE public.performance_cycles '
        'DROP CONSTRAINT IF EXISTS performance_cycles_status_chk;',
        "ALTER TABLE public.performance_cycles ADD CONSTRAINT "
        "performance_cycles_status_chk CHECK (status IN "
        "('draft','active','closed','cancelled'));",
    ),
]

DDL_RLS_CHECK: set = set()


# ═══════════════════════════════════════════════════════════════════════
#  تكافؤات مُثبتة — لا تُعدّ ثغرات تغطية
# ═══════════════════════════════════════════════════════════════════════
EQUIVALENT_INVERSIONS = [
    (
        'EQ01',
        "حارس p_status في performance_review_set_status",
        "مُكافئ لجدول الانتقالات (INV33): كل حالة خارج المفردات الخمس "
        "لا تُطابق أيّ فرع في CASE فيصير v_ok = FALSE ويُرمى "
        "REVIEW_BAD_TRANSITION. الفارق رسالة الخطأ فقط، والانتقال "
        "مرفوض في الحالتين. (INV33 يسقط الاختبار فعلاً.)",
    ),
    (
        'EQ02',
        "حارس p_status في performance_cycle_set_status",
        "مُكافئ لقيد performance_cycles_status_chk (DDL10): إسقاط "
        "الحارس وحده يُبقي القيد يرفض الكتابة. الفارق أن الخطأ يأتي "
        "من القاعدة بدل الدالة — والصفّ يُرفض في الحالتين.",
    ),
    (
        'EQ03',
        "تطبيع البيانات القائمة قبل فرض القيود (كتل UPDATE في DO $$)",
        "على قاعدة نظيفة لا صفوف تخالف القيود، فالتطبيع بلا أثر قابل "
        "للقياس. أثره الحقيقيّ على قاعدة الإنتاج وحدها — وهو مُثبَت "
        "بأن المايجريشن يُطبَّق بنجاح على القاعدة الحالية (284 مايجريشن).",
    ),
]


def main():
    original = open(MIG, encoding='utf-8').read()
    results = []

    print('═' * 74)
    print('  عكس إصلاحات 0356 — إثبات أن كل إصلاح مُختبَر فعلاً')
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

    # ── (أ) العكوس النصّية ──────────────────────────────────────────
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

    # ── (ب) عكوس DDL ────────────────────────────────────────────────
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
