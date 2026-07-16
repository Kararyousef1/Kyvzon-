/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperService - خدمة البوابة والحركة
 *  Domain: Gatekeeper — تشمل الجلسات, الزوار, الحركة, الاستراحات
 *
 *  ✅ إصلاح: جداول gatekeeper_sessions, gatekeeper_visitor_logs,
 *             gatekeeper_visitors بدون عمود tenant_id في قاعدة البيانات.
 *             نستخدم skipTenantFilter=true لكل عمليات هذه الجداول
 *             حتى لا يضيف BaseService شرط WHERE tenant_id=? الذي
 *             يسبب إرجاع صفر نتائج أو خطأ.
 *
 *  ✅ إصلاح: جدول movements_log يملك tenant_id → نبقيه بدون skip.
 *
 *  ملاحظة أمنية: الحماية في هذه الجداول تعتمد على RLS policies
 *  المبنية على created_by / auth.uid() بدلاً من tenant_id.
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

// ═══════════════════════════════════════════════════
//  مساعد: BaseService بدون tenant filter
//  للجداول التي لا تملك عمود tenant_id
// ═══════════════════════════════════════════════════

class NoTenantBaseService<T = any> extends BaseService<T> {
  constructor(tableName: string) {
    super(tableName);
  }

  /** تجاوز addTenantFilter — هذا الجدول بدون tenant_id */
  protected override addTenantFilter(query: any, _skipTenantFilter?: boolean): any {
    return query; // لا نضيف أي فلتر
  }

  /** تجاوز injectTenantId — لا نحقن tenant_id في INSERT */
  protected override injectTenantId(data: Partial<T>): Record<string, unknown> {
    const { tenant_id: _, ...cleanData } = data as Record<string, unknown>;
    return cleanData; // نحذف tenant_id إن وُجد، لكن لا نضيف جديداً
  }
}

// ─── Gatekeeper Sessions ─────────────────────────
// الجدول: gatekeeper_sessions — بدون tenant_id

class GatekeeperSessionService extends NoTenantBaseService<GatekeeperSessionRecord> {
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
// الجدول: gatekeeper_visitor_logs — بدون tenant_id

class GatekeeperVisitorLogService extends NoTenantBaseService<GatekeeperVisitorLogRecord> {
  constructor() {
    super('gatekeeper_visitor_logs');
  }

  async findVisitorLogs(options?: {
    sessionId?: string;
    fromDate?: string;
  }): Promise<GatekeeperVisitorLogRecord[]> {
    const filters: Record<string, unknown> = {};
    if (options?.sessionId) filters.session_id = options.sessionId;

    return this.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: 'check_in_time',
      ascending: false,
    });
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

  async countVisitorsSince(fromDate: string): Promise<number> {
    try {
      // هذا الجدول بدون tenant_id — نستعلم مباشرة
      const { count, error } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', fromDate);
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
