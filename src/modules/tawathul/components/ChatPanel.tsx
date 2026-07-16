/**
 * لوحة المحادثة النشطة — كاملة
 */

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  Hash,
  Link2,
  MessageCircle,
  Pin,
  PinOff,
  Archive,
  Search,
  Users,
  VolumeX,
  UserPlus,
} from 'lucide-react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import { useTawathulMessages } from '../hooks/useTawathulMessages';
import { tawathulConversationService, tawathulMessageService } from '../services';
import type { TawathulConversation, TawathulEntityLink, TawathulMember, TawathulMessage } from '../types';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { userService } from '../../../services/sdk';

interface Props {
  conversation: TawathulConversation | null;
  onBack?: () => void;
}

export default function ChatPanel({ conversation, onBack }: Props) {
  const { user } = useAuthStore();
  const addToast = useUIStore((s) => s.addToast);
  const { messages, loading, sending, error, send, reload } = useTawathulMessages(
    conversation?.id ?? null,
  );
  const [entity, setEntity] = useState<TawathulEntityLink | null>(null);
  const [title, setTitle] = useState('محادثة');
  const [replyTo, setReplyTo] = useState<TawathulMessage | null>(null);
  const [pinned, setPinned] = useState<TawathulMessage[]>([]);
  const [search, setSearch] = useState('');
  const [searchHits, setSearchHits] = useState<TawathulMessage[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [members, setMembers] = useState<TawathulMember[]>([]);
  const [myMembership, setMyMembership] = useState<TawathulMember | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReplyTo(null);
    setShowSearch(false);
    setSearch('');
    setSearchHits([]);

    if (!conversation?.id) {
      setEntity(null);
      setTitle('محادثة');
      setPinned([]);
      setMembers([]);
      setMyMembership(null);
      return;
    }

    void tawathulConversationService.markRead(conversation.id);

    (async () => {
      try {
        const display = await tawathulConversationService.resolveDisplayTitle(
          conversation,
          user?.id,
        );
        if (!cancelled) setTitle(display);
      } catch {
        if (!cancelled) setTitle(conversation.title || 'محادثة');
      }

      try {
        const pins = await tawathulMessageService.listPinned(conversation.id);
        if (!cancelled) setPinned(pins);
      } catch {
        if (!cancelled) setPinned([]);
      }

      try {
        const mem = await tawathulConversationService.listMembers(conversation.id);
        if (!cancelled) setMembers(mem);
      } catch {
        if (!cancelled) setMembers([]);
      }

      try {
        const mine = await tawathulConversationService.getMyMembership(conversation.id);
        if (!cancelled) setMyMembership(mine);
      } catch {
        if (!cancelled) setMyMembership(null);
      }

      if (conversation.type === 'entity') {
        try {
          const link = await tawathulConversationService.getEntityLink(conversation.id);
          if (!cancelled) setEntity(link);
        } catch {
          if (!cancelled) setEntity(null);
        }
      } else if (!cancelled) setEntity(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversation, user?.id]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-8">
        <MessageCircle size={48} className="mb-3 opacity-40" />
        <p className="font-medium text-slate-600">اختر محادثة من القائمة</p>
        <p className="text-sm mt-1">أو ابدأ محادثة جديدة للتعاون مع فريقك</p>
      </div>
    );
  }

  const TypeIcon =
    conversation.type === 'channel'
      ? Hash
      : conversation.type === 'group'
        ? Users
        : conversation.type === 'entity'
          ? Link2
          : MessageCircle;

  const runSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim()) {
      setSearchHits([]);
      return;
    }
    try {
      const hits = await tawathulMessageService.searchMessages(q, conversation.id);
      setSearchHits(hits);
    } catch {
      setSearchHits([]);
    }
  };

  const toggleConversationPin = async () => {
    if (!conversation?.id) return;
    try {
      const next = !myMembership?.is_pinned;
      await tawathulConversationService.updateMyMembershipPreferences(conversation.id, { is_pinned: next });
      setMyMembership((prev) => prev ? { ...prev, is_pinned: next } : prev);
      addToast(next ? 'تم تثبيت المحادثة' : 'تم إلغاء تثبيت المحادثة', 'success');
    } catch (e: any) {
      addToast(e?.message || 'تعذر تحديث التثبيت', 'error');
    }
  };

  const toggleConversationMute = async () => {
    if (!conversation?.id) return;
    try {
      const next = !myMembership?.is_muted;
      await tawathulConversationService.updateMyMembershipPreferences(conversation.id, { is_muted: next });
      setMyMembership((prev) => prev ? { ...prev, is_muted: next } : prev);
      addToast(next ? 'تم كتم المحادثة' : 'تم إلغاء كتم المحادثة', 'success');
    } catch (e: any) {
      addToast(e?.message || 'تعذر تحديث الكتم', 'error');
    }
  };

  const archiveConversation = async () => {
    if (!conversation?.id) return;
    if (!confirm('هل تريد أرشفة هذه المحادثة؟ ستختفي من القائمة الرئيسية.')) return;
    try {
      await tawathulConversationService.archiveConversation(conversation.id);
      addToast('تمت أرشفة المحادثة', 'success');
      onBack?.();
    } catch (e: any) {
      addToast(e?.message || 'تعذر أرشفة المحادثة', 'error');
    }
  };

  const exportConversation = () => {
    const headers = ['المرسل', 'الرسالة', 'النوع', 'التاريخ', 'معدلة', 'مثبتة'];
    const escape = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
    const rows = messages.map((m) => [
      m.sender_name || 'النظام',
      m.body || '',
      m.message_type || 'text',
      m.created_at || '',
      m.edited_at ? 'نعم' : 'لا',
      m.is_pinned ? 'نعم' : 'لا',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tawathul_conversation_${conversation.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('تم تصدير المحادثة', 'success');
  };

  const addMember = async () => {
    const emailOrName = window.prompt('أدخل جزءاً من اسم/بريد الموظف لإضافته:');
    if (!emailOrName?.trim()) return;
    try {
      const users = await userService.findAllUsers();
      const q = emailOrName.trim();
      const found = users.find(
        (u) =>
          u.full_name?.includes(q) ||
          u.email?.includes(q) ||
          u.id === q,
      );
      if (!found) {
        addToast('لم يتم العثور على المستخدم', 'warning');
        return;
      }
      await tawathulConversationService.ensureMember(conversation.id, found.id);
      const mem = await tawathulConversationService.listMembers(conversation.id);
      setMembers(mem);
      addToast(`تمت إضافة ${found.full_name || found.email}`, 'success');
    } catch (e: any) {
      addToast(e?.message || 'تعذّرت الإضافة', 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-slate-50 to-white">
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur px-3 sm:px-5 flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden p-2 rounded-xl hover:bg-slate-100"
            aria-label="رجوع"
          >
            <ArrowRight size={18} />
          </button>
        )}
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <TypeIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-800 truncate text-sm sm:text-base">{title}</h2>
          <p className="text-[11px] text-slate-400 truncate">
            {members.length ? `${members.length} أعضاء` : conversation.type}
            {entity ? ` · ${entity.entity_type}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
          title="بحث"
          onClick={() => setShowSearch((v) => !v)}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
          title="الأعضاء"
          onClick={() => setShowMembers((v) => !v)}
        >
          <Users size={16} />
        </button>
        <button
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
          title={myMembership?.is_pinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
          onClick={() => void toggleConversationPin()}
        >
          {myMembership?.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <button
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
          title={myMembership?.is_muted ? 'إلغاء كتم المحادثة' : 'كتم المحادثة'}
          onClick={() => void toggleConversationMute()}
        >
          <VolumeX size={16} className={myMembership?.is_muted ? 'text-amber-600' : ''} />
        </button>
        <button
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
          title="تصدير المحادثة"
          onClick={exportConversation}
        >
          <Download size={16} />
        </button>
        {conversation.type !== 'dm' && (
          <button
            type="button"
            className="p-2 rounded-xl hover:bg-red-50 text-slate-500 hover:text-red-600"
            title="أرشفة المحادثة"
            onClick={() => void archiveConversation()}
          >
            <Archive size={16} />
          </button>
        )}
        {conversation.type !== 'dm' && (
          <button
            type="button"
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
            title="إضافة عضو"
            onClick={() => void addMember()}
          >
            <UserPlus size={16} />
          </button>
        )}
      </header>

      {showSearch && (
        <div className="border-b border-slate-100 bg-white px-3 py-2">
          <input
            value={search}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="ابحث في رسائل هذه المحادثة…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {!!searchHits.length && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {searchHits.map((h) => (
                <div key={h.id} className="text-xs bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600">
                  <span className="font-semibold text-slate-800">{h.sender_name}: </span>
                  {h.body}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!!pinned.length && (
        <div className="border-b border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 flex gap-2 overflow-x-auto">
          <Pin size={14} className="shrink-0 mt-0.5" />
          {pinned.slice(0, 3).map((p) => (
            <span key={p.id} className="truncate max-w-[200px] bg-white/70 rounded-lg px-2 py-1 border border-amber-100">
              {p.body}
            </span>
          ))}
        </div>
      )}

      {showMembers && (
        <div className="border-b border-slate-100 bg-white px-3 py-2 max-h-36 overflow-y-auto">
          <div className="text-[11px] font-semibold text-slate-500 mb-1">الأعضاء</div>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <span
                key={m.id}
                className="text-xs bg-slate-50 border border-slate-200 rounded-full px-2 py-1"
              >
                {m.full_name || m.user_id.slice(0, 8)}
                {m.is_muted ? <VolumeX size={10} className="inline mr-1" /> : null}
                <span className="text-slate-400"> · {m.role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <MessageList
        messages={messages}
        currentUserId={user?.id}
        loading={loading}
        conversationId={conversation.id}
        onReply={setReplyTo}
        onChanged={() => {
          void reload();
          void tawathulMessageService.listPinned(conversation.id).then(setPinned);
        }}
      />

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
          {error}
        </div>
      )}

      <MessageComposer
        sending={sending}
        disabled={!conversation.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={async ({ text, files }) => {
          await send(text, replyTo?.id, files);
          setReplyTo(null);
          await tawathulConversationService.markRead(conversation.id);
        }}
      />
    </div>
  );
}
