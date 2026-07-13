/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationsPage - التبليغات (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ✅ 4 استخدام any → 0
 *  ✅ (user as any).permissions → user.permissions (موجود)
 *  ✅ (user as any).manufacturing_dept → user.manufacturingDept (موجود)
 *  ✅ (user as any).department → user.department (موجود)
 *  ✅ priority as any → PriorityLevel union
 *  ✅ تنظيف markdown artifacts + إصلاح addToast المكسور
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import {
  Megaphone, FileText, Image, Video, BarChart3, Send, X,
  Calendar, Clock, User, ThumbsUp, Eye, Bell,
  Target, Plus, AlertCircle, Star,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Card from '../../shared/components/ui/Card';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

type AnnouncementType = 'text' | 'image' | 'video' | 'poll';
type PriorityLevel = 'normal' | 'important' | 'urgent';
type FilterType = 'all' | AnnouncementType;

interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters: string[];
}

interface PollData {
  question: string;
  options: PollOption[];
  endDate?: string;
  totalVotes: number;
}

interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  content: string;
  mediaUrl?: string;
  targetDepartments: string[];
  author: string;
  authorRole: string;
  authorId: string;
  createdAt: string;
  priority: PriorityLevel;
  tags: string[];
  likes: number;
  likedBy: string[];
  views: number;
  hasNotification: boolean;
  poll?: PollData;
}

interface AnnouncementForm {
  title: string;
  content: string;
  type: AnnouncementType;
  mediaUrl: string;
  tags: string;
  priority: PriorityLevel;
  hasNotification: boolean;
  targetDepartments: string[];
}

// ════════════════════════════════════════════════════
// ثوابت ومساعدات
// ════════════════════════════════════════════════════

const STORAGE_KEY = 'hr_advanced_notifications';
const DEPARTMENTS = ['الكل', 'الإدارة العامة', 'الموارد البشرية', 'قسم التقنية', 'قسم المبيعات', 'قسم التسويق', 'قسم الدعم الفني', 'المشرفين', 'الحراسة', 'المطورين'];

const loadData = (): Announcement[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Announcement[]) : [];
  } catch {
    return [];
  }
};

const saveData = (data: Announcement[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

const initialForm: AnnouncementForm = {
  title: '', content: '', type: 'text', mediaUrl: '',
  tags: '', priority: 'normal', hasNotification: true, targetDepartments: [],
};

const emptyPoll = (): PollData => ({
  question: '',
  options: [
    { id: '1', text: '', votes: 0, voters: [] },
    { id: '2', text: '', votes: 0, voters: [] },
  ],
  totalVotes: 0,
});

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  const [announcements, setAnnouncements] = useState<Announcement[]>(loadData);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>(initialForm);
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pollData, setPollData] = useState<PollData>(emptyPoll());
  const [deptFilter, setDeptFilter] = useState('all');

  const canPublish = user?.role === 'admin' || user?.role === 'developer';
  const canPublishWithPermission = user?.role === 'hr' && (user?.permissions?.includes('publish-announcements') || false);
  const canPublishAny = canPublish || canPublishWithPermission;

  useEffect(() => { saveData(announcements); }, [announcements]);

  const userDept = user?.manufacturingDept || user?.department || '';

  const visibleAnnouncements = announcements.filter((a) => {
    if (a.targetDepartments.length === 0 || a.targetDepartments.includes('الكل')) return true;
    if (user?.role === 'admin' || user?.role === 'developer') return true;
    if (a.targetDepartments.includes(userDept)) return true;
    if ((user?.role === 'supervisor' || user?.role === 'manager') && a.targetDepartments.includes('المشرفين')) return true;
    if (user?.role === 'hr' && a.targetDepartments.includes('الموارد البشرية')) return true;
    if (user?.role === 'gatekeeper' && a.targetDepartments.includes('الحراسة')) return true;
    return false;
  });

  const filtered = visibleAnnouncements
    .filter((a) => filter === 'all' || a.type === filter)
    .filter((a) => deptFilter === 'all' || a.targetDepartments.includes(deptFilter) || (deptFilter === 'الكل' && a.targetDepartments.length === 0));

  const targetDeptNames = (deps: string[]): string => {
    if (deps.length === 0 || deps.includes('الكل')) return 'جميع الأقسام';
    return deps.join('، ');
  };

  const handleCreate = () => {
    if (!form.title.trim() || !form.content.trim()) return;
    if (form.type === 'poll' && (!pollData.question.trim() || pollData.options.filter((o) => o.text.trim()).length < 2)) {
      addToast('الاستفتاء يجب أن يحتوي على سؤال وخيارين', 'error');
      return;
    }
    if (editingId) {
      setAnnouncements((prev) => prev.map((a) => (a.id === editingId ? { ...a, title: form.title, content: form.content, type: form.type, poll: form.type === 'poll' ? pollData : undefined } : a)));
      addToast('تم التحديث', 'success');
    } else {
      const newAnn: Announcement = {
        id: Date.now().toString(),
        type: form.type,
        title: form.title,
        content: form.content,
        mediaUrl: form.mediaUrl || undefined,
        targetDepartments: form.targetDepartments.length > 0 ? form.targetDepartments : ['الكل'],
        author: user?.full_name || user?.name || 'مستخدم',
        authorRole: user?.role || 'employee',
        authorId: user?.id || '',
        createdAt: new Date().toISOString(),
        priority: form.priority,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        likes: 0,
        likedBy: [],
        views: 0,
        hasNotification: form.hasNotification,
        poll: form.type === 'poll' ? { ...pollData } : undefined,
      };
      setAnnouncements((prev) => [newAnn, ...prev]);
      addToast(`📢 تم نشر "${form.title}"`, 'success');
    }
    setForm(initialForm);
    setPollData(emptyPoll());
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('حذف؟')) return;
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    addToast('تم الحذف', 'info');
  };

  const handleEdit = (ann: Announcement) => {
    setForm({
      title: ann.title, content: ann.content, type: ann.type,
      mediaUrl: ann.mediaUrl || '', tags: ann.tags.join(', '),
      priority: ann.priority, hasNotification: ann.hasNotification,
      targetDepartments: ann.targetDepartments.includes('الكل') ? [] : ann.targetDepartments,
    });
    if (ann.poll) setPollData(ann.poll);
    setEditingId(ann.id);
    setShowForm(true);
  };

  const handleLike = (id: string) => {
    if (!user?.id) return;
    setAnnouncements((prev) => prev.map((a) => (a.id !== id ? a : {
      ...a,
      likes: a.likedBy.includes(user.id) ? a.likes - 1 : a.likes + 1,
      likedBy: a.likedBy.includes(user.id) ? a.likedBy.filter((uid) => uid !== user.id) : [...a.likedBy, user.id],
    })));
  };

  const handleVote = (annId: string, optionId: string) => {
    if (!user?.id) return;
    setAnnouncements((prev) => prev.map((a) => {
      if (a.id !== annId || !a.poll) return a;
      if (a.poll.options.some((o) => o.voters.includes(user.id))) {
        addToast('سبق أن صوت', 'warning');
        return a;
      }
      return {
        ...a,
        poll: {
          ...a.poll,
          options: a.poll.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1, voters: [...o.voters, user.id] } : o)),
          totalVotes: a.poll.totalVotes + 1,
        },
      };
    }));
    addToast('تم التصويت', 'success');
  };

  const myVoteFor = (poll: PollData | undefined): string | null => {
    if (!poll || !user?.id) return null;
    for (const opt of poll.options) {
      if (opt.voters.includes(user.id)) return opt.id;
    }
    return null;
  };

  const getPriorityColor = (p: PriorityLevel) => {
    switch (p) {
      case 'urgent': return { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', icon: AlertCircle };
      case 'important': return { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', icon: Star };
      default: return { bg: 'bg-white', badge: 'bg-blue-100 text-blue-700', icon: Bell };
    }
  };

  const getTypeIcon = (t: AnnouncementType) =>
    t === 'image' ? <Image size={16} className="text-green-500" />
    : t === 'video' ? <Video size={16} className="text-purple-500" />
    : t === 'poll' ? <BarChart3 size={16} className="text-orange-500" />
    : <FileText size={16} className="text-blue-500" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-fade-in" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{announcements.length}</p>
          <p className="text-indigo-100 text-xs font-bold mt-1">إجمالي التبليغات</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{visibleAnnouncements.length}</p>
          <p className="text-emerald-100 text-xs font-bold mt-1">متاحة لك</p>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-700 rounded-2xl p-4 text-white">
          <p className="text-2xl font-black">{canPublishAny ? 'نعم' : 'لا'}</p>
          <p className="text-rose-100 text-xs font-bold mt-1">صلاحية النشر</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Megaphone className="text-indigo-600" size={28} /> التبليغات</h2>
          <p className="text-slate-500 text-sm">إعلانات واستفتاءات للموظفين</p>
        </div>
        {canPublishAny && (
          <button onClick={() => { setForm(initialForm); setPollData(emptyPoll()); setEditingId(null); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold shadow-sm transition-all">
            <Send size={18} /> نشر تبليغ
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'text', 'image', 'video', 'poll'] as const).map((tab) => (
            <button key={tab} onClick={() => setFilter(tab)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${filter === tab ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {tab === 'all' ? <Bell size={14} /> : tab === 'text' ? <FileText size={14} /> : tab === 'image' ? <Image size={14} /> : tab === 'video' ? <Video size={14} /> : <BarChart3 size={14} />}
              {tab === 'all' ? 'الكل' : tab === 'text' ? 'نصوص' : tab === 'image' ? 'صور' : tab === 'video' ? 'فيديو' : 'استفتاءات'}
            </button>
          ))}
        </div>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none">
          <option value="all">جميع الأقسام</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-2 border-indigo-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{editingId ? '✏️ تعديل' : '📢 نشر تبليغ'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['text', 'image', 'video', 'poll'] as const).map((t) => (
                <button key={t} onClick={() => setForm((p) => ({ ...p, type: t }))} className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${form.type === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                  {t === 'text' ? '📝 نص' : t === 'image' ? '🖼️ صورة' : t === 'video' ? '🎬 فيديو' : '📊 استفتاء'}
                </button>
              ))}
            </div>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="العنوان *" className="w-full border rounded-xl px-4 py-2 outline-none focus:border-indigo-500 font-bold" />
            <textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} placeholder="المحتوى *" rows={3} className="w-full border rounded-xl px-4 py-2 outline-none focus:border-indigo-500 resize-none" />

            {form.type === 'poll' && (
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 space-y-2">
                <input value={pollData.question} onChange={(e) => setPollData((p) => ({ ...p, question: e.target.value }))} placeholder="سؤال الاستفتاء *" className="w-full border rounded-xl px-3 py-2 outline-none focus:border-orange-500" />
                {pollData.options.map((opt, i) => (
                  <div key={opt.id} className="flex gap-2">
                    <input value={opt.text} onChange={(e) => { const opts = [...pollData.options]; opts[i] = { ...opts[i], text: e.target.value }; setPollData((p) => ({ ...p, options: opts })); }} placeholder={`خيار ${i + 1}`} className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-500" />
                    {pollData.options.length > 2 && <button onClick={() => setPollData((p) => ({ ...p, options: p.options.filter((o) => o.id !== opt.id) }))} className="text-red-400">✕</button>}
                  </div>
                ))}
                <button onClick={() => setPollData((p) => ({ ...p, options: [...p.options, { id: Date.now().toString(), text: '', votes: 0, voters: [] }] }))} className="text-sm font-bold text-orange-600 flex items-center gap-1"><Plus size={14} /> إضافة خيار</button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as PriorityLevel }))} className="border rounded-xl px-3 py-2 text-sm outline-none">
                <option value="normal">🔵 عادية</option>
                <option value="important">🟡 مهمة</option>
                <option value="urgent">🔴 عاجلة</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.hasNotification} onChange={(e) => setForm((p) => ({ ...p, hasNotification: e.target.checked }))} /> 🔔 مع إشعار</label>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">إلغاء</button>
              <button onClick={handleCreate} disabled={!form.title.trim() || !form.content.trim()} className="px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"><Send size={14} className="inline ml-1" /> {editingId ? 'تحديث' : 'نشر'}</button>
            </div>
          </div>
        </Card>
      )}

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone size={64} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-xl font-bold text-slate-600">لا توجد تبليغات</h3>
          <p className="text-slate-400 text-sm">{canPublishAny ? 'انقر "نشر تبليغ" لإنشاء أول تبليغ' : 'لا توجد تبليغات متاحة'}</p>
        </div>
      ) : filtered.map((ann) => {
        const pc = getPriorityColor(ann.priority);
        const isLiked = user?.id ? ann.likedBy.includes(user.id) : false;
        const myVote = myVoteFor(ann.poll);
        const PriorityIcon = pc.icon;
        return (
          <div key={ann.id} className={`rounded-2xl p-4 sm:p-5 border ${pc.bg} shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{ann.author.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-800">{ann.title}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${pc.badge}`}><PriorityIcon size={10} className="inline ml-1" />{ann.priority === 'urgent' ? 'عاجل' : ann.priority === 'important' ? 'مهم' : 'عادي'}</span>
                  {getTypeIcon(ann.type)}
                </div>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{ann.content}</p>

                {/* Poll */}
                {ann.poll && (
                  <div className="mt-3 bg-orange-50 rounded-xl p-4 border border-orange-200" onClick={(e) => e.stopPropagation()}>
                    <p className="font-bold text-sm text-orange-800 mb-2 flex items-center gap-1"><BarChart3 size={14} /> {ann.poll.question}</p>
                    {ann.poll.options.map((opt) => {
                      const pct = ann.poll!.totalVotes > 0 ? Math.round((opt.votes / ann.poll!.totalVotes) * 100) : 0;
                      return (
                        <div key={opt.id} className="mb-2">
                          <button onClick={() => handleVote(ann.id, opt.id)} disabled={!!myVote} className={`w-full text-right px-3 py-2 rounded-xl text-sm border flex items-center justify-between ${myVote === opt.id ? 'bg-orange-100 border-orange-500 font-bold' : myVote ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200 hover:border-orange-300'}`}>
                            <span className="flex items-center gap-1">{myVote === opt.id && '✓ '}{opt.text}</span>
                            <span className="text-xs text-slate-500">{opt.votes} ({pct}%)</span>
                          </button>
                          <div className="h-1.5 bg-slate-100 rounded-full mt-0.5 overflow-hidden"><div className={`h-full rounded-full ${myVote === opt.id ? 'bg-orange-500' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-400 mt-1">إجمالي: {ann.poll.totalVotes} صوت</p>
                  </div>
                )}

                {/* Media */}
                {ann.mediaUrl && ann.type === 'image' && <img src={ann.mediaUrl} alt="" className="mt-3 rounded-xl max-h-48 object-cover border" onClick={(e) => { e.stopPropagation(); window.open(ann.mediaUrl, '_blank'); }} />}
                {ann.mediaUrl && ann.type === 'video' && <video src={ann.mediaUrl} controls className="mt-3 rounded-xl max-h-48 border" onClick={(e) => e.stopPropagation()} />}

                {/* Tags + Dept */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {ann.tags.map((t, i) => <span key={i} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">#{t}</span>)}
                  <span className="text-[10px] text-slate-400 flex items-center gap-1"><Target size={10} /> {targetDeptNames(ann.targetDepartments)}</span>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                  <span><User size={11} className="inline ml-1" />{ann.author}</span>
                  <span><Calendar size={11} className="inline ml-1" />{format(new Date(ann.createdAt), 'dd MMM', { locale: ar })}</span>
                  <span><Clock size={11} className="inline ml-1" />{format(new Date(ann.createdAt), 'HH:mm')}</span>
                  <span><Eye size={11} className="inline ml-1" />{ann.views}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                  <button onClick={(e) => { e.stopPropagation(); handleLike(ann.id); }} className={`flex items-center gap-1 text-xs font-bold ${isLiked ? 'text-red-500' : 'text-slate-400 hover:text-red-400'}`}>
                    <ThumbsUp size={13} fill={isLiked ? 'currentColor' : 'none'} /> {ann.likes}
                  </button>
                  {(canPublishAny || ann.authorId === user?.id) && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(ann); }} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">✏️ تعديل</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(ann.id); }} className="text-xs text-red-500 hover:text-red-700 font-semibold">🗑️ حذف</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
