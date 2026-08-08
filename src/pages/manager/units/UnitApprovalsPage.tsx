/**
 * UnitApprovalsPage — صفحة موافقات عامة لأي وحدة
 *
 * ═════════════════════════════════════════════════════════════════════════
 * قرار معماري: صفحة واحدة بدل ست عشرة.
 *
 *   الوحدات التسع × دورين = 16 صفحة موافقات محتملة. نسخها يعني:
 *     • ست عشرة نسخة من نفس المنطق
 *     • ست عشرة فرصة للتباعد عند أي تعديل
 *     • ست عشرة صفحة تُختبر وتُصان
 *
 *   لكن المحرك الموحّد (0305) يخدمها كلها أصلاً:
 *     my_approval_inbox(unitKey) → طلبات هذه الوحدة لفريقي
 *     unified_approval_decide(...) → القرار يُوجَّه للجدول الصحيح
 *
 *   فالاختلاف بين «موافقات المشتريات» و«موافقات المخزون» هو **معامل
 *   واحد**، لا صفحة كاملة. الصفحة تقرأ unitKey من المسار.
 *
 * الاستثناء المتعمّد: وحدة الحركة لها صفحتان مخصّصتان (اعتماد + تقرير
 *   فريق) لأن منظورها أغنى من قائمة موافقات — وهذا مبرّر بالوظيفة لا
 *   بالنسخ.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Inbox, RefreshCw, XCircle } from 'lucide-react';
import { useUIStore } from '../../../core/stores';
import {
  unifiedApprovalService,
  SOURCE_MODULE_LABELS,
  SOURCE_MODULE_TONES,
  type ApprovalDecision,
  type UnifiedApprovalItem,
} from '../../../services/sdk/UnifiedApprovalService';
import {
  findUnit,
  type PortalUnitBaseRole,
  type PortalUnitKey,
} from '../../../shared/constants/portalUnits';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import { getErrorMessage } from '../../../services/errors';
import { ApprovalTrail } from '../../../shared/components/approvals/ApprovalTrail';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ManagerUnitNav } from './ManagerUnitNav';

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

export function UnitApprovalsPage({
  baseRole = 'manager',
  unitKey: fixedUnitKey,
}: {
  baseRole?: PortalUnitBaseRole;
  /** تمريرها يُثبّت الوحدة؛ وإلا تُقرأ من المسار */
  unitKey?: PortalUnitKey;
}) {
  const params = useParams<{ unitKey?: string }>();
  const unitKey = (fixedUnitKey ?? params.unitKey) as PortalUnitKey | undefined;
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);

  const [active, setActive] = useState<UnifiedApprovalItem | null>(null);
  const [decision, setDecision] = useState<ApprovalDecision>('approved');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const unit = useMemo(() => (unitKey ? findUnit(unitKey) : undefined), [unitKey]);

  const load = useCallback(async () => {
    if (!unitKey) return;
    setLoading(true);
    try {
      setItems(await unifiedApprovalService.findMyInbox(unitKey));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, unitKey]);

  useEffect(() => {
    void load();
  }, [load]);

  /** المشرف يتابع ولا يعتمد — نفس مبدأ 0307 */
  const canDecide = baseRole === 'manager';

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

  if (!unitKey || !unit) {
    return (
      <div dir="rtl">
        <Card className="p-10 text-center">
          <p className="font-bold text-slate-700">وحدة غير معروفة</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <ManagerUnitNav unitKey={unitKey} baseRole={baseRole} />

      <div
        className={`rounded-2xl p-5 text-white bg-gradient-to-l ${
          baseRole === 'manager'
            ? 'from-indigo-600 to-violet-600'
            : 'from-emerald-600 to-teal-600'
        }`}
      >
        <p className="text-white/70 text-sm font-semibold">
          وحدة {unit.label} • بوابة {baseRole === 'manager' ? 'المدير' : 'المشرف'}
        </p>
        <h1 className="text-2xl font-black mt-1">
          {canDecide ? 'اعتماد الطلبات' : 'متابعة الطلبات'}
        </h1>
        <p className="text-white/80 text-sm mt-1">{unit.description}</p>
      </div>

      <Card className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500">
            {loading ? 'جارٍ التحميل…' : `${items.length} طلب بانتظار القرار`}
          </span>
          <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={14} />}>
            تحديث
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-slate-400 text-sm">جارٍ التحميل…</Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox size={36} className="mx-auto text-emerald-500 mb-3" />
          <p className="font-bold text-slate-700">لا طلبات معلَّقة</p>
          <p className="text-sm text-slate-500 mt-1">
            كل طلبات فريقك في وحدة {unit.label} مُعالَجة.
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

                  {/* مسار الاعتماد (0309/0316) — مطويّ افتراضياً فلا يُطلق
                      طلباً لكل بطاقة. يظهر فقط حين تتعدّد المستويات:
                      طلب بمستوى واحد لا مسار له يستحق العرض. */}
                  {it.totalSteps > 1 && (
                    <ApprovalTrail
                      sourceModule={it.sourceModule}
                      sourceId={it.sourceId}
                    />
                  )}
                </div>

                {canDecide && (
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
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!canDecide && (
        <p className="text-[11px] text-slate-400 text-center">
          الاعتماد صلاحية المدير — هذه الشاشة للمتابعة فقط.
        </p>
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

export default UnitApprovalsPage;
