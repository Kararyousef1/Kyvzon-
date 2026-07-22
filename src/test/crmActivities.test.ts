/**
 * حارس بوابة CRM — الوحدة 3: الأنشطة والأتمتة (التقرير 03):
 *  - الخدمات مُصدَّرة وتعرّف دوال الوحدة (مكالمات/مهام/سلاسل/أتمتة/إسناد/تحليل).
 *  - وحدة crm-activities أصبحت available في الكتالوج.
 *  - خرائط التسميات مكتملة لكل قيم القيود (CHECK) في migration 0167.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import {
  crmTaskService, crmSequenceService, crmAutomationService, crmAssignmentService,
  TASK_TYPE_LABEL, TASK_PRIORITY_LABEL, TASK_PRIORITY_COLOR, TASK_STATUS_LABEL,
  SEQUENCE_TYPE_LABEL, SEQUENCE_ACTION_LABEL,
  AUTOMATION_TRIGGER_LABEL, AUTOMATION_ACTION_LABEL, ASSIGNMENT_MATCH_LABEL, CALL_OUTCOME_LABEL,
} from '../services/sdk';
import { CRM_MODULES } from '../pages/crmportal/crmCatalog';

describe('بوابة CRM — الوحدة 3: الخدمات', () => {
  it('الخدمات مُصدَّرة كـ singletons', () => {
    expect(crmTaskService).toBeDefined();
    expect(crmSequenceService).toBeDefined();
    expect(crmAutomationService).toBeDefined();
    expect(crmAssignmentService).toBeDefined();
  });

  it('الخدمات تعرّف دوال الوحدة', () => {
    expect(typeof crmTaskService.logCall).toBe('function');
    expect(typeof crmTaskService.complete).toBe('function');
    expect(typeof crmTaskService.activityStats).toBe('function');
    expect(typeof crmTaskService.activityGaps).toBe('function');
    expect(typeof crmSequenceService.enroll).toBe('function');
    expect(typeof crmSequenceService.seedDefault).toBe('function');
    expect(typeof crmAssignmentService.applyToDeal).toBe('function');
  });
});

describe('بوابة CRM — الوحدة 3: الكتالوج والتسميات', () => {
  it('وحدة crm-activities أصبحت available', () => {
    const m = CRM_MODULES.find((x) => x.id === 'crm-activities');
    expect(m?.status).toBe('available');
  });

  it('أنواع المهام والأولويات والحالات مكتملة (قيم CHECK)', () => {
    (['todo', 'call', 'email', 'meeting', 'demo', 'follow_up', 'custom'] as const).forEach((t) => expect(TASK_TYPE_LABEL[t]).toBeTruthy());
    (['urgent', 'high', 'medium', 'low'] as const).forEach((p) => {
      expect(TASK_PRIORITY_LABEL[p]).toBeTruthy();
      expect(TASK_PRIORITY_COLOR[p]).toBeTruthy();
    });
    (['not_started', 'in_progress', 'completed', 'cancelled'] as const).forEach((s) => expect(TASK_STATUS_LABEL[s]).toBeTruthy());
  });

  it('أنواع السلاسل وإجراءاتها مكتملة', () => {
    (['cold_outreach', 'post_demo', 'proposal_sent', 're_engagement', 'renewal', 'onboarding', 'custom'] as const).forEach((s) => expect(SEQUENCE_TYPE_LABEL[s]).toBeTruthy());
    (['task', 'email', 'call', 'sms', 'wait', 'stop'] as const).forEach((a) => expect(SEQUENCE_ACTION_LABEL[a]).toBeTruthy());
  });

  it('محفّزات وإجراءات الأتمتة وأنواع الإسناد ونتائج المكالمات مكتملة', () => {
    (['deal_created', 'deal_stage_changed', 'deal_won', 'deal_overdue', 'call_outcome', 'lead_score_reached', 'task_completed', 'no_activity'] as const).forEach((t) => expect(AUTOMATION_TRIGGER_LABEL[t]).toBeTruthy());
    (['notify_manager', 'create_task', 'move_stage', 'create_deal', 'notify_team', 'start_sequence', 'assign_owner'] as const).forEach((a) => expect(AUTOMATION_ACTION_LABEL[a]).toBeTruthy());
    (['region', 'value_gte', 'source', 'industry'] as const).forEach((m) => expect(ASSIGNMENT_MATCH_LABEL[m]).toBeTruthy());
    (['interested', 'thinking', 'no_answer', 'callback', 'rejected'] as const).forEach((o) => expect(CALL_OUTCOME_LABEL[o]).toBeTruthy());
  });
});
