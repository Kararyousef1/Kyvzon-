-- ════════════════════════════════════════════════════════════════
--  FILE: 041_fix_rls_notifications_security.sql
--  PURPOSE: Fix RLS Policies for notifications table (Security Fix)
--  EXECUTION ORDER: 6
--  DEPENDS ON: 001_initial_schema.sql, 040_create_notifications_table.sql
--  SAFETY LEVEL: HIGH (Security Critical)
--  ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  SECTION 1: DROP DANGEROUS POLICIES
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
DROP POLICY IF EXISTS "Allow all inserts" ON notifications;

-- ════════════════════════════════════════════════════════════════
--  SECTION 2: CREATE SECURE POLICIES
-- ════════════════════════════════════════════════════════════════

-- SELECT: Users can only see their own notifications
CREATE POLICY "notifications_select_own"
    ON notifications
    FOR SELECT
    USING (user_id = auth.uid());

-- UPDATE: Users can only update their own notifications
CREATE POLICY "notifications_update_own"
    ON notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- INSERT: Only through secure RPC (SECURITY DEFINER)
-- This prevents users from inserting notifications for other users
CREATE POLICY "notifications_insert_via_rpc"
    ON notifications
    FOR INSERT
    WITH CHECK (false); -- Block direct inserts, use RPC instead

-- ════════════════════════════════════════════════════════════════
--  SECTION 3: NOTES
-- ════════════════════════════════════════════════════════════════
--  IMPORTANT:
--  To insert notifications securely, create a SECURITY DEFINER function
--  that validates the user and inserts the notification.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
--  END OF FILE
--  ════════════════════════════════════════════════════════════════