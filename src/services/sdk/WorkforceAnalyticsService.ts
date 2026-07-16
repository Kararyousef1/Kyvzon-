/**
 * ════════════════════════════════════════════════════════════════
 *  WorkforceAnalyticsService - مؤشرات القوى العاملة لبوابة HR
 *  يقرأ عبر خدمات SDK فقط ولا يستخدم Supabase مباشرة من الصفحات.
 * ════════════════════════════════════════════════════════════════
 */

import { employeeService } from './EmployeeService';
import { attendanceSummaryService } from './AttendanceService';
import { incidentService } from './IncidentService';
import { employeeContractService } from './ContractService';
import { criticalPositionService, successionCandidateService } from './SuccessionService';

export interface WorkforceSummary {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  attendanceRate: number;
  absenteeismRate: number;
  lateRate: number;
  openIncidents: number;
  contractsExpiring30Days: number;
  criticalPositions: number;
  successionCoverageRate: number;
  generatedAt: string;
}

const withinDays = (date: string | undefined, days: number): boolean => {
  if (!date) return false;
  const now = new Date();
  const target = new Date(date);
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000);
  return diff >= 0 && diff <= days;
};

export const workforceAnalyticsService = {
  async getSummary(): Promise<WorkforceSummary> {
    const [employees, attendance, incidents, contracts, positions] = await Promise.all([
      employeeService.findAll(),
      attendanceSummaryService.findAll({ orderBy: 'shift_date', ascending: false, limit: 500 }),
      incidentService.findAll(),
      employeeContractService.findAll({ orderBy: 'end_date', ascending: true }),
      criticalPositionService.findAll({ filters: { status: 'active' } }),
    ]);

    const totalEmployees = employees.length;
    const activeEmployees = employees.filter((e: any) => e.is_active !== false).length;
    const inactiveEmployees = Math.max(totalEmployees - activeEmployees, 0);

    const attendanceRows = attendance || [];
    const presentRows = attendanceRows.filter((a: any) => !['غائب', 'absent'].includes(String(a.status || '').toLowerCase()));
    const absentRows = attendanceRows.filter((a: any) => ['غائب', 'absent'].includes(String(a.status || '').toLowerCase()));
    const lateRows = attendanceRows.filter((a: any) => Number(a.late_minutes || 0) > 0 || String(a.status || '').includes('متأخر'));
    const attendanceRate = attendanceRows.length ? Math.round((presentRows.length / attendanceRows.length) * 100) : 0;
    const absenteeismRate = attendanceRows.length ? Math.round((absentRows.length / attendanceRows.length) * 100) : 0;
    const lateRate = attendanceRows.length ? Math.round((lateRows.length / attendanceRows.length) * 100) : 0;

    const openIncidents = incidents.filter((i: any) => !['resolved', 'closed', 'مغلق', 'تم الحل'].includes(String(i.status || '').toLowerCase())).length;
    const contractsExpiring30Days = contracts.filter((c: any) => c.status === 'active' && withinDays(c.end_date, c.renewal_notice_days || 30)).length;

    const criticalPositions = positions.filter((p: any) => ['high', 'critical'].includes(p.risk_level)).length;
    const candidateSets = await Promise.all(positions.map((p: any) => successionCandidateService.findByPosition(p.id).catch(() => [])));
    const coveredPositions = candidateSets.filter((list) => list.length > 0).length;
    const successionCoverageRate = positions.length ? Math.round((coveredPositions / positions.length) * 100) : 0;

    return {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      attendanceRate,
      absenteeismRate,
      lateRate,
      openIncidents,
      contractsExpiring30Days,
      criticalPositions,
      successionCoverageRate,
      generatedAt: new Date().toISOString(),
    };
  },
};
