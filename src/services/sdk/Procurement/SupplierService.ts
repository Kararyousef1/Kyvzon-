/**
 * ════════════════════════════════════════════════════════════════
 *  SupplierService — خدمة الموردين (بوابة المشتريات)
 *  Wave1: الأساس — 03 Supplier Onboarding — 100% حقيقي بلا محاكاة
 *
 *  - يرث BaseService مع حقن tenant_id تلقائي
 *  - RLS: procurement/admin/manager يرى الكل، employee لا يرى
 *  - دوال حقيقية: Kraljic, expiry alerts, portal invites
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from '../BaseService';

export interface SupplierRecord {
  id: string;
  tenant_id: string;
  supplier_code: string;
  legal_name: string;
  trade_name?: string | null;
  tax_number?: string | null;
  registration_number?: string | null;
  legal_form?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  annual_revenue?: number | null;
  bank_name?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  currency_code?: string | null;
  payment_terms_days?: number | null;
  credit_limit?: number | null;
  product_list?: string[] | null;
  max_capacity?: number | null;
  reference_customers?: string[] | null;
  lead_time_days?: number | null;
  supplier_type: 'prospect' | 'approved' | 'strategic' | 'blocked';
  kraljic_category?: 'strategic' | 'leverage' | 'bottleneck' | 'routine' | null;
  risk_score?: number | null;
  risk_level?: 'low' | 'medium' | 'high' | 'critical' | null;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  is_active: boolean;
  owner_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface SupplierDocumentRecord {
  id: string;
  tenant_id: string;
  supplier_id: string;
  doc_type: 'commercial_register' | 'tax_certificate' | 'iso_certificate' | 'insurance' | 'bank_letter' | 'zakat_certificate' | 'authorization' | 'gosi_certificate' | 'other';
  file_name: string;
  file_url: string;
  expiry_date?: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | 'expired';
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
}

export interface SupplierContactRecord {
  id: string;
  tenant_id: string;
  supplier_id: string;
  full_name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface SupplierRiskAssessmentRecord {
  id: string;
  tenant_id: string;
  supplier_id: string;
  financial_score?: number | null;
  compliance_score?: number | null;
  operational_score?: number | null;
  quality_score?: number | null;
  security_score?: number | null;
  total_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  notes?: string | null;
  assessed_by?: string | null;
  created_at: string;
}

export interface SupplierSiteVisitRecord {
  id: string;
  tenant_id: string;
  supplier_id: string;
  visit_date: string;
  agenda: Array<{ time: string; activity: string }>;
  strengths?: string | null;
  weaknesses?: string | null;
  conditions?: string | null;
  recommendation?: 'approved' | 'conditional' | 'rejected' | null;
  visited_by?: string | null;
  created_at: string;
}

export interface SupplierPortalInviteRecord {
  id: string;
  tenant_id: string;
  supplier_id?: string | null;
  email: string;
  token_hash: string;
  expires_at: string;
  used_at?: string | null;
  created_by?: string | null;
  created_at: string;
}

class SupplierService extends BaseService<SupplierRecord> {
  constructor() {
    super('suppliers');
  }

  async findApproved(): Promise<SupplierRecord[]> {
    return this.findAll({ filters: { status: 'approved', is_active: true }, orderBy: 'legal_name', limit: 200 });
  }

  async findByCode(code: string): Promise<SupplierRecord | null> {
    const rows = await this.findAll({ filters: { supplier_code: code }, limit: 1 });
    return rows[0] || null;
  }

  async search(query: string): Promise<SupplierRecord[]> {
    const all = await this.findAll({ limit: 200 });
    const q = query.toLowerCase().trim();
    if (!q) return all;
    return all.filter(s => 
      s.legal_name.toLowerCase().includes(q) || 
      (s.trade_name && s.trade_name.toLowerCase().includes(q)) ||
      s.supplier_code.toLowerCase().includes(q)
    );
  }

  async calculateKraljic(supplierId: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('calculate_kraljic', { p_supplier_id: supplierId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async checkExpiringDocuments(days = 30): Promise<Array<{ supplier_id: string; doc_type: string; expiry_date: string; days_left: number }>> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('check_supplier_documents_expiry', { p_days: days });
    if (error) throw new Error(error.message);
    return data as any;
  }
}

class SupplierDocumentService extends BaseService<SupplierDocumentRecord> {
  constructor() {
    super('supplier_documents');
  }

  async findBySupplier(supplierId: string): Promise<SupplierDocumentRecord[]> {
    return this.findAll({ filters: { supplier_id: supplierId }, orderBy: 'expiry_date', ascending: true });
  }

  async findExpiringSoon(days = 30): Promise<SupplierDocumentRecord[]> {
    const all = await this.findAll({ filters: { verification_status: 'verified' }, limit: 500 });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    return all.filter(d => d.expiry_date && new Date(d.expiry_date) <= cutoff);
  }
}

class SupplierContactService extends BaseService<SupplierContactRecord> {
  constructor() {
    super('supplier_contacts');
  }

  async findBySupplier(supplierId: string): Promise<SupplierContactRecord[]> {
    return this.findAll({ filters: { supplier_id: supplierId }, orderBy: 'is_primary', ascending: false, limit: 50 });
  }
}

class SupplierRiskAssessmentService extends BaseService<SupplierRiskAssessmentRecord> {
  constructor() {
    super('supplier_risk_assessments');
  }

  async findBySupplier(supplierId: string): Promise<SupplierRiskAssessmentRecord[]> {
    return this.findAll({ filters: { supplier_id: supplierId }, orderBy: 'created_at', ascending: false, limit: 20 });
  }

  async findHighRisk(): Promise<SupplierRiskAssessmentRecord[]> {
    return this.findAll({ filters: { risk_level: 'high' }, orderBy: 'total_score', ascending: false, limit: 100 });
  }
}

class SupplierSiteVisitService extends BaseService<SupplierSiteVisitRecord> {
  constructor() {
    super('supplier_site_visits');
  }

  async findBySupplier(supplierId: string): Promise<SupplierSiteVisitRecord[]> {
    return this.findAll({ filters: { supplier_id: supplierId }, orderBy: 'visit_date', ascending: false, limit: 20 });
  }
}

class SupplierPortalInviteService extends BaseService<SupplierPortalInviteRecord> {
  constructor() {
    super('supplier_portal_invites');
  }

  async invite(supplierId: string, email: string, tokenHash: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('invite_supplier_portal', {
      p_supplier_id: supplierId,
      p_email: email,
      p_token_hash: tokenHash,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export const supplierService = new SupplierService();
export const supplierDocumentService = new SupplierDocumentService();
export const supplierContactService = new SupplierContactService();
export const supplierRiskAssessmentService = new SupplierRiskAssessmentService();
export const supplierSiteVisitService = new SupplierSiteVisitService();
export const supplierPortalInviteService = new SupplierPortalInviteService();
