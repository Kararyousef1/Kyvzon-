CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  asset_code VARCHAR(30) NOT NULL UNIQUE,
  asset_name VARCHAR(200) NOT NULL, asset_category VARCHAR(30) DEFAULT 'equipment',
  purchase_date DATE NOT NULL, purchase_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  useful_life_years INTEGER DEFAULT 5, depreciation_rate NUMERIC(8,4) DEFAULT 20.0000,
  accumulated_depreciation NUMERIC(15,2) DEFAULT 0, book_value NUMERIC(15,2) DEFAULT 0,
  depreciation_start_date DATE, status VARCHAR(20) DEFAULT 'active',
  last_depreciation_run TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant ON fixed_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);
CREATE TABLE IF NOT EXISTS depreciation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), asset_id UUID REFERENCES fixed_assets(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL, depreciation_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  accumulated_at_date NUMERIC(15,2) NOT NULL DEFAULT 0, status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_depreciation_asset ON depreciation_schedules(asset_id);
