/**
 * ContractService — Unit 06 — إدارة العقود CLM — 100% حقيقي بلا محاكاة
 * يغلف كل استعلامات supabase.from داخل SDK (مسموح) — الصفحات تستخدم SDK فقط
 */

import { BaseService } from '../BaseService';

export interface ProcurementContractRecord {
  id: string;
  tenant_id: string;
  contract_number: string;
  supplier_id: string;
  type: string;
  title: string;
  status: string;
  total_value?: number | null;
  currency_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

export interface ContractTemplateRecord {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  content: string;
  is_active: boolean;
}

export interface ContractClauseRecord {
  id: string;
  tenant_id: string;
  clause_type: string;
  title: string;
  content: string;
  is_red_flag: boolean;
  is_standard: boolean;
}

export interface ContractVersionRecord {
  id: string;
  tenant_id: string;
  contract_id: string;
  version_number: string;
  content: string;
  change_summary?: string | null;
  created_at: string;
}

export interface ContractObligationRecord {
  id: string;
  tenant_id: string;
  contract_id: string;
  description: string;
  responsible_party: string;
  due_date: string;
  status: string;
}

export interface ContractRenewalRecord {
  id: string;
  tenant_id: string;
  contract_number: string;
  title: string;
  end_date: string;
  days_until_expiry: number;
  total_value?: number | null;
  renewal_status: string;
}

class ProcurementContractService extends BaseService<ProcurementContractRecord> {
  constructor() { super('procurement_contracts'); }

  async findRenewalsUpcoming(limit = 20): Promise<ContractRenewalRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.from('contract_renewals_upcoming').select('*').limit(limit);
    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  }
}

class ContractTemplateService extends BaseService<ContractTemplateRecord> {
  constructor() { super('contract_templates'); }
}

class ContractClauseService extends BaseService<ContractClauseRecord> {
  constructor() { super('contract_clauses'); }
}

class ContractVersionService extends BaseService<ContractVersionRecord> {
  constructor() { super('contract_versions'); }
  async findByContract(contractId: string): Promise<ContractVersionRecord[]> {
    return this.findAll({ filters: { contract_id: contractId }, orderBy: 'created_at', ascending: false, limit: 50 });
  }
}

class ContractObligationService extends BaseService<ContractObligationRecord> {
  constructor() { super('contract_obligations'); }
  async findUpcoming(days = 30): Promise<ContractObligationRecord[]> {
    const all = await this.findAll({ limit: 200 });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    return all.filter(o => o.due_date && new Date(o.due_date) <= cutoff);
  }
}

export interface ContractSignatureRecord {
  id: string;
  tenant_id: string;
  contract_id: string;
  signer_email: string;
  signer_role: string;
  signed_at?: string | null;
  ip_address?: string | null;
  signature_method: string;
  otp_verified: boolean;
  created_at: string;
}

class ContractSignatureService extends BaseService<ContractSignatureRecord> {
  constructor() { super('contract_signatures'); }

  async sign(contractId: string, signerEmail: string, signerRole: string, ip: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('sign_contract', {
      p_contract_id: contractId,
      p_signer_email: signerEmail,
      p_signer_role: signerRole,
      p_ip: ip,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export const procurementContractService = new ProcurementContractService();
export const contractTemplateService = new ContractTemplateService();
export const contractClauseService = new ContractClauseService();
export const contractVersionService = new ContractVersionService();
export const contractObligationService = new ContractObligationService();
export const contractSignatureService = new ContractSignatureService();
