-- ════════════════════════════════════════════════════════════════
--  جدول سجل الأخطاء - Error Logs Table
--  لتخزين جميع الأخطاء التي يتم التقاطها من المطور
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  source VARCHAR(255),
  stack_trace TEXT,
  component_stack TEXT,
  file_name VARCHAR(500),
  line_number INTEGER,
  column_number INTEGER,
  user_agent TEXT,
  user_id UUID,
  user_name VARCHAR(255),
  severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  category VARCHAR(50) CHECK (category IN ('runtime', 'network', 'promise', 'resource', 'syntax', 'custom')) DEFAULT 'custom',
  related_files TEXT[],
  frequency INTEGER DEFAULT 1,
  environment VARCHAR(20) CHECK (environment IN ('production', 'development', 'staging')) DEFAULT 'production',
  route VARCHAR(500),
  action VARCHAR(255),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_file_name ON error_logs(file_name);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- RLS Policies
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- فقط المطورون يمكنهم قراءة سجل الأخطاء
CREATE POLICY "Developers can view error logs" ON error_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'developer'
    )
  );

-- الجميع يمكنهم إضافة أخطاء
CREATE POLICY "Anyone can insert error logs" ON error_logs
  FOR INSERT
  WITH CHECK (true);

-- فقط المطورون يمكنهم تحديث الأخطاء
CREATE POLICY "Developers can update error logs" ON error_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'developer'
    )
  );

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_error_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_error_logs_updated_at
  BEFORE UPDATE ON error_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_error_logs_updated_at();

-- ════════════════════════════════════════════════════════════════
--  جدول إحصائيات النظام - System Health Table
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('healthy', 'degraded', 'down')) DEFAULT 'healthy',
  latency_ms INTEGER,
  uptime_percent DECIMAL(5, 2),
  metadata JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_health_service ON system_health(service_name);
CREATE INDEX IF NOT EXISTS idx_system_health_recorded_at ON system_health(recorded_at DESC);

ALTER TABLE system_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can view system health" ON system_health
  FOR SELECT
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

COMMENT ON TABLE error_logs IS 'سجل الأخطاء الذي يلتقطه نظام المطور';
COMMENT ON TABLE system_health IS 'سجل صحة الخدمات المختلفة';
COMMENT ON COLUMN error_logs.severity IS 'مستوى الخطورة: critical, high, medium, low';
COMMENT ON COLUMN error_logs.category IS 'تصنيف الخطأ: runtime, network, promise, resource, syntax, custom';
