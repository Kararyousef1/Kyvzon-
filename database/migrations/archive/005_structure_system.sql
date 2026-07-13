-- ============================================
-- نظام إدارة الهيكلية للمطور
-- Developer System Structure Management
-- ============================================

-- 1. جدول الأقسام التصنيعية
CREATE TABLE IF NOT EXISTS structure_departments (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول المناصب الوظيفية
CREATE TABLE IF NOT EXISTS structure_positions (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  department_id INT REFERENCES structure_departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول المراتب
CREATE TABLE IF NOT EXISTS structure_ranks (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  level INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول الورديات
CREATE TABLE IF NOT EXISTS structure_shifts (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول أدوار النظام
CREATE TABLE IF NOT EXISTS structure_roles (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  code VARCHAR(50) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- إدراج البيانات الافتراضية (فقط إذا كانت الجداول فارغة)
-- ============================================

INSERT INTO structure_departments (name_ar, name_en, code) 
SELECT 'قسم التقنية', 'Tech Dept', 'tech'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'syrups');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'قسم المبيعات', 'Sales Dept', 'sales'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'tablets');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'قسم التسويق', 'Marketing Dept', 'marketing'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'ointments');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'قسم الدعم الفني', 'Support Dept', 'support'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'powders');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'الإدارة العامة', 'General Management', 'management'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'management');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'تقنية المعلومات', 'IT Dept', 'it'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'it');

INSERT INTO structure_departments (name_ar, name_en, code)
SELECT 'الموارد البشرية', 'HR Dept', 'hr'
WHERE NOT EXISTS (SELECT 1 FROM structure_departments WHERE code = 'hr');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'موظف', 'Employee', 'employee', 1
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'employee');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'مشرف', 'Supervisor', 'supervisor', 2
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'supervisor');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'مدير قسم', 'Department Manager', 'manager', 3
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'manager');

INSERT INTO structure_ranks (name_ar, name_en, code, level)
SELECT 'مدير تنفيذي', 'Executive Director', 'executive', 4
WHERE NOT EXISTS (SELECT 1 FROM structure_ranks WHERE code = 'executive');

INSERT INTO structure_shifts (name_ar, name_en, code, start_time, end_time)
SELECT 'الوردية الصباحية', 'Morning Shift', 'morning', '08:00', '16:00'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'morning');

INSERT INTO structure_shifts (name_ar, name_en, code, start_time, end_time)
SELECT 'الوردية المسائية', 'Evening Shift', 'evening', '16:00', '00:00'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'evening');

INSERT INTO structure_shifts (name_ar, name_en, code, start_time, end_time)
SELECT 'الوردية الليلية', 'Night Shift', 'night', '00:00', '08:00'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'night');

INSERT INTO structure_shifts (name_ar, name_en, code)
SELECT 'وردية مرنة', 'Flexible Shift', 'flexible'
WHERE NOT EXISTS (SELECT 1 FROM structure_shifts WHERE code = 'flexible');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'موظف', 'Employee', 'employee'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'employee');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مشرف', 'Supervisor', 'supervisor'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'supervisor');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مدير قسم', 'Department Manager', 'manager'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'manager');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'موارد بشرية', 'HR', 'hr'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'hr');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'حارس', 'Gatekeeper', 'gatekeeper'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'gatekeeper');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مطور', 'Developer', 'developer'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'developer');

INSERT INTO structure_roles (name_ar, name_en, code)
SELECT 'مدير نظام', 'System Admin', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM structure_roles WHERE code = 'admin');

-- عرض البيانات
SELECT '✅ Departments:' as info, COUNT(*) as count FROM structure_departments
UNION ALL SELECT '✅ Ranks:', COUNT(*) FROM structure_ranks
UNION ALL SELECT '✅ Shifts:', COUNT(*) FROM structure_shifts
UNION ALL SELECT '✅ Roles:', COUNT(*) FROM structure_roles;