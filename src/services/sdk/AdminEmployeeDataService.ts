import { supabase } from '../supabase/supabase';

export interface FinanceLookupRecord {
  id: string;
  name_ar: string;
  code: string;
}

export interface EntityMembershipRecord {
  id?: string;
  tenant_id?: string;
  user_id: string;
  legal_entity_id: string;
  finance_role: string;
  is_active: boolean;
  legal_entities?: { name_ar: string; code: string } | null;
}

class AdminEmployeeDataService {
  async findCostCenters(tenantId: string, limit = 50): Promise<FinanceLookupRecord[]> {
    const { data, error } = await supabase.from('cost_centers')
      .select('id,name_ar,code')
      .eq('tenant_id', tenantId)
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw new Error(error.message);
    return (data ?? []) as FinanceLookupRecord[];
  }

  async findFinanceProjects(tenantId: string, limit = 50): Promise<FinanceLookupRecord[]> {
    const { data, error } = await supabase.from('finance_projects')
      .select('id,name_ar,code')
      .eq('tenant_id', tenantId)
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw new Error(error.message);
    return (data ?? []) as FinanceLookupRecord[];
  }

  async findTenantMemberships(tenantId: string): Promise<EntityMembershipRecord[]> {
    const { data, error } = await supabase.from('entity_memberships')
      .select('id,tenant_id,user_id,legal_entity_id,finance_role,is_active')
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    return (data ?? []) as EntityMembershipRecord[];
  }

  async findUserMemberships(userId: string, tenantId?: string): Promise<EntityMembershipRecord[]> {
    let query = supabase.from('entity_memberships')
      .select('id,tenant_id,user_id,legal_entity_id,finance_role,is_active,legal_entities!inner(name_ar,code)')
      .eq('user_id', userId);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as EntityMembershipRecord[];
  }

  async updateCustomPermissions(userId: string, customPermissions: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('profiles')
      .update({ custom_permissions: customPermissions })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  }

  async upsertMembership(input: {
    tenantId: string;
    legalEntityId: string;
    userId: string;
    financeRole: string;
  }): Promise<void> {
    const { data: existing, error: lookupError } = await supabase.from('entity_memberships')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('user_id', input.userId)
      .eq('legal_entity_id', input.legalEntityId)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    if (existing) {
      const { error } = await supabase.from('entity_memberships')
        .update({ finance_role: input.financeRole, is_active: true })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      return;
    }

    await this.createMembership(input);
  }

  async createMembership(input: {
    tenantId: string;
    legalEntityId: string;
    userId: string;
    financeRole: string;
  }): Promise<void> {
    const { error } = await supabase.from('entity_memberships').insert({
      tenant_id: input.tenantId,
      legal_entity_id: input.legalEntityId,
      user_id: input.userId,
      finance_role: input.financeRole,
      is_active: true,
    });
    if (error) throw new Error(error.message);
  }
}

export const adminEmployeeDataService = new AdminEmployeeDataService();
