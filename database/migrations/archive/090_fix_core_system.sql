-- ============================================================================
-- ملف: 090_fix_core_system.sql
-- الوصف: إصلاح شامل للنظام الأساسي (أدوار + إجازات + حضور + زمنيات)
-- التاريخ: 2026-06-26
-- ============================================================================

-- ============================================================================
-- 1. توحيد الأدوار - إضافة hr و supervisor و gatekeeper
-- ============================================================================

-- تحديث CHECK constraint في جدول employees لتشمل كل الأدوار
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'supervisor', 'hr', 'admin', 'developer', 'gatekeeper'));

-- ============================================================================
-- 2. إضافة أعمدة مفقودة لجدول الموظفين
-- ============================================================================

-- إضافة أعمدة مفقودة
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'full_time'
    CHECK (contract_type IN ('full_time', 'part_time', 'contract', 'temporary', 'intern')),
  ADD COLUMN IF NOT EXISTS employment_status VARCHAR(30) DEFAULT 'active'
    CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'terminated', 'probation')),
  ADD COLUMN IF NOT EXISTS probation_end_date DATE,
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(100),
  ADD COLUMN IF NOT EXISTS national_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10)
    CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20)
    CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS education VARCHAR(200),
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS location VARCHAR(200),
  ADD COLUMN IF NOT EXISTS fingerprint_id VARCHAR(100);

-- إضافة index للمشرفين
CREATE INDEX IF NOT EXISTS idx_employees_supervisor ON public.employees(supervisor_id);

-- ============================================================================
-- 3. إصلاح trigger تحديث رصيد الإجازات عند تغيير الحالة
--    المشكلة: Trigger موجود فقط عند INSERT وليس عند UPDATE
-- ============================================================================

-- حذف المشغل القديم (يعمل فقط على INSERT)
DROP TRIGGER IF EXISTS trigger_update_leave_balance ON public.leaves;

-- إنشاء دالة محسّنة لتحديث الرصيد
CREATE OR REPLACE FUNCTION public.update_leave_balance_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_working_days INTEGER;
  v_old_working_days INTEGER;
  v_year INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.date_from, OLD.date_from));

  -- حساب أيام العمل للطلب الجديد
  IF NEW.date_from IS NOT NULL AND NEW.date_to IS NOT NULL THEN
    v_working_days := public.calculate_working_days(NEW.date_from, NEW.date_to);
  ELSE
    v_working_days := 0;
  END IF;

  -- حساب أيام العمل للطلب القديم (في حالة التحديث)
  IF TG_OP = 'UPDATE' AND OLD.date_from IS NOT NULL AND OLD.date_to IS NOT NULL THEN
    v_old_working_days := public.calculate_working_days(OLD.date_from, OLD.date_to);
  ELSE
    v_old_working_days := 0;
  END IF;

  -- ─── INSERT: زيادة pending ───
  IF TG_OP = 'INSERT' THEN
    IF NEW.leave_type = 'سنوية' THEN
      INSERT INTO public.leave_balance (employee_id, year, annual_total, annual_pending)
      VALUES (
        NEW.employee_id, v_year,
        public.calculate_annual_leave_balance(NEW.employee_id, v_year),
        v_working_days
      )
      ON CONFLICT (employee_id, year) DO UPDATE SET
        annual_total = public.calculate_annual_leave_balance(NEW.employee_id, v_year),
        annual_pending = public.leave_balance.annual_pending + v_working_days,
        updated_at = NOW();

    ELSIF NEW.leave_type = 'مرضية' THEN
      INSERT INTO public.leave_balance (employee_id, year, sick_pending)
      VALUES (NEW.employee_id, v_year, v_working_days)
      ON CONFLICT (employee_id, year) DO UPDATE SET
        sick_pending = public.leave_balance.sick_pending + v_working_days,
        updated_at = NOW();
    END IF;

  -- ─── UPDATE: تعديل الرصيد حسب التغيير في الحالة ───
  ELSIF TG_OP = 'UPDATE' THEN
    -- إذا تمت الموافقة: نقل من pending إلى used
    IF NEW.status = 'موافق' AND OLD.status != 'موافق' THEN
      IF NEW.leave_type = 'سنوية' THEN
        -- تقليل pending وزيادة used
        UPDATE public.leave_balance
        SET
          annual_pending = GREATEST(annual_pending - v_working_days, 0),
          annual_used = annual_used + v_working_days,
          updated_at = NOW()
        WHERE employee_id = NEW.employee_id AND year = v_year;

      ELSIF NEW.leave_type = 'مرضية' THEN
        UPDATE public.leave_balance
        SET
          sick_pending = GREATEST(sick_pending - v_working_days, 0),
          sick_used = sick_used + v_working_days,
          updated_at = NOW()
        WHERE employee_id = NEW.employee_id AND year = v_year;
      END IF;

      -- تحديث حالة الحضور للأيام التي تغطيها الإجازة
      PERFORM public.recalc_attendance_for_leave(NEW.employee_id, NEW.date_from, NEW.date_to);

    -- إذا تم الرفض: إعادة الأيام من pending
    ELSIF NEW.status = 'مرفوض' AND OLD.status != 'مرفوض' THEN
      IF NEW.leave_type = 'سنوية' THEN
        UPDATE public.leave_balance
        SET
          annual_pending = GREATEST(annual_pending - v_working_days, 0),
          updated_at = NOW()
        WHERE employee_id = NEW.employee_id AND year = v_year;

      ELSIF NEW.leave_type = 'مرضية' THEN
        UPDATE public.leave_balance
        SET
          sick_pending = GREATEST(sick_pending - v_working_days, 0),
          updated_at = NOW()
        WHERE employee_id = NEW.employee_id AND year = v_year;
      END IF;

    -- إذا تغيرت التواريخ: إعادة حساب
    ELSIF NEW.date_from != OLD.date_from OR NEW.date_to != OLD.date_to THEN
      -- إعادة الأيام القديمة
      IF OLD.leave_type = 'سنوية' THEN
        UPDATE public.leave_balance
        SET annual_pending = GREATEST(annual_pending - v_old_working_days, 0), updated_at = NOW()
        WHERE employee_id = NEW.employee_id AND year = EXTRACT(YEAR FROM OLD.date_from);
      ELSIF OLD.leave_type = 'مرضية' THEN
        UPDATE public.leave_balance
        SET sick_pending = GREATEST(sick_pending - v_old_working_days, 0), updated_at = NOW()
        WHERE employee_id = NEW.employee_id AND year = EXTRACT(YEAR FROM OLD.date_from);
      END IF;

      -- إضافة الأيام الجديدة
      IF NEW.status = 'انتظار' THEN
        IF NEW.leave_type = 'سنوية' THEN
          UPDATE public.leave_balance
          SET annual_pending = annual_pending + v_working_days, updated_at = NOW()
          WHERE employee_id = NEW.employee_id AND year = v_year;
        ELSIF NEW.leave_type = 'مرضية' THEN
          UPDATE public.leave_balance
          SET sick_pending = sick_pending + v_working_days, updated_at = NOW()
          WHERE employee_id = NEW.employee_id AND year = v_year;
        END IF;
      ELSIF NEW.status = 'موافق' THEN
        IF NEW.leave_type = 'سنوية' THEN
          UPDATE public.leave_balance
          SET annual_used = annual_used + v_working_days, updated_at = NOW()
          WHERE employee_id = NEW.employee_id AND year = v_year;
        ELSIF NEW.leave_type = 'مرضية' THEN
          UPDATE public.leave_balance
          SET sick_used = sick_used + v_working_days, updated_at = NOW()
          WHERE employee_id = NEW.employee_id AND year = v_year;
        END IF;
      END IF;
    END IF;
  END IF;

  -- تحديث رصيد الحج إذا تمت الموافقة على إجازة حج
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE')
    AND NEW.leave_type = 'حج'
    AND NEW.status = 'موافق'
    AND (TG_OP = 'INSERT' OR OLD.status != 'موافق') THEN
    UPDATE public.leave_balance
    SET hajj_taken = true, updated_at = NOW()
    WHERE employee_id = NEW.employee_id
    ORDER BY year DESC LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق المشغل على INSERT و UPDATE
CREATE TRIGGER trigger_update_leave_balance
  AFTER INSERT OR UPDATE ON public.leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_leave_balance_on_status_change();

-- ============================================================================
-- 4. دالة إعادة حساب الحضور عند الموافقة على إجازة
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_attendance_for_leave(
  p_employee_id UUID,
  p_date_from DATE,
  p_date_to DATE
) RETURNS void AS $$
DECLARE
  v_current_date DATE;
BEGIN
  v_current_date := p_date_from;
  WHILE v_current_date <= p_date_to LOOP
    -- تحديث حالة الحضور للأيام التي ليست جمعة أو عطلة
    IF EXTRACT(DOW FROM v_current_date) != 6 AND
       NOT EXISTS (SELECT 1 FROM public.holidays WHERE date = v_current_date) THEN
      INSERT INTO public.attendance_summary (employee_id, shift_date, status)
      VALUES (p_employee_id, v_current_date, 'مجاز'::attendance_status_enum)
      ON CONFLICT (employee_id, shift_date) DO UPDATE SET
        status = 'مجاز'::attendance_status_enum,
        updated_at = NOW();
    END IF;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. تحسين دالة تحديد الوردية (تغطية كل ساعات اليوم)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.determine_shift(p_punch_time TIMESTAMPTZ)
RETURNS shift_type_enum AS $$
DECLARE
  v_hour NUMERIC := EXTRACT(HOUR FROM p_punch_time) + (EXTRACT(MINUTE FROM p_punch_time) / 60.0);
  v_shift shift_type_enum;
BEGIN
  -- الوردية الصباحية: الدخول 06:00-10:00 (تغطي حتى 14:00)
  -- الوردية المسائية: الدخول 14:00-18:00 (تغطي حتى 22:00)
  -- الوردية الليلية: الدخول 22:00-02:00 (تغطي حتى 06:00)
  -- فترات الانتقال: 10:00-14:00 → صباحي، 18:00-22:00 → مسائي، 02:00-06:00 → ليلي

  IF v_hour >= 6.0 AND v_hour < 10.0 THEN
    v_shift := 'صباحي'::shift_type_enum;
  ELSIF v_hour >= 10.0 AND v_hour < 14.0 THEN
    -- فترة انتقال صباحية (موظفون متأخرون أو خارجين)
    v_shift := 'صباحي'::shift_type_enum;
  ELSIF v_hour >= 14.0 AND v_hour < 18.0 THEN
    v_shift := 'مسائي'::shift_type_enum;
  ELSIF v_hour >= 18.0 AND v_hour < 22.0 THEN
    -- فترة انتقال مسائية
    v_shift := 'مسائي'::shift_type_enum;
  ELSIF v_hour >= 22.0 OR v_hour < 2.0 THEN
    v_shift := 'ليلي'::shift_type_enum;
  ELSE
    -- 02:00-06:00 → ليلي
    v_shift := 'ليلي'::shift_type_enum;
  END IF;

  RETURN v_shift;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 6. تحسين دالة تحديث ملخص الحضور (معالجة البصمة المنفردة)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_attendance_summary(
  p_employee_id UUID,
  p_shift_date DATE
) RETURNS void AS $$
DECLARE
  v_logs RECORD[];
  v_log_count INTEGER;
  v_first_punch TIMESTAMPTZ;
  v_last_punch TIMESTAMPTZ;
  v_shift_type shift_type_enum;
  v_late_minutes INTEGER := 0;
  v_early_leave_minutes INTEGER := 0;
  v_overtime_minutes INTEGER := 0;
  v_total_seconds INTEGER := 0;
  v_status attendance_status_enum;
  v_shift_start TIME;
  v_shift_end TIME;
  v_shift_hours INTEGER;
  v_is_holiday BOOLEAN;
  v_is_friday BOOLEAN;
  v_has_approved_leave BOOLEAN;
  v_has_pending_leave BOOLEAN;
  v_has_approved_permission BOOLEAN;
  v_has_pending_permission BOOLEAN;
  v_shift_settings JSONB;
  v_missing_check_out BOOLEAN := false;
  v_permission_end_time TIME;
BEGIN
  -- التحقق من يوم الجمعة
  v_is_friday := EXTRACT(DOW FROM p_shift_date) = 6;

  -- التحقق من العطلة الرسمية
  SELECT EXISTS(
    SELECT 1 FROM public.holidays WHERE date = p_shift_date
  ) INTO v_is_holiday;

  -- إذا كان اليوم عطلة
  IF v_is_friday OR v_is_holiday THEN
    INSERT INTO public.attendance_summary
      (employee_id, shift_date, status)
    VALUES (p_employee_id, p_shift_date, 'عطلة'::attendance_status_enum)
    ON CONFLICT (employee_id, shift_date)
    DO UPDATE SET status = 'عطلة'::attendance_status_enum, updated_at = NOW();
    RETURN;
  END IF;

  -- جمع كل بصمات اليوم
  SELECT array_agg(ROW(punch_time, shift_type) ORDER BY punch_time)
    INTO v_logs
  FROM public.attendance_logs
  WHERE employee_id = p_employee_id AND shift_date = p_shift_date;

  v_log_count := COALESCE(array_length(v_logs, 1), 0);

  -- إذا لم توجد أي بصمة
  IF v_log_count = 0 THEN
    -- التحقق من إجازة معتمدة
    SELECT EXISTS(
      SELECT 1 FROM public.leaves
      WHERE employee_id = p_employee_id
        AND p_shift_date BETWEEN date_from AND date_to
        AND status = 'موافق'
    ) INTO v_has_approved_leave;

    IF v_has_approved_leave THEN
      v_status := 'مجاز'::attendance_status_enum;
    ELSE
      SELECT EXISTS(
        SELECT 1 FROM public.leaves
        WHERE employee_id = p_employee_id
          AND p_shift_date BETWEEN date_from AND date_to
          AND status = 'انتظار'
      ) INTO v_has_pending_leave;

      IF v_has_pending_leave THEN
        v_status := 'إجازة_انتظار'::attendance_status_enum;
      ELSE
        v_status := 'غائب'::attendance_status_enum;
      END IF;
    END IF;

    INSERT INTO public.attendance_summary
      (employee_id, shift_date, status)
    VALUES (p_employee_id, p_shift_date, v_status)
    ON CONFLICT (employee_id, shift_date)
    DO UPDATE SET status = v_status, updated_at = NOW();
    RETURN;
  END IF;

  -- استخراج أول وآخر بصمة
  SELECT (v_logs[1]).f1 INTO v_first_punch;
  SELECT (v_logs[v_log_count]).f1 INTO v_last_punch;

  -- تحديد الوردية
  IF (v_logs[1]).f2 IS NOT NULL THEN
    v_shift_type := (v_logs[1]).f2;
  ELSE
    v_shift_type := public.determine_shift(v_first_punch);
  END IF;

  -- جلب إعدادات الوردية
  SELECT shift_timings INTO v_shift_settings
  FROM public.system_settings WHERE id = 'singleton';

  IF v_shift_settings IS NOT NULL THEN
    v_shift_start := (v_shift_settings->>(v_shift_type::TEXT))::jsonb->>'start';
    v_shift_end := (v_shift_settings->>(v_shift_type::TEXT))::jsonb->>'end';
    v_shift_hours := ((v_shift_settings->>(v_shift_type::TEXT))::jsonb->>'hours')::INTEGER;
  ELSE
    -- قيم افتراضية
    v_shift_start := CASE v_shift_type
      WHEN 'صباحي'::shift_type_enum THEN '08:00'::TIME
      WHEN 'مسائي'::shift_type_enum THEN '16:00'::TIME
      ELSE '00:00'::TIME
    END;
    v_shift_end := CASE v_shift_type
      WHEN 'صباحي'::shift_type_enum THEN '16:00'::TIME
      WHEN 'مسائي'::shift_type_enum THEN '00:00'::TIME
      ELSE '08:00'::TIME
    END;
    v_shift_hours := 8;
  END IF;

  -- حساب التأخير
  IF v_first_punch::TIME > v_shift_start THEN
    v_late_minutes := EXTRACT(EPOCH FROM (v_first_punch::TIME - v_shift_start)) / 60;
  END IF;

  -- حساب الساعات والوقت الإضافي والخروج المبكر
  IF v_last_punch IS NOT NULL AND v_last_punch != v_first_punch THEN
    -- بصمتين أو أكثر → حضور كامل مع وقت خروج
    v_total_seconds := EXTRACT(EPOCH FROM (v_last_punch - v_first_punch));

    IF v_total_seconds > v_shift_hours * 3600 THEN
      v_overtime_minutes := (v_total_seconds - v_shift_hours * 3600) / 60;
    END IF;

    IF v_last_punch::TIME < v_shift_end THEN
      v_early_leave_minutes := EXTRACT(EPOCH FROM (v_shift_end - v_last_punch::TIME)) / 60;
    END IF;
  ELSIF v_last_punch = v_first_punch THEN
    -- بصمة واحدة فقط = دخول بدون خروج
    v_missing_check_out := true;
    v_total_seconds := 0;

    -- نتحقق إذا مرت 8 ساعات على الأقل (نعتبره دخل وخرج)
    -- إذا كان الوقت الحالي بعد نهاية الوردية، نحسب حتى نهاية الوردية
    IF NOW()::TIME > v_shift_end THEN
      v_total_seconds := EXTRACT(EPOCH FROM (v_shift_end::TIMESTAMPTZ - v_first_punch::TIMESTAMPTZ));
      -- لا نحسب خروج مبكر لأنه لم يخرج
    END IF;
  END IF;

  -- تحديد الحالة
  IF v_missing_check_out THEN
    -- بصمة واحدة فقط → نحتاج بصمة خروج
    IF v_late_minutes > 0 THEN
      v_status := 'متأخر'::attendance_status_enum;
    ELSE
      v_status := 'حضور_بوقت'::attendance_status_enum;
    END IF;
  ELSIF v_late_minutes > 0 AND v_early_leave_minutes > 0 THEN
    -- متأخر وخرج مبكر
    v_status := 'متأخر'::attendance_status_enum;

    -- التحقق من زمنية للخروج المبكر
    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id AND date = p_shift_date
        AND status = 'موافق'
    ) INTO v_has_approved_permission;

    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id AND date = p_shift_date
        AND status = 'انتظار'
    ) INTO v_has_pending_permission;

    IF v_has_approved_permission THEN
      v_status := 'زمنية_معتمدة'::attendance_status_enum;
    ELSIF v_has_pending_permission THEN
      v_status := 'زمنية_انتظار'::attendance_status_enum;
    END IF;
  ELSIF v_late_minutes > 0 THEN
    v_status := 'متأخر'::attendance_status_enum;
  ELSIF v_early_leave_minutes > 0 THEN
    -- دخول بوقت لكن خروج مبكر
    v_status := 'حضور_بوقت'::attendance_status_enum;

    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id AND date = p_shift_date
        AND status = 'موافق'
    ) INTO v_has_approved_permission;

    SELECT EXISTS(
      SELECT 1 FROM public.permissions
      WHERE employee_id = p_employee_id AND date = p_shift_date
        AND status = 'انتظار'
    ) INTO v_has_pending_permission;

    IF v_has_approved_permission THEN
      v_status := 'زمنية_معتمدة'::attendance_status_enum;
    ELSIF v_has_pending_permission THEN
      v_status := 'زمنية_انتظار'::attendance_status_enum;
    END IF;
  ELSE
    v_status := 'حضور_بوقت'::attendance_status_enum;
  END IF;

  -- حفظ أو تحديث الملخص
  INSERT INTO public.attendance_summary (
    employee_id, shift_date, shift_type, check_in, check_out,
    total_hours, late_minutes, early_leave_minutes,
    overtime_minutes, status
  ) VALUES (
    p_employee_id, p_shift_date, v_shift_type, v_first_punch,
    CASE WHEN v_missing_check_out THEN NULL ELSE v_last_punch END,
    ROUND(COALESCE(v_total_seconds, 0)::NUMERIC / 3600, 2),
    v_late_minutes, v_early_leave_minutes, v_overtime_minutes, v_status
  )
  ON CONFLICT (employee_id, shift_date) DO UPDATE SET
    shift_type = COALESCE(v_shift_type, public.attendance_summary.shift_type),
    check_in = COALESCE(v_first_punch, public.attendance_summary.check_in),
    check_out = CASE WHEN v_missing_check_out THEN public.attendance_summary.check_out ELSE v_last_punch END,
    total_hours = ROUND(COALESCE(v_total_seconds, 0)::NUMERIC / 3600, 2),
    late_minutes = COALESCE(v_late_minutes, public.attendance_summary.late_minutes),
    early_leave_minutes = COALESCE(v_early_leave_minutes, public.attendance_summary.early_leave_minutes),
    overtime_minutes = COALESCE(v_overtime_minutes, public.attendance_summary.overtime_minutes),
    status = v_status,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. تحسين RLS - إضافة سياسات لـ hr
-- ============================================================================

-- الموظفين: HR يستطيع رؤية الجميع
CREATE POLICY employees_hr_select ON public.employees
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'hr'
  );

CREATE POLICY employees_hr_update ON public.employees
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'hr'
  );

-- HR يستطيع إدارة الحضور
CREATE POLICY attendance_logs_hr_select ON public.attendance_logs
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'hr'
  );

CREATE POLICY attendance_summary_hr_select ON public.attendance_summary
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'hr'
  );

-- HR يستطيع إدارة الإجازات
CREATE POLICY leaves_hr_select ON public.leaves
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'hr'
  );

CREATE POLICY leaves_hr_update ON public.leaves
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'hr'
  );

-- HR يستطيع إدارة الزمنيات
CREATE POLICY permissions_hr_select ON public.permissions
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'hr'
  );

CREATE POLICY permissions_hr_update ON public.permissions
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'hr'
  );

CREATE POLICY permissions_request_hr_select ON public.permissions_request
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'hr'
  );

CREATE POLICY permissions_request_hr_update ON public.permissions_request
  FOR UPDATE USING (
    current_setting('app.current_role', true) = 'hr'
  );

-- ============================================================================
-- 8. دالة carry forward (نقل رصيد الإجازات للسنة الجديدة)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.carry_forward_leave_balance(
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
) RETURNS void AS $$
DECLARE
  v_next_year INTEGER := p_year + 1;
  v_max_carry_days NUMERIC := 5; -- أقصى عدد أيام يمكن نقلها
BEGIN
  -- نقل الأيام السنوية المتبقية
  INSERT INTO public.leave_balance (employee_id, year, annual_total, annual_remaining)
  SELECT
    lb.employee_id,
    v_next_year,
    public.calculate_annual_leave_balance(lb.employee_id, v_next_year),
    LEAST(
      GREATEST(lb.annual_total - lb.annual_used - lb.annual_pending, 0),
      v_max_carry_days
    )
  FROM public.leave_balance lb
  WHERE lb.year = p_year
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_balance lb2
      WHERE lb2.employee_id = lb.employee_id AND lb2.year = v_next_year
    );

  -- نقل الأيام المرضية المتبقية
  UPDATE public.leave_balance lb_new
  SET sick_total = lb_new.sick_total +
    LEAST(
      GREATEST(old_lb.sick_total - old_lb.sick_used - old_lb.sick_pending, 0),
      10 -- أقصى نقل للأيام المرضية
    )
  FROM public.leave_balance old_lb
  WHERE old_lb.year = p_year
    AND lb_new.employee_id = old_lb.employee_id
    AND lb_new.year = v_next_year;

  RAISE NOTICE 'تم نقل أرصدة الإجازات من % إلى % بنجاح', p_year, v_next_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- نهاية ملف الإصلاح
-- ============================================================================
