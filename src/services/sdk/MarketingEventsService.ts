/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MarketingEventsService — خدمة وحدة إدارة الفعاليات (التقرير 5)
 *
 *  يغلّف جداول ودوال migration 0161:
 *    • marketing_events / speakers / sponsors / sessions → الفعالية وصفحتها
 *    • event_ticket_types / event_promo_codes            → التذاكر والخصومات
 *    • event_registrations                               → التسجيل + QR + الحضور
 *
 *  الدوال (RPC): register_for_event · checkin_by_qr · set_event_engagement · event_kpis.
 *  الدفع (Stripe) والبث (Zoom/Teams) hooks — محاكاة حتى إدخال المفاتيح.
 *  الربط بالوحدة 1: حضور 80%+ يرفع Lead Score تلقائياً.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export type EventType = 'in_person' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'published' | 'live' | 'completed' | 'cancelled';
export type StreamProvider = 'zoom' | 'teams' | 'youtube' | 'vimeo' | 'other';

export interface MarketingEvent {
  id: string; tenant_id: string; name: string; slug: string | null; description: string | null;
  event_type: EventType; status: EventStatus;
  starts_at: string | null; ends_at: string | null; timezone: string | null;
  location: string | null; map_url: string | null;
  stream_provider: StreamProvider | null; stream_url: string | null;
  capacity: number | null; cover_image_url: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface MarketingEventInput {
  name: string; description?: string | null; event_type?: EventType; status?: EventStatus;
  starts_at?: string | null; ends_at?: string | null; timezone?: string | null;
  location?: string | null; stream_provider?: StreamProvider | null; stream_url?: string | null;
  capacity?: number | null;
}

export interface EventSpeaker { id: string; tenant_id: string; event_id: string; name: string; title: string | null; bio: string | null; photo_url: string | null; linkedin_url: string | null; created_at: string; }
export interface EventSponsor { id: string; tenant_id: string; event_id: string; name: string; logo_url: string | null; website_url: string | null; tier: string | null; created_at: string; }
export interface EventSession { id: string; tenant_id: string; event_id: string; title: string; speaker_id: string | null; room: string | null; starts_at: string | null; ends_at: string | null; capacity: number | null; created_at: string; }

export type TicketTier = 'early_bird' | 'general' | 'vip' | 'group' | 'press' | 'free';
export interface EventTicketType {
  id: string; tenant_id: string; event_id: string; name: string; tier: TicketTier;
  price: number; currency: string; quantity: number | null; sold: number;
  min_group_size: number | null; sales_end_at: string | null; is_active: boolean; created_at: string;
}
export interface EventTicketTypeInput {
  event_id: string; name: string; tier?: TicketTier; price?: number; currency?: string; quantity?: number | null;
}

export interface EventPromoCode {
  id: string; tenant_id: string; event_id: string; code: string;
  discount_type: 'percent' | 'fixed'; discount_value: number; max_uses: number | null; used_count: number; is_active: boolean; created_at: string;
}
export interface EventPromoCodeInput {
  event_id: string; code: string; discount_type?: 'percent' | 'fixed'; discount_value: number; max_uses?: number | null;
}

export type RegistrationStatus = 'registered' | 'waitlisted' | 'cancelled';
export type PaymentStatus = 'not_required' | 'pending' | 'paid' | 'refunded';
export interface EventRegistration {
  id: string; tenant_id: string; event_id: string; ticket_type_id: string | null;
  full_name: string; email: string | null; phone: string | null; company: string | null; job_title: string | null;
  custom_fields: Record<string, unknown>; lead_id: string | null;
  status: RegistrationStatus; payment_status: PaymentStatus; amount_paid: number; promo_code: string | null;
  qr_token: string; checked_in: boolean; checked_in_at: string | null;
  engagement_score: number; attendance_pct: number; created_at: string; updated_at: string;
}

export interface EventKpis { registered: number; waitlisted: number; checkedIn: number; revenue: number; leads: number; attendanceRate: number; }
export interface CheckinResult { result: 'success' | 'already_checked_in' | 'not_found'; registrant: string | null; regId: string | null; }

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات
// ════════════════════════════════════════════════════════════════════════════

class EventService extends BaseService<MarketingEvent> {
  constructor() { super('marketing_events'); }
  listEvents() { return this.findAll({ orderBy: 'starts_at', ascending: false }); }
  createEvent(input: MarketingEventInput) { return this.create(input as Partial<MarketingEvent>); }
  setStatus(id: string, status: EventStatus) { return this.update(id, { status } as Partial<MarketingEvent>); }

  private async listChild<T>(table: string, eventId: string): Promise<T[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from(table).select('*').eq('event_id', eventId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as T[];
  }
  private async createChild<T>(table: string, input: Record<string, unknown>): Promise<T> {
    const tenantId = getCurrentTenantId();
    const { data, error } = await supabase.from(table).insert({ ...input, tenant_id: tenantId }).select().single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  listSpeakers(eventId: string) { return this.listChild<EventSpeaker>('event_speakers', eventId); }
  addSpeaker(input: Omit<EventSpeaker, 'id' | 'tenant_id' | 'created_at'>) { return this.createChild<EventSpeaker>('event_speakers', input); }
  listSponsors(eventId: string) { return this.listChild<EventSponsor>('event_sponsors', eventId); }
  addSponsor(input: Omit<EventSponsor, 'id' | 'tenant_id' | 'created_at'>) { return this.createChild<EventSponsor>('event_sponsors', input); }
  listSessions(eventId: string) { return this.listChild<EventSession>('event_sessions', eventId); }
  addSession(input: Omit<EventSession, 'id' | 'tenant_id' | 'created_at'>) { return this.createChild<EventSession>('event_sessions', input); }
}

class EventTicketService extends BaseService<EventTicketType> {
  constructor() { super('event_ticket_types'); }
  listForEvent(eventId: string) { return this.findAll({ filters: { event_id: eventId }, orderBy: 'price', ascending: true }); }
  createTicket(input: EventTicketTypeInput) { return this.create(input as Partial<EventTicketType>); }
}

class EventPromoService extends BaseService<EventPromoCode> {
  constructor() { super('event_promo_codes'); }
  listForEvent(eventId: string) { return this.findAll({ filters: { event_id: eventId }, orderBy: 'created_at', ascending: false }); }
  createPromo(input: EventPromoCodeInput) { return this.create(input as Partial<EventPromoCode>); }
}

class EventRegistrationService extends BaseService<EventRegistration> {
  constructor() { super('event_registrations'); }
  listForEvent(eventId: string) { return this.findAll({ filters: { event_id: eventId }, orderBy: 'created_at', ascending: false }); }

  /** تسجيل في فعالية عبر دالة DB (قائمة انتظار/دفع/QR) */
  async register(params: { eventId: string; ticketTypeId: string | null; fullName: string; email: string; promoCode?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('register_for_event', {
      p_event_id: params.eventId, p_ticket_type_id: params.ticketTypeId,
      p_full_name: params.fullName, p_email: params.email, p_promo_code: params.promoCode ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** Check-in بمسح QR (منع التكرار) */
  async checkinByQr(qrToken: string): Promise<CheckinResult> {
    const { data, error } = await supabase.rpc('checkin_by_qr', { p_qr_token: qrToken });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    return { result: row.result, registrant: row.registrant ?? null, regId: row.reg_id ?? null };
  }

  /** تسجيل حضور/engagement (يرفع Lead Score عند 80%+) */
  async setEngagement(registrationId: string, attendancePct: number, engagement: number): Promise<void> {
    const { error } = await supabase.rpc('set_event_engagement', {
      p_registration_id: registrationId, p_attendance_pct: attendancePct, p_engagement: engagement,
    });
    if (error) throw new Error(error.message);
  }

  /** تحديث حالة الدفع (بعد نجاح بوابة الدفع — hook) */
  markPaid(id: string, amount: number) {
    return this.update(id, { payment_status: 'paid', amount_paid: amount } as Partial<EventRegistration>);
  }
  /** ربط تسجيل بعميل (الوحدة 1) */
  linkLead(id: string, leadId: string) { return this.update(id, { lead_id: leadId } as Partial<EventRegistration>); }

  async kpis(eventId: string): Promise<EventKpis> {
    const { data, error } = await supabase.rpc('event_kpis', { p_event_id: eventId });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    const registered = Number(row.registered || 0);
    const checkedIn = Number(row.checked_in || 0);
    return {
      registered, waitlisted: Number(row.waitlisted || 0), checkedIn,
      revenue: Number(row.revenue || 0), leads: Number(row.leads || 0),
      attendanceRate: registered > 0 ? Math.round((checkedIn / registered) * 1000) / 10 : 0,
    };
  }

  /** QR كصورة SVG data-URI (توليد محلي — بدون تبعية خارجية) */
  qrDataUri(token: string): string {
    // شبكة رمزية حتمية مبنية من الرمز (تمثيل بصري، ليست QR ماسحة فعلية)
    const size = 21; const cell = 6;
    let hash = 0; for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    let rects = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const corner = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        const bit = corner ? ((x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
          (x >= size - 7) && (x === size - 7 || x === size - 1 || y === 0 || y === 6 || (x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4)) ||
          (y >= size - 7) && (x === 0 || x === 6 || y === size - 7 || y === size - 1 || (x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3))) ? 1 : 0)
          : (((hash >> ((x * 3 + y * 7) % 31)) & 1) ^ ((x + y) & 1));
        if (bit) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * cell}" height="${size * cell}" viewBox="0 0 ${size * cell} ${size * cell}"><rect width="100%" height="100%" fill="#fff"/><g fill="#0f172a">${rects}</g></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ثوابت مرجعية من التقرير
// ════════════════════════════════════════════════════════════════════════════

export const TICKET_TIER_LABEL: Record<TicketTier, string> = {
  early_bird: 'الحجز المبكر', general: 'عام', vip: 'VIP', group: 'مجموعة', press: 'صحافة/إعلام', free: 'مجاني',
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = { in_person: 'حضوري', virtual: 'افتراضي', hybrid: 'هجين' };

/** تسلسل التواصل قبل الحدث (من التقرير) */
export const PRE_EVENT_SEQUENCE = [
  { when: 'عند التسجيل (فوري)', content: 'تأكيد + كود QR + إضافة للتقويم' },
  { when: 'قبل أسبوعين', content: 'تذكير + تحديث الأجندة والمتحدثين' },
  { when: 'قبل يوم واحد', content: 'تذكير + الأجندة الكاملة + معلومات الوصول/الدخول' },
  { when: 'قبل ساعة (افتراضي)', content: 'رابط الدخول المبكر' },
];

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const eventService = new EventService();
export const eventTicketService = new EventTicketService();
export const eventPromoService = new EventPromoService();
export const eventRegistrationService = new EventRegistrationService();
