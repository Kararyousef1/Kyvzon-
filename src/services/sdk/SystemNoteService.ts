import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface SystemNoteRecord {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  note_content: string;
  user_id?: string | null;
  timestamp: string;
  is_immutable: boolean;
}

export interface FinanceAuditEventBoardRecord {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  entity_code: string;
  entity_name: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  correlation_id?: string | null;
  created_at: string;
}

export class SystemNoteService extends BaseService<SystemNoteRecord> {
  constructor() { super('system_notes'); }
  async createNote(data: Partial<SystemNoteRecord>) { return this.create(data); }
  async findByEntity(entityType: string, entityId: string) { return this.findAll({ filters: { entity_type: entityType, entity_id: entityId }, orderBy: 'timestamp', ascending: false }); }
  async findFinanceAuditEvents(input?: { legalEntityId?: string; eventType?: string; limit?: number }): Promise<FinanceAuditEventBoardRecord[]> {
    let query = supabase.from('finance_audit_event_board').select('*').order('created_at', { ascending: false }).limit(input?.limit || 200);
    if (input?.legalEntityId) query = query.eq('legal_entity_id', input.legalEntityId);
    if (input?.eventType) query = query.eq('event_type', input.eventType);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as FinanceAuditEventBoardRecord[];
  }
}
export const systemNoteService = new SystemNoteService();
