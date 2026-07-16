/**
 * ════════════════════════════════════════════════════════════════
 *  MyPayrollPage - قسيمة الراتب للموظف
 *  ✅ إصلاح: infinite loading عندما لا يوجد employee record
 *  ✅ إصلاح: استخدام payrollRecordService (جدول payroll_records)
 *            بدلاً من payrollService (جدول payroll القديم)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { DollarSign, FileText, Loader2, Eye, X, TrendingUp, TrendingDown, Printer, CalendarDays } from 'lucide-react';
import { useAuthStore } from '../../core/stores';
import { employeeService, payrollRecordService, payrollPeriodService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { PayrollRecord } from '../../shared/types/payroll';
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUS_COLORS, formatCurrency } from '../../utils/payrollUtils';

export default function MyPayrollPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null); // null = لم يُحدَّد بعد
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // المرحلة 1: جلب employee_id للمستخدم الحالي
  useEffect(() => {
    if (!user?.id) {
      // لا يوجد مستخدم — أوقف التحميل
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const employees = await employeeService.findAll({
          filters: { user_id: user.id },
          limit: 1,
        });

        if (employees.length > 0) {
          setEmployeeId(employees[0].id);
        } else {
          // لا يوجد سجل موظف — أوقف التحميل وأظهر الحالة الفارغة
          setEmployeeId(''); // سلسلة فارغة = تم البحث ولا يوجد
          setLoading(false);
        }
      } catch (err) {
        console.error('خطأ في جلب بيانات الموظف:', getErrorMessage(err));
        setError('تعذر جلب بيانات الموظف');
        setLoading(false);
      }
    })();
  }, [user?.id]);

  // المرحلة 2: جلب الرواتب بعد معرفة employee_id
  useEffect(() => {
    // employeeId = null → لا زلنا ننتظر المرحلة 1
    // employeeId = '' → لا يوجد سجل موظف
    if (employeeId === null) return;
    if (employeeId === '') {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        // جلب سجلات الراتب من جدول payroll_records
        const rawRecords = await payrollRecordService.findAll({
          filters: { employee_id: employeeId },
          orderBy: 'created_at',
          ascending: false,
        });

        // جلب فترات الرواتب لإضافة الأسماء
        let periodMap = new Map<string, any>();
        try {
          const periods = await payrollPeriodService.findAllPeriods();
          periodMap = new Map((periods || []).map((p: any) => [p.id, p]));
        } catch {
          // الفترات اختيارية — نكمل بدونها
        }

        const enriched = rawRecords.map((r: any) => ({
          ...r,
          payroll_periods: periodMap.get(r.period_id) || null,
        }));

        setRecords(enriched as unknown as PayrollRecord[]);
      } catch (err) {
        console.error('خطأ في جلب الرواتب:', getErrorMessage(err));
        setError('تعذر جلب سجلات الرواتب');
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  // ─── حالة التحميل ───
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin text-emerald-500 mb-3" size={40} />
        <p className="text-slate-500">جاري التحميل...</p>
      </div>
    );
  }

  // ─── حالة الخطأ ───
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 flex items-center justify-center mb-3">
          <X size={28} className="text-red-400" />
        </div>
        <p className="font-semibold text-slate-700">{error}</p>
        <p className="text-sm text-slate-400 mt-1">تحقق من اتصالك وحاول مجدداً</p>
      </div>
    );
  }

  const totalEarned = records.reduce((s, r) => s + (r.net_salary || 0), 0);
  const totalDeductions = records.reduce((s, r) => s + (r.total_deductions || 0), 0);
  const latestPayroll = records[0];
  const previousPayroll = records[1];
  const payrollDelta = latestPayroll && previousPayroll ? (latestPayroll.net_salary || 0) - (previousPayroll.net_salary || 0) : 0;
  const payrollDeltaPercent = previousPayroll?.net_salary ? Math.round((payrollDelta / previousPayroll.net_salary) * 100) : 0;
  const averageNet = records.length ? Math.round(totalEarned / records.length) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* الهيدر */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <DollarSign className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">رواتبي</h1>
          <p className="text-sm text-slate-500">سجل الرواتب والقسائم</p>
        </div>
      </div>

      {/* ملخص */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
          <TrendingUp size={20} className="mb-2 opacity-80" />
          <p className="text-2xl font-bold">{formatCurrency(totalEarned)}</p>
          <p className="text-sm opacity-90">إجمالي الصافي</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <FileText size={20} className="mb-2 text-blue-500" />
          <p className="text-2xl font-bold text-slate-900">{records.length}</p>
          <p className="text-sm text-slate-500">قسائم الرواتب</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <TrendingDown size={20} className="mb-2 text-red-500" />
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalDeductions)}</p>
          <p className="text-sm text-slate-500">إجمالي الاستقطاعات</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <CalendarDays size={20} className="mb-2 text-indigo-500" />
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(averageNet)}</p>
          <p className="text-sm text-slate-500">متوسط الصافي</p>
        </div>
      </div>

      {latestPayroll && previousPayroll && (
        <div className={`mb-6 rounded-2xl border p-4 flex items-center justify-between gap-3 ${payrollDelta >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <div>
            <p className="text-sm font-bold text-slate-800">مقارنة بآخر قسيمة سابقة</p>
            <p className="text-xs text-slate-500 mt-1">تساعدك على فهم تغير صافي الراتب بين الفترات.</p>
          </div>
          <div className={`text-left font-extrabold ${payrollDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            <p>{payrollDelta >= 0 ? '+' : ''}{formatCurrency(payrollDelta)}</p>
            <p className="text-xs">{payrollDeltaPercent >= 0 ? '+' : ''}{payrollDeltaPercent}%</p>
          </div>
        </div>
      )}

      {/* القائمة */}
      {records.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <FileText size={28} className="text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700">لا توجد قسائم رواتب</p>
          <p className="text-sm text-slate-400 mt-1">ستظهر هنا قسائم راتبك عند صرفها</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {records.map((r) => {
            const period = (r as any).payroll_periods;
            const statusColor = PAYROLL_STATUS_COLORS[r.status] || PAYROLL_STATUS_COLORS.draft;
            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <DollarSign size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{period?.name || 'فترة رواتب'}</p>
                    <p className="text-xs text-slate-500">
                      {period?.payment_date
                        ? format(new Date(period.payment_date), 'd MMMM yyyy', { locale: ar })
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-left">
                    <p className="font-bold text-slate-900">{formatCurrency(r.net_salary || 0)}</p>
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5"
                      style={{ background: statusColor.bg, color: statusColor.text }}
                    >
                      {PAYROLL_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedRecord(r)}
                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    <Eye size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: تفاصيل القسيمة */}
      {selectedRecord && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">قسيمة الراتب</h3>
                <p className="text-sm text-slate-500">
                  {(selectedRecord as any).payroll_periods?.name || ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100" title="طباعة">
                  <Printer size={18} />
                </button>
                <button onClick={() => setSelectedRecord(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <PaySlipRow label="الراتب الأساسي" value={formatCurrency(selectedRecord.basic_salary || 0)} color="text-slate-900" />
              <PaySlipRow label="إجمالي البدلات" value={`+ ${formatCurrency(selectedRecord.total_allowances || 0)}`} color="text-emerald-600" />
              <PaySlipRow label="الوقت الإضافي" value={`+ ${formatCurrency(selectedRecord.overtime_pay || 0)}`} color="text-emerald-600" />
              <PaySlipRow label="الجوائز والمكافآت" value={`+ ${formatCurrency(selectedRecord.bonus_amount || 0)}`} color="text-emerald-600" />
              <PaySlipRow label="إجمالي الاستقطاعات" value={`- ${formatCurrency(selectedRecord.total_deductions || 0)}`} color="text-red-600" />
              <div className="border-t border-slate-200 pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">صافي الراتب</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {formatCurrency(selectedRecord.net_salary || 0)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-slate-400">أيام العمل</p>
                <p className="font-semibold text-slate-700">{selectedRecord.working_days ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">أيام الحضور</p>
                <p className="font-semibold text-slate-700">{selectedRecord.present_days ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">أيام الغياب</p>
                <p className="font-semibold text-slate-700">{selectedRecord.absent_days ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaySlipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
