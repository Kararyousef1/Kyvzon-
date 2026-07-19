import { beforeEach, describe, expect, it, vi } from 'vitest';

const chains: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

vi.mock('../../services/supabase/supabase', () => {
  const chainable = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['select', 'insert', 'update', 'eq', 'order', 'limit', 'range', 'maybeSingle']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.single = vi.fn(() => Promise.resolve({ data: { id: 'approval-1' }, error: null }));
    chain.then = vi.fn((onFulfilled: (result: { data: unknown[]; error: null }) => unknown) =>
      onFulfilled({ data: [], error: null }),
    );
    chains.push(chain);
    return chain;
  };

  return { supabase: { from: vi.fn(chainable) } };
});

vi.mock('../../services/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabase } from '../../services/supabase/supabase';
import { approvalActionService, approvalRequestService } from '../../services/sdk/ApprovalService';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('Approval SDK services', () => {
  beforeEach(() => {
    chains.length = 0;
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('tenant_id', TENANT_ID);
  });

  it('loads approvals for the current approver from approval_requests', async () => {
    await approvalRequestService.findForApprover('manager-1');

    expect(supabase.from).toHaveBeenCalledWith('approval_requests');
    expect(chains[0].eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(chains[0].eq).toHaveBeenCalledWith('current_approver_id', 'manager-1');
    expect(chains[0].order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('records a decision without allowing the tenant to be changed', async () => {
    await approvalRequestService.decide('approval-1', 'approved', 'manager-1', 'approved after review');

    expect(supabase.from).toHaveBeenCalledWith('approval_requests');
    expect(chains[0].update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      decided_by: 'manager-1',
      decision_note: 'approved after review',
    }));
    expect(chains[0].eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(chains[0].eq).toHaveBeenCalledWith('id', 'approval-1');
  });

  it('writes an audit action to approval_actions, not approval_requests', async () => {
    await approvalActionService.addAction({
      approval_request_id: 'approval-1',
      actor_id: 'manager-1',
      action: 'approved',
      note: 'approved after review',
    });

    expect(supabase.from).toHaveBeenCalledWith('approval_actions');
    expect(chains[0].insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT_ID,
      approval_request_id: 'approval-1',
      action: 'approved',
    }));
  });
});
