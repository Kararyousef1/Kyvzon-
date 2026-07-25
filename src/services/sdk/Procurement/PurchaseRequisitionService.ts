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

export interface CreatePrItemInput {
  item_code?: string;
  description: string;
  quantity: number;
  unit?: string;
  estimated_unit_price: number;
  suggested_supplier_id?: string;
  notes?: string;
}

export interface CreatePrInput {
  department_id?: string;
  cost_center_id?: string;
  needed_by_date?: string;
  priority?: 'normal' | 'urgent' | 'emergency';
  request_type?: 'raw_material' | 'service' | 'asset' | 'consumable' | 'other';
  justification?: string;
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
      p_emergency_reason: (input as any).emergency_reason || null,
      p_source: (input as any).source || 'manual',
      p_currency_code: input.currency_code || 'SAR',
      p_items: input.items as unknown as string, // JSONB
    });

    if (error) throw new Error(error.message);
    return data as string; // UUID
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
}

export const purchaseRequisitionService = new PurchaseRequisitionService();
export const prLineItemService = new PrLineItemService();
export const prApprovalService = new PrApprovalService();
export const prAttachmentService = new PrAttachmentService();
