-- ============================================================================
-- Kyvzon Platform - Demo Seed Data
-- ============================================================================
-- هذا السكريبت ينشئ بيئة تجريبية كاملة لتجربة النظام عملياً
-- يشمل: موظفين، بصمات بكل الورديات، إجازات، زمنيات، عطل
-- ============================================================================

-- ⚠️ تأكد أولاً من وجود بيانات في جدول employees
-- إذا كان جدول employees فارغاً، شغّل هذا أولاً:

-- ============================================================================
-- 1. إنشاء الأقسام
-- ============================================================================
INSERT INTO departments (id, name_ar, name_en, is_active) VALUES
  ('d0010001-0000-0000-0000-000000000001', 'التقنية', 'Production', true),
  ('d0010001-0000-0000-0000-000000000002', 'الجودة', 'Quality', true),
  ('d0010001-0000-0000-0000-000000000003', 'المختبرات', 'Laboratories', true),
  ('d0010001-0000-0000-0000-000000000004', 'المشاريع', 'Warehouses', true),
  ('d0010001-0000-0000-0000-000000000005', 'الإدارة', 'Management', true)
ON CONFLICT (id) DO NOTHING;

-- ⚠️ ملاحظة: جدول employees يقبل فقط: developer, system_admin, manager, employee
-- الأدوار hr, supervisor, admin تُخزَّن في جدول profiles، أما employees فالدور إما employee أو manager أو system_admin
-- ============================================================================
-- 2. إنشاء موظفين تجريبيين بكل الأدوار
-- ============================================================================
INSERT INTO employees (id, employee_code, first_name, last_name, email, department_id, position, role, hire_date, is_active) VALUES
  ('e0010001-0000-0000-0000-000000000001', 'EMP-001', 'أحمد', 'العلي', 'ahmed@kyvzon.com', 'd0010001-0000-0000-0000-000000000001', 'مطور برمجيات', 'employee', '2023-01-15', true),
  ('e0010001-0000-0000-0000-000000000002', 'EMP-002', 'محمد', 'حسين', 'mohamed@kyvzon.com', 'd0010001-0000-0000-0000-000000000001', 'مهندس نظم', 'employee', '2022-06-01', true),
  ('e0010001-0000-0000-0000-000000000003', 'EMP-003', 'سارة', 'خالد', 'sara@kyvzon.com', 'd0010001-0000-0000-0000-000000000002', 'محلل بيانات', 'employee', '2023-09-01', true),
  ('e0010001-0000-0000-0000-000000000004', 'EMP-004', 'علي', 'عباس', 'ali@kyvzon.com', 'd0010001-0000-0000-0000-000000000003', 'مدير تقنية', 'manager', '2021-03-15', true),
  ('e0010001-0000-0000-0000-000000000005', 'EMP-005', 'نور', 'مهدي', 'noor@kyvzon.com', 'd0010001-0000-0000-0000-000000000004', 'مدير مشاريع', 'employee', '2024-01-01', true),
  ('e0010001-0000-0000-0000-000000000006', 'EMP-006', 'زينب', 'كاظم', 'zainab@kyvzon.com', 'd0010001-0000-0000-0000-000000000005', 'أخصائي موارد بشرية', 'employee', '2022-01-01', true),   -- role=employee (hr يُقرأ من profiles)
  ('e0010001-0000-0000-0000-000000000007', 'EMP-007', 'حسن', 'جاسم', 'hasan@kyvzon.com', 'd0010001-0000-0000-0000-000000000001', 'مهندس برمجيات', 'employee', '2020-06-15', true)   -- role=employee (supervisor يُقرأ من profiles)
ON CONFLICT (id) DO NOTHING;

-- تعيين المدراء
UPDATE employees SET manager_id = 'e0010001-0000-0000-0000-000000000004' WHERE department_id = 'd0010001-0000-0000-0000-000000000001' AND id != 'e0010001-0000-0000-0000-000000000004';
UPDATE departments SET manager_id = 'e0010001-0000-0000-0000-000000000004' WHERE id = 'd0010001-0000-0000-0000-000000000003';

-- ============================================================================
-- 3. إنشاء عطلة رسمية غداً للتجربة
-- ============================================================================
INSERT INTO holidays (id, date, name, applies_to, is_recurring, created_by) VALUES
('a0000001-0000-0000-0000-000000000001', CURRENT_DATE + 1, '⚡ عطلة تجريبية - صيانة دورية', 'all', false, 'e0010001-0000-0000-0000-000000000006')
ON CONFLICT (date) DO NOTHING;

-- ============================================================================
-- 4. محاكاة البصمات - سيناريو اليوم: كل الموظفين والورديات
-- ============================================================================

-- 📘 سيناريو 1: موظف صباحي ملتزم (EMP-001)
-- بصم 07:45 صباحاً ✓ وخرج 16:10 (10 دقائق إضافية)
INSERT INTO attendance_logs (employee_id, punch_time, shift_type, shift_date, source, verification_type) VALUES
  ('e0010001-0000-0000-0000-000000000001', (CURRENT_DATE + TIME '07:45')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'ADMS', 'finger'),
  ('e0010001-0000-0000-0000-000000000001', (CURRENT_DATE + TIME '16:10')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'ADMS', 'finger')
ON CONFLICT (employee_id, punch_time) DO NOTHING;

-- 📘 سيناريو 2: موظف متأخر (EMP-002)
-- بصم 08:35 (35 دقيقة تأخير) وخرج 16:00
INSERT INTO attendance_logs (employee_id, punch_time, shift_type, shift_date, source, verification_type) VALUES
  ('e0010001-0000-0000-0000-000000000002', (CURRENT_DATE + TIME '08:35')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'ADMS', 'finger'),
  ('e0010001-0000-0000-0000-000000000002', (CURRENT_DATE + TIME '16:00')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'ADMS', 'finger')
ON CONFLICT (employee_id, punch_time) DO NOTHING;

-- 📘 سيناريو 3: موظف مسائي (EMP-003 - مفتش جودة)
-- بصم 15:00 وخرج 23:30
INSERT INTO attendance_logs (employee_id, punch_time, shift_type, shift_date, source, verification_type) VALUES
  ('e0010001-0000-0000-0000-000000000003', (CURRENT_DATE + TIME '15:00')::TIMESTAMPTZ, 'مسائي', CURRENT_DATE, 'ADMS', 'face'),
  ('e0010001-0000-0000-0000-000000000003', (CURRENT_DATE + TIME '23:30')::TIMESTAMPTZ, 'مسائي', CURRENT_DATE, 'ADMS', 'face')
ON CONFLICT (employee_id, punch_time) DO NOTHING;

-- 📘 سيناريو 4: موظف ليلي (EMP-004 - مدير المختبرات)
-- بصم 23:15 ليلاً (ليوم أمس تقنياً) وخرج 07:45 صباحاً
INSERT INTO attendance_logs (employee_id, punch_time, shift_type, shift_date, source, verification_type) VALUES
  ('e0010001-0000-0000-0000-000000000004', (CURRENT_DATE + TIME '23:15')::TIMESTAMPTZ, 'ليلي', CURRENT_DATE, 'Python', 'card'),
  ('e0010001-0000-0000-0000-000000000004', ((CURRENT_DATE + 1) + TIME '07:45')::TIMESTAMPTZ, 'ليلي', CURRENT_DATE, 'Python', 'card')
ON CONFLICT (employee_id, punch_time) DO NOTHING;

-- 📘 سيناريو 5: موظف خرج مبكراً (EMP-005 - أمين مستودع)
-- بصم 07:30 وخرج 14:30 (ساعة ونص مبكر)
INSERT INTO attendance_logs (employee_id, punch_time, shift_type, shift_date, source, verification_type) VALUES
  ('e0010001-0000-0000-0000-000000000005', (CURRENT_DATE + TIME '07:30')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'ADMS', 'finger'),
  ('e0010001-0000-0000-0000-000000000005', (CURRENT_DATE + TIME '14:30')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'ADMS', 'finger')
ON CONFLICT (employee_id, punch_time) DO NOTHING;

-- 📘 سيناريو 6: موظف بصم مرة واحدة فقط (EMP-007 - مشرف)
-- بصم 08:00 فقط ولم يبصم خروج
INSERT INTO attendance_logs (employee_id, punch_time, shift_type, shift_date, source, verification_type) VALUES
  ('e0010001-0000-0000-0000-000000000007', (CURRENT_DATE + TIME '08:00')::TIMESTAMPTZ, 'صباحي', CURRENT_DATE, 'Python', 'finger')
ON CONFLICT (employee_id, punch_time) DO NOTHING;

-- 🟢 EMP-006 (HR) = غائب بدون عذر → سيظهر كـ "غائب 🔴"

-- ============================================================================
-- 5. إضافة زمنيات (Permissions) للموظفين
-- ============================================================================

-- زمنية مصادق عليها للموظف EMP-005 (خرج مبكراً)
INSERT INTO permissions (id, employee_id, date, permission_type, expected_out_time, expected_return_time, actual_out_time, actual_return_time, status, approved_by, reason) VALUES
  ('c0010001-0000-0000-0000-000000000001', 'e0010001-0000-0000-0000-000000000005', CURRENT_DATE, 'عادية', '14:30', '15:30', 
   (CURRENT_DATE + TIME '14:30')::TIMESTAMPTZ, (CURRENT_DATE + TIME '15:45')::TIMESTAMPTZ, 'موافق', 'e0010001-0000-0000-0000-000000000004', 'مراجعة طبيب أسنان - لديه موعد')
ON CONFLICT (id) DO NOTHING;

-- زمنية مغادرة (لم يرجع) للموظف EMP-007
INSERT INTO permissions (id, employee_id, date, permission_type, expected_out_time, actual_out_time, status, approved_by, reason) VALUES
  ('c0010001-0000-0000-0000-000000000002', 'e0010001-0000-0000-0000-000000000007', CURRENT_DATE, 'مغادرة', '13:00',
   (CURRENT_DATE + TIME '13:00')::TIMESTAMPTZ, 'موافق', 'e0010001-0000-0000-0000-000000000004', 'ظرف عائلي طارئ')
ON CONFLICT (id) DO NOTHING;

-- زمنية بانتظار الموافقة للموظف EMP-001
INSERT INTO permissions (id, employee_id, date, permission_type, expected_out_time, expected_return_time, status, reason) VALUES
  ('c0010001-0000-0000-0000-000000000003', 'e0010001-0000-0000-0000-000000000001', CURRENT_DATE + 2, 'تعويضية', '10:00', '12:00', 'انتظار', 'طلب تعويض عن أوفرتايم الأسبوع الماضي')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. إضافة إجازات لموظفين (بأنواع مختلفة)
-- ============================================================================

-- إجازة سنوية موافق عليها للموظف EMP-002 (3 أيام من اليوم+5)
INSERT INTO leaves (id, employee_id, leave_type, date_from, date_to, working_days_count, status, approved_by, reason) VALUES
  ('b0010001-0000-0000-0000-000000000001', 'e0010001-0000-0000-0000-000000000002', 'سنوية', CURRENT_DATE + 5, CURRENT_DATE + 9, 3, 'موافق', 'e0010001-0000-0000-0000-000000000006', 'إجازة سنوية')
ON CONFLICT (id) DO NOTHING;

-- إجازة مرضية بانتظار الموافقة للموظف EMP-001
INSERT INTO leaves (id, employee_id, leave_type, date_from, date_to, working_days_count, status, reason) VALUES
  ('b0010001-0000-0000-0000-000000000002', 'e0010001-0000-0000-0000-000000000001', 'مرضية', CURRENT_DATE + 2, CURRENT_DATE + 3, 2, 'انتظار', 'مراجعة طبية - مرفق التقرير')
ON CONFLICT (id) DO NOTHING;

-- إجازة زواج للموظف EMP-005
INSERT INTO leaves (id, employee_id, leave_type, date_from, date_to, working_days_count, status, approved_by, reason) VALUES
  ('b0010001-0000-0000-0000-000000000003', 'e0010001-0000-0000-0000-000000000005', 'زواج', CURRENT_DATE + 10, CURRENT_DATE + 18, 7, 'موافق', 'e0010001-0000-0000-0000-000000000006', 'إجازة زواج')
ON CONFLICT (id) DO NOTHING;

-- إجازة وفاة للموظف EMP-003
INSERT INTO leaves (id, employee_id, leave_type, date_from, date_to, working_days_count, status, approved_by, reason) VALUES
  ('b0010001-0000-0000-0000-000000000004', 'e0010001-0000-0000-0000-000000000003', 'وفاة_أول', CURRENT_DATE + 3, CURRENT_DATE + 5, 3, 'موافق', 'e0010001-0000-0000-0000-000000000006', 'وفاة والد - رحمه الله')
ON CONFLICT (id) DO NOTHING;

-- إجازة حج (مرفوضة لأنها أخذها من قبل) - نختبر المنطق
INSERT INTO leave_balance (employee_id, year, hajj_taken) VALUES
  ('e0010001-0000-0000-0000-000000000004', EXTRACT(YEAR FROM CURRENT_DATE), true)
ON CONFLICT (employee_id, year) DO UPDATE SET hajj_taken = true;

-- ============================================================================
-- 7. تحديث رصيد الإجازات للموظفين
-- ============================================================================
INSERT INTO leave_balance (employee_id, year, annual_total, annual_used, sick_total, sick_used)
SELECT 
  id, 
  EXTRACT(YEAR FROM CURRENT_DATE),
  public.calculate_annual_leave_balance(id, EXTRACT(YEAR FROM CURRENT_DATE)),
  0,
  30,
  0
FROM public.employees
WHERE is_active = true
ON CONFLICT (employee_id, year) DO NOTHING;

-- ============================================================================
-- 8. إضافة أوفرتايم للموظف EMP-003
-- ============================================================================
INSERT INTO overtime_log (employee_id, date, shift_type, extra_minutes, approved_by) VALUES
  ('e0010001-0000-0000-0000-000000000003', CURRENT_DATE, 'مسائي', 90, 'e0010001-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. تشغيل التحديث اليدوي للملخص (بدون انتظار الـ trigger)
-- ============================================================================
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000001', CURRENT_DATE);
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000002', CURRENT_DATE);
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000003', CURRENT_DATE);
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000004', CURRENT_DATE);
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000005', CURRENT_DATE);
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000006', CURRENT_DATE);
SELECT public.refresh_attendance_summary('e0010001-0000-0000-0000-000000000007', CURRENT_DATE);

-- ============================================================================
-- 10. عرض النتيجة النهائية - جدول المقارنة
-- ============================================================================
SELECT 
  e.employee_code AS "الكود",
  e.first_name || ' ' || e.last_name AS "الموظف",
  d.name_ar AS "القسم",
  e.role AS "الدور",
  as2.shift_type AS "الوردية",
  to_char(as2.check_in::timestamptz AT TIME ZONE 'Asia/Baghdad', 'HH24:MI') AS "الدخول",
  to_char(as2.check_out::timestamptz AT TIME ZONE 'Asia/Baghdad', 'HH24:MI') AS "الخروج",
  as2.total_hours AS "ساعات",
  as2.late_minutes AS "تأخير(د)",
  as2.early_leave_minutes AS "خروج مبكر(د)",
  as2.overtime_minutes AS "أوفرتايم(د)",
  CASE as2.status
    WHEN 'حضور_بوقت' THEN '🟢 حضور بوقت'
    WHEN 'متأخر' THEN '🟡 متأخر'
    WHEN 'زمنية_معتمدة' THEN '🔵 زمنية معتمدة'
    WHEN 'زمنية_انتظار' THEN '🟡 زمنية انتظار'
    WHEN 'مجاز' THEN '🟣 مجاز'
    WHEN 'إجازة_انتظار' THEN '🟡 إجازة انتظار'
    WHEN 'غائب' THEN '🔴 غائب'
    WHEN 'عطلة' THEN '⚪ عطلة'
  END AS "الحالة"
FROM public.attendance_summary as2
JOIN public.employees e ON e.id = as2.employee_id
LEFT JOIN public.departments d ON d.id = e.department_id
WHERE as2.shift_date = CURRENT_DATE
ORDER BY as2.check_in NULLS LAST;

-- ============================================================================
-- عرض الإجازات المضافة
-- ============================================================================
SELECT 
  '📋' AS " ",
  e.first_name || ' ' || e.last_name AS "الموظف",
  l.leave_type AS "نوع الإجازة",
  l.date_from AS "من",
  l.date_to AS "إلى",
  l.working_days_count AS "أيام عمل",
  l.status AS "الحالة"
FROM public.leaves l
JOIN public.employees e ON e.id = l.employee_id
ORDER BY l.date_from;

-- ============================================================================
-- عرض الزمنيات
-- ============================================================================
SELECT 
  '⏱️' AS " ",
  e.first_name || ' ' || e.last_name AS "الموظف",
  p.permission_type AS "النوع",
  p.date AS "التاريخ",
  p.expected_out_time AS "وقت الخروج",
  p.expected_return_time AS "وقت الرجوع",
  p.status AS "الحالة"
FROM public.permissions p
JOIN public.employees e ON e.id = p.employee_id
ORDER BY p.date;