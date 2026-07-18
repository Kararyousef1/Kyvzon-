import { payrollService } from './PayrollService';
import { generalLedgerService } from './GeneralLedgerService';

export async function syncPayrollToGL(employeeId: string, month: number, year: number) {
  const payrolls = await payrollService.findPayrollByEmployee(employeeId);
  for (const p of payrolls) {
    if (p.month === month && p.year === year) {
      await generalLedgerService.createJournal({
        entry_number: `PAYROLL-${employeeId}-${year}-${month}`,
        entry_date: new Date(year, month - 1, 1).toISOString().slice(0, 10),
        description: `راتب الموظف ${employeeId} لشهر ${month}/${year}`,
        reference: `payroll_sync`,
        total_debit: p.total_salary || 0,
        total_credit: p.total_salary || 0,
        status: 'posted',
        created_by: 'system',
        tenant_id: p.tenant_id || '',
      });
    }
  }
}
