/**
 * SupervisorMovementShiftPage — حركة الوردية
 *
 * وحدة «الحركة» في بوابة المشرف. يتابع من خرج ومن لم يعد ومن تأخّر.
 *
 * ⚠️ لا أزرار اعتماد هنا عمداً: الإذن بالخروج قرار إداري يخصّ المدير.
 * المشرف يتابع التنفيذ اليومي. مايجريشن 0307 يفرض هذا في القاعدة.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, MapPin, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import {
  supervisorMovementUnitService,
  type SupervisorShiftKpis,
  type SupervisorShiftMovement,
} from '../../../../services/sdk/SupervisorMovementUnitService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ManagerUnitNav } from '../../../manager/units/ManagerUnitNav';

const WINDOWS = [
  { hours: 8, label: '٨ ساعات' },
  { hours: 12, label: '١٢ ساعة' },
  { hours: 24, label: '٢٤ ساعة' },
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

export default function SupervisorMovementShiftPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(12);
  const [rows, setRows] = useState<SupervisorShiftMovement[]>([]);
  const [kpis, setKpis] = useState<SupervisorShiftKpis | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, k] = await Promise.all([
        supervisorMovementUnitService.findShiftMovements(hours),
        supervisorMovementUnitService.getShiftKpis(hours),
      ]);
      setRows(list);
      setKpis(k);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, hours]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      <ManagerUnitNav unitKey="movement" baseRole="supervisor" />

      <div className="bg-gradient-to-l from-emerald-600 to-teal-600 rounded-2xl p-5 text-white">
        <p className="text-white/70 text-sm font-semibold">وحدة الحركة • بوابة المشرف</p>
        <h1 className="text-2xl font-black mt-1">حركة الوردية</h1>
        <p className="text-white/80 text-sm mt-1">
          من خرج من فريقك ومن لم يعد بعد — متابعة لحظية.
        </p>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'حجم الفريق', value: kpis.teamSize, icon: Users, tone: 'text-slate-600' },
            { label: 'خارج الموقع الآن', value: kpis.outNow, icon: MapPin, tone: 'text-sky-600' },
            { label: 'متأخر عن العودة', value: kpis.overdueNow, icon: AlertTriangle, tone: 'text-rose-600' },
            { label: 'عاد خلال الوردية', value: kpis.returnedShift, icon: ShieldCheck, tone: 'text-emerald-600' },
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

      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => setHours(w.hours)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                hours === w.hours
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              آخر {w.label}
            </button>
          ))}
          <Button
            variant="secondary"
            onClick={() => void load()}
            icon={<RefreshCw size={14} />}
            className="mr-auto"
          >
            تحديث
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-slate-400 text-sm">جارٍ التحميل…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <ShieldCheck size={36} className="mx-auto text-emerald-500 mb-3" />
          <p className="font-bold text-slate-700">لا حركة في هذه النافذة</p>
          <p className="text-sm text-slate-500 mt-1">
            لم يسجّل أي من فريقك خروجاً خلال آخر {hours} ساعة.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card
              key={r.logId}
              className={`p-4 ${r.isOutNow && r.overdueMinutes > 0 ? 'border-rose-200 bg-rose-50/30' : ''}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-800">{r.employeeName}</span>
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
                    {r.overdueMinutes > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 font-black">
                        <Clock size={11} className="inline ml-1" />
                        تأخّر {r.overdueMinutes} دقيقة
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    <MapPin size={13} className="inline ml-1 text-slate-400" />
                    {r.destination}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    خرج {fmt(r.departureAt)} · متوقّع {fmt(r.expectedReturn)}
                    {r.actualReturn && ` · عاد ${fmt(r.actualReturn)}`}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        الاعتماد على تصاريح الخروج صلاحية المدير — هذه الشاشة للمتابعة فقط.
      </p>
    </div>
  );
}
