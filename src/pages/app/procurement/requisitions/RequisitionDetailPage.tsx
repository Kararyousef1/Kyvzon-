import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, FileText, History, MessageSquare, Paperclip, ShieldCheck, XCircle } from 'lucide-react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import {
  purchaseRequisitionService,
  prLineItemService,
  prApprovalService,
  prAttachmentService,
  prAuditLogService,
  prCommentService,
  type PurchaseRequisitionRecord,
  type PrLineItemRecord,
  type PrApprovalRecord,
  type PrAttachmentRecord,
  type PrAuditLogRecord,
  type PrCommentRecord,
} from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-indigo-100 text-indigo-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  revision_required: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  converted_to_po: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function RequisitionDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [pr, setPr] = useState<PurchaseRequisitionRecord | null>(null);
  const [lines, setLines] = useState<PrLineItemRecord[]>([]);
  const [approvals, setApprovals] = useState<PrApprovalRecord[]>([]);
  const [attachments, setAttachments] = useState<PrAttachmentRecord[]>([]);
  const [auditLog, setAuditLog] = useState<PrAuditLogRecord[]>([]);
  const [comments, setComments] = useState<PrCommentRecord[]>([]);
  const [commentText, setCommentText] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [attachmentForm, setAttachmentForm] = useState({ file_name: '', file_url: '' });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [header, itemRows, approvalRows, attachmentRows, auditRows, commentRows] = await Promise.all([
        purchaseRequisitionService.findById(id),
        prLineItemService.findByPr(id).catch(() => []),
        prApprovalService.findByPr(id).catch(() => []),
        prAttachmentService.findByPr(id).catch(() => []),
        prAuditLogService.findByPr(id).catch(() => []),
        prCommentService.findByPr(id).catch(() => []),
      ]);
      setPr(header);
      setLines(itemRows);
      setApprovals(approvalRows);
      setAttachments(attachmentRows);
      setAuditLog(auditRows);
      setComments(commentRows);
    } catch (e: any) {
      addToast('فشل تحميل تفاصيل طلب الشراء: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const linesTotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.estimated_total || 0), 0), [lines]);

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!pr) return;
    setDecisionBusy(true);
    try {
      await prApprovalService.approve(pr.id, decision, decision === 'approved' ? 'موافق' : 'مرفوض');
      addToast(decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض', decision === 'approved' ? 'success' : 'info');
      await load();
    } catch (e: any) {
      addToast('تعذر تنفيذ القرار: ' + e.message, 'error');
    } finally {
      setDecisionBusy(false);
    }
  };

  const addComment = async () => {
    if (!pr || !commentText.trim()) return;
    try {
      await prCommentService.add(pr.id, commentText.trim(), false);
      setCommentText('');
      addToast('تمت إضافة التعليق', 'success');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const requestRevision = async () => {
    if (!pr || !revisionReason.trim()) return;
    try {
      await purchaseRequisitionService.requestRevision(pr.id, revisionReason.trim());
      setRevisionReason('');
      addToast('تم طلب تعديل الطلب', 'info');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const cancelPr = async () => {
    if (!pr) return;
    if (!cancelReason.trim()) {
      addToast('سبب الإلغاء مطلوب', 'error');
      return;
    }
    try {
      await purchaseRequisitionService.cancel(pr.id, cancelReason.trim());
      addToast('تم إلغاء الطلب', 'info');
      setCancelOpen(false);
      setCancelReason('');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const addAttachment = async () => {
    if (!pr) return;
    try {
      if (attachmentFile) {
        await prAttachmentService.uploadFile(pr.id, attachmentFile);
      } else if (attachmentForm.file_name.trim() && attachmentForm.file_url.trim()) {
        await prAttachmentService.create({ pr_id: pr.id, file_name: attachmentForm.file_name.trim(), file_url: attachmentForm.file_url.trim() });
      } else {
        return;
      }
      setAttachmentForm({ file_name: '', file_url: '' });
      setAttachmentFile(null);
      addToast('تمت إضافة المرفق', 'success');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const openAttachment = async (file: PrAttachmentRecord) => {
    if (!pr) return;
    try {
      const url = await prAttachmentService.signedUrl(pr.id, file.file_url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  if (loading) return <div className="p-10 text-center">جاري تحميل تفاصيل طلب الشراء...</div>;
  if (!pr) {
    return (
      <Card className="max-w-3xl mx-auto text-center py-12">
        <h2 className="font-black text-xl">طلب الشراء غير موجود</h2>
        <Link to="/app/procurement/requisitions" className="text-indigo-600 text-sm mt-3 inline-block">العودة للقائمة</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <Link to="/app/procurement/requisitions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-2">
            <ArrowRight size={14} /> العودة لطلبات الشراء
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-black font-mono">{pr.pr_number}</h1>
            <span className={`text-xs px-3 py-1 rounded-full font-bold ${statusColor[pr.status] || 'bg-slate-100'}`}>{pr.status}</span>
            <span className={`text-xs px-3 py-1 rounded-full ${pr.priority === 'emergency' ? 'bg-red-100 text-red-700' : pr.priority === 'urgent' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>{pr.priority}</span>
          </div>
          <p className="text-slate-500 mt-1">{pr.justification || 'لا يوجد مبرر مكتوب'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {pr.status === 'pending_approval' && (
            <>
              <Button disabled={decisionBusy} className="bg-emerald-600" onClick={() => decide('approved')}>
                <CheckCircle size={16} className="inline ml-1" /> موافقة
              </Button>
              <Button disabled={decisionBusy} variant="secondary" className="!bg-red-50 !text-red-700" onClick={() => decide('rejected')}>
                <XCircle size={16} className="inline ml-1" /> رفض
              </Button>
            </>
          )}
          {['draft','submitted','under_review','pending_approval','revision_required','rejected'].includes(pr.status) && <Button variant="secondary" onClick={()=>{ setCancelReason(''); setCancelOpen(true); }}>إلغاء</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card><div className="text-xs text-slate-500">الإجمالي التقديري</div><div className="text-2xl font-black">{Number(pr.total_estimated || linesTotal).toLocaleString()} {pr.currency_code}</div></Card>
        <Card><div className="text-xs text-slate-500">فحص الميزانية</div><div className={`text-lg font-bold ${pr.budget_status === 'ok' ? 'text-emerald-700' : pr.budget_status === 'exceeded' ? 'text-red-700' : 'text-slate-700'}`}>{pr.budget_status || 'غير محدد'}</div></Card>
        <Card><div className="text-xs text-slate-500">نوع الطلب</div><div className="text-lg font-bold">{pr.request_type}</div></Card>
        <Card><div className="text-xs text-slate-500">تاريخ الحاجة</div><div className="text-lg font-bold">{pr.needed_by_date ? new Date(pr.needed_by_date).toLocaleDateString('ar-SA') : '—'}</div></Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <h3 className="font-bold mb-3 flex items-center gap-2"><FileText size={18} /> بنود الطلب</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2">الوصف</th>
                    <th className="p-2">الكمية</th>
                    <th className="p-2">الوحدة</th>
                    <th className="p-2">سعر تقديري</th>
                    <th className="p-2">الإجمالي</th>
                    <th className="p-2">UNSPSC</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="p-2 font-mono">{line.item_code || '—'}</td>
                      <td className="p-2 font-medium">{line.description}</td>
                      <td className="p-2 text-center font-mono">{line.quantity}</td>
                      <td className="p-2 text-center">{line.unit}</td>
                      <td className="p-2 text-center">{Number(line.estimated_unit_price).toLocaleString()}</td>
                      <td className="p-2 text-center font-bold">{Number(line.estimated_total).toLocaleString()}</td>
                      <td className="p-2 text-center font-mono text-xs">{line.unspsc_code || '—'}</td>
                    </tr>
                  ))}
                  {!lines.length && <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد بنود مسجلة</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h3 className="font-bold mb-3 flex items-center gap-2"><ShieldCheck size={18} /> سير الموافقات</h3>
            <div className="space-y-3">
              {approvals.map((approval) => (
                <div key={approval.id} className="p-3 border rounded-xl flex justify-between items-center gap-3">
                  <div>
                    <div className="font-bold">المستوى {approval.approval_level} — {approval.role_required || 'معتمد'}</div>
                    <div className="text-xs text-slate-500 mt-1">المعتمد: <span className="font-mono">{approval.approver_id}</span></div>
                    {approval.comments && <div className="text-xs text-slate-600 mt-1">تعليق: {approval.comments}</div>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${approval.decision === 'approved' ? 'bg-emerald-100 text-emerald-700' : approval.decision === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {approval.decision || 'pending'}
                  </span>
                </div>
              ))}
              {!approvals.length && <div className="py-8 text-center text-slate-400 text-sm">لا توجد مراحل موافقة ظاهرة لهذا الطلب</div>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h3 className="font-bold mb-3">بيانات الطلب</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">القسم</dt><dd className="font-mono text-xs">{pr.department_id || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">مركز التكلفة</dt><dd className="font-mono text-xs">{pr.cost_center_id || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">مستوى الموافقة</dt><dd>{pr.current_approval_level}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">تاريخ الإنشاء</dt><dd>{new Date(pr.created_at).toLocaleString('ar-SA')}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">آخر تحديث</dt><dd>{new Date(pr.updated_at).toLocaleString('ar-SA')}</dd></div>
            </dl>
          </Card>

          <Card>
            <h3 className="font-bold mb-3 flex items-center gap-2"><Paperclip size={18} /> المرفقات</h3>
            <div className="space-y-2">
              {attachments.map((file) => (
                <button key={file.id} type="button" onClick={() => openAttachment(file)} className="block w-full text-right p-3 border rounded-xl hover:bg-slate-50 text-sm">
                  <div className="font-bold">{file.file_name}</div>
                  <div className="text-xs text-slate-500">{file.file_size ? `${Math.round(file.file_size / 1024)} KB` : 'رابط مرفق'}</div>
                </button>
              ))}
              {!attachments.length && <div className="py-6 text-center text-slate-400 text-sm">لا توجد مرفقات بعد</div>}
              <div className="pt-2 border-t space-y-2">
                <input type="file" className="w-full border rounded-xl p-2 text-sm" onChange={e=>setAttachmentFile(e.target.files?.[0] || null)} />
                <div className="text-[11px] text-slate-400">أو أدخل رابط مرفق خارجي:</div>
                <input className="w-full border rounded-xl p-2 text-sm" placeholder="اسم المرفق" value={attachmentForm.file_name} onChange={e=>setAttachmentForm({...attachmentForm, file_name:e.target.value})} />
                <input className="w-full border rounded-xl p-2 text-sm" placeholder="رابط المرفق" value={attachmentForm.file_url} onChange={e=>setAttachmentForm({...attachmentForm, file_url:e.target.value})} />
                <Button size="sm" variant="secondary" fullWidth onClick={addAttachment}>إضافة مرفق</Button>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="font-bold mb-3 flex items-center gap-2"><MessageSquare size={18} /> التعليقات وطلب التعديل</h3>
            <div className="space-y-2 max-h-48 overflow-auto mb-3">
              {comments.map(c => <div key={c.id} className="p-2 border rounded-xl text-sm"><div>{c.comment}</div><div className="text-[10px] text-slate-400 mt-1">{new Date(c.created_at).toLocaleString('ar-SA')}</div></div>)}
              {!comments.length && <div className="text-center text-slate-400 text-sm py-4">لا تعليقات</div>}
            </div>
            <textarea className="w-full border rounded-xl p-2 text-sm" placeholder="اكتب تعليقاً" value={commentText} onChange={e=>setCommentText(e.target.value)} />
            <Button size="sm" className="mt-2" fullWidth onClick={addComment}>إضافة تعليق</Button>
            {['pending_approval','under_review','submitted'].includes(pr.status) && <div className="mt-3 pt-3 border-t"><textarea className="w-full border rounded-xl p-2 text-sm" placeholder="سبب طلب التعديل" value={revisionReason} onChange={e=>setRevisionReason(e.target.value)} /><Button size="sm" variant="secondary" fullWidth className="mt-2" onClick={requestRevision}>طلب تعديل</Button></div>}
          </Card>

          <Card className="bg-slate-50">
            <h3 className="font-bold mb-3 flex items-center gap-2"><History size={18} /> سجل التدقيق</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {auditLog.map(a => <div key={a.id} className="p-2 border rounded-xl bg-white text-xs"><div className="font-bold">{a.action}</div><div className="text-slate-500">{a.old_status || '—'} → {a.new_status || '—'}</div>{a.comments && <div className="mt-1">{a.comments}</div>}<div className="text-[10px] text-slate-400 mt-1">{new Date(a.created_at).toLocaleString('ar-SA')}</div></div>)}
              {!auditLog.length && <div className="text-center text-slate-400 text-sm py-4">لا يوجد سجل تدقيق بعد</div>}
            </div>
          </Card>
        </div>
      </div>

      {cancelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-black text-lg mb-2">إلغاء طلب الشراء</h3>
            <p className="text-sm text-slate-500 mb-4">{pr.pr_number}</p>
            <label className="block text-xs font-bold text-slate-600 mb-1">سبب الإلغاء *</label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="اذكر سبب الإلغاء — يُسجَّل في سجل التدقيق"
              className="w-full border rounded-xl p-3"
            />
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={cancelPr} className="flex-1 bg-rose-600 text-white rounded-xl py-2.5 font-bold hover:bg-rose-700">تأكيد الإلغاء</button>
              <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(''); }} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">تراجع</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
