-- =============================================================
-- Migration: 050_create_courses_tables.sql
-- Purpose:   إنشاء جداول الدورات التدريبية وتتبع التقدم
-- Author:    System
-- Date:      2026-07-06
-- =============================================================

-- 1. إنشاء enum لحالة الدورة
DO $$ BEGIN
  CREATE TYPE course_level AS ENUM ('مبتدئ', 'متوسط', 'متقدم', 'خبير');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE course_status AS ENUM ('active', 'inactive', 'draft');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. جدول الدورات التدريبية
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT,
  description TEXT,
  description_en TEXT,
  category TEXT NOT NULL DEFAULT 'gmp-basics',
  duration TEXT DEFAULT '2 ساعة',
  level course_level DEFAULT 'مبتدئ',
  points INTEGER DEFAULT 0,
  mandatory BOOLEAN DEFAULT false,
  instructor TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  objectives TEXT[] DEFAULT '{}',
  rich_content JSONB DEFAULT '{"blocks":[],"mediaFiles":[]}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول تقدم الموظف في الدورات (مشابه لـ sops_readings)
CREATE TABLE IF NOT EXISTS course_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_access_at TIMESTAMPTZ DEFAULT NOW(),
  time_spent INTEGER DEFAULT 0, -- بالثواني
  progress_percent INTEGER DEFAULT 0, -- 0-100
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  UNIQUE (course_id, employee_id)
);

-- 4. RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;

-- 5. سياسات الأمان
DROP POLICY IF EXISTS "Everyone can view active courses" ON courses;
CREATE POLICY "Everyone can view active courses"
  ON courses FOR SELECT
  USING (active = true OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'hr')));

DROP POLICY IF EXISTS "HR/Admin can manage courses" ON courses;
CREATE POLICY "HR/Admin can manage courses"
  ON courses FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'hr')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'hr')));

DROP POLICY IF EXISTS "Employees can manage their own course progress" ON course_progress;
CREATE POLICY "Employees can manage their own course progress"
  ON course_progress FOR ALL
  USING (auth.uid() = employee_id)
  WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR/Admin can view all progress" ON course_progress;
CREATE POLICY "HR/Admin can view all progress"
  ON course_progress FOR SELECT
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('hr', 'admin')));

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_active ON courses(active);
CREATE INDEX IF NOT EXISTS idx_course_progress_employee ON course_progress(employee_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON course_progress(course_id);

-- 7. Trigger للوقت المحدث
DROP TRIGGER IF EXISTS update_courses_modtime ON courses;
CREATE TRIGGER update_courses_modtime
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE PROCEDURE update_modified_column();
