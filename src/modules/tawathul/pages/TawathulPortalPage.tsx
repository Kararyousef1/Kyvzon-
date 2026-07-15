/**
 * بوابة التواصل (Tawathul) — الصفحة الرئيسية
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import ConversationList from '../components/ConversationList';
import ChatPanel from '../components/ChatPanel';
import NewConversationModal from '../components/NewConversationModal';
import { useTawathulStore } from '../stores/tawathulStore';
import { canAccessTawathul, canAdminTawathul } from '../permissions';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { ensureDefaultTenantCached } from '../utils/tenant';
import { cn } from '../../../utils/cn';
import Button from '../../../shared/components/ui/Button';
import { tawathulMessageService, tawathulNotificationService } from '../services';
import type { TawathulMessage, TawathulNotification } from '../types';
import { useNavigate } from 'react-router-dom';

export default function TawathulPortalPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const {
    conversations,
    activeConversationId,
    loadingList,
    error,
    mobileShowChat,
    setActiveConversationId,
    setMobileShowChat,
    loadConversations,
    upsertConversation,
  } = useTawathulStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchHits, setSearchHits] = useState<TawathulMessage[]>([]);
  const [notifs, setNotifs] = useState<TawathulNotification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const allowed = canAccessTawathul(user?.role, user?.permissions);
  const isAdmin = canAdminTawathul(user?.role, user?.permissions);

  useEffect(() => {
    if (!allowed) return;
    ensureDefaultTenantCached();
    void loadConversations();
    void refreshNotifs();
  }, [allowed, loadConversations]);

  useEffect(() => {
    if (!allowed) return;
    const pending = sessionStorage.getItem('tawathul_open_conversation');
    if (!pending) return;
    sessionStorage.removeItem('tawathul_open_conversation');
    setActiveConversationId(pending);
    void loadConversations();
  }, [allowed, setActiveConversationId, loadConversations]);

  const refreshNotifs = async () => {
    try {
      const [list, count] = await Promise.all([
        tawathulNotificationService.list(20),
        tawathulNotificationService.countUnread(),
      ]);
      setNotifs(list);
      setUnreadNotifs(count);
    } catch {
      setNotifs([]);
      setUnreadNotifs(0);
    }
  };

  const active = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const activeConversation = useMemo(() => {
    if (active) return active;
    if (!activeConversationId) return null;
    return {
      id: activeConversationId,
      tenant_id: '',
      type: 'entity' as const,
      title: 'محادثة',
      is_private: true,
      created_by: null,
      last_message_at: null,
      last_message_preview: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }, [active, activeConversationId]);

  const filteredConversations = useMemo(() => {
    const q = globalSearch.trim();
    if (!q || searchHits.length) return conversations;
    return conversations.filter(
      (c) =>
        (c.title || '').includes(q) ||
        (c.last_message_preview || '').includes(q) ||
        c.type.includes(q),
    );
  }, [conversations, globalSearch, searchHits.length]);

  const runGlobalSearch = async (q: string) => {
    setGlobalSearch(q);
    if (!q.trim()) {
      setSearchHits([]);
      return;
    }
    try {
      const hits = await tawathulMessageService.searchMessages(q);
      setSearchHits(hits);
    } catch {
      setSearchHits([]);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center text-slate-500" dir="rtl">
        يجب تسجيل الدخول لفتح بوابة التواصل
      </div>
    );
  }

  if (!allowed) {
    return (
      <div
        className="max-w-lg mx-auto mt-16 text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm"
        dir="rtl"
      >
        <ShieldAlert className="mx-auto text-amber-500 mb-3" size={40} />
        <h1 className="text-lg font-bold text-slate-800">لا تملك صلاحية بوابة التواصل</h1>
      </div>
    );
  }

  return (
    <div
      className="h-[calc(100vh-7rem)] min-h-[480px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
      dir="rtl"
    >
      <div className="h-14 shrink-0 border-b border-slate-200 bg-gradient-to-l from-indigo-600 to-violet-700 text-white px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
            <MessagesSquare size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base truncate">بوابة التواصل</h1>
            <p className="text-[11px] text-indigo-100 truncate">Tawathul · تعاون مؤسسي</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setShowNotifs((v) => !v);
              void refreshNotifs();
            }}
            className="relative p-2 rounded-xl hover:bg-white/10"
            title="إشعارات التواصل"
          >
            <Bell size={16} />
            {unreadNotifs > 0 && (
              <span className="absolute top-1 left-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] flex items-center justify-center">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/app/tawathul/admin')}
              className="p-2 rounded-xl hover:bg-white/10"
              title="إدارة"
            >
              <Settings2 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadConversations()}
            className="p-2 rounded-xl hover:bg-white/10"
            title="تحديث"
          >
            <RefreshCw size={16} className={loadingList ? 'animate-spin' : ''} />
          </button>
          <Button
            type="button"
            size="sm"
            className="bg-white text-indigo-700 hover:bg-indigo-50 border-0"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={14} className="ml-1" />
            جديد
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs bg-amber-50 text-amber-900 border-b border-amber-100 leading-relaxed">
          <strong>تنبيه:</strong> {error}
          <div className="mt-0.5 text-amber-700">
            نفّذ على Supabase: 300_tawathul_core → 301_tawathul_rls → 302_tawathul_features
          </div>
        </div>
      )}

      {showNotifs && (
        <div className="border-b border-slate-100 bg-white px-3 py-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">إشعارات التواصل</span>
            <button
              type="button"
              className="text-[11px] text-indigo-600"
              onClick={async () => {
                await tawathulNotificationService.markAllRead();
                void refreshNotifs();
              }}
            >
              تعليم الكل كمقروء
            </button>
          </div>
          {!notifs.length && (
            <p className="text-xs text-slate-400 py-2">لا إشعارات (قد تحتاج سكربت 302)</p>
          )}
          {notifs.map((n) => (
            <button
              key={n.id}
              type="button"
              className={cn(
                'w-full text-right rounded-xl px-3 py-2 mb-1 text-xs border',
                n.is_read ? 'bg-white border-slate-100 text-slate-500' : 'bg-indigo-50 border-indigo-100 text-slate-800',
              )}
              onClick={async () => {
                await tawathulNotificationService.markRead(n.id);
                if (n.conversation_id) setActiveConversationId(n.conversation_id);
                void refreshNotifs();
              }}
            >
              <div className="font-semibold">{n.title}</div>
              <div className="truncate opacity-80">{n.body}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <aside
          className={cn(
            'w-full lg:w-80 xl:w-96 border-l border-slate-200 flex flex-col bg-white',
            mobileShowChat ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="px-3 py-3 border-b border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">محادثاتي</p>
              <span className="text-[10px] text-slate-400">{conversations.length}</span>
            </div>
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={globalSearch}
                onChange={(e) => void runGlobalSearch(e.target.value)}
                placeholder="بحث في المحادثات/الرسائل…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {!!searchHits.length && (
              <div className="max-h-28 overflow-y-auto space-y-1">
                {searchHits.slice(0, 8).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="w-full text-right text-[11px] bg-slate-50 hover:bg-indigo-50 rounded-lg px-2 py-1.5"
                    onClick={() => setActiveConversationId(h.conversation_id)}
                  >
                    <span className="font-semibold">{h.sender_name}: </span>
                    <span className="text-slate-500">{h.body}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ConversationList
            conversations={filteredConversations}
            activeId={activeConversationId}
            loading={loadingList}
            onSelect={(id) => setActiveConversationId(id)}
          />
        </aside>

        <section
          className={cn(
            'flex-1 min-w-0 flex flex-col',
            mobileShowChat ? 'flex' : 'hidden lg:flex',
          )}
        >
          <ChatPanel
            conversation={activeConversation}
            onBack={() => {
              setMobileShowChat(false);
              setActiveConversationId(null);
            }}
          />
        </section>
      </div>

      <NewConversationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => {
          upsertConversation(c);
          setActiveConversationId(c.id);
        }}
      />
    </div>
  );
}
