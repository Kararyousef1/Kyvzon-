import { supabase } from '../supabase/supabase';

export interface AttendanceNotificationProfile {
  id: string;
  full_name: string | null;
  manager_id?: string | null;
}

export interface AttendanceNotificationSummary {
  employee_id: string;
  shift_date: string;
  status: string;
  late_minutes?: number | null;
}

class AttendanceNotificationQueryService {
  async findEmployeeName(employeeId: string): Promise<string | null> {
    const { data, error } = await supabase.from('profiles')
      .select('full_name')
      .eq('id', employeeId)
      .single();
    if (error) throw new Error(error.message);
    return data?.full_name ?? null;
  }

  async findEmployeeSummaries(employeeId: string, startDate: string, endDate: string): Promise<AttendanceNotificationSummary[]> {
    const { data, error } = await supabase.from('attendance_summary')
      .select('employee_id,shift_date,status,late_minutes')
      .eq('employee_id', employeeId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .order('shift_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AttendanceNotificationSummary[];
  }

  async findTeam(managerId: string, excludeDeveloper = false): Promise<AttendanceNotificationProfile[]> {
    let query = supabase.from('profiles')
      .select('id,full_name,manager_id')
      .eq('manager_id', managerId);
    if (excludeDeveloper) query = query.not('role', 'eq', 'developer');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AttendanceNotificationProfile[];
  }

  async findSummariesForEmployees(employeeIds: string[], startDate: string, endDate?: string): Promise<AttendanceNotificationSummary[]> {
    let query = supabase.from('attendance_summary')
      .select('employee_id,shift_date,status,late_minutes')
      .gte('shift_date', startDate)
      .in('employee_id', employeeIds);
    if (endDate) query = query.lte('shift_date', endDate);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AttendanceNotificationSummary[];
  }

  async findDailySummaries(date: string, employeeIds?: string[]): Promise<AttendanceNotificationSummary[]> {
    let query = supabase.from('attendance_summary')
      .select('employee_id,shift_date,status,late_minutes')
      .eq('shift_date', date);
    if (employeeIds) query = query.in('employee_id', employeeIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AttendanceNotificationSummary[];
  }

  async findActiveEmployees(): Promise<AttendanceNotificationProfile[]> {
    const { data, error } = await supabase.from('profiles')
      .select('id,full_name,manager_id')
      .eq('status', 'active');
    if (error) throw new Error(error.message);
    return (data ?? []) as AttendanceNotificationProfile[];
  }
}

export const attendanceNotificationQueryService = new AttendanceNotificationQueryService();
