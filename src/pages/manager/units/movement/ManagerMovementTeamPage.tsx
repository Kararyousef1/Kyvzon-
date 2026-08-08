/**
 * ManagerMovementTeamPage — حركة الفريق
 *
 * وحدة «الحركة» داخل بوابة المدير: من خرج · متى · هل عاد · كم تأخّر.
 * الفلترة بالفريق تجري في القاعدة (is_in_my_team).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Download, MapPin, Users } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import {
  managerMovementUnitService,
  type ManagerTeamKpis,
  type ManagerTeamMovement,
} from '../../../../services/sdk/ManagerMovementUnitService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { exportToCsv } from '../../../../utils/dataExport';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ManagerUnitNav } from '../ManagerUnitNav';

const PERIODS = [
  { days: 7, label: '٧ أيام' },
  { days: 30, label: '٣٠ يوماً' },
  { days: 90, label: '٩٠ يوماً' },
];

const STATUS_LABELS: Record<string, string> = {
  out: 'خارج الموقع',
  returned: 'عاد',
  overdue: 'متأخر',
  violated: 'مخالفة',
};

function fmt(value: string | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'dd MMM • HH:mm', { locale: ar });
  } catch {
    return '—';
  }
}

export default function ManagerMovementTeamPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<ManagerTeamMovement[]>([]);
  const [kpis, setKpis] = useState<ManagerTeamKpis | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [log, k] = await Promise.all([
        managerMovementUnitService.findTeamLog(days),
        managerMovementUnitService.getTeamKpis(days),
      ]);
      setRows(log);
      setKpis(k);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const overdueCount = useMemo(
    () => rows.filter((r) => r.overdueMinutes > 0).length,
    [rows],
  );

  const handleExport = () => {
    if (rows.length === 0) {
      addToast('لا بيانات للتصدير', 'error');
      return;
    }
    // exportToCsv يعالج ترميز العربية ويحمي من حقن صيغ Excel
    exportToCsv<ManagerTeamMovement>(
      `حركة-الفريق-${days}يوم`,
      [
        { header: 'الموظف', value: (r) => r.employeeName },
        { header: 'الوجهة', value: (r) => r.destination },
        { header: 'الخروج', value: (r) => fmt(r.departureAt) },
        { header: 'العودة المتوقعة', value: (r) => fmt(r.expectedReturn) },
        { header: 'العودة الفعلية', value: (r) => fmt(r.actualReturn) },
        { header: 'الحالة', value: (r) => STATUS_LABELS[r.status] ?? r.status },
        { header: 'التأخير (دقيقة)', value: (r) => String(r.overdueMinutes) },
      ],
      rows,
    );
  };

  return (
    <div className="space-y-4" dir="rtl">
      <ManagerUnitNav unitKey="movement" />

      <div className="bg-gradient-to-l from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
        <p className="text-white/60 text-sm font-semibold">وحدة الحركة • بوابة المدير</p>
        <h1 className="text-2xl font-black mt-1">حركة الفريق</h1>
        <p className="text-white/70 text-sm mt-1">
          سجل خروج وعودة موظفي فريقك خلال المدة المختارة.
        </p>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'حجم الفريق', value: kpis.teamSize, icon: Users, tone: 'text-slate-600' },
            { label: 'حركات المدة', value: kpis.movementsPeriod, icon: Activity, tone: 'text-indigo-600' },
            { label: 'خارج الموقع الآن', value: kpis.currentlyOut, icon: MapPin, tone: 'text-sky-600' },
            { label: 'مخالفات المدة', value: kpis.violationsPeriod, icon: AlertTriangle, tone: 'text-rose-600' },
          ].map((k) => (
            <Card key={k.label} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">{k.label}</span>
                <k.icon size={16} className={k.tone} />
              </div>
              <p className={`text-2xl font-black mt-1 ${k.tone}`}>{k.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  days === p.days
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={handleExport} icon={<Download size={14} />}>
            تصدير CSV
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-slate-400 text-sm">جارٍ التحميل…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Activity size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="font-bold text-slate-700">لا حركات في هذه المدة</p>
          <p className="text-sm text-slate-500 mt-1">
            لم يسجّل أي من موظفي فريقك خروجاً خلال آخر {days} يوماً.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {overdueCount > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs font-bold text-amber-800">
              <AlertTriangle size={13} className="inline ml-1" />
              {overdueCount} حركة تجاوزت وقت العودة المتوقع
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="p-3 text-right font-bold">الموظف</th>
                  <th className="p-3 text-right font-bold">الوجهة</th>
                  <th className="p-3 text-right font-bold">الخروج</th>
                  <th className="p-3 text-right font-bold">العودة المتوقعة</th>
                  <th className="p-3 text-right font-bold">العودة الفعلية</th>
                  <th className="p-3 text-right font-bold">الحالة</th>
                  <th className="p-3 text-right font-bold">التأخير</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.logId} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-700">{r.employeeName}</td>
                    <td className="p-3 text-slate-600">{r.destination}</td>
                    <td className="p-3 text-slate-500 text-xs">{fmt(r.departureAt)}</td>
                    <td className="p-3 text-slate-500 text-xs">{fmt(r.expectedReturn)}</td>
                    <td className="p-3 text-slate-500 text-xs">{fmt(r.actualReturn)}</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-lg font-bold ${
                          r.status === 'returned'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.status === 'out'
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.overdueMinutes > 0 ? (
                        <span className="text-xs font-black text-rose-600">
                          <Clock size={12} className="inline ml-1" />
                          {r.overdueMinutes} د
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
