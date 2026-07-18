CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  asset_code VARCHAR(30) NOT NULL, asset_name VARCHAR(200) NOT NULL,
  category VARCHAR(30) DEFAULT 'equipment' CHECK (category IN ('equipment','vehicle','building','software','furniture')),
  purchase_date DATE NOT NULL, purchase_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  useful_life_years INTEGER DEFAULT 5, depreciation_method VARCHAR(20) DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line','declining_balance')),
  accumulated_depreciation NUMERIC(15,2) DEFAULT 0, book_value NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','retired','sold','impaired')),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant ON fixed_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);
