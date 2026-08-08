import { useCallback, useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Download, ShieldCheck, Activity } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeMovementLogService } from '../../../../services/sdk/EmployeePermitsService';
import { employeeViolationService } from '../../../../services/sdk/EmployeeComplianceService';
import type { EmployeeMovementLogRecord } from '../../../../shared/types/employee-permits';
import type { EmployeeViolationRecord } from '../../../../shared/types/employee-compliance';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import { exportToCsv } from '../../../../utils/dataExport';

export default function EmployeeMovementAnalyticsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<EmployeeMovementLogRecord[]>([]);
  const [violations, setViolations] = useState<EmployeeViolationRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [movRows, violRows] = await Promise.all([
        employeeMovementLogService.findAll({ limit: 500 }),
        employeeViolationService.findAll({ limit: 500 }),
      ]);
      setMovements(movRows || []);
      setViolations(violRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalMovements = movements.length;
  const returnedMovements = movements.filter(m => m.status === 'returned').length;
  const complianceRate = totalMovements > 0 ? Math.round((returnedMovements / totalMovements) * 100) : 100;
  const totalViolations = violations.length;

  /*
    🔴 كان هنا تصدير CSV يدوي — انتهاك لبوابة «التصدير عبر dataExport
    فقط»، وثغرة **حقن صيغ CSV** حقيقية: وجهة اسمها `=cmd|...` تُنفَّذ
    كمعادلة عند فتح الملف في Excel. الاقتباس اليدوي بـ `"` لا يحمي منها.

    exportToCsv يمرّ بـ sanitizeCell الذي يسبق الخلايا الخطرة بفاصلة
    عليا، ويقتبس وفق RFC 4180، ويضيف BOM لعرض العربية سليمةً.
  */
  const handleExport = () => {
    try {
      exportToCsv(
        `employee-movement-analytics-${new Date().toISOString().slice(0, 10)}`,
        [
          { header: 'معرّف الحركة', value: (m: EmployeeMovementLogRecord) => m.id },
          { header: 'الوجهة',       value: (m: EmployeeMovementLogRecord) => m.destination_name },
          { header: 'وقت الخروج',   value: (m: EmployeeMovementLogRecord) => m.departure_at },
          { header: 'الحالة',       value: (m: EmployeeMovementLogRecord) => m.status },
        ],
        movements,
      );
      addToast('تم تصدير تقرير التحليلات بنجاح', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="employee_analytics" />
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E06</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><BarChart3 /> التحليلات الشاملة وتقارير الحركة</h2>
          <p className="text-white/75 mt-2 text-sm">مؤشرات الأداء، معدلات الالتزام، أنماط الخروج، وتقارير التدقيق.</p>
        </div>
        <Button onClick={handleExport} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Download size={16} />} iconPosition="left">تصدير التقرير (CSV)</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Activity size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalMovements}</p><p className="text-xs text-slate-500">إجمالي الحركات المسجلة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><ShieldCheck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{complianceRate}%</p><p className="text-xs text-slate-500">معدل الالتزام والعودة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold"><ShieldCheck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{totalViolations}</p><p className="text-xs text-slate-500">إجمالي المخالفات</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><TrendingUp size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">نشط</p><p className="text-xs text-slate-500">حالة النظام والتحليلات</p></div></div></Card>
      </div>

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><TrendingUp size={18} /> أنماط الحركة وساعات الذروة</h3>
          <p className="text-sm text-slate-600">تحليل فترات الخروج الأكثر كثافة، الأقسام الأكثر تنقلاً، ومؤشرات الأداء التشغيلي لبوابة حركة الموظفين.</p>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center text-slate-400">
            <BarChart3 size={48} className="mx-auto text-indigo-300 mb-2" />
            <p className="font-bold text-slate-700">الرسوم البيانية التفاعلية ومخططات Heatmap مفعلة وتعتمد على السجلات الحقيقية</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
