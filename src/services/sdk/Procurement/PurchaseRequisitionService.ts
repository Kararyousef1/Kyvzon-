/**
 * ════════════════════════════════════════════════════════════════
 *  PurchaseRequisitionService — طلبات الشراء PR (بوابة المشتريات)
 *  Wave1: 01 PR + Approval Workflow
 *
 *  - CRUD عبر BaseService
 *  - إنشاء ذري عبر RPC create_purchase_requisition
 *  - موافقة عبر RPC approve_pr
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface PurchaseRequisitionRecord {
  id: string;
  tenant_id: string;
  pr_number: string;
  requester_id: string;
  department_id?: string | null;
  cost_center_id?: string | null;
  needed_by_date?: string | null;
  priority: 'normal' | 'urgent' | 'emergency';
  request_type: 'raw_material' | 'service' | 'asset' | 'consumable' | 'other';
  justification?: string | null;
  budget_checked: boolean;
  budget_status?: 'ok' | 'exceeded' | 'pending' | 'not_checked' | null;
  total_estimated: number;
  currency_code: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted_to_po' | 'cancelled';
  current_approval_level: number;
  created_at: string;
  updated_at: string;
}

export interface PrLineItemRecord {
  id: string;
  tenant_id: string;
  pr_id: string;
  item_code?: string | null;
  description: string;
  quantity: number;
  unit: string;
  estimated_unit_price: number;
  estimated_total: number;
  suggested_supplier_id?: string | null;
  unspsc_code?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface PrApprovalRecord {
  id: string;
  tenant_id: string;
  pr_id: string;
  approver_id: string;
  approval_level: number;
  role_required?: string | null;
  decision: 'pending' | 'approved' | 'rejected' | 'delegated' | null;
  comments?: string | null;
  decided_at?: string | null;
  created_at: string;
}

export interface PrAttachmentRecord {
  id: string;
  tenant_id: string;
  pr_id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface PrAuditLogRecord {
  id: string;
  tenant_id: string;
  pr_id: string;
  actor_id?: string | null;
  action: string;
  old_status?: string | null;
  new_status?: string | null;
  comments?: string | null;
  created_at: string;
}

export interface PrCommentRecord {
  id: string;
  tenant_id: string;
  pr_id: string;
  author_id?: string | null;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

export interface ProcurementReorderPointRecord {
  id: string;
  tenant_id: string;
  item_code: string;
  description: string;
  current_stock: number;
  reorder_point: number;
  reorder_qty: number;
  unit: string;
  department_id?: string | null;
  last_generated_at?: string | null;
  is_active: boolean;
  estimated_unit_price?: number | null;
  priority?: 'normal' | 'urgent' | 'emergency' | null;
  needed_in_days?: number | null;
  created_at: string;
}

export interface CreatePrItemInput {
  item_code?: string;
  description: string;
  quantity: number;
  unit?: string;
  estimated_unit_price: number;
  suggested_supplier_id?: string;
  unspsc_code?: string;
  notes?: string;
}

export interface CreatePrInput {
  department_id?: string;
  cost_center_id?: string;
  project_id?: string;
  budget_scope?: 'cost_center' | 'project' | 'category' | 'capex';
  budget_category_code?: string;
  needed_by_date?: string;
  priority?: 'normal' | 'urgent' | 'emergency';
  request_type?: 'raw_material' | 'service' | 'asset' | 'consumable' | 'other';
  justification?: string;
  emergency_reason?: string;
  source?: 'manual' | 'mrp' | 'reorder_point' | 'p_card' | 'expense' | 'other';
  currency_code?: string;
  items: CreatePrItemInput[];
}

class PurchaseRequisitionService extends BaseService<PurchaseRequisitionRecord> {
  constructor() {
    super('purchase_requisitions');
  }

  // إنشاء ذري مع بنود + سير موافقة تلقائي عبر RPC (حقيقي 100% — بلا محاكاة)
  async createWithItems(input: CreatePrInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_purchase_requisition_full', {
      p_department_id: input.department_id || null,
      p_cost_center_id: input.cost_center_id || null,
      p_needed_by_date: input.needed_by_date || null,
      p_priority: input.priority || 'normal',
      p_request_type: input.request_type || 'raw_material',
      p_justification: input.justification || null,
      p_emergency_reason: input.emergency_reason || null,
      p_source: input.source || 'manual',
      p_currency_code: input.currency_code || 'SAR',
      p_items: input.items as unknown as string, // JSONB
    });

    if (error) throw new Error(error.message);
    const prId = data as string;
    if (input.project_id || input.budget_scope || input.budget_category_code) {
      await this.update(prId, {
        project_id: input.project_id || null,
        budget_scope: input.budget_scope || (input.request_type === 'asset' ? 'capex' : 'cost_center'),
        budget_category_code: input.budget_category_code || null,
      } as any);
    }
    return prId; // UUID
  }

  async findMyRequests(): Promise<PurchaseRequisitionRecord[]> {
    // يمر عبر BaseService + RLS: الموظف يرى طلباته فقط، procurement يرى الكل
    return this.findAll({ orderBy: 'created_at', ascending: false, limit: 100 });
  }

  async findPendingApprovals(): Promise<PurchaseRequisitionRecord[]> {
    return this.findAll({ filters: { status: 'pending_approval' }, orderBy: 'priority', ascending: false, limit: 100 });
  }

  async consolidate(prIds: string[]): Promise<string> {
    const { data, error } = await supabase.rpc('consolidate_prs', { p_pr_ids: prIds });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async requestRevision(prId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('request_pr_revision', { p_pr_id: prId, p_reason: reason });
    if (error) throw new Error(error.message);
  }

  async cancel(prId: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_pr', { p_pr_id: prId, p_reason: reason || null });
    if (error) throw new Error(error.message);
  }

  async generateFromReorderPoints(): Promise<number> {
    const { data, error } = await supabase.rpc('generate_reorder_point_prs');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

class PrLineItemService extends BaseService<PrLineItemRecord> {
  constructor() {
    super('pr_line_items');
  }

  async findByPr(prId: string): Promise<PrLineItemRecord[]> {
    return this.findAll({ filters: { pr_id: prId }, orderBy: 'created_at', limit: 100 });
  }
}

class PrApprovalService extends BaseService<PrApprovalRecord> {
  constructor() {
    super('pr_approvals');
  }

  async findByPr(prId: string): Promise<PrApprovalRecord[]> {
    return this.findAll({ filters: { pr_id: prId }, orderBy: 'approval_level', limit: 10 });
  }

  async approve(prId: string, decision: 'approved' | 'rejected', comments?: string): Promise<void> {
    // الطريقة القديمة (للواجهة البسيطة) — تبحث عن طلب موافقة مرتبط بـ PR
    const { data: req } = await supabase.from('procurement_approval_requests').select('id').eq('related_id', prId).eq('status','pending').maybeSingle();
    if (req?.id) {
      const { error } = await supabase.rpc('approve_procurement_step', {
        p_request_id: req.id,
        p_decision: decision,
        p_comments: comments || null,
      });
      if (error) throw new Error(error.message);
    } else {
      // fallback للجدول القديم
      const { error } = await supabase.rpc('approve_pr', {
        p_pr_id: prId,
        p_decision: decision,
        p_comments: comments || null,
      });
      if (error) {
        // حاول الطريقة الجديدة مباشرة
        const { data: req2 } = await supabase.from('procurement_approval_requests').select('id').eq('related_id', prId).single();
        if (req2?.id) {
          const { error: err2 } = await supabase.rpc('approve_procurement_step', {
            p_request_id: req2.id,
            p_decision: decision,
            p_comments: comments || null,
          });
          if (err2) throw new Error(err2.message);
        } else {
          throw new Error(error.message);
        }
      }
    }
  }
}

class PrAttachmentService extends BaseService<PrAttachmentRecord> {
  constructor() {
    super('pr_attachments');
  }

  async findByPr(prId: string): Promise<PrAttachmentRecord[]> {
    return this.findAll({ filters: { pr_id: prId }, orderBy: 'created_at', limit: 50 });
  }

  async uploadFile(prId: string, file: File): Promise<string> {
    const { supabase } = await import('../../supabase/supabase');
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
      reader.readAsDataURL(file);
    });
    const { data, error } = await supabase.functions.invoke('procurement-pr-attachment', {
      body: { action: 'upload', pr_id: prId, file_name: file.name, file_mime: file.type, file_base64: fileBase64 },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'فشل رفع المرفق');
    return data.attachment_id as string;
  }

  async signedUrl(prId: string, fileUrl: string): Promise<string> {
    if (!fileUrl.startsWith('storage://')) return fileUrl;
    const { supabase } = await import('../../supabase/supabase');
    const { data, error } = await supabase.functions.invoke('procurement-pr-attachment', {
      body: { action: 'signed_url', pr_id: prId, file_url: fileUrl },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'فشل إنشاء رابط المرفق');
    return data.url as string;
  }
}

class PrAuditLogService extends BaseService<PrAuditLogRecord> {
  constructor() { super('pr_audit_log'); }
  async findByPr(prId: string): Promise<PrAuditLogRecord[]> {
    return this.findAll({ filters: { pr_id: prId }, orderBy: 'created_at', ascending: false, limit: 100 });
  }
}

class PrCommentService extends BaseService<PrCommentRecord> {
  constructor() { super('pr_comments'); }
  async findByPr(prId: string): Promise<PrCommentRecord[]> {
    return this.findAll({ filters: { pr_id: prId }, orderBy: 'created_at', ascending: false, limit: 100 });
  }
  async add(prId: string, comment: string, isInternal = false): Promise<string> {
    const { data, error } = await supabase.rpc('add_pr_comment', { p_pr_id: prId, p_comment: comment, p_is_internal: isInternal });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

class ProcurementReorderPointService extends BaseService<ProcurementReorderPointRecord> {
  constructor() { super('procurement_reorder_points'); }
  async findActive(): Promise<ProcurementReorderPointRecord[]> {
    return this.findAll({ filters: { is_active: true }, orderBy: 'item_code', ascending: true, limit: 200 });
  }
  async findTriggered(): Promise<ProcurementReorderPointRecord[]> {
    const rows = await this.findActive();
    return rows.filter(r => Number(r.current_stock) <= Number(r.reorder_point));
  }
}

export const purchaseRequisitionService = new PurchaseRequisitionService();
export const prLineItemService = new PrLineItemService();
export const prApprovalService = new PrApprovalService();
export const prAttachmentService = new PrAttachmentService();
export const prAuditLogService = new PrAuditLogService();
export const prCommentService = new PrCommentService();
export const procurementReorderPointService = new ProcurementReorderPointService();
