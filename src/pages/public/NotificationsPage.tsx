/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationsPage v3 — لوحة التبليغات والإعلانات
 * ════════════════════════════════════════════════════════════════
 *
 *  🔒 عزل البيانات (multi-tenant):
 *  ─────────────────────────────────────────────────────────────
 *  ✅ AnnouncementService يحقن tenant_id في كل INSERT عبر BaseService
 *  ✅ RLS في Supabase: كل شركة ترى بياناتها فقط
 *  ✅ لا localStorage — كل البيانات في Supabase
 *  ✅ Soft delete: التبليغ المحذوف لا يُحذف من DB
 *
 *  🎯 صلاحيات النشر:
 *  ─────────────────────────────────────────────────────────────
 *  - admin / developer / hr / manager / supervisor → ينشر دائماً
 *  - employee بصلاحية 'publish-announcements' → ينشر
 *  - بقية الموظفين → قراءة فقط + تصويت + إعجاب
 *
 *  🎨 UX:
 *  ─────────────────────────────────────────────────────────────
 *  ✅ Feed عمودي بتصميم social-media مع بطاقات ذكية
 *  ✅ رفع صور/فيديو عبر URL + Preview
 *  ✅ استفتاء تفاعلي مع progress bar حي
 *  ✅ أشرطة الأولوية الملونة + تصفية متعددة
 *  ✅ Skeleton loading + حالات فارغة/خطأ احترافية
 *  ✅ Modal نشر احترافي مع toggle الهوية المجهولة
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Megaphone, FileText, Image as ImageIcon, Video, BarChart3, Send, X,
  Calendar, ThumbsUp, Eye, Plus, AlertTriangle, RefreshCw,
  Filter, Search, ChevronDown, Check, Globe, Lock,
  Tag, Target, Bell, BellOff, Trash2, Edit3, Loader2,
  Sparkles, Users, Briefcase, Shield,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import {
  announcementService,
  AnnouncementService,
  type Announcement,
  type AnnouncementType,
  type AnnouncementPriority,
  type PollOption,
} from '../../services/sdk/AnnouncementService';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ════════════════════════════════════════════════════════════════
//  الثوابت
// ════════════════════════════════════════════════════════════════

const PRIORITY_CFG: Record<AnnouncementPriority, {
  label: string; pill: string; bar: string; glow: string;
}> = {
  normal:    { label: 'عادي',   pill: 'bg-slate-100 text-slate-600 border border-slate-200',    bar: 'bg-slate-400',   glow: '' },
  important: { label: 'مهم',    pill: 'bg-amber-100 text-amber-700 border border-amber-200',    bar: 'bg-amber-400',   glow: 'ring-1 ring-amber-100' },
  urgent:    { label: 'عاجل',   pill: 'bg-red-100 text-red-700 border border-red-200',          bar: 'bg-red-500',     glow: 'ring-1 ring-red-100' },
};

const TYPE_CFG: Record<AnnouncementType, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  text:  { label: 'نص',        icon: FileText,  color: 'text-blue-600',   bg: 'bg-blue-50' },
  image: { label: 'صورة',      icon: ImageIcon, color: 'text-emerald-600',bg: 'bg-emerald-50' },
  video: { label: 'فيديو',     icon: Video,     color: 'text-purple-600', bg: 'bg-purple-50' },
  poll:  { label: 'استفتاء',   icon: BarChart3, color: 'text-orange-600', bg: 'bg-orange-50' },
};

const ROLES_AR: Record<string, string> = {
  admin: 'المسؤول', hr: 'الموارد البشرية', manager: 'المدير',
  supervisor: 'المشرف', employee: 'الموظف', gatekeeper: 'الحارس',
  developer: 'المطور',
};

const DEPT_LIST = [
  'الإدارة العامة', 'الموارد البشرية', 'قسم التقنية',
  'قسم المبيعات', 'قسم التسويق', 'قسم الدعم الفني',
  'قسم الإنتاج', 'قسم المالية', 'الحراسة',
];

const ROLE_LIST = ['admin', 'hr', 'manager', 'supervisor', 'employee', 'gatekeeper'];

// ════════════════════════════════════════════════════════════════
//  مكونات مساعدة
// ════════════════════════════════════════════════════════════════

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-pulse">
      <div className="h-1.5 bg-slate-200" />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-200" />
          <div className="space-y-2 flex-1">
            <div className="h-3.5 bg-slate-200 rounded-full w-1/3" />
            <div className="h-2.5 bg-slate-100 rounded-full w-1/4" />
          </div>
          <div className="h-5 bg-slate-100 rounded-full w-14" />
        </div>
        <div className="h-5 bg-slate-200 rounded-full w-2/3 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-slate-100 rounded-full w-full" />
          <div className="h-3 bg-slate-100 rounded-full w-4/5" />
        </div>
      </div>
    </div>
  );
}

// ─── بطاقة الاستفتاء ─────────────────────────────────────────
function PollCard({ poll, announcementId, onVote }: {
  poll: { id: string; question: string; options: PollOption[]; total_votes: number; user_vote_option_id?: string };
  announcementId: string;
  onVote: (pollId: string, optionId: string, annId: string) => Promise<void>;
}) {
  const hasVoted = !!poll.user_vote_option_id;
  const [voting, setVoting] = useState<string | null>(null);

  const handleVote = async (optId: string) => {
    if (hasVoted || voting) return;
    setVoting(optId);
    await onVote(poll.id, optId, announcementId);
    setVoting(null);
  };

  return (
    <div className="mt-4 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-orange-100 rounded-lg">
          <BarChart3 size={14} className="text-orange-600" />
        </div>
        <p className="font-bold text-sm text-orange-900">{poll.question}</p>
      </div>

      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct = poll.total_votes > 0
            ? Math.round(((opt.votes_count ?? 0) / poll.total_votes) * 100)
            : 0;
          const isMyVote = poll.user_vote_option_id === opt.id;
          const isVoting = voting === opt.id;

          return (
            <button
              key={opt.id}
              disabled={hasVoted || !!voting}
              onClick={() => handleVote(opt.id)}
              className={`
                w-full text-right relative overflow-hidden rounded-xl border-2 transition-all
                ${isMyVote
                  ? 'border-orange-400 bg-orange-50'
                  : hasVoted
                  ? 'border-slate-100 bg-white opacity-70 cursor-default'
                  : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/50'
                }
              `}
            >
              {/* شريط التقدم في الخلفية */}
              {hasVoted && (
                <div
                  className="absolute inset-y-0 right-0 bg-orange-100 transition-all duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {isVoting && <Loader2 size={14} className="animate-spin text-orange-500" />}
                  {isMyVote && !isVoting && <Check size={14} className="text-orange-600 font-black" />}
                  <span className={`text-sm font-medium ${isMyVote ? 'text-orange-800 font-bold' : 'text-slate-700'}`}>
                    {opt.text}
                  </span>
                </div>
                {hasVoted && (
                  <span className="text-xs font-bold text-orange-700">{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-orange-600 mt-2 font-medium">
        {poll.total_votes} {hasVoted ? '· صوتك مسجَّل ✓' : '· اضغط للتصويت'}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  الصفحة الرئيسية
// ════════════════════════════════════════════════════════════════

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  const canPublish = AnnouncementService.canPublish({
    role: user?.role,
    permissions: user?.permissions as string[] | undefined,
  });

  // ─── الحالة ────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [showForm, setShowForm]           = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [deleting, setDeleting]           = useState<string | null>(null);

  // ─── فلاتر ───────────────────────────────────────────────
  const [filterType, setFilterType]         = useState<AnnouncementType | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<AnnouncementPriority | 'all'>('all');
  const [search, setSearch]                 = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // ─── نموذج النشر ─────────────────────────────────────────
  const [form, setForm] = useState({
    title:           '',
    content:         '',
    type:            'text' as AnnouncementType,
    priority:        'normal' as AnnouncementPriority,
    media_url:       '',
    tags:            '',
    is_anonymous:    false,
    has_notification: true,
    target_roles:    [] as string[],
    target_depts:    [] as string[],
  });
  const [pollQuestion, setPollQuestion]     = useState('');
  const [pollOptions, setPollOptions]       = useState(['', '']);

  const searchRef = useRef<HTMLInputElement>(null);

  // ════════════════════════════════════════════════════════
  //  جلب البيانات
  // ════════════════════════════════════════════════════════
  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await announcementService.findAnnouncements({ limit: 100 });
      // فلترة الرؤية حسب الدور/القسم
      const visible = data.filter(a =>
        AnnouncementService.isVisibleToUser(a, {
          role:             user?.role,
          department:       user?.department,
          manufacturingDept: (user as any)?.manufacturingDept,
        })
      );
      setAnnouncements(visible);
    } catch (err: any) {
      setFetchError(err?.message || 'تعذّر تحميل التبليغات');
    } finally {
      setLoading(false);
    }
  }, [user?.role, user?.department]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  // ════════════════════════════════════════════════════════
  //  إنشاء تبليغ
  // ════════════════════════════════════════════════════════
  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      addToast('يرجى ملء العنوان والمحتوى', 'warning');
      return;
    }
    if (form.type === 'poll') {
      const validOpts = pollOptions.filter(o => o.trim());
      if (!pollQuestion.trim() || validOpts.length < 2) {
        addToast('الاستفتاء يحتاج سؤالاً وخيارين على الأقل', 'warning');
        return;
      }
    }

    setSubmitting(true);
    try {
      await announcementService.createAnnouncement(
        {
          type:             form.type,
          priority:         form.priority,
          title:            form.title.trim(),
          content:          form.content.trim(),
          media_url:        form.media_url.trim() || undefined,
          target_roles:     form.target_roles,
          target_depts:     form.target_depts,
          tags:             form.tags.split(',').map(t => t.trim()).filter(Boolean),
          has_notification: form.has_notification,
          author_name:      form.is_anonymous ? undefined : (user?.full_name || user?.name),
          author_role:      form.is_anonymous ? undefined : user?.role,
          poll: form.type === 'poll' ? {
            question: pollQuestion.trim(),
            options:  pollOptions.filter(o => o.trim()),
          } : undefined,
        },
        user?.id ?? '',
      );

      addToast(`📢 تم نشر "${form.title}"`, 'success');
      resetForm();
      await fetchAnnouncements();
    } catch (err: any) {
      addToast(err?.message || 'فشل نشر التبليغ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: '', content: '', type: 'text', priority: 'normal',
      media_url: '', tags: '', is_anonymous: false, has_notification: true,
      target_roles: [], target_depts: [],
    });
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowForm(false);
  };

  // ─── حذف ────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('تأكيد حذف هذا التبليغ؟')) return;
    setDeleting(id);
    try {
      await announcementService.softDelete(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      addToast('تم حذف التبليغ', 'info');
    } catch (err: any) {
      addToast(err?.message || 'فشل الحذف', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // ─── إعجاب ──────────────────────────────────────────────
  const handleLike = async (id: string) => {
    if (!user?.id) return;
    const liked = await announcementService.toggleLike(id, user.id).catch(() => null);
    setAnnouncements(prev => prev.map(a => {
      if (a.id !== id) return a;
      const alreadyLiked = a.liked_by.includes(user.id);
      return {
        ...a,
        likes_count: alreadyLiked ? a.likes_count - 1 : a.likes_count + 1,
        liked_by:    alreadyLiked
          ? a.liked_by.filter(uid => uid !== user.id)
          : [...a.liked_by, user.id],
      };
    }));
  };

  // ─── تصويت ──────────────────────────────────────────────
  const handleVote = async (pollId: string, optionId: string, annId: string) => {
    if (!user?.id) return;
    try {
      await announcementService.castVote(pollId, optionId, user.id);
      setAnnouncements(prev => prev.map(a => {
        if (a.id !== annId || !a.poll) return a;
        return {
          ...a,
          poll: {
            ...a.poll,
            user_vote_option_id: optionId,
            total_votes: a.poll.total_votes + 1,
            options: a.poll.options.map(o =>
              o.id === optionId ? { ...o, votes_count: (o.votes_count ?? 0) + 1, has_voted: true } : o
            ),
          },
        };
      }));
    } catch (err: any) {
      addToast(err?.message || 'فشل التصويت', 'error');
    }
  };

  // ─── فلترة ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...announcements];
    if (filterType !== 'all')     list = list.filter(a => a.type === filterType);
    if (filterPriority !== 'all') list = list.filter(a => a.priority === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
      );
    }
    return list;
  }, [announcements, filterType, filterPriority, search]);

  // ─── إحصائيات ───────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     announcements.length,
    urgent:    announcements.filter(a => a.priority === 'urgent').length,
    polls:     announcements.filter(a => a.type === 'poll').length,
    today:     announcements.filter(a => {
      const d = new Date(a.created_at);
      const n = new Date();
      return d.getDate() === n.getDate() && d.getMonth() === n.getMonth();
    }).length,
  }), [announcements]);

  // ════════════════════════════════════════════════════════
  //  العرض
  // ════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── الهيدر ─────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Megaphone size={20} className="text-white" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">التبليغات</h1>
            </div>
            <p className="text-sm text-slate-500 mr-12">
              {stats.total} تبليغ · {stats.today > 0 && `${stats.today} جديد اليوم`}
            </p>
          </div>
          {canPublish && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5 text-sm"
            >
              <Plus size={17} /> نشر
            </button>
          )}
        </div>

        {/* ── إحصائيات ───────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'الكل',   value: stats.total,   color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'عاجلة',  value: stats.urgent,  color: 'text-red-600',    bg: 'bg-red-50' },
            { label: 'استفتاء',value: stats.polls,   color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'اليوم',  value: stats.today,   color: 'text-emerald-600',bg: 'bg-emerald-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── بحث وفلاتر ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="بحث..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pr-9 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              className={`p-2.5 rounded-xl border transition-colors ${showFilterMenu ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-slate-200 text-slate-500'}`}
            >
              <Filter size={16} />
            </button>
          </div>

          {/* نوع التبليغ */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(['all', 'text', 'image', 'video', 'poll'] as const).map(t => {
              const cfg = t === 'all' ? null : TYPE_CFG[t];
              const Icon = cfg?.icon ?? Megaphone;
              return (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    filterType === t
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Icon size={13} />
                  {t === 'all' ? 'الكل' : cfg?.label}
                </button>
              );
            })}
          </div>

          {/* فلتر الأولوية */}
          {showFilterMenu && (
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {(['all', 'normal', 'important', 'urgent'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    filterPriority === p
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {p === 'all' ? 'جميع الأولويات' : PRIORITY_CFG[p].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── القائمة ────────────────────────────────── */}

        {loading && <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>}

        {!loading && fetchError && (
          <div className="bg-white rounded-2xl border border-red-100 p-8 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle size={26} className="text-red-400" />
            </div>
            <h3 className="font-bold text-slate-800 mb-1">تعذّر التحميل</h3>
            <p className="text-sm text-slate-500 mb-5">{fetchError}</p>
            <button
              onClick={fetchAnnouncements}
              className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700"
            >
              <RefreshCw size={15} /> إعادة المحاولة
            </button>
          </div>
        )}

        {!loading && !fetchError && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm">
            <Megaphone size={40} className="mx-auto text-slate-200 mb-3" />
            <h3 className="font-bold text-slate-700">
              {search ? 'لا توجد نتائج' : 'لا توجد تبليغات بعد'}
            </h3>
            <p className="text-sm text-slate-400 mt-1 mb-4">
              {search ? 'جرب كلمة بحث مختلفة' : canPublish ? 'ابدأ بنشر أول تبليغ' : 'لا توجد تبليغات متاحة'}
            </p>
            {canPublish && !search && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm shadow-md shadow-indigo-200"
              >
                <Plus size={16} /> نشر أول تبليغ
              </button>
            )}
          </div>
        )}

        {!loading && !fetchError && filtered.map(ann => {
          const pc    = PRIORITY_CFG[ann.priority];
          const tc    = TYPE_CFG[ann.type];
          const TypeIcon = tc.icon;
          const isLiked  = user?.id ? ann.liked_by.includes(user.id) : false;
          const isOwner  = ann.author_id === user?.id;
          const canEdit  = isOwner || ['admin', 'hr'].includes(user?.role ?? '');
          const isDeleting = deleting === ann.id;

          return (
            <article
              key={ann.id}
              className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-all ${pc.glow}`}
            >
              {/* شريط الأولوية العلوي */}
              <div className={`h-1.5 ${pc.bar}`} />

              <div className="p-5">
                {/* الهيدر */}
                <div className="flex items-start gap-3 mb-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-md shadow-indigo-100">
                    {ann.author_name ? ann.author_name.charAt(0) : '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">
                        {ann.author_name || 'مجهول'}
                      </span>
                      {ann.author_role && (
                        <span className="text-xs text-slate-400">
                          · {ROLES_AR[ann.author_role] ?? ann.author_role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">
                        {format(new Date(ann.created_at), 'd MMM yyyy، h:mm a', { locale: ar })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${pc.pill}`}>
                      {pc.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${tc.bg} ${tc.color}`}>
                      <TypeIcon size={11} /> {tc.label}
                    </span>
                  </div>
                </div>

                {/* الجمهور المستهدف */}
                {(ann.target_roles.length > 0 || ann.target_depts.length > 0) && (
                  <div className="flex items-center gap-1.5 mb-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                    <Target size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-xs text-slate-500">
                      {ann.target_roles.length > 0 && ann.target_roles.map(r => ROLES_AR[r] ?? r).join('، ')}
                      {ann.target_roles.length > 0 && ann.target_depts.length > 0 && ' · '}
                      {ann.target_depts.length > 0 && ann.target_depts.join('، ')}
                    </span>
                  </div>
                )}

                {/* المحتوى */}
                <h2 className="font-black text-slate-900 text-base mb-2 leading-snug">{ann.title}</h2>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{ann.content}</p>

                {/* الصورة */}
                {ann.media_url && ann.type === 'image' && (
                  <img
                    src={ann.media_url}
                    alt={ann.title}
                    onClick={() => window.open(ann.media_url, '_blank')}
                    className="mt-3 w-full rounded-2xl object-cover max-h-64 border border-slate-100 cursor-zoom-in"
                  />
                )}

                {/* الفيديو */}
                {ann.media_url && ann.type === 'video' && (
                  <video
                    src={ann.media_url}
                    controls
                    className="mt-3 w-full rounded-2xl border border-slate-100 max-h-64"
                  />
                )}

                {/* الاستفتاء */}
                {ann.type === 'poll' && ann.poll && (
                  <PollCard
                    poll={ann.poll}
                    announcementId={ann.id}
                    onVote={handleVote}
                  />
                )}

                {/* الوسوم */}
                {ann.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {ann.tags.map((t, i) => (
                      <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-medium">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {/* شريط الإجراءات */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleLike(ann.id)}
                      className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                        isLiked ? 'text-red-500' : 'text-slate-400 hover:text-red-400'
                      }`}
                    >
                      <ThumbsUp size={15} fill={isLiked ? 'currentColor' : 'none'} />
                      <span>{ann.likes_count}</span>
                    </button>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Eye size={13} />
                      <span>{ann.views}</span>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        disabled={isDeleting}
                        onClick={() => handleDelete(ann.id)}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-semibold transition-colors disabled:opacity-50"
                      >
                        {isDeleting
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />
                        }
                        حذف
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════
          Modal: نشر تبليغ جديد
          ════════════════════════════════════════════ */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !submitting && resetForm()}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-xl bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* هيدر الـ modal */}
            <div className="sticky top-0 bg-white sm:rounded-t-3xl rounded-t-3xl px-5 pt-5 pb-4 border-b border-slate-100 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-200">
                    <Megaphone size={17} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-black text-slate-900">نشر تبليغ جديد</h2>
                    <p className="text-xs text-slate-400">سيصل لموظفي الشركة المختارين</p>
                  </div>
                </div>
                <button onClick={() => !submitting && resetForm()} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-4">

              {/* نوع التبليغ */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">نوع التبليغ</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['text', 'image', 'video', 'poll'] as const).map(t => {
                    const cfg = TYPE_CFG[t];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
                          form.type === t
                            ? `border-current ${cfg.color} ${cfg.bg}`
                            : 'border-slate-200 text-slate-400 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="text-xs font-bold">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* العنوان */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  العنوان <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="عنوان واضح ومباشر..."
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                />
              </div>

              {/* المحتوى */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  المحتوى <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="اكتب التفاصيل هنا..."
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all resize-none leading-relaxed"
                />
              </div>

              {/* رابط الوسائط */}
              {(form.type === 'image' || form.type === 'video') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {form.type === 'image' ? 'رابط الصورة (URL)' : 'رابط الفيديو (URL)'}
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.media_url}
                    onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                  />
                  {form.media_url && form.type === 'image' && (
                    <img src={form.media_url} alt="" className="mt-2 w-full rounded-xl max-h-40 object-cover border border-slate-100" onError={e => (e.currentTarget.hidden = true)} />
                  )}
                </div>
              )}

              {/* الاستفتاء */}
              {form.type === 'poll' && (
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-bold text-orange-800 flex items-center gap-1.5">
                    <BarChart3 size={13} /> إعداد الاستفتاء
                  </p>
                  <input
                    type="text"
                    placeholder="سؤال الاستفتاء *"
                    value={pollQuestion}
                    onChange={e => setPollQuestion(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-orange-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`خيار ${i + 1} ${i < 2 ? '*' : ''}`}
                        value={opt}
                        onChange={e => {
                          const opts = [...pollOptions];
                          opts[i] = e.target.value;
                          setPollOptions(opts);
                        }}
                        className="flex-1 px-3 py-2.5 bg-white border border-orange-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 p-1">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <button
                      onClick={() => setPollOptions(p => [...p, ''])}
                      className="flex items-center gap-1.5 text-sm font-bold text-orange-600"
                    >
                      <Plus size={14} /> إضافة خيار
                    </button>
                  )}
                </div>
              )}

              {/* الأولوية + الهدف */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الأولوية</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as AnnouncementPriority }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="normal">عادي</option>
                    <option value="important">مهم</option>
                    <option value="urgent">عاجل 🔴</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الوسوم (مفصولة بفاصلة)</label>
                  <input
                    type="text"
                    placeholder="مثال: إجازات، مبيعات"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* الأقسام المستهدفة */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">الأقسام المستهدفة <span className="text-slate-400 font-normal">(فارغ = الكل)</span></label>
                <div className="flex flex-wrap gap-2">
                  {DEPT_LIST.map(d => (
                    <button
                      key={d}
                      onClick={() => setForm(f => ({
                        ...f,
                        target_depts: f.target_depts.includes(d)
                          ? f.target_depts.filter(x => x !== d)
                          : [...f.target_depts, d],
                      }))}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                        form.target_depts.includes(d)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* الأدوار المستهدفة */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">الأدوار المستهدفة <span className="text-slate-400 font-normal">(فارغ = الكل)</span></label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_LIST.map(r => (
                    <button
                      key={r}
                      onClick={() => setForm(f => ({
                        ...f,
                        target_roles: f.target_roles.includes(r)
                          ? f.target_roles.filter(x => x !== r)
                          : [...f.target_roles, r],
                      }))}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                        form.target_roles.includes(r)
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                      }`}
                    >
                      {ROLES_AR[r] ?? r}
                    </button>
                  ))}
                </div>
              </div>

              {/* خيارات إضافية */}
              <div className="flex flex-col gap-3">
                {/* إشعار */}
                <button
                  onClick={() => setForm(f => ({ ...f, has_notification: !f.has_notification }))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${
                    form.has_notification
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {form.has_notification
                    ? <Bell size={17} className="text-indigo-600" />
                    : <BellOff size={17} className="text-slate-400" />
                  }
                  <div className="flex-1 text-right">
                    <p className={`text-sm font-bold ${form.has_notification ? 'text-indigo-700' : 'text-slate-600'}`}>
                      {form.has_notification ? 'إرسال إشعار للموظفين' : 'بدون إشعار'}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${form.has_notification ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                    {form.has_notification && <Check size={12} className="text-white" />}
                  </div>
                </button>

                {/* مجهول */}
                <button
                  onClick={() => setForm(f => ({ ...f, is_anonymous: !f.is_anonymous }))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${
                    form.is_anonymous
                      ? 'border-slate-800 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {form.is_anonymous
                    ? <Lock size={16} className="text-white" />
                    : <Globe size={16} className="text-slate-400" />
                  }
                  <div className="flex-1 text-right">
                    <p className={`text-sm font-bold ${form.is_anonymous ? 'text-white' : 'text-slate-600'}`}>
                      {form.is_anonymous ? 'النشر بهوية مجهولة' : 'النشر باسمي'}
                    </p>
                  </div>
                </button>
              </div>

              {/* أزرار الإجراء */}
              <div className="flex gap-3 pt-2 pb-2">
                <button
                  onClick={() => !submitting && resetForm()}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting || !form.title.trim() || !form.content.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {submitting ? 'جاري النشر...' : 'نشر التبليغ'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

