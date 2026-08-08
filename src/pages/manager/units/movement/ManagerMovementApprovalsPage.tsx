/**
 * ManagerMovementApprovalsPage — اعتماد تصاريح خروج الفريق
 *
 * وحدة «الحركة» داخل بوابة المدير. المدير يعتمد تصاريح فريقه من هنا
 * دون فتح بوابة الحركة — وهذا جوهر معمارية الوحدات: مكان واحد.
 *
 * الفلترة بالفريق تجري في القاعدة (is_in_my_team) لا هنا.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ClipboardCheck, Clock, MapPin, Users, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import {
  managerMovementUnitService,
  type ManagerPendingPermit,
  type ManagerTeamKpis,
  type PermitDecision,
} from '../../../../services/sdk/ManagerMovementUnitService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Modal from '../../../../shared/components/ui/Modal';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ManagerUnitNav } from '../ManagerUnitNav';

function fmt(value: string | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'dd MMM yyyy • HH:mm', { locale: ar });
  } catch {
    return '—';
  }
}

export default function ManagerMovementApprovalsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [permits, setPermits] = useState<ManagerPendingPermit[]>([]);
  const [kpis, setKpis] = useState<ManagerTeamKpis | null>(null);

  // نافذة القرار — بديل prompt() المحظور
  const [active, setActive] = useState<ManagerPendingPermit | null>(null);
  const [decision, setDecision] = useState<PermitDecision>('approved');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, k] = await Promise.all([
        managerMovementUnitService.findPendingPermits(),
        managerMovementUnitService.getTeamKpis(30),
      ]);
      setPermits(rows);
      setKpis(k);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDecision = (permit: ManagerPendingPermit, next: PermitDecision) => {
    setActive(permit);
    setDecision(next);
    setComments('');
  };

  const submit = async () => {
    if (!active) return;
    if (decision === 'rejected' && !comments.trim()) {
      addToast('سبب الرفض مطلوب', 'error');
      return;
    }
    setSaving(true);
    try {
      await managerMovementUnitService.decidePermit(
        active.permitId,
        decision,
        comments.trim() || undefined,
      );
      addToast(decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض', 'success');
      setActive(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <ManagerUnitNav unitKey="movement" />

      <div className="bg-gradient-to-l from-indigo-600 to-indigo-500 rounded-2xl p-5 text-white">
        <p className="text-white/70 text-sm font-semibold">وحدة الحركة • بوابة المدير</p>
        <h1 className="text-2xl font-black mt-1">اعتماد تصاريح الفريق</h1>
        <p className="text-white/80 text-sm mt-1">
          تظهر هنا تصاريح الخروج المعلَّقة لموظفي فريقك وحدهم.
        </p>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'حجم الفريق', value: kpis.teamSize, icon: Users, tone: 'text-slate-600' },
            { label: 'بانتظار قرارك', value: kpis.pendingPermits, icon: ClipboardCheck, tone: 'text-amber-600' },
            { label: 'خارج الموقع الآن', value: kpis.currentlyOut, icon: MapPin, tone: 'text-sky-600' },
            { label: 'متأخر عن العودة', value: kpis.overdueNow, icon: AlertTriangle, tone: 'text-rose-600' },
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

      {loading ? (
        <Card className="p-10 text-center text-slate-400 text-sm">جارٍ التحميل…</Card>
      ) : permits.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-3" />
          <p className="font-bold text-slate-700">لا تصاريح معلَّقة</p>
          <p className="text-sm text-slate-500 mt-1">
            كل تصاريح فريقك مُعالَجة. ستظهر الطلبات الجديدة هنا تلقائياً.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {permits.map((p) => (
            <Card key={p.permitId} className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-800">{p.employeeName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 font-bold">
                      معلَّق
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    <MapPin size={13} className="inline ml-1 text-slate-400" />
                    {p.destinationName} — {p.purpose}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    <Clock size={12} className="inline ml-1" />
                    من {fmt(p.validFrom)} إلى {fmt(p.validUntil)} · حد {p.maxMinutes} دقيقة
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="primary"
                    onClick={() => openDecision(p, 'approved')}
                    icon={<CheckCircle2 size={14} />}
                  >
                    موافقة
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openDecision(p, 'rejected')}
                    icon={<XCircle size={14} />}
                  >
                    رفض
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!active}
        onClose={() => setActive(null)}
        title={decision === 'approved' ? 'تأكيد الموافقة' : 'سبب الرفض'}
      >
        <div className="space-y-3" dir="rtl">
          <p className="text-sm text-slate-600">
            {active?.employeeName} — {active?.destinationName}
          </p>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder={decision === 'approved' ? 'ملاحظة (اختيارية)' : 'سبب الرفض (مطلوب)'}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setActive(null)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : decision === 'approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
