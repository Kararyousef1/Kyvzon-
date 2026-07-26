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
  auto_renewal?: boolean | null;
  non_standard_terms?: boolean | null;
  legal_review_required?: boolean | null;
  renewal_decision?: string | null;
  termination_reason?: string | null;
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

export interface ContractApprovalStepRecord {
  id: string;
  tenant_id: string;
  request_id: string;
  contract_id: string;
  step_order: number;
  approver_role: string;
  approver_id?: string | null;
  status: string;
  comments?: string | null;
  decided_at?: string | null;
}

export interface ContractAuditLogRecord {
  id: string;
  tenant_id: string;
  contract_id?: string | null;
  action: string;
  old_status?: string | null;
  new_status?: string | null;
  comments?: string | null;
  created_at: string;
}

class ProcurementContractService extends BaseService<ProcurementContractRecord> {
  constructor() { super('procurement_contracts'); }

  async findRenewalsUpcoming(limit = 20): Promise<ContractRenewalRecord[]> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.from('contract_renewals_upcoming').select('*').limit(limit);
    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  }

  async createFull(input: { supplier_id: string; type: string; title: string; total_value?: number; currency_code?: string; start_date?: string; end_date?: string; template_id?: string; description?: string }): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('create_procurement_contract_full', {
      p_supplier_id: input.supplier_id,
      p_type: input.type,
      p_title: input.title,
      p_total_value: input.total_value || 0,
      p_currency_code: input.currency_code || 'SAR',
      p_start_date: input.start_date || null,
      p_end_date: input.end_date || null,
      p_template_id: input.template_id || null,
      p_description: input.description || null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async requestApproval(contractId: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('request_contract_approval', { p_contract_id: contractId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async requestSignature(contractId: string, signers: Array<{ email: string; role: string; order?: number }>): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('request_contract_signature', { p_contract_id: contractId, p_signers: signers as any });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }

  async decideRenewal(contractId: string, decision: string, notes?: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('decide_contract_renewal', { p_contract_id: contractId, p_decision: decision, p_notes: notes || null });
    if (error) throw new Error(error.message);
  }

  async terminate(contractId: string, reason: string): Promise<void> {
    const { supabase } = await import('../../supabase/supabase');
    const { error } = await supabase.rpc('terminate_contract', { p_contract_id: contractId, p_reason: reason });
    if (error) throw new Error(error.message);
  }
}

class ContractTemplateService extends BaseService<ContractTemplateRecord> {
  constructor() { super('contract_templates'); }
  async seedDefaults(): Promise<number> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('seed_default_contract_templates_clauses');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
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
  async add(contractId: string, description: string, responsibleParty: string, dueDate: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('add_contract_obligation', { p_contract_id: contractId, p_description: description, p_responsible_party: responsibleParty, p_due_date: dueDate });
    if (error) throw new Error(error.message);
    return data as string;
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

class ContractApprovalStepService extends BaseService<ContractApprovalStepRecord> {
  constructor() { super('contract_approval_steps'); }
  async findByContract(contractId: string): Promise<ContractApprovalStepRecord[]> {
    return this.findAll({ filters: { contract_id: contractId }, orderBy: 'step_order', ascending: true, limit: 20 });
  }
  async decide(stepId: string, decision: 'approved' | 'rejected', comments?: string): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.rpc('approve_contract_step', { p_step_id: stepId, p_decision: decision, p_comments: comments || null });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class ContractAuditLogService extends BaseService<ContractAuditLogRecord> {
  constructor() { super('contract_audit_log'); }
  async findByContract(contractId: string): Promise<ContractAuditLogRecord[]> {
    return this.findAll({ filters: { contract_id: contractId }, orderBy: 'created_at', ascending: false, limit: 100 });
  }
}

export const procurementContractService = new ProcurementContractService();
export const contractApprovalStepService = new ContractApprovalStepService();
export const contractAuditLogService = new ContractAuditLogService();
export const contractTemplateService = new ContractTemplateService();
export const contractClauseService = new ContractClauseService();
export const contractVersionService = new ContractVersionService();
export const contractObligationService = new ContractObligationService();
export const contractSignatureService = new ContractSignatureService();
