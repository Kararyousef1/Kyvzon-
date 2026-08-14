import { supabase } from '../supabase/supabase';

export type FinancialApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface FinancialApprovalQueueItem {
  id: string;
  tenant_id: string;
  request_type: string;
  reference_id: string;
  requested_by?: string | null;
  status: string;
  current_step: number;
  total_steps: number;
  created_at: string;
  updated_at: string;
}

class FinancialApprovalQueueService {
  async findByStatus(status: FinancialApprovalStatus, limit = 50): Promise<FinancialApprovalQueueItem[]> {
    const { data, error } = await supabase
      .from('financial_approval_requests')
      .select('id,tenant_id,request_type,reference_id,requested_by,status,current_step,total_steps,created_at,updated_at')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw new Error(error.message);
    return (data ?? []) as FinancialApprovalQueueItem[];
  }

  async decide(requestId: string, decision: 'approved' | 'rejected'): Promise<void> {
    const { error } = await supabase
      .from('financial_approval_requests')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (error) throw new Error(error.message);
  }
}

export const financialApprovalQueueService = new FinancialApprovalQueueService();
