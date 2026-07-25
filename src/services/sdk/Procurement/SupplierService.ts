/**
 * ════════════════════════════════════════════════════════════════
 *  SupplierService — خدمة الموردين (بوابة المشتريات)
 *  Wave1: الأساس — 03 Supplier Onboarding
 *
 *  - يرث BaseService مع حقن tenant_id تلقائي
 *  - RLS: procurement/admin/manager يرى الكل، employee لا يرى
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
  country?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  annual_revenue?: number | null;
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
  doc_type: 'commercial_register' | 'tax_certificate' | 'iso_certificate' | 'insurance' | 'bank_letter' | 'zakat_certificate' | 'authorization' | 'other';
  file_name: string;
  file_url: string;
  expiry_date?: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | 'expired';
  verified_by?: string | null;
  verified_at?: string | null;
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
    // بحث بسيط بالاسم القانوني أو التجاري — يمر عبر findAll ثم فلترة محلية (لعدم وجود full-text بعد)
    const all = await this.findAll({ limit: 200 });
    const q = query.toLowerCase().trim();
    if (!q) return all;
    return all.filter(s => 
      s.legal_name.toLowerCase().includes(q) || 
      (s.trade_name && s.trade_name.toLowerCase().includes(q)) ||
      s.supplier_code.toLowerCase().includes(q)
    );
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
    // الوثائق التي تنتهي خلال X يوم — تُحسب محلياً لأن Postgres لا يدعم عبارة خاصة هنا بلا RPC
    const all = await this.findAll({ filters: { verification_status: 'verified' }, limit: 500 });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    return all.filter(d => d.expiry_date && new Date(d.expiry_date) <= cutoff);
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

export const supplierService = new SupplierService();
export const supplierDocumentService = new SupplierDocumentService();
export const supplierRiskAssessmentService = new SupplierRiskAssessmentService();
