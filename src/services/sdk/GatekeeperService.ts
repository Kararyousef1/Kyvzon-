/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperService - خدمة البوابة والحركة
 *  Domain: Gatekeeper — تشمل الجلسات, الزوار, الحركة, الاستراحات
 *
 *  ★★★ تصحيح جوهري (0350) — الترويسة السابقة كانت **خاطئة**:
 *
 *    كانت تقول: «جداول gatekeeper_sessions و gatekeeper_visitor_logs
 *    و gatekeeper_visitors بدون عمود tenant_id في قاعدة البيانات»
 *    و«الحماية تعتمد RLS المبنية على created_by / auth.uid()».
 *
 *    **كلا الادعاءين غير صحيح.** المُحقَّق على Postgres:
 *      gatekeeper_sessions.tenant_id      uuid → tenants(id) CASCADE
 *      gatekeeper_visitor_logs.tenant_id  uuid → tenants(id) CASCADE
 *      gatekeeper_visitors.tenant_id      uuid
 *    ولا سياسة واحدة تذكر `created_by` — السياسات تُرشّح بـtenant_id.
 *
 *    وبناءً على ذلك الوهم كان `NoTenantBaseService` **يحذف tenant_id
 *    عند الإدراج**، والسياسة القديمة كانت:
 *      ((tenant_id IS NULL) OR (tenant_id = current_user_tenant_id()))
 *
 *    فكل صفّ يُكتب بـNULL ⇒ الفرع الأول يجعله مرئياً **لكل مستأجري
 *    المنصّة**. مُثبَت بدور `authenticated` حقيقي: مدير موارد الشركة (ب)
 *    قرأ سجلّ زوّار الشركة (أ) — الاسم والهاتف ورقم الهوية والمضيف.
 *
 *    0350 جعل العمود NOT NULL بقيمة افتراضية من current_user_tenant_id()
 *    وحذف الفرع المتساهل من السياسات. و`NoTenantBaseService` **أُزيل**:
 *    الجداول الثلاثة صارت تستعمل `BaseService` القياسي بحقن tenant_id.
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId, type FindAllOptions } from './BaseService';
import { supabase } from '../supabase/supabase';
import type {
  GatekeeperSessionRecord,
  GatekeeperVisitorLogRecord,
  MovementLogRecord,
  EmployeeBreakRecord,
} from '../../shared/types/sdk';

// ★★★ `NoTenantBaseService` أُزيل في 0350.
//   كان يحذف `tenant_id` عند الإدراج بناءً على اعتقاد خاطئ بأن الجداول
//   لا تحويه — فأنتج صفوفاً بلا مالك تراها كل المستأجرين.
//   الجداول الثلاثة تستعمل الآن `BaseService` القياسي.

// ─── Gatekeeper Sessions ─────────────────────────
// الجدول: gatekeeper_sessions — يحوي tenant_id (إلزامي منذ 0350)

class GatekeeperSessionService extends BaseService<GatekeeperSessionRecord> {
  constructor() {
    super('gatekeeper_sessions');
  }

  async findActiveSessions(): Promise<GatekeeperSessionRecord[]> {
    return this.findAll({
      filters: { is_active: true },
      orderBy: 'started_at',
      ascending: false,
    });
  }

  async findEndedSessions(): Promise<GatekeeperSessionRecord[]> {
    return this.findAll({
      filters: { is_active: false },
      orderBy: 'ended_at',
      ascending: false,
    });
  }

  async createSession(data: Partial<GatekeeperSessionRecord>): Promise<GatekeeperSessionRecord> {
    return this.create(data);
  }

  async endSession(id: string): Promise<GatekeeperSessionRecord> {
    return this.update(id, {
      is_active: false,
      ended_at: new Date().toISOString(),
    } as unknown as Partial<GatekeeperSessionRecord>);
  }

  async updateHandoverStatus(
    id: string,
    status: string,
    tempPin?: string,
  ): Promise<GatekeeperSessionRecord> {
    const data: Record<string, unknown> = { handover_status: status };
    if (tempPin) data.temp_pin = tempPin;
    return this.update(id, data as unknown as Partial<GatekeeperSessionRecord>);
  }
}

// ─── Visitor Logs ────────────────────────────────
// الجدول: gatekeeper_visitor_logs — يحوي tenant_id (إلزامي منذ 0350)

class GatekeeperVisitorLogService extends BaseService<GatekeeperVisitorLogRecord> {
  constructor() {
    super('gatekeeper_visitor_logs');
  }

  /**
   * ★★★ إصلاح 0350 — `fromDate` كان يُمرَّر ويُهمَل تماماً.
   *
   *   الشيفرة السابقة أعلنت المُعامل في التوقيع ثم لم تستعمله:
   *     if (options?.sessionId) filters.session_id = options.sessionId;
   *     // ولا سطر واحد يمسّ fromDate
   *
   *   والصفحة تستدعيها بـ`{ fromDate }` لكل نطاق («اليوم» · «7 أيام» …).
   *   مُثبَت على Postgres (3 سجلات: اثنان قبل أكثر من سنة وواحد اليوم):
   *     بلا مرشّح => 3 صفوف · بالمرشّح => 1
   *   ⇒ مُرشِّح المدة لم يكن له أثر على تبويب الزوّار إطلاقاً.
   *
   *   ★ `BaseService.findAll` يحوّل كل مُرشِّح إلى `.eq()` فلا يدعم
   *     النطاقات — لذلك نستعمل `findWhere` بـ`gte`/`lte`.
   */
  async findVisitorLogs(options?: {
    sessionId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<GatekeeperVisitorLogRecord[]> {
    const conditions: Array<{
      column: string;
      operator?: 'eq' | 'gte' | 'lte';
      value: unknown;
    }> = [];
    if (options?.sessionId) {
      conditions.push({ column: 'session_id', value: options.sessionId });
    }
    if (options?.fromDate) {
      conditions.push({ column: 'check_in_time', operator: 'gte', value: options.fromDate });
    }
    if (options?.toDate) {
      conditions.push({ column: 'check_in_time', operator: 'lte', value: options.toDate });
    }

    if (conditions.length > 0) {
      return this.findWhere(conditions, {
        orderBy: 'check_in_time',
        ascending: false,
      });
    }

    return this.findAll({ orderBy: 'check_in_time', ascending: false });
  }

  async createVisitorLog(
    data: Partial<GatekeeperVisitorLogRecord>,
  ): Promise<GatekeeperVisitorLogRecord> {
    return this.create(data);
  }

  /** @deprecated استخدم delete */
  async deleteVisitorLog(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async updateVisitorLogStatus(
    id: string,
    status: string,
  ): Promise<GatekeeperVisitorLogRecord> {
    return this.update(id, {
      status,
      check_out_time: new Date().toISOString(),
    } as unknown as Partial<GatekeeperVisitorLogRecord>);
  }

  /**
   * ★★★ إصلاح 0350 — كان تسريباً ثانياً بين المستأجرين.
   *
   *   التعليق السابق «هذا الجدول بدون tenant_id — نستعلم مباشرة» خاطئ:
   *   العمود موجود ومرتبط بـ`tenants(id)`. والاستعلام المباشر بلا
   *   ترشيح كان يعدّ زوّار **كل** الشركات في رقم واحد.
   *
   *   الآن يُرشَّح بمستأجر المستخدم صراحةً — ودفاعاً في العمق فوق RLS.
   */
  async countVisitorsSince(fromDate: string): Promise<number> {
    try {
      const tenantId = getCurrentTenantId();
      let query = supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', fromDate);
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { count, error } = await query;
      return error ? 0 : (count || 0);
    } catch {
      return 0;
    }
  }
}

// ─── Movements Log ───────────────────────────────
// الجدول: movements_log — يملك tenant_id → نستخدم BaseService العادي

class MovementLogService extends BaseService<MovementLogRecord> {
  constructor() {
    super('movements_log');
  }

  async findMovements(options?: {
    fromDate?: string;
    employeeId?: string;
  }): Promise<MovementLogRecord[]> {
    const conditions: Array<{ column: string; operator?: 'eq' | 'gte'; value: unknown }> = [];
    if (options?.employeeId) conditions.push({ column: 'employee_id', value: options.employeeId });
    if (options?.fromDate) conditions.push({ column: 'departure_at', operator: 'gte', value: options.fromDate });

    if (conditions.length > 0) {
      return this.findWhere(conditions, { orderBy: 'departure_at', ascending: false });
    }

    return this.findAll({ orderBy: 'departure_at', ascending: false });
  }

  async findActiveMovements(fromDate?: string): Promise<MovementLogRecord[]> {
    const conditions: Array<{ column: string; operator?: 'eq' | 'gte' | 'is'; value: unknown }> = [
      { column: 'returned_at', operator: 'is', value: null },
    ];
    if (fromDate) conditions.push({ column: 'departure_at', operator: 'gte', value: fromDate });
    return this.findWhere(conditions, { orderBy: 'departure_at', ascending: false });
  }

  async findRouteViolations(fromDate?: string): Promise<MovementLogRecord[]> {
    const conditions: Array<{ column: string; operator?: 'eq' | 'gte'; value: unknown }> = [
      { column: 'route_violation', value: true },
    ];
    if (fromDate) conditions.push({ column: 'departure_at', operator: 'gte', value: fromDate });
    return this.findWhere(conditions, { orderBy: 'departure_at', ascending: false });
  }

  async recordMovement(data: Partial<MovementLogRecord>): Promise<MovementLogRecord> {
    return this.create({
      ...data,
      departure_at: data.departure_at || new Date().toISOString(),
      route_violation: data.route_violation ?? false,
    });
  }

  async recordReturn(id: string | number, notes?: string, actualLocation?: string): Promise<MovementLogRecord> {
    const routeViolation = Boolean(notes?.includes('مخالفة مسار') || notes?.includes('[مخالفة مسار'));
    return this.update(String(id), {
      returned_at: new Date().toISOString(),
      return_notes: notes || null,
      notes: notes || null,
      actual_location: actualLocation,
      route_violation: routeViolation,
      updated_at: new Date().toISOString(),
    } as unknown as Partial<MovementLogRecord>);
  }

  async countMovementsSince(fromDate: string): Promise<number> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .gte('departure_at', fromDate);
      const tenantId = getCurrentTenantId();
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { count, error } = await query;
      return error ? 0 : (count || 0);
    } catch {
      return 0;
    }
  }
}

// ─── Employee Breaks ─────────────────────────────
// الجدول: employee_breaks — يملك tenant_id → BaseService العادي

class EmployeeBreakService extends BaseService<EmployeeBreakRecord> {
  constructor() {
    super('employee_breaks');
  }

  async findActiveBreaks(): Promise<EmployeeBreakRecord[]> {
    return this.findAll({
      filters: { status: 'active' },
      orderBy: 'started_at',
      ascending: false,
    });
  }

  async updateBreakStatus(
    id: string,
    status: string,
    outTime?: string,
  ): Promise<EmployeeBreakRecord> {
    const data: Record<string, unknown> = { status };
    if (outTime) data.out_time = outTime;
    return this.update(id, data as unknown as Partial<EmployeeBreakRecord>);
  }
}

export const gatekeeperSessionService    = new GatekeeperSessionService();
export const gatekeeperVisitorLogService = new GatekeeperVisitorLogService();
export const movementLogService          = new MovementLogService();
export const employeeBreakService        = new EmployeeBreakService();
