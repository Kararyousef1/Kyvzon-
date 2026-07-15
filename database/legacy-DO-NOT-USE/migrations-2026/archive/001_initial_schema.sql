-- 1. إنشاء الأنواع المخصصة (Enums) لضمان صحة البيانات
CREATE TYPE user_role AS ENUM ('admin', 'hr', 'employee', 'kiosk', 'developer', 'gatekeeper');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE incident_status AS ENUM ('pending', 'in_progress', 'resolved', 'closed');
CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE log_type AS ENUM ('check_in', 'check_out', 'break_start', 'break_end');

-- 2. جدول Profiles (ملفات تعريف المستخدمين)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role user_role DEFAULT 'employee'::user_role NOT NULL,
  rank TEXT DEFAULT 'employee',
  manufacturing_dept TEXT,
  department TEXT,
  phone TEXT,
  location TEXT,
  passcode TEXT,
  profile_image TEXT,
  certificate_image TEXT,
  manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  custom_permissions JSONB DEFAULT '{}'::jsonb,
  status user_status DEFAULT 'active'::user_status NOT NULL,
  position TEXT,
  shift TEXT DEFAULT 'morning',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول Time Logs (سجلات الحضور)
CREATE TABLE time_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  log_type log_type NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  kiosk_id UUID REFERENCES profiles(id),
  notes TEXT
);

-- 4. جدول Incidents (بلاغات المشاكل)
CREATE TABLE incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  severity incident_severity DEFAULT 'medium'::incident_severity NOT NULL,
  status incident_status DEFAULT 'pending'::incident_status NOT NULL,
  is_anonymous BOOLEAN DEFAULT FALSE,
  reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ai_analysis JSONB,
  resolved_at TIMESTAMPTZ
);

-- 5. جدول Movement Logs (سجلات الحركة - هذا هو الجدول المفقود)
CREATE TABLE movements_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  employee_name VARCHAR(255),
  department VARCHAR(255),
  logged_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  departure_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  returned_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. جدول رسائل الموارد البشرية (HR Messages)
CREATE TABLE hr_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'new' NOT NULL, -- new, read, replied
  created_at TIMESTAMPTZ DEFAULT NOW(),
  replied_at TIMESTAMPTZ
);

-- 7. جدول المهارات (Skills Catalog)
CREATE TABLE skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT
);

-- 8. جدول مهارات الموظفين (Employee Skills)
CREATE TABLE employee_skills (
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level INTEGER CHECK (proficiency_level BETWEEN 1 AND 5),
  PRIMARY KEY (employee_id, skill_id)
);

-- 9. جدول الشهادات والمؤهلات (Certifications)
CREATE TABLE employee_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL,
  issue_date DATE NOT NULL,
  credential_id TEXT,
  credential_url TEXT
);

-- 10. جدول الصحة النفسية (Wellness Entries)
CREATE TABLE wellness_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  score INTEGER NOT NULL,
  mood TEXT NOT NULL,
  stress INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. جدول سجل العمليات والتدقيق (Audit Logs)
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role user_role,
  target TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 12. جدول إجابات الاستبيانات (Survey Responses)
CREATE TABLE survey_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id TEXT NOT NULL,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. جدول التعليقات (Incident Comments)
CREATE TABLE incident_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. تفعيل نظام حماية الصفوف (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_comments ENABLE ROW LEVEL SECURITY;

-- 15. سياسات الأمان (RLS Policies)
-- Profiles
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all profiles." ON profiles FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin') WITH CHECK (true);

-- Time Logs
CREATE POLICY "Users can view their own time logs." ON time_logs FOR SELECT USING (auth.uid() = employee_id);
CREATE POLICY "HR/Admin can view all time logs." ON time_logs FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin')));
CREATE POLICY "Kiosks/Gatekeepers can insert time logs." ON time_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('kiosk', 'gatekeeper', 'admin')));

-- Incidents
CREATE POLICY "Users can view all incidents." ON incidents FOR SELECT USING (true);
CREATE POLICY "Users can create incidents." ON incidents FOR INSERT WITH CHECK (auth.uid() = reported_by OR is_anonymous = true);
CREATE POLICY "HR/Admin can update incidents." ON incidents FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin')));

-- Movement Logs
CREATE POLICY "Gatekeepers and HR can manage movement logs" ON movements_log FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('gatekeeper', 'hr', 'admin')));
CREATE POLICY "Employees can see their own movement logs" ON movements_log FOR SELECT USING (auth.uid() = employee_id);

-- HR Messages
CREATE POLICY "Employees can send and see their own messages" ON hr_messages FOR ALL USING (auth.uid() = employee_id);
CREATE POLICY "HR can manage all messages" ON hr_messages FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin')));

-- Skills & Certs
CREATE POLICY "Everyone can view skills and certs." ON skills FOR SELECT USING (true);
CREATE POLICY "Everyone can view employee skills and certs." ON employee_skills FOR SELECT USING (true);
CREATE POLICY "Users can manage their own skills and certs." ON employee_skills FOR ALL USING (auth.uid() = employee_id);
CREATE POLICY "Everyone can view employee certifications." ON employee_certifications FOR SELECT USING (true);
CREATE POLICY "Users can manage their own certifications." ON employee_certifications FOR ALL USING (auth.uid() = employee_id);

-- Wellness
CREATE POLICY "Users can manage their own wellness entries." ON wellness_entries FOR ALL USING (auth.uid() = employee_id);
CREATE POLICY "HR/Admin can view all wellness entries." ON wellness_entries FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin')));

-- Audit Logs
CREATE POLICY "Admins can view audit logs." ON audit_logs FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Survey Responses
CREATE POLICY "Users can manage their own survey responses." ON survey_responses FOR ALL USING (auth.uid() = employee_id);
CREATE POLICY "HR/Admin can view all survey responses." ON survey_responses FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('hr', 'admin')));

-- Incident Comments
CREATE POLICY "Users can view comments on incidents they can see." ON incident_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert their own comments." ON incident_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments." ON incident_comments FOR UPDATE USING (auth.uid() = user_id);

-- 16. دالة تحديث الوقت
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 17. Triggers
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_incidents_modtime
    BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- 18. جدول SOPs (إجراءات التشغيل القياسية)
CREATE TABLE sops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  description_en TEXT,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  pdf_url TEXT,
  version TEXT DEFAULT '1.0',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  effective_date DATE,
  review_date DATE,
  tags TEXT[] DEFAULT '{}',
  duration TEXT DEFAULT '30',
  is_mandatory BOOLEAN DEFAULT true
);

-- 19. جدول SOPs Readings (سجل قراءة الموظفين للـ SOPs)
CREATE TABLE sops_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sop_id UUID REFERENCES sops(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  read_count INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0, -- بالثواني
  completed BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  UNIQUE (sop_id, employee_id)
);

-- Enable RLS
ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sops_readings ENABLE ROW LEVEL SECURITY;

-- SOPs Policies
CREATE POLICY "Everyone can view active SOPs" ON sops FOR SELECT USING (status = 'active' OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
CREATE POLICY "Admins can manage SOPs" ON sops FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- SOPs Readings Policies
CREATE POLICY "Employees can manage their own readings" ON sops_readings FOR ALL USING (auth.uid() = employee_id);
CREATE POLICY "HR/Admin can view all readings" ON sops_readings FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('hr', 'admin')));

-- Indexes
CREATE INDEX idx_sops_department ON sops(department);
CREATE INDEX idx_sops_status ON sops(status);
CREATE INDEX idx_sops_readings_employee ON sops_readings(employee_id);
CREATE INDEX idx_sops_readings_sop ON sops_readings(sop_id);

-- Trigger for updated_at
CREATE TRIGGER update_sops_modtime
    BEFORE UPDATE ON sops FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- 20. جدول إعدادات النظام (System Settings) - صف واحد بمعرّف 'singleton'
CREATE TABLE system_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  landing_config   JSONB DEFAULT '{}'::jsonb,  -- إعدادات الصفحة الرئيسية
  general_settings JSONB DEFAULT '{}'::jsonb,  -- الإعدادات العامة
  ai_settings      JSONB DEFAULT '{}'::jsonb,  -- إعدادات الذكاء الاصطناعي
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل RLS (مهم! بدونه تُتجاهل السياسات ويصبح الجدول مكشوفاً)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- System Settings Policies
-- القراءة متاحة للجميع (مطلوبة لعرض الصفحة الرئيسية العامة)
CREATE POLICY "Everyone can read system settings" ON system_settings FOR SELECT USING (true);
-- الكتابة/التعديل محصورة على المدير فقط
CREATE POLICY "Admins can manage system settings" ON system_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));


