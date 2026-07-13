/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperService - خدمة البوابة والحركة
 *  Domain: Gatekeeper — تشمل الجلسات, الزوار, الحركة, الاستراحات
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';
import type {
  GatekeeperSessionRecord,
  GatekeeperVisitorLogRecord,
  MovementLogRecord,
  EmployeeBreakRecord,
} from '../../shared/types/sdk';

// ─── Gatekeeper Sessions ─────────────────────────

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

  async updateHandoverStatus(id: string, status: string, tempPin?: string): Promise<GatekeeperSessionRecord> {
    const data: Record<string, unknown> = { handover_status: status };
    if (tempPin) data.temp_pin = tempPin;
    return this.update(id, data as unknown as Partial<GatekeeperSessionRecord>);
  }
}

// ─── Visitor Logs ────────────────────────────────

class GatekeeperVisitorLogService extends BaseService<GatekeeperVisitorLogRecord> {
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

  async createVisitorLog(data: Partial<GatekeeperVisitorLogRecord>): Promise<GatekeeperVisitorLogRecord> {
    return this.create(data);
  }

  /** @deprecated استخدم delete */
  async deleteVisitorLog(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async updateVisitorLogStatus(id: string, status: string): Promise<GatekeeperVisitorLogRecord> {
    return this.update(id, {
      status,
      check_out_time: new Date().toISOString(),
    } as unknown as Partial<GatekeeperVisitorLogRecord>);
  }

  async countVisitorsSince(fromDate: string): Promise<number> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', fromDate);
      const tenantId = getCurrentTenantId();
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { count, error } = await query;
      return error ? 0 : (count || 0);
    } catch { return 0; }
  }
}

// ─── Movements Log ───────────────────────────────

class MovementLogService extends BaseService<MovementLogRecord> {
  constructor() {
    super('movements_log');
  }

  async findMovements(options?: {
    fromDate?: string;
    employeeId?: string;
  }): Promise<MovementLogRecord[]> {
    const filters: Record<string, unknown> = {};
    if (options?.employeeId) filters.employee_id = options.employeeId;
    return this.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: 'departure_at',
      ascending: false,
    });
  }

  async recordMovement(data: Partial<MovementLogRecord>): Promise<MovementLogRecord> {
    return this.create(data);
  }

  async recordReturn(id: string | number, notes?: string): Promise<MovementLogRecord> {
    return this.update(String(id), {
      returned_at: new Date().toISOString(),
      notes: notes || null,
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
    } catch { return 0; }
  }
}

// ─── Employee Breaks ─────────────────────────────

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

  async updateBreakStatus(id: string, status: string, outTime?: string): Promise<EmployeeBreakRecord> {
    const data: Record<string, unknown> = { status };
    if (outTime) data.out_time = outTime;
    return this.update(id, data as unknown as Partial<EmployeeBreakRecord>);
  }
}

export const gatekeeperSessionService = new GatekeeperSessionService();
export const gatekeeperVisitorLogService = new GatekeeperVisitorLogService();
export const movementLogService = new MovementLogService();
export const employeeBreakService = new EmployeeBreakService();
