-- ════════════════════════════════════════════════════════════════
--  جدول الأحداث الأمنية - Security Events Table
--  لتسجيل محاولات الدخول، التهديدات، والأنشطة المشبوهة
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'login_success', 'login_failed', 'logout', 'pin_failed', 'pin_locked',
    'permission_denied', 'unauthorized_access', 'suspicious_activity',
    'rate_limit_exceeded', 'data_export', 'settings_changed',
    'user_created', 'user_deleted', 'role_changed'
  )),
  threat_level VARCHAR(20) NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  user_id UUID,
  user_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  details TEXT NOT NULL,
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(type);
CREATE INDEX IF NOT EXISTS idx_security_events_threat_level ON security_events(threat_level);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);

-- RLS Policies
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- فقط المطورون يمكنهم قراءة الأحداث الأمنية
CREATE POLICY "Developers can view security events" ON security_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'developer'
    )
  );

-- الجميع يمكنهم إضافة أحداث أمنية (لتسجيل المحاولات)
CREATE POLICY "Anyone can insert security events" ON security_events
  FOR INSERT
  WITH CHECK (true);

-- فقط المطورون يمكنهم تحديث الأحداث
CREATE POLICY "Developers can update security events" ON security_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'developer'
    )
  );

-- ════════════════════════════════════════════════════════════════
--  التعليقات
-- ════════════════════════════════════════════════════════════════

COMMENT ON TABLE security_events IS 'سجل الأحداث الأمنية - محاولات الدخول، التهديدات، الأنشطة المشبوهة';
COMMENT ON COLUMN security_events.threat_level IS 'مستوى التهديد: low, medium, high, critical';
COMMENT ON COLUMN security_events.type IS 'نوع الحدث الأمني';
