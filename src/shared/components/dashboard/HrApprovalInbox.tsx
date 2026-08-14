/**
 * HrApprovalInbox — صندوق الموافقات الموحّد المصغّر للوحة التحكم.
 *
 * لا يقرأ جداول HR القديمة ولا يثري الطلبات من جداول المصادر. كل العرض
 * والقرار يمران عبر UnifiedApprovalService وRPC المحرّك الموحّد.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock, CheckCircle2, CircleDollarSign, Clock, FileCheck2,
  Inbox, Loader2, XCircle,
} from 'lucide-react';
import { useUIStore } from '../../../core/stores';
import {
  SOURCE_MODULE_LABELS,
  SOURCE_MODULE_TONES,
  unifiedApprovalService,
  type ApprovalDecision,
  type UnifiedApprovalItem,
} from '../../../services/sdk/UnifiedApprovalService';
import { getErrorMessage } from '../../../services/errors';
import Card, { CardHeader, CardTitle } from '../ui/Card';
import Button from '../ui/Button';

function itemKey(item: UnifiedApprovalItem): string {
  return `${item.sourceModule}:${item.sourceId}`;
}

function RequestIcon({ item }: { item: UnifiedApprovalItem }) {
  if (item.requestType === 'leave') return <CalendarClock size={18} />;
  if (item.requestType === 'permission') return <Clock size={18} />;
  if (item.requestType === 'expense' || item.requestType === 'loan') {
    return <CircleDollarSign size={18} />;
  }
  return <FileCheck2 size={18} />;
}

function formatAmount(amount: number | null): string | null {
  if (amount === null) return null;
  return new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 2 }).format(amount);
}

export default function HrApprovalInbox() {
  const { addToast } = useUIStore();
  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await unifiedApprovalService.findMyInbox());
    } catch (err) {
      setItems([]);
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    item: UnifiedApprovalItem,
    decision: ApprovalDecision,
    comments?: string,
  ) => {
    const key = itemKey(item);
    setProcessingKey(key);
    try {
      const finalStatus = await unifiedApprovalService.decide(
        item.sourceModule,
        item.sourceId,
        decision,
        comments,
      );
      addToast(
        finalStatus === 'pending'
          ? 'اعتُمد مستواك — انتقل الطلب للمستوى التالي'
          : decision === 'approved' ? 'اعتُمد الطلب نهائياً' : 'تم رفض الطلب',
        decision === 'approved' ? 'success' : 'info',
      );
      setRejectingKey(null);
      setRejectNote('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-black">
          <Inbox size={18} className="text-indigo-600" /> طلبات بانتظار موافقتك
          {items.length > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <div className="p-5 pt-0">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo-500" size={28} />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 size={40} className="mx-auto text-emerald-300 mb-2" />
            <p className="text-sm text-slate-400">لا توجد طلبات بانتظار موافقتك</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const key = itemKey(item);
              const amount = formatAmount(item.amount);
              return (
                <div key={key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                      <RequestIcon item={item} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{item.title}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${SOURCE_MODULE_TONES[item.sourceModule]}`}>
                          {SOURCE_MODULE_LABELS[item.sourceModule]}
                        </span>
                        <span className="text-[11px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                          المرحلة {item.stepOrder} من {item.totalSteps}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        مقدّم الطلب: {item.requesterName}
                        {amount ? ` — المبلغ: ${amount}` : ''}
                      </p>
                    </div>
                  </div>

                  {rejectingKey === key ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={rejectNote}
                        onChange={(event) => setRejectNote(event.target.value)}
                        placeholder="سبب الرفض"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-red-300"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="danger"
                          onClick={() => void decide(item, 'rejected', rejectNote.trim() || undefined)}
                          loading={processingKey === key}
                        >
                          تأكيد الرفض
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setRejectingKey(null); setRejectNote(''); }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="success"
                        onClick={() => void decide(item, 'approved')}
                        loading={processingKey === key}
                        icon={<CheckCircle2 size={15} />}
                        iconPosition="left"
                      >
                        اعتماد
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setRejectingKey(key)}
                        icon={<XCircle size={15} />}
                        iconPosition="left"
                      >
                        رفض
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
