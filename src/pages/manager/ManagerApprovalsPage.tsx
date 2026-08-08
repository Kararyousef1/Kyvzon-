/**
 * ManagerApprovalsPage — مركز الموافقات الموحّد
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ أُعيدت كتابته كلياً 2026-08-05.
 *
 * الصفحة السابقة (17 سطراً) كانت تقرأ approval_requests وحده — وفحص
 * INSERT أثبت أن **لا أحد يكتب فيه** (صفر في المايجريشنات وصفر في
 * SDK). الجدول مهجور منذ 0023، فالصفحة كانت فارغة **أبداً** لا عرضاً.
 *
 * وكانت تستخدم prompt() المحظور بقواعد المشروع.
 *
 * الآن تقرأ my_approval_inbox (0305) الذي يجمع البوابات التسع:
 *   HR · المشتريات · المالية · العقود · الحركة · المخزون · التصنيع
 *   · CRM · العام
 *
 * وهذا يحقّق وعد «مكان واحد للمدير»: بدل فتح ثلاث بوابات للموافقة
 * على ثلاثة طلبات.
 *
 * الفلترة بالوحدة والفريق تجري في القاعدة لا هنا.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Inbox,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  unifiedApprovalService,
  SOURCE_MODULE_LABELS,
  SOURCE_MODULE_TONES,
  type ApprovalDecision,
  type ApprovalSourceModule,
  type UnifiedApprovalItem,
} from '../../services/sdk/UnifiedApprovalService';
import { usePortalUnits } from '../../shared/hooks/usePortalUnits';
import { findUnit, type PortalUnitKey } from '../../shared/constants/portalUnits';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Modal from '../../shared/components/ui/Modal';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ApprovalTrail } from '../../shared/components/approvals/ApprovalTrail';

function fmt(value: string): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'dd MMM yyyy • HH:mm', { locale: ar });
  } catch {
    return '—';
  }
}

function fmtAmount(amount: number | null): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 2 }).format(amount);
}

export default function ManagerApprovalsPage() {
  const { addToast } = useUIStore();
  const { units, loaded: unitsLoaded } = usePortalUnits();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);
  const [unitFilter, setUnitFilter] = useState<PortalUnitKey | 'all'>('all');

  // نافذة القرار — بديل prompt() المحظور
  const [active, setActive] = useState<UnifiedApprovalItem | null>(null);
  const [decision, setDecision] = useState<ApprovalDecision>('approved');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await unifiedApprovalService.findMyInbox(
        unitFilter === 'all' ? undefined : unitFilter,
      );
      setItems(rows);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, unitFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  /** الوحدات التي يملكها المستخدم — للتصفية */
  const myUnitKeys = useMemo(
    () => [...new Set(units.map((u) => u.unitKey))],
    [units],
  );

  /** توزيع الطلبات على البوابات — لعرض العدّادات */
  const countsByModule = useMemo(() => {
    const map = new Map<ApprovalSourceModule, number>();
    for (const it of items) {
      map.set(it.sourceModule, (map.get(it.sourceModule) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const openDecision = (item: UnifiedApprovalItem, next: ApprovalDecision) => {
    setActive(item);
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
      const result = await unifiedApprovalService.decide(
        active.sourceModule,
        active.sourceId,
        decision,
        comments.trim() || undefined,
      );
      // 'pending' تعني أن الطلب انتقل لمستوى اعتماد تالٍ (0309) —
      // إخبار المستخدم بأنه «اعتُمد» هنا يكون تضليلاً.
      addToast(
        result === 'pending'
          ? 'اعتُمد مستواك — انتقل الطلب للمستوى التالي'
          : decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض',
        'success',
      );
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
      <div className="bg-gradient-to-l from-indigo-600 to-violet-600 rounded-2xl p-5 text-white">
        <p className="text-white/70 text-sm font-semibold">بوابة المدير</p>
        <h1 className="text-2xl font-black mt-1">مركز الموافقات الموحّد</h1>
        <p className="text-white/80 text-sm mt-1">
          كل ما ينتظر قرارك عبر البوابات — في مكان واحد.
        </p>
      </div>

      {/* عدّادات البوابات */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...countsByModule.entries()].map(([mod, count]) => (
            <span
              key={mod}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold ${SOURCE_MODULE_TONES[mod]}`}
            >
              {SOURCE_MODULE_LABELS[mod]} — {count}
            </span>
          ))}
        </div>
      )}

      {/* تصفية بالوحدة */}
      {unitsLoaded && myUnitKeys.length > 1 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-slate-400" />
            <button
              type="button"
              onClick={() => setUnitFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                unitFilter === 'all'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              كل الوحدات
            </button>
            {myUnitKeys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setUnitFilter(k)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  unitFilter === k
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {findUnit(k)?.label ?? k}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              className="mr-auto px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 flex items-center gap-1"
            >
              <RefreshCw size={12} /> تحديث
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="p-10 text-center text-slate-400 text-sm">جارٍ التحميل…</Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox size={36} className="mx-auto text-emerald-500 mb-3" />
          <p className="font-bold text-slate-700">لا طلبات تنتظر قرارك</p>
          <p className="text-sm text-slate-500 mt-1">
            {myUnitKeys.length === 0
              ? 'لم تُسنَد إليك وحدات بعد — يُسنِدها مدير النظام من إدارة المستخدمين.'
              : 'كل الطلبات في وحداتك مُعالَجة.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={`${it.sourceModule}-${it.sourceId}`} className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-black ${SOURCE_MODULE_TONES[it.sourceModule]}`}
                    >
                      {SOURCE_MODULE_LABELS[it.sourceModule]}
                    </span>
                    <span className="font-black text-slate-800">{it.title}</span>
                    {it.amount !== null && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold">
                        {fmtAmount(it.amount)}
                      </span>
                    )}
                    {it.totalSteps > 1 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 font-black">
                        مستوى {it.stepOrder} من {it.totalSteps}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    مقدّم الطلب: <span className="font-bold">{it.requesterName}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{fmt(it.createdAt)}</p>

                  {/* مسار الاعتماد (0309/0316) — يظهر عند تعدّد المستويات */}
                  {it.totalSteps > 1 && (
                    <ApprovalTrail
                      sourceModule={it.sourceModule}
                      sourceId={it.sourceId}
                    />
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="primary"
                    onClick={() => openDecision(it, 'approved')}
                    icon={<CheckCircle2 size={14} />}
                  >
                    موافقة
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openDecision(it, 'rejected')}
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
          {active && (
            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <p className="font-bold text-slate-800">{active.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {SOURCE_MODULE_LABELS[active.sourceModule]} · {active.requesterName}
              </p>
            </div>
          )}
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
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> جارٍ الحفظ…
                </>
              ) : (
                <>
                  <ClipboardCheck size={14} />{' '}
                  {decision === 'approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
