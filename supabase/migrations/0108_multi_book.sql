CREATE TABLE IF NOT EXISTS journal_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  book_name VARCHAR(100) NOT NULL, book_code VARCHAR(20) NOT NULL UNIQUE,
  book_type VARCHAR(30) NOT NULL DEFAULT 'statutory' CHECK (book_type IN ('statutory','management','tax','ifrs','gaap')),
  is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_books_tenant ON journal_books(tenant_id);
