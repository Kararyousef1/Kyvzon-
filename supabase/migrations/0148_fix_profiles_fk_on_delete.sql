-- ============================================================================
--  Migration 0148: Fix ON DELETE clause on all profiles(id) FKs
--
--  السبب: auth.admin.deleteUser() تفشل بـ "Database error deleting user"
--  لأن حذف auth.users يُشغّل ON DELETE CASCADE على profiles,
--  لكن جداول أخرى تحتوي REFERENCES profiles(id) بدون ON DELETE
--  (السلوك الافتراضي = RESTRICT) فتمنع حذف الـ profile ومن ثم تمنع
--  حذف المستخدم من auth.users.
--
--  الجداول المتأثرة:
--    departments.manager_id
--    permissions.approved_by
--    permissions_request.approved_by
--    leaves.approved_by
--    overtime_log.approved_by
--    performance_reviews.reviewer_id
--    sops.created_by
--    system_settings.updated_by
--    security_events.user_id
--
--  الحل: تحويل كل هذه الـ FKs إلى ON DELETE SET NULL
-- ============================================================================

-- 1. departments.manager_id
ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_manager_id_fkey;
ALTER TABLE public.departments
  ADD CONSTRAINT departments_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 2. permissions.approved_by
ALTER TABLE public.permissions
  DROP CONSTRAINT IF EXISTS permissions_approved_by_fkey;
ALTER TABLE public.permissions
  ADD CONSTRAINT permissions_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 3. permissions_request.approved_by
ALTER TABLE public.permissions_request
  DROP CONSTRAINT IF EXISTS permissions_request_approved_by_fkey;
ALTER TABLE public.permissions_request
  ADD CONSTRAINT permissions_request_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 4. leaves.approved_by
ALTER TABLE public.leaves
  DROP CONSTRAINT IF EXISTS leaves_approved_by_fkey;
ALTER TABLE public.leaves
  ADD CONSTRAINT leaves_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 5. overtime_log.approved_by
ALTER TABLE public.overtime_log
  DROP CONSTRAINT IF EXISTS overtime_log_approved_by_fkey;
ALTER TABLE public.overtime_log
  ADD CONSTRAINT overtime_log_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 6. performance_reviews.reviewer_id
ALTER TABLE public.performance_reviews
  DROP CONSTRAINT IF EXISTS performance_reviews_reviewer_id_fkey;
ALTER TABLE public.performance_reviews
  ADD CONSTRAINT performance_reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 7. sops.created_by
ALTER TABLE public.sops
  DROP CONSTRAINT IF EXISTS sops_created_by_fkey;
ALTER TABLE public.sops
  ADD CONSTRAINT sops_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 8. system_settings.updated_by
ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_updated_by_fkey;
ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- 9. security_events.user_id
ALTER TABLE public.security_events
  DROP CONSTRAINT IF EXISTS security_events_user_id_fkey;
ALTER TABLE public.security_events
  ADD CONSTRAINT security_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;
