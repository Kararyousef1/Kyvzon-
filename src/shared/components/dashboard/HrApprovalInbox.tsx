/**
 * ════════════════════════════════════════════════════════════════
 *  HrApprovalInbox — صندوق موافقات المستخدم الحالي
 *
 *  يعرض الطلبات (إجازات/أذونات) التي تنتظر قرار المستخدم في سلسلة
 *  الموافقات التسلسلية، ويتيح الاعتماد/الرفض. عند القرار، تتحرّك
 *  السلسلة تلقائياً (منطق قاعدة البيانات — migration 0153).
 *
 *  قابل لإعادة الاستخدام في بوابات المشرف/المدير/الإدارة.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, Inbox, CalendarClock, Clock } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { hrApprovalService, type HrApprovalRequest, type HrApprovalStep } from '../../../services/sdk/HrApprovalService';
import { leaveService, permissionRequestService } from '../../../services/sdk';
import Card, { CardHeader, CardTitle } from '../ui/Card';
import Button from '../ui/Button';

/** حقول الإجازة المستعملة في العرض — بديل `as any` */
interface LeaveDetail {
  leave_type: string;
  date_from: string;
  date_to: string;
  working_days_count: number | null;
}

/** حقول الإذن المستعملة في العرض */
interface PermissionDetail {
  permission_type: string;
  date: string;
  expected_out_time: string;
}

type PendingItem = HrApprovalRequest & { my_step: HrApprovalStep; detail?: string; employee_label?: string };

export default function HrApprovalInbox() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const pending = await hrApprovalService.findPendingForApprover(user.id);
      // إثراء بتفاصيل الطلب الأصلي (نوع/تواريخ)
      const enriched = await Promise.all(
        pending.map(async (p) => {
          let detail = '';
          try {
            if (p.request_type === 'leave') {
              const lv = (await leaveService.findById(p.related_id)) as LeaveDetail | null;
              if (lv) detail = `${lv.leave_type} — من ${lv.date_from} إلى ${lv.date_to} (${lv.working_days_count ?? '—'} يوم)`;
            } else {
              const pr = (await permissionRequestService.findById(p.related_id)) as PermissionDetail | null;
              if (pr) detail = `${pr.permission_type} — ${pr.date} (${pr.expected_out_time})`;
            }
          } catch { /* تجاهل */ }
          return { ...p, detail };
        }),
      );
      setItems(enriched);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const decide = async (item: PendingItem, decision: 'approved' | 'rejected', comments?: string) => {
    setProcessingId(item.id);
    try {
      // ★ القاعدة تُزامن leaves/permissions_request عبر sync_hr_source_status
      //   (محفّز على جدول الخطوات — migration 0323).
      //
      //   قبل 0323 كانت هذه الدالة تكتب 'موافق عليه' من المتصفح، وهي سلسلة
      //   لا تقرؤها أي شاشة موظف: LeaveRequestPage تقارن بـ'موافق'. النتيجة
      //   كانت إجازة مُعتمَدة تظهر للموظف «قيد المراجعة» إلى الأبد.
      //   المزامنة من المتصفح خاطئة أصلاً: إغلاق التبويب بين النداءين
      //   يترك الطلب مُعتمَداً ومصدره معلَّقاً.
      const finalStatus = await hrApprovalService.decide(item.id, decision, comments);

      addToast(
        decision === 'approved'
          ? (finalStatus === 'approved' ? '✅ اعتُمد الطلب نهائياً' : '✅ اعتُمدت مرحلتك — انتقل للمرحلة التالية')
          : '↩️ تم رفض الطلب',
        decision === 'approved' ? 'success' : 'info',
      );
      setRejectingId(null);
      setRejectNote('');
      await load();
    } catch (err: any) {
      addToast('❌ ' + (err?.message || 'تعذّر تنفيذ القرار'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-black">
          <Inbox size={18} className="text-indigo-600" /> طلبات بانتظار موافقتك
          {items.length > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{items.length}</span>
          )}
        </CardTitle>
      </CardHeader>
      <div className="p-5 pt-0">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 size={40} className="mx-auto text-emerald-300 mb-2" />
            <p className="text-sm text-slate-400">لا توجد طلبات بانتظار موافقتك</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.request_type === 'leave' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {item.request_type === 'leave' ? <CalendarClock size={18} /> : <Clock size={18} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">
                        {item.request_type === 'leave' ? 'طلب إجازة' : 'إذن زمني'}
                      </span>
                      <span className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">
                        دورك: {hrApprovalService.roleLabel(item.my_step.approver_role)} (مرحلة {item.my_step.step_order})
                      </span>
                    </div>
                    {item.detail && <p className="text-xs text-slate-500 mt-1">{item.detail}</p>}
                  </div>
                </div>

                {rejectingId === item.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="سبب الرفض (اختياري)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-red-300"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => decide(item, 'rejected', rejectNote)} loading={processingId === item.id}>
                        تأكيد الرفض
                      </Button>
                      <Button variant="outline" onClick={() => { setRejectingId(null); setRejectNote(''); }}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="success"
                      onClick={() => decide(item, 'approved')}
                      loading={processingId === item.id}
                      icon={<CheckCircle2 size={15} />}
                      iconPosition="left"
                    >
                      اعتماد
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setRejectingId(item.id)}
                      icon={<XCircle size={15} />}
                      iconPosition="left"
                    >
                      رفض
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
