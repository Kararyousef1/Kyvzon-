import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Mail, MessageSquare, Phone, Send, ShieldCheck, TicketCheck } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Badge from '../../shared/components/ui/Badge';
import { useUIStore, useAuthStore } from '../../core/stores';
import {
  employeeLetterRequestService,
  hrCaseCommentService,
  hrCaseService,
} from '../../services/sdk';
import type {
  EmployeeLetterRequestRecord,
  HRCaseCommentRecord,
  HRCasePriority,
  HRCaseRecord,
} from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { useEmployeeId } from '../../shared/hooks/useEmployeeId';

const caseTypes = [
  { value: 'general_inquiry', label: 'استفسار عام' },
  { value: 'payroll', label: 'الرواتب والاستقطاعات' },
  { value: 'benefits', label: 'المزايا والتأمين' },
  { value: 'documents', label: 'المستندات والخطابات' },
  { value: 'attendance', label: 'الحضور والإجازات' },
  { value: 'work_environment', label: 'بيئة العمل' },
];

const letterTypes: Array<{ value: EmployeeLetterRequestRecord['letter_type']; label: string }> = [
  { value: 'employment_verification', label: 'إثبات عمل' },
  { value: 'salary_certificate', label: 'تعريف راتب' },
  { value: 'experience_letter', label: 'خطاب خبرة' },
  { value: 'other', label: 'خطاب آخر' },
];

function caseStatusLabel(status: HRCaseRecord['status']) {
  const labels: Record<HRCaseRecord['status'], string> = {
    open: 'مفتوح',
    in_review: 'قيد المراجعة',
    waiting_employee: 'بانتظار الموظف',
    resolved: 'تم الحل',
    closed: 'مغلق',
  };
  return labels[status] || status;
}

function statusVariant(status: HRCaseRecord['status']) {
  if (status === 'resolved' || status === 'closed') return 'success' as const;
  if (status === 'waiting_employee') return 'warning' as const;
  return 'info' as const;
}

export default function ContactPage() {
  // ★ 0335: employees.id لا profiles.id — أربع صفحات مرّرت الخطأ
  //   فعرضت قوائم فارغة دائماً.
  const { employeeId, linkMissing } = useEmployeeId();
  const { addToast } = useUIStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingLetter, setSendingLetter] = useState(false);
  const [cases, setCases] = useState<HRCaseRecord[]>([]);
  const [latestReplies, setLatestReplies] = useState<Record<string, HRCaseCommentRecord>>({});
  const [letters, setLetters] = useState<EmployeeLetterRequestRecord[]>([]);
  const [form, setForm] = useState({
    case_type: 'general_inquiry',
    subject: '',
    description: '',
    priority: 'normal' as HRCasePriority,
  });
  const [letterForm, setLetterForm] = useState({
    letter_type: 'employment_verification' as EmployeeLetterRequestRecord['letter_type'],
    purpose: '',
    language: 'ar' as EmployeeLetterRequestRecord['language'],
    delivery_method: 'portal' as EmployeeLetterRequestRecord['delivery_method'],
  });

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    // ★★ 0335: لا نُمرّر سلسلة فارغة — هذا بالضبط العطل الذي
    //   أصلحه 0333: `employee_id=eq.` يردّه Postgres بـ400
    //   «invalid input syntax for type uuid». رسالة صريحة أوضح.
    if (!employeeId) {
      addToast('حسابك غير مرتبط بسجلّ موظف — راجع الموارد البشرية', 'error');
      return;
    }
    setLoading(true);
    // ★ 0335: بلا سجلّ موظف لا معنى للجلب — والواجهة تعرض
    //   رسالة «حسابك غير مرتبط بسجلّ موظف» عبر linkMissing.
    if (!employeeId) { setLoading(false); return; }
    try {
      const [caseRows, letterRows] = await Promise.all([
        // ★★ إصلاح 0335: employees.id لا profiles.id
        hrCaseService.findByEmployee(employeeId),
        employeeLetterRequestService.findByEmployee(employeeId),
      ]);

      // 0374: ردود HR العامة تُحفظ في خيط الحالة، لا في نسخةٍ منفصلة
      // لا يقرأها الموظف. نحمّل آخر ردٍّ لأول ثماني حالات المعروضة فقط.
      const replyPairs = await Promise.all(
        caseRows.slice(0, 8).map(async (caseRow) => {
          const comments = await hrCaseCommentService.findByCase(caseRow.id);
          const latest = comments.filter((comment) => !comment.is_internal).at(-1);
          return latest ? ([caseRow.id, latest] as const) : null;
        }),
      );

      setCases(caseRows);
      setLatestReplies(Object.fromEntries(replyPairs.filter((pair) => pair !== null)));
      setLetters(letterRows);
    } catch (err) {
      console.error('HR self-service load failed:', getErrorMessage(err));
      addToast('تعذر تحميل طلبات HR السابقة', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, employeeId, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const dashboard = useMemo(() => {
    const open = cases.filter(c => ['open', 'in_review', 'waiting_employee'].includes(c.status)).length;
    const resolved = cases.filter(c => ['resolved', 'closed'].includes(c.status)).length;
    const readyLetters = letters.filter(l => ['ready', 'delivered'].includes(l.status)).length;
    return { open, resolved, letters: letters.length, readyLetters };
  }, [cases, letters]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !form.subject.trim() || !form.description.trim()) {
      addToast('يرجى ملء عنوان الطلب والوصف', 'warning');
      return;
    }
    // ★★ 0335: لا نُمرّر سلسلة فارغة — هذا بالضبط العطل الذي
    //   أصلحه 0333: `employee_id=eq.` يردّه Postgres بـ400
    //   «invalid input syntax for type uuid». رسالة صريحة أوضح.
    if (!employeeId) {
      addToast('حسابك غير مرتبط بسجلّ موظف — راجع الموارد البشرية', 'error');
      return;
    }
    setSending(true);
    try {
      await hrCaseService.submitCase({
        caseType: form.case_type,
        subject: form.subject,
        description: form.description,
        priority: form.priority,
      });

      setForm({ case_type: 'general_inquiry', subject: '', description: '', priority: 'normal' });
      addToast('تم إنشاء طلب HR بنجاح ✅', 'success');
      await loadData();
    } catch (err) {
      console.error('Create HR case failed:', getErrorMessage(err));
      addToast('حدث خطأ أثناء إرسال الطلب', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleLetterRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    // ★★ 0335: لا سلسلة فارغة — راجع تعليل handleSend أعلاه
    if (!employeeId) {
      addToast('حسابك غير مرتبط بسجلّ موظف — راجع الموارد البشرية', 'error');
      return;
    }
    setSendingLetter(true);
    try {
      await employeeLetterRequestService.createLetterRequest({
        employee_id: employeeId,
        letter_type: letterForm.letter_type,
        purpose: letterForm.purpose.trim() || undefined,
        language: letterForm.language,
        delivery_method: letterForm.delivery_method,
      });
      setLetterForm({ letter_type: 'employment_verification', purpose: '', language: 'ar', delivery_method: 'portal' });
      addToast('تم إرسال طلب الخطاب إلى الموارد البشرية', 'success');
      await loadData();
    } catch (err) {
      console.error('Create letter request failed:', getErrorMessage(err));
      addToast('تعذر إرسال طلب الخطاب', 'error');
    } finally {
      setSendingLetter(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white/70 text-sm font-semibold">Employee Self-Service</p>
            <h2 className="text-2xl font-extrabold mt-1">مركز خدمات الموارد البشرية</h2>
            <p className="text-white/75 mt-2 text-sm">أنشئ طلبات HR، تابع حالتها، واطلب الخطابات الرسمية من مكان واحد.</p>
          </div>
          <ShieldCheck size={56} className="text-white/25" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'طلبات مفتوحة', value: dashboard.open, icon: TicketCheck, color: 'bg-amber-50 text-amber-600' },
          { label: 'طلبات محلولة', value: dashboard.resolved, icon: ShieldCheck, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'طلبات خطابات', value: dashboard.letters, icon: FileText, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'خطابات جاهزة', value: dashboard.readyLetters, icon: Mail, color: 'bg-purple-50 text-purple-600' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-bold">{item.label}</p>
                  <p className="text-2xl font-extrabold text-slate-800 mt-1">{item.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.color}`}><Icon size={20} /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-indigo-600" />
            <h3 className="font-bold text-slate-800">إنشاء طلب HR</h3>
          </div>

          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">نوع الطلب</label>
                <select value={form.case_type} onChange={e => setForm(p => ({ ...p, case_type: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                  {caseTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">الأولوية</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as HRCasePriority }))} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="low">منخفضة</option>
                  <option value="normal">عادية</option>
                  <option value="urgent">عاجلة</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">الموضوع <span className="text-red-500">*</span></label>
              <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="مثال: استفسار عن رصيد الإجازات" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">الوصف <span className="text-red-500">*</span></label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="اكتب تفاصيل الطلب والنتيجة المطلوبة..." rows={6} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none resize-none focus:border-indigo-400" />
            </div>

            <Button type="submit" fullWidth loading={sending} icon={<Send size={14} />} iconPosition="left">إرسال طلب HR</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-purple-600" />
            <h3 className="font-bold text-slate-800">طلب خطاب رسمي</h3>
          </div>
          <form onSubmit={handleLetterRequest} className="space-y-3">
            <select value={letterForm.letter_type} onChange={e => setLetterForm(p => ({ ...p, letter_type: e.target.value as EmployeeLetterRequestRecord['letter_type'] }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
              {letterTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={letterForm.language} onChange={e => setLetterForm(p => ({ ...p, language: e.target.value as EmployeeLetterRequestRecord['language'] }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
              <option value="ar">عربي</option>
              <option value="en">English</option>
              <option value="both">عربي + English</option>
            </select>
            <select value={letterForm.delivery_method} onChange={e => setLetterForm(p => ({ ...p, delivery_method: e.target.value as EmployeeLetterRequestRecord['delivery_method'] }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
              <option value="portal">داخل البوابة</option>
              <option value="email">البريد الإلكتروني</option>
              <option value="printed">نسخة مطبوعة</option>
            </select>
            <textarea value={letterForm.purpose} onChange={e => setLetterForm(p => ({ ...p, purpose: e.target.value }))} placeholder="الغرض من الخطاب" rows={4} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none focus:border-purple-400" />
            <Button type="submit" fullWidth loading={sendingLetter} icon={<Send size={14} />} iconPosition="left">طلب الخطاب</Button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2"><Phone size={14} /> الدعم العاجل: +966 11 123 4567</div>
            <div className="flex items-center gap-2"><Mail size={14} /> hr@kayan.sa</div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-bold text-slate-800 mb-4">📨 طلبات HR السابقة</h3>
          <div className="space-y-3">
            {loading ? <p className="text-sm text-slate-400">جاري التحميل...</p> : cases.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">لا توجد طلبات HR سابقة.</p>
            ) : cases.slice(0, 8).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-700 truncate">{item.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{caseTypes.find(t => t.value === item.case_type)?.label || item.case_type}</p>
                  {latestReplies[item.id] && (
                    <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                      <p className="text-[10px] font-bold text-emerald-700">آخر رد من الموارد البشرية</p>
                      <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{latestReplies[item.id].message}</p>
                    </div>
                  )}
                </div>
                <Badge variant={statusVariant(item.status)}>{caseStatusLabel(item.status)}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-slate-800 mb-4">📄 طلبات الخطابات</h3>
          <div className="space-y-3">
            {loading ? <p className="text-sm text-slate-400">جاري التحميل...</p> : letters.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">لا توجد طلبات خطابات بعد.</p>
            ) : letters.slice(0, 8).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{letterTypes.find(t => t.value === item.letter_type)?.label || item.letter_type}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.language} • {item.delivery_method}</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">{item.status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
