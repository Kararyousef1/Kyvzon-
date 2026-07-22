/**
 * حارس بوابة CRM — الوحدة 5: الدعم والتذاكر (التقرير 05):
 *  - الخدمات مُصدَّرة وتعرّف دوال الوحدة (إنشاء/رد/حالة/CSAT/churn/KPIs).
 *  - مرجع الـ SLA مطابق للتقرير (P1 30/240 … P4 480/4320).
 *  - وحدة crm-support أصبحت available + خرائط التسميات مكتملة (قيم CHECK).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import {
  crmTicketService, crmSlaService, crmKbService, crmCannedService, crmRoutingService,
  TICKET_TYPE_LABEL, TICKET_PRIORITY_LABEL, TICKET_PRIORITY_COLOR, TICKET_CHANNEL_LABEL,
  TICKET_STATUS_LABEL, TICKET_STATUS_COLOR, KB_ARTICLE_TYPE_LABEL, ROUTING_STRATEGY_LABEL, SLA_REFERENCE,
} from '../services/sdk';
import { CRM_MODULES } from '../pages/crmportal/crmCatalog';

describe('بوابة CRM — الوحدة 5: الخدمات', () => {
  it('الخدمات مُصدَّرة كـ singletons', () => {
    expect(crmTicketService).toBeDefined();
    expect(crmSlaService).toBeDefined();
    expect(crmKbService).toBeDefined();
    expect(crmCannedService).toBeDefined();
    expect(crmRoutingService).toBeDefined();
  });

  it('خدمة التذاكر تعرّف دوال الوحدة', () => {
    expect(typeof crmTicketService.createTicket).toBe('function');
    expect(typeof crmTicketService.addReply).toBe('function');
    expect(typeof crmTicketService.setStatus).toBe('function');
    expect(typeof crmTicketService.submitCsat).toBe('function');
    expect(typeof crmTicketService.churnRisk).toBe('function');
    expect(typeof crmTicketService.kpis).toBe('function');
  });

  it('مرجع الـ SLA مطابق للتقرير', () => {
    expect(SLA_REFERENCE.p1).toEqual({ frt: 30, ttr: 240 });
    expect(SLA_REFERENCE.p2).toEqual({ frt: 120, ttr: 480 });
    expect(SLA_REFERENCE.p3).toEqual({ frt: 240, ttr: 1440 });
    expect(SLA_REFERENCE.p4).toEqual({ frt: 480, ttr: 4320 });
  });
});

describe('بوابة CRM — الوحدة 5: الكتالوج والتسميات', () => {
  it('وحدة crm-support أصبحت available', () => {
    const m = CRM_MODULES.find((x) => x.id === 'crm-support');
    expect(m?.status).toBe('available');
  });

  it('أنواع/أولويات/قنوات/حالات التذاكر مكتملة (قيم CHECK)', () => {
    (['technical', 'feature_request', 'billing', 'critical_incident'] as const).forEach((t) => expect(TICKET_TYPE_LABEL[t]).toBeTruthy());
    (['p1', 'p2', 'p3', 'p4'] as const).forEach((p) => { expect(TICKET_PRIORITY_LABEL[p]).toBeTruthy(); expect(TICKET_PRIORITY_COLOR[p]).toBeTruthy(); });
    (['email', 'live_chat', 'self_service', 'phone', 'whatsapp'] as const).forEach((c) => expect(TICKET_CHANNEL_LABEL[c]).toBeTruthy());
    (['new', 'open', 'pending_customer', 'pending_internal', 'resolved', 'closed'] as const).forEach((s) => { expect(TICKET_STATUS_LABEL[s]).toBeTruthy(); expect(TICKET_STATUS_COLOR[s]).toBeTruthy(); });
  });

  it('أنواع قاعدة المعرفة واستراتيجيات التوزيع مكتملة', () => {
    (['how_to', 'troubleshooting', 'faq', 'release_notes'] as const).forEach((t) => expect(KB_ARTICLE_TYPE_LABEL[t]).toBeTruthy());
    (['rule_based', 'round_robin', 'skills_based'] as const).forEach((s) => expect(ROUTING_STRATEGY_LABEL[s]).toBeTruthy());
  });
});
