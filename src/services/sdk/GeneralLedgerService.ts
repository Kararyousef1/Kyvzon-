/**
 * ════════════════════════════════════════════════════════════════
 *  GeneralLedgerService — الدفتر العام ودورة حياة القيود
 *  ════════════════════════════════════════════════════════════════
 */
import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import type { JournalEntryRecord } from '../../shared/types/sdk';

export interface JournalDraftLineInput {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
  cost_center_id?: string;
  project_id?: string;
}

export interface CreateJournalDraftInput {
  legal_entity_id: string;
  accounting_period_id: string;
  entry_date: string;
  description: string;
  reference?: string;
  transaction_currency_code: string;
  exchange_rate?: number;
  idempotency_key?: string;
  lines: JournalDraftLineInput[];
}

export interface JournalEntryBoardRecord extends JournalEntryRecord {
  entity_code?: string;
  entity_name?: string;
  period_name?: string | null;
  created_by_name?: string | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  submitted_by_name?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  voided_by_name?: string | null;
  void_reason?: string | null;
  reversed_entry_id?: string | null;
  reversal_reason?: string | null;
  line_count: number;
  lines_with_cost_center: number;
  lines_with_project: number;
}

export interface JournalEntryLineBoardRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  entry_id: string;
  line_number?: number | null;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  description?: string | null;
  debit_amount: number;
  credit_amount: number;
  transaction_currency_code?: string | null;
  cost_center_id?: string | null;
  cost_center_code?: string | null;
  cost_center_name?: string | null;
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
  created_at: string;
}

export interface JournalLifecycleDashboardRecord {
  tenant_id: string;
  legal_entity_id: string;
  entity_code: string;
  entity_name: string;
  draft_entries: number;
  submitted_entries: number;
  approved_entries: number;
  posted_entries: number;
  reversed_entries: number;
  voided_entries: number;
  posted_debit: number;
  posted_credit: number;
}

class GeneralLedgerService extends BaseService<JournalEntryRecord> {
  constructor() { super('journal_entries'); }

  /** @deprecated Finance Unit 02 requires createDraft() so lines, balancing and entity checks are atomic. */
  async createJournal(data: Partial<JournalEntryRecord>): Promise<JournalEntryRecord> {
    if (Number(data.total_debit || 0) !== Number(data.total_credit || 0)) {
      throw new Error('القيد غير متوازن: المدين يجب أن يساوي الدائن');
    }
    return this.create(data as Partial<JournalEntryRecord>);
  }

  async findByTenant(tenantId: string): Promise<JournalEntryRecord[]> {
    return this.findAll({ filters: { tenant_id: tenantId }, orderBy: 'entry_date', ascending: false });
  }

  async findByStatus(status: string): Promise<JournalEntryRecord[]> {
    return this.findAll({ filters: { status: status as any }, orderBy: 'entry_date', ascending: false });
  }

  async findBoard(legalEntityId: string): Promise<JournalEntryBoardRecord[]> {
    const { data, error } = await supabase
      .from('finance_journal_entry_board')
      .select('*')
      .eq('legal_entity_id', legalEntityId)
      .order('entry_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as JournalEntryBoardRecord[];
  }

  async findLines(entryId: string): Promise<JournalEntryLineBoardRecord[]> {
    const { data, error } = await supabase
      .from('finance_journal_entry_line_board')
      .select('*')
      .eq('entry_id', entryId)
      .order('line_number');
    if (error) throw new Error(error.message);
    return (data || []) as JournalEntryLineBoardRecord[];
  }

  async findLifecycleDashboard(legalEntityId?: string): Promise<JournalLifecycleDashboardRecord[]> {
    let query = supabase.from('finance_journal_lifecycle_dashboard').select('*').order('entity_code');
    if (legalEntityId) query = query.eq('legal_entity_id', legalEntityId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as JournalLifecycleDashboardRecord[];
  }

  /** Creates entry header and all lines in one database transaction. */
  async createDraft(input: CreateJournalDraftInput): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('create_journal_draft', {
      p_legal_entity_id: input.legal_entity_id,
      p_accounting_period_id: input.accounting_period_id,
      p_entry_date: input.entry_date,
      p_description: input.description,
      p_reference: input.reference || '',
      p_transaction_currency_code: input.transaction_currency_code,
      p_exchange_rate: input.exchange_rate ?? 1,
      p_lines: input.lines,
      p_idempotency_key: input.idempotency_key || null,
    });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }

  /**
   * تقديم قيد للاعتماد.
   *
   * يستدعي submit_journal_entry (المنطق المحاسبي) ثم جسر الموافقات
   * create_financial_approval (0306) ليظهر القيد في مركز موافقات
   * المدير الموحّد.
   *
   * ⚠️ فشل الجسر لا يُفشل التقديم: القيد قُدِّم فعلاً في القاعدة،
   * وإرجاع خطأ هنا يوهم المستخدم بأن العملية لم تتم. نُسجّل تحذيراً
   * فقط — والطلب يمكن إنشاؤه لاحقاً بإعادة التقديم (الجسر آمن للتكرار).
   */
  async submitEntry(entryId: string, reason: string): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('submit_journal_entry', { p_entry_id: entryId, p_reason: reason });
    if (error) throw new Error(error.message);

    // p_amount = null ⇒ الجسر يستخرجه من سطور القيد (0310)
    const { error: bridgeError } = await supabase.rpc('create_financial_approval', {
      p_request_type: 'journal_entry',
      p_reference_id: entryId,
      p_amount: null,
    });
    if (bridgeError) {
      logger.warn('تعذّر إنشاء طلب موافقة للقيد — القيد قُدِّم بنجاح', {
        entryId,
        error: bridgeError.message,
      });
    }

    return data as JournalEntryRecord;
  }

  async approveEntry(entryId: string, reason: string): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('approve_journal_entry', { p_entry_id: entryId, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }

  /** Posts through the Unit 02 lifecycle RPC. Reason is mandatory for finance audit. */
  async postJournalEntry(entryId: string, reason: string): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('post_journal_entry_with_reason', { p_entry_id: entryId, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }

  async voidEntry(entryId: string, reason: string): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('void_journal_entry', { p_entry_id: entryId, p_reason: reason });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }

  /** Creates a separate opposite entry and marks the original as reversed. */
  async reverseEntry(input: {
    entryId: string;
    accountingPeriodId: string;
    reversalDate: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('reverse_journal_entry', {
      p_entry_id: input.entryId,
      p_accounting_period_id: input.accountingPeriodId,
      p_reversal_date: input.reversalDate,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }
}

export const generalLedgerService = new GeneralLedgerService();
