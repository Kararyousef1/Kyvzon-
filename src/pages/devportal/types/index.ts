/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Types
 * ════════════════════════════════════════════════════════════════
 */

import type { ComponentType } from 'react';

export type IconType = ComponentType<{ size?: number | string; className?: string }>;

export type BillingCycle = 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time' | 'custom';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'overdue' | 'failed' | 'refunded' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'zain_cash' | 'asia_hawala' | 'stripe' | 'manual_invoice' | 'other';

export interface Company {
  id: string;
  slug: string;
  name_ar: string;
  name_en?: string;
  logo_url?: string;
  status: 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
  domain?: string;
  settings?: Record<string, unknown>;
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
  payment_method?: PaymentMethod | string;
  payment_reference?: string;
  billing_cycle?: BillingCycle | string;
  payment_status?: PaymentStatus | string;
  payment_due_date?: string;
  paid_at?: string;
  base_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  invoice_number?: string;
  contract_number?: string;
  sales_owner?: string;
  gateway_provider?: string;
  billing_contact_name?: string;
  billing_email?: string;
  billing_phone?: string;
  auto_renew?: boolean;
  grace_period_days?: number;
  max_employees: number;
  max_branches?: number;
  max_biometric_devices?: number;
  storage_gb?: number;
  custom_limits?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  | 'modules'
  | 'platform-health'
  | 'engineering-console'
  | 'landing-cms'
  | 'public-site'
  | 'visitor-leads'
  | 'permissions'
  | 'audit-log' 
  | 'settings';

export const PAGE_META: Record<DevPortalPage, { title: string; description: string }> = {
  dashboard:     { title: 'لوحة التحكم الرئيسية', description: 'نظرة عامة على المنصة والشركات المشتركة' },
  companies:     { title: 'إدارة الشركات',         description: 'إضافة وتعديل وإدارة جميع الشركات المشتركة' },
  subscriptions: { title: 'إدارة الاشتراكات',      description: 'متابعة وإدارة اشتراكات الشركات والمدفوعات' },
  modules:       { title: 'إدارة البوابات',        description: 'تفعيل وتعطيل بوابات كل شركة حسب الاشتراك' },
  'platform-health': { title: 'صحة المنصة',        description: 'مؤشرات هندسية وتشغيلية لسلامة منصة Kyvzon' },
  'engineering-console': { title: 'وحدة التحكم الهندسية', description: 'جاهزية الإطلاق، أوامر الفحص، وحالة البوابات' },
  'landing-cms': { title: 'إدارة صفحة الزوار',     description: 'تخصيص وتحرير الصفحة الرئيسية العامة للمنصة' },
  'public-site': { title: 'إدارة الموقع العام',    description: 'إدارة صفحات الفوتر وCTA وتدفق التسجيل العام' },
  'visitor-leads': { title: 'طلبات الزوار',        description: 'إدارة طلبات التسجيل والخطط والخدمات والتقييمات من صفحة الهبوط' },
  permissions:   { title: 'نظام الصلاحيات',        description: 'إدارة صلاحيات الأدوار والمستخدمين في المنصة' },
  'audit-log':   { title: 'سجل العمليات',          description: 'مراقبة جميع عمليات المنصة وسجل التدقيق' },
  settings:      { title: 'إعدادات المنصة',        description: 'تكوين إعدادات منصة Kyvzon العامة' },
};
