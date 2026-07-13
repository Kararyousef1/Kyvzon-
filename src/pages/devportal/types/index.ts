/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Types
 * ════════════════════════════════════════════════════════════════
 */

import type { ComponentType } from 'react';

export type IconType = ComponentType<{ size?: number | string; className?: string }>;

export interface Company {
  id: string;
  slug: string;
  name_ar: string;
  name_en?: string;
  logo_url?: string;
  status: 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
  domain?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  max_employees: number;
  subscription_plan: 'basic' | 'professional' | 'enterprise' | 'custom';
  subscription_status: 'trial' | 'active' | 'grace_period' | 'expired' | 'cancelled';
  subscription_start_date?: string;
  subscription_end_date?: string;
  features?: string[];
  enabled_modules?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan: string;
  status: string;
  start_date: string;
  end_date?: string;
  amount?: number;
  currency?: string;
  payment_method?: string;
  payment_reference?: string;
  max_employees: number;
  features?: string[];
  notes?: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  category: 'company' | 'subscription' | 'security' | 'system' | 'general';
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  details?: Record<string, unknown>;
  description?: string;
  ip_address?: string;
  created_at: string;
}

export interface PlatformStats {
  total_companies: number;
  active_companies: number;
  trial_companies: number;
  suspended_companies: number;
  total_users: number;
  total_revenue_estimated: number;
  recent_signups: number;
  companies_by_plan: Record<string, number>;
}

export interface CompanyStats {
  total_users: number;
  active_users: number;
  total_incidents: number;
  open_incidents: number;
}

export type DevPortalPage = 
  | 'dashboard' 
  | 'companies' 
  | 'subscriptions' 
  | 'landing-cms'
  | 'permissions'
  | 'audit-log' 
  | 'settings';

export const PAGE_META: Record<DevPortalPage, { title: string; description: string }> = {
  dashboard:     { title: 'لوحة التحكم الرئيسية', description: 'نظرة عامة على المنصة والشركات المشتركة' },
  companies:     { title: 'إدارة الشركات',         description: 'إضافة وتعديل وإدارة جميع الشركات المشتركة' },
  subscriptions: { title: 'إدارة الاشتراكات',      description: 'متابعة وإدارة اشتراكات الشركات والمدفوعات' },
  'landing-cms': { title: 'إدارة صفحة الزوار',     description: 'تخصيص وتحرير الصفحة الرئيسية العامة للمنصة' },
  permissions:   { title: 'نظام الصلاحيات',        description: 'إدارة صلاحيات الأدوار والمستخدمين في المنصة' },
  'audit-log':   { title: 'سجل العمليات',          description: 'مراقبة جميع عمليات المنصة وسجل التدقيق' },
  settings:      { title: 'إعدادات المنصة',        description: 'تكوين إعدادات منصة Kyvzon العامة' },
};
