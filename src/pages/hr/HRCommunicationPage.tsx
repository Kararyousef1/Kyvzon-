/**
 * HRCommunicationPage — صندوق بريد الموارد البشرية · migration 0371
 * ★ الصفحة الأخيرة في المرحلة الرابعة.
 *
 * ① ★★★★ **الصفحة كانت تعرض اسماً فارغاً لكلّ رسالة — دائماً.**
 *   `findAllWithProfiles()` تطلب `profiles(full_name, department)`
 *   و**صفرُ مفتاحٍ أجنبيٍّ** يربط `hr_messages` بـ`profiles`
 *   (الموجودان يشيران إلى `employees`). ⇒ PostgREST يردّ بخطأ،
 *   والخدمة تبتلعه وتُعيد `[]`. والسطران 78 و97 كانا:
 *      {(msg.profiles?.full_name ?? "")}
 *      ({(selected.profiles?.department ?? "")})
 *   سلسلةٌ فارغةٌ بين قوسين — لا «غير محدَّد» ولا شيء.
 *
 * ② ★★★★ **الأزرار الثلاثة بلا `onClick`** (السطر 107–109):
 *   «وضع علامة كمكتمل» · «أرشفة» · «رد» — زينةٌ خالصة.
 *
 * ③ ★★★ أعمدة الردّ الثلاثة ميتة · ④ ★★★ الرادُّ كان يشير إلى
 *   `employees` فمديرُ النظام لا يستطيع الردَّ · ⑤ ★★★ الحذف
 *   النهائيّ مسموحٌ ولا أرشفة · ⑥ نصوصٌ من مسافات · ⑦ عبورٌ بين
 *   المستأجرين · ⑧ صفرُ دالة · ⑨ `tenant_id` يقبل NULL.
 *
 * ⑩ ★★★★ **الاشتراك اللحظيّ** كان `event: '*'` يستدعي `fetchMessages`
 *   عند كلّ تغيير — بما فيه تغييرُ المستخدم نفسه بفتح رسالة ⇒ كلّ
 *   نقرةٍ تُعيد جلب الجدول. والصفحة تلمس `supabase` مباشرةً.
 *
 * ⑪ ★★★★ **الردُّ لا يصل أحداً**: `ContactPage` تكتب في `hr_cases`
 *   **وفي** `hr_messages` بلا رابط، والموظف يقرأ `hr_cases` فقط.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `hrInboxSdk`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, ArchiveRestore, CheckCircle2, ExternalLink, Inbox,
  Link2Off, Loader2, Lock, Mail, RefreshCw, Search, Send, Timer,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  hrInboxSdk, INBOX_PRIORITIES, INBOX_STATES,
  inboxStateLabel, inboxStateTone, inboxPriorityLabel, inboxPriorityTone,
  isInboxFinal,
} from '../../services/sdk';
import type {
  InboxMessageRow, InboxSummary, InboxPriority, InboxState,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, DetailRow } from './LoansPage';

function fmtDateTime(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy · HH:mm', { locale: ar });
}

/** ★ العمرُ بصيغةٍ مقروءة — والتمييز بين «صفر ساعة» و«بلا تاريخ» */
function ageLabel(hours: number): string {
  if (hours < 1) return 'الآن';
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوماً`;
}

export default function HRCommunicationPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  /** ★★★ الحرمان حالةٌ صريحةٌ تُعرض لا صفحةٌ فارغةٌ صامتة */
  const [forbidden, setForbidden] = useState(false);

  const [rows, setRows] = useState<InboxMessageRow[]>([]);
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [selected, setSelected] = useState<InboxMessageRow | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InboxState>('all');
  const [prioFilter, setPrioFilter] = useState<'all' | InboxPriority>('all');
  const [showArchive, setShowArchive] = useState(false);

  const [replying, setReplying] = useState<InboxMessageRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [archiving, setArchiving] = useState<InboxMessageRow | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑧: الترشيح في القاعدة لا في المتصفّح
      const [list, sum] = await Promise.all([
        hrInboxSdk.board(
          search.trim() || null,
          statusFilter === 'all' ? null : statusFilter,
          prioFilter === 'all' ? null : prioFilter,
          showArchive, 200,
        ),
        hrInboxSdk.summary(),
      ]);
      setRows(list);
      setSummary(sum);
      setForbidden(false);
      // ★ المحدَّدُ يُحدَّث من القائمة الجديدة أو يُلغى إن اختفى
      setSelected((cur) => (cur ? list.find((r) => r.id === cur.id) ?? null : null));
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('HR_MESSAGE_FORBIDDEN')) {
        setForbidden(true);
        setRows([]);
        setSummary(null);
      } else {
        addToast(`تعذّر تحميل البريد: ${msg}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [addToast, search, statusFilter, prioFilter, showArchive]);

  useEffect(() => { void load(); }, [load]);

  /**
   * ★★★★ العطل ⑩: لا اشتراكَ لحظيٌّ يُعيد جلب الجدول عند كلّ تغيير
   *   — بما فيه تغييرُ المستخدم نفسه. التحديثُ صريحٌ بزرٍّ أو بعد
   *   كلّ إجراء، والصفحة لا تلمس `supabase` أصلاً.
   */

  const openMessage = useCallback(async (msg: InboxMessageRow) => {
    setSelected(msg);
    if (msg.status !== 'new') return;
    try {
      await hrInboxSdk.markRead(msg.id);
      setRows((prev) => prev.map((r) =>
        r.id === msg.id ? { ...r, status: 'read' } : r));
      setSelected({ ...msg, status: 'read' });
      setSummary(await hrInboxSdk.summary());
    } catch (err) {
      // ★ لا يُبتلع الخطأ صامتاً كما كان (السطر 52–54: console.error فقط)
      addToast(`تعذّر تعليم الرسالة مقروءةً: ${getErrorMessage(err)}`, 'error');
    }
  }, [addToast]);

  const submitReply = useCallback(async () => {
    if (!replying) return;
    if (!replyText.trim()) {
      addToast('نصُّ الردّ فارغ', 'warning');
      return;
    }
    setSaving(true);
    try {
      await hrInboxSdk.reply(replying.id, replyText);
      addToast(
        replying.caseId
          ? '✅ أُرسل الردّ وحُدِّثت الحالة المرتبطة — سيراه الموظف'
          : '✅ أُرسل الردّ. ★ هذه الرسالة غير مرتبطةٍ بحالة، فقد لا تظهر للموظف في مركز الخدمات',
        replying.caseId ? 'success' : 'warning',
      );
      setReplying(null);
      setReplyText('');
      await load();
    } catch (err) {
      addToast(`فشل الردّ: ${getErrorMessage(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [replying, replyText, addToast, load]);

  const submitArchive = useCallback(async () => {
    if (!archiving) return;
    if (!archiveReason.trim()) {
      addToast('سببُ الأرشفة مطلوب', 'warning');
      return;
    }
    setSaving(true);
    try {
      await hrInboxSdk.archive(archiving.id, archiveReason);
      addToast('أُرشفت الرسالة — ولم تُحذف', 'success');
      setArchiving(null);
      setArchiveReason('');
      setSelected(null);
      await load();
    } catch (err) {
      addToast(`فشلت الأرشفة: ${getErrorMessage(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [archiving, archiveReason, addToast, load]);

  const closeMessage = useCallback(async (msg: InboxMessageRow) => {
    setBusyId(msg.id);
    try {
      await hrInboxSdk.close(msg.id);
      addToast('أُغلقت الرسالة', 'success');
      await load();
    } catch (err) {
      const m = getErrorMessage(err);
      addToast(
        m.includes('HR_MESSAGE_NOT_REPLIED')
          ? 'لا تُغلَق رسالةٌ قبل الردّ عليها'
          : `فشل الإغلاق: ${m}`,
        'error',
      );
    } finally {
      setBusyId(null);
    }
  }, [addToast, load]);

  const overdueCount = useMemo(
    () => rows.filter((r) => r.isOverdue).length, [rows]);

  // ───────────────────────────────────────────────────────────────
  if (loading && rows.length === 0 && !forbidden) {
    return (
      <div className="flex items-center justify-center py-24" dir="rtl">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600
                        flex items-center justify-center mx-auto mb-4">
          <Lock size={28} />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800 mb-2">
          صندوق البريد غير متاحٍ لدورك
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          رسائلُ الموظفين تمسّ شؤوناً شخصيةً، فصندوقُ الوارد مقصورٌ على
          الموارد البشرية والإدارة. ولك أن تقرأ رسائلك أنت وردودَها من
          صفحة «مركز خدمات الموارد البشرية».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <Inbox className="text-indigo-600" /> صندوق بريد الموارد البشرية
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            رسائلُ الموظفين وردودُها — والردُّ يصل الموظفَ في مركز الخدمات.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm
                     font-semibold hover:bg-slate-200 transition-colors
                     flex items-center gap-2"
        >
          <RefreshCw size={15} /> تحديث
        </button>
      </div>

      {/* البطاقات */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="مفتوحة" value={summary.totalOpen}
                    tone="bg-indigo-50 text-indigo-700" icon={Inbox} />
          <StatCard label="غير مقروءة" value={summary.unread}
                    tone="bg-sky-50 text-sky-700" icon={Mail} />
          <StatCard label="عاجلةٌ مفتوحة" value={summary.urgentOpen}
                    tone="bg-red-50 text-red-700" icon={AlertTriangle} />
          <StatCard label="متأخّرة" value={summary.overdue}
                    tone="bg-amber-50 text-amber-700" icon={Timer} />
          <StatCard label="بلا حالةٍ مرتبطة" value={summary.unlinked}
                    tone="bg-rose-50 text-rose-700" icon={Link2Off} />
        </div>
      )}

      {/* ★★★ العطل ⑪ معروضاً: الرسائل غير المرتبطة لا يصلها ردّ */}
      {summary && summary.unlinked > 0 && !showArchive && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50
                        border border-rose-200 text-sm text-rose-800">
          <Link2Off size={16} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <span className="font-bold">{summary.unlinked}</span> رسالةً بلا حالةٍ
            مرتبطةٍ في مركز الخدمات. الردُّ عليها يُحفظ هنا لكنّه قد لا يظهر
            للموظف في الشاشة التي يتابعها.
          </span>
        </div>
      )}

      {/* المرشِّحات */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحثٌ في الموضوع أو النصّ أو اسم المُرسِل…"
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | InboxState)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
          >
            <option value="all">كل الحالات</option>
            {INBOX_STATES.map((s) => (
              <option key={s} value={s}>{inboxStateLabel(s)}</option>
            ))}
          </select>
          <select
            value={prioFilter}
            onChange={(e) => setPrioFilter(e.target.value as 'all' | InboxPriority)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
          >
            <option value="all">كل الأولويات</option>
            {INBOX_PRIORITIES.map((p) => (
              <option key={p} value={p}>{inboxPriorityLabel(p)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => { setShowArchive(!showArchive); setSelected(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border
                        transition-colors flex items-center gap-1.5 ${
              showArchive
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {showArchive ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            {showArchive ? 'العودة إلى الوارد' : `الأرشيف (${summary?.archived ?? 0})`}
          </button>
          {overdueCount > 0 && (
            <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
              <Timer size={13} /> {overdueCount} متأخّرة في العرض الحاليّ
            </span>
          )}
        </div>
      </div>

      {/* القائمة والعارض */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* القائمة */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200
                        overflow-hidden flex flex-col max-h-[70vh]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center
                          justify-between shrink-0">
            <span className="font-bold text-sm text-slate-700">
              {showArchive ? 'الأرشيف' : 'الوارد'}
            </span>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100
                             px-2 py-0.5 rounded-lg">{rows.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                لا رسائلَ مطابِقة.
              </div>
            ) : rows.map((msg) => (
              <button
                key={msg.id}
                onClick={() => void openMessage(msg)}
                className={`w-full text-right p-3.5 border-b border-slate-100
                            flex items-start gap-2.5 transition-colors ${
                  selected?.id === msg.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                {msg.status === 'new' && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    {/* ★★★★ العطل ①: الاسم يظهر — كان "" فارغةً دائماً */}
                    <p className="font-bold text-sm text-slate-800 truncate">
                      {msg.senderName}
                    </p>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {ageLabel(msg.ageHours)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">{msg.subject}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                                      border ${inboxPriorityTone(msg.priority)}`}>
                      {inboxPriorityLabel(msg.priority)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                                      border ${inboxStateTone(msg.status)}`}>
                      {inboxStateLabel(msg.status)}
                    </span>
                    {msg.isOverdue && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                                       bg-amber-50 text-amber-700 border border-amber-200
                                       flex items-center gap-0.5">
                        <Timer size={9} /> متأخّرة
                      </span>
                    )}
                    {!msg.caseId && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold
                                       bg-rose-50 text-rose-700 border border-rose-200">
                        بلا حالة
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* العارض */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Mail size={44} className="mb-3 opacity-50" />
              <p className="font-bold text-sm">اختر رسالةً لعرضها</p>
              <p className="text-xs mt-1">ستُعرض تفاصيلُ الرسالة وردُّها هنا</p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="pb-4 border-b border-slate-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-800 text-lg">
                      {selected.subject}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      من:{' '}
                      <span className="font-semibold text-slate-700">
                        {selected.senderName}
                      </span>
                      {' — '}
                      <span className="text-slate-600">{selected.senderDept}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtDateTime(selected.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold
                                      border ${inboxPriorityTone(selected.priority)}`}>
                      {inboxPriorityLabel(selected.priority)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold
                                      border ${inboxStateTone(selected.status)}`}>
                      {inboxStateLabel(selected.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="py-4 space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selected.message}
                </p>

                {/* ★★★★ العطل ⑪ معروضاً */}
                {selected.caseId ? (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50
                                  border border-emerald-200 text-xs text-emerald-800">
                    <ExternalLink size={13} className="shrink-0 mt-0.5" />
                    <span>
                      مرتبطةٌ بالحالة «{selected.caseSubject ?? '—'}» في مركز الخدمات
                      — الردُّ سيصل الموظفَ هناك.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50
                                  border border-rose-200 text-xs text-rose-800">
                    <Link2Off size={13} className="shrink-0 mt-0.5" />
                    <span>
                      غيرُ مرتبطةٍ بحالةٍ في مركز الخدمات — الردُّ يُحفظ هنا وقد
                      لا يظهر للموظف في الشاشة التي يتابعها.
                    </span>
                  </div>
                )}

                {selected.reply && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500 mb-1">
                      الردّ — {selected.replierName ?? 'غير معروف'} ·{' '}
                      {fmtDateTime(selected.repliedAt)}
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {selected.reply}
                    </p>
                  </div>
                )}

                {selected.archivedAt && (
                  <DetailRow label="أُرشفت في" value={fmtDateTime(selected.archivedAt)} />
                )}
              </div>

              {/* ★★★★ العطل ②: الأزرار تعمل الآن */}
              {!selected.archivedAt && (
                <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  {!isInboxFinal(selected.status) && (
                    <button
                      onClick={() => { setReplying(selected); setReplyText(selected.reply ?? ''); }}
                      disabled={busyId !== null}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm
                                 font-semibold hover:bg-indigo-700 disabled:opacity-50
                                 transition-colors flex items-center gap-1.5"
                    >
                      <Send size={14} /> {selected.reply ? 'تعديل الردّ' : 'ردّ'}
                    </button>
                  )}
                  {selected.status === 'replied' && (
                    <button
                      onClick={() => void closeMessage(selected)}
                      disabled={busyId !== null}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm
                                 font-semibold hover:bg-emerald-700 disabled:opacity-50
                                 transition-colors flex items-center gap-1.5"
                    >
                      {busyId === selected.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <CheckCircle2 size={14} />}
                      إغلاق
                    </button>
                  )}
                  <button
                    onClick={() => { setArchiving(selected); setArchiveReason(''); }}
                    disabled={busyId !== null}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm
                               font-semibold hover:bg-slate-200 disabled:opacity-50
                               transition-colors flex items-center gap-1.5"
                  >
                    <Archive size={14} /> أرشفة
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* نافذة الردّ */}
      {replying && (
        <Modal title={`الردّ على: ${replying.subject}`} onClose={() => setReplying(null)}>
          <DetailRow label="المُرسِل" value={`${replying.senderName} — ${replying.senderDept}`} />
          <FormField label="نصُّ الردّ" required>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={6}
              placeholder="اكتب الردَّ هنا…"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm
                         leading-relaxed resize-none"
            />
          </FormField>
          {!replying.caseId && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50
                            border border-amber-200 text-xs text-amber-800">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                هذه الرسالة غير مرتبطةٍ بحالةٍ في مركز الخدمات، فقد لا يرى
                الموظفُ الردَّ في الشاشة التي يتابعها.
              </span>
            </div>
          )}
          <ModalActions
            onClose={() => setReplying(null)}
            onSubmit={() => void submitReply()}
            submitLabel={saving ? 'جارٍ الإرسال…' : 'إرسال الردّ'}
            color="blue"
          />
        </Modal>
      )}

      {/* نافذة الأرشفة */}
      {archiving && (
        <Modal title={`أرشفة: ${archiving.subject}`} onClose={() => setArchiving(null)}>
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50
                          border border-slate-200 text-xs text-slate-600">
            <Archive size={13} className="shrink-0 mt-0.5" />
            <span>
              الأرشفةُ لا تحذف الرسالة — تبقى محفوظةً ويمكن استعراضُها في
              الأرشيف. الحذفُ النهائيّ ممنوعٌ في القاعدة.
            </span>
          </div>
          <FormField label="سببُ الأرشفة" required>
            <input
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="مثال: عولجت هاتفياً"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </FormField>
          <ModalActions
            onClose={() => setArchiving(null)}
            onSubmit={() => void submitArchive()}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'أرشفة'}
            color="orange"
          />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
function StatCard({ label, value, tone, icon: Icon }: {
  label: string;
  value: number;
  tone: string;
  icon: typeof Inbox;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 truncate">{label}</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}
