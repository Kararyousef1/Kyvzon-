-- ════════════════════════════════════════════════════════════════
--  FILE: 007_tawathul_module.sql
--  PURPOSE: Tawathul Communication Module
--  EXECUTION ORDER: 7
--  SAFETY: HIGH - Uses IF NOT EXISTS
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: TAWATHUL CONVERSATIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tawathul_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: TAWATHUL MESSAGES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tawathul_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES tawathul_conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: INDEXES
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tawathul_messages_conversation 
    ON tawathul_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_tawathul_messages_sender 
    ON tawathul_messages(sender_id);

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════