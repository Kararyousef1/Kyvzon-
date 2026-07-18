-- ====== إضافة أدوار التقنية والمالية كأدوار نظام في قاعدة البيانات ======
-- تاريخ الإنشاء: 2026-07-19
-- الهدف: السماح بتعيين أدوار 'tech' و 'finance' للمستخدمين في جدول profiles

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN (
    'employee', 'hr', 'manager', 'supervisor', 'admin', 
    'gatekeeper', 'developer', 'it_admin', 'tech', 'finance'
  ));
