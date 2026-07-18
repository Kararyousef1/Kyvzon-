-- ====== تصحيح ترميز اللغة العربية للأقسام الافتراضية ======
-- تاريخ الإنشاء: 2026-07-19
-- الهدف: حل مشكلة ظهور رموز غريبة (Mojibake) بدلاً من الحروف العربية للأقسام

-- 1. تحديث جدول الهيكلية العام (structure_departments)
UPDATE public.structure_departments SET name_ar = 'قسم التقنية' WHERE code = 'tech';
UPDATE public.structure_departments SET name_ar = 'قسم المبيعات' WHERE code = 'sales';
UPDATE public.structure_departments SET name_ar = 'قسم التسويق' WHERE code = 'marketing';
UPDATE public.structure_departments SET name_ar = 'قسم الدعم الفني' WHERE code = 'support';
UPDATE public.structure_departments SET name_ar = 'الإدارة العامة' WHERE code = 'management';
UPDATE public.structure_departments SET name_ar = 'تقنية المعلومات' WHERE code = 'it';
UPDATE public.structure_departments SET name_ar = 'الموارد البشرية' WHERE code = 'hr';

-- 2. تحديث جدول الأقسام الخاص بالشركات (departments)
UPDATE public.departments SET name_ar = 'قسم التقنية' WHERE name_en = 'Tech Dept';
UPDATE public.departments SET name_ar = 'قسم المبيعات' WHERE name_en = 'Sales Dept';
UPDATE public.departments SET name_ar = 'قسم التسويق' WHERE name_en = 'Marketing Dept';
UPDATE public.departments SET name_ar = 'قسم الدعم الفني' WHERE name_en = 'Support Dept';
UPDATE public.departments SET name_ar = 'الإدارة العامة' WHERE name_en = 'General Management';
UPDATE public.departments SET name_ar = 'تقنية المعلومات' WHERE name_en = 'IT Dept';
UPDATE public.departments SET name_ar = 'الموارد البشرية' WHERE name_en = 'HR Dept';
