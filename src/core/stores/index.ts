/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Platform - إدارة الحالة الموحدة
 *  تمت إزالة جميع استدعاءات Supabase المباشرة
 *  والاعتماد على طبقة SDK فقط
 * ════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../../services/supabase/supabase';
import { authService } from '../../services/sdk/AuthService';
import { userService } from '../../services/sdk/UserService';
import { settingsService } from '../../services/sdk/SettingsService';
import { storageService } from '../../services/sdk/StorageService';
import {
  addNotification,
  createWelcomeNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../../services/notifications/notificationManager';
import {
  fetchNotificationsFromServer,
  markAsReadOnServer,
  markAllAsReadOnServer,
  deleteNotificationOnServer,
  subscribeToRealtimeNotifications,
} from '../../services/notifications/notificationService';
import type { RealtimeNotificationEvent } from '../../services/notifications/notificationService';
import { getEffectivePermissions } from '../constants/permissions';
import { normalizeUser, getUserDisplayName } from '../../utils/userUtils';
import { getErrorMessage } from '../../services/errors';
import type {
  User, Problem, Notification, UserRole,
  WellnessData, ChatMessage, AuditLog, Employee, Analytics,
} from '../../shared/types';
import type {
  LandingConfig,
} from '../../shared/types/landing';
import {
  mockUser,
} from '../../data/dev/mockData';

// ════════════════════════════════════════════════════
// أنواع محلية
// ════════════════════════════════════════════════════

/** إشعار من Supabase (الشكل الخام) */
interface ServerNotification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
  user_id: string;
  action_url?: string;
  group_key?: string;
  metadata?: Record<string, unknown>;
  expires_at?: string;
}

/** تحويل ServerNotification → Notification */
function convertServerNotification(n: ServerNotification): Notification {
  return {
    id: n.id,
    type: (n.type as Notification['type']) || 'info',
    title: n.title,
    message: n.message,
    read: n.is_read || false,
    createdAt: n.created_at,
    readAt: n.read_at,
    recipient_id: n.user_id,
    link: n.action_url,
  };
}

// ════════════════════════════════════════════════════════════════
//  Real-time Subscriptions
// ════════════════════════════════════════════════════════════════

let _profileChannel: ReturnType<typeof supabase.channel> | null = null;
let _notificationUnsubscribe: (() => void) | null = null;

const setupRealtimeProfileSubscription = (
  userId: string | undefined,
  updateUser: (user: User) => void,
): void => {
  if (_profileChannel) {
    supabase.removeChannel(_profileChannel);
    _profileChannel = null;
  }
  if (!userId) return;

  _profileChannel = supabase
    .channel(`profile-updates-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      async () => {
        try {
          const freshProfile = await userService.findUserById(userId);
          if (freshProfile) {
            const role = (freshProfile.role as UserRole) || 'employee';
            const normalizedUser = normalizeUser({
              ...freshProfile,
              permissions: getEffectivePermissions(role, freshProfile.permissions),
            });
            updateUser(normalizedUser);
            console.log('✅ User updated via Realtime');
          }
        } catch (err) {
          console.error('Real-time profile update error:', getErrorMessage(err));
        }
      },
    )
    .subscribe();
};

// ════════════════════════════════════════════════════════════════
//  Auth Store
// ════════════════════════════════════════════════════════════════

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  loginLocal: (username: string, role: string, fullName: string) => void;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  cleanup: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  loading: true,

  // ─────────────────────────────────────────────────
  //  initialize
  // ─────────────────────────────────────────────────
  initialize: async () => {
    // ✅ إذا كان هناك مستخدم محلي (dev) - لا نحتاج للاتصال بـ Supabase
    const currentState = get();
    if (currentState.isAuthenticated && currentState.user?.id?.startsWith('dev-')) {
      set({ loading: false });
      return;
    }

    set({ loading: true });

    try {
      // ✅ استخدام AuthService بدلاً من supabase.auth.getSession()
      const session = await authService.getSession();

      if (!session?.session?.user) {
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        set({ user: null, isAuthenticated: false, loading: false });
        return;
      }

      const userId = session.session.user.id;

      // 🔐 إصلاح أمني حرج: ضبط سياق الجلسة قبل أي استعلام بيانات
      // بدون هذا، RLS سيرفض كل الطلبات لأن app.current_tenant_id غير مضبوط
      try {
        await authService.setSessionContext();
      } catch (ctxErr) {
        console.error('initialize: setSessionContext failed', getErrorMessage(ctxErr));
      }

      let profile: User | null = null;

      // ✅ استخدام UserService بدلاً من supabase.from('profiles')
      const userProfile = await userService.findUserById(userId);

      if (userProfile) {
        profile = normalizeUser({
          ...userProfile,
          permissions: getEffectivePermissions(
            userProfile.role as UserRole,
            userProfile.permissions,
          ),
        });
      }

      if (!profile) {
        profile = normalizeUser({
          id: userId,
          email: session.session.user.email || '',
          full_name: 'مستخدم جديد',
          role: 'employee',
          permissions: getEffectivePermissions('employee', []),
        });
        console.warn('⚠️ No profile found, using minimal user object');
      }

      set({ user: profile, isAuthenticated: true, loading: false });
      setupRealtimeProfileSubscription(userId, (user) => set({ user }));

    } catch (error) {
      console.error('Auth initialization error:', getErrorMessage(error));
      set({ user: null, isAuthenticated: false, loading: false });
    } finally {
      set({ loading: false });
    }
  },

  // ─────────────────────────────────────────────────
  //  login
  // ─────────────────────────────────────────────────
  login: async (email, password) => {
    try {
      const data = await authService.login(email, password);
      if (!data.user) return false;

      // ✅ إصلاح أمني: ضبط app.current_role / app.current_tenant_id في Postgres
      // فوراً بعد نجاح المصادقة، وقبل أي طلب بيانات محمي بـ RLS.
      // بدون هذه الخطوة، is_platform_owner() و is_same_tenant() (Migration 101)
      // ترجعان false دائماً — أي أن RLS يمنع الوصول حتى للمستخدم الصحيح.
      let sessionContext;
      try {
        sessionContext = await authService.setSessionContext();
      } catch (contextError) {
        // فشل ضبط السياق يعني عدم وجود profile صالح لهذا المستخدم —
        // لا نكمل تسجيل الدخول ببيانات RLS معطّلة.
        console.error('setSessionContext failed:', getErrorMessage(contextError));
        await authService.logout();
        throw new Error('تعذّر تحضير الجلسة. يرجى المحاولة مرة أخرى أو التواصل مع مدير النظام.');
      }

      const profile = await userService.findUserById(data.user.id);
      if (profile) {
        const tenantId = sessionContext.resolvedTenantId
          ?? localStorage.getItem('tenant_id')
          ?? undefined;

        const normalizedUser = normalizeUser({
          ...profile,
          tenant_id: tenantId,
          permissions: getEffectivePermissions(
            profile.role as UserRole,
            profile.permissions,
          ),
        });
        set({ user: normalizedUser, isAuthenticated: true });

        // Router يتولى التوجيه للصفحة الافتراضية عبر <RoleRedirect>
        // (راجع src/router/constants.ts → ROLE_DEFAULT_PATH)
        createWelcomeNotification(data.user.id);
        const userName = getUserDisplayName(normalizedUser);
        const today = new Date().toISOString().slice(0, 10);
        addNotification(data.user.id, {
          type: 'login',
          priority: 'low',
          title: '👋 مرحباً بعودتك',
          message: `أهلاً ${userName}، تم تسجيل دخولك بنجاح`,
          groupKey: `login-${data.user.id}-${today}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        setupRealtimeProfileSubscription(data.user.id, (user) => set({ user }));
      }
      return true;
    } catch (error) {
      console.error('Login error:', getErrorMessage(error));
      throw error;
    }
  },

  // ─────────────────────────────────────────────────
  //  loginLocal (dev only)
  // ─────────────────────────────────────────────────
  loginLocal: (username, role, fullName) => {
    if (import.meta.env.PROD || import.meta.env.VITE_ENABLE_LOCAL_AUTH !== 'true') {
      console.error('🚫 loginLocal() غير مفعّل. استخدم Supabase Auth للمشروع المتصل.');
      return;
    }

    console.warn('⚠️ loginLocal() للتطوير المحلي المعزول فقط');
    const userRole = (role as UserRole) || 'employee';

    const normalizedUser = normalizeUser({
      id: `dev-${Date.now()}`,
      username,
      role: userRole,
      full_name: fullName,
      email: `${username}@dev.local`,
      permissions: getEffectivePermissions(userRole, []),
    });

    // إيقاف التحميل وتعيين المستخدم - مهم جداً لتجاوز AuthLoader
    set({ user: normalizedUser, isAuthenticated: true, loading: false });
  },

  // ─────────────────────────────────────────────────
  //  logout
  // ─────────────────────────────────────────────────
  logout: async () => {
    try {
      get().cleanup();
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      await authService.clearSessionContext();
      await authService.logout();
      set({ user: null, isAuthenticated: false });
    } catch (error) {
      console.error('Logout error:', getErrorMessage(error));
    }
  },

  updateUser: (data) =>
    set((state) => ({
      user: state.user ? normalizeUser({ ...state.user, ...data }) : null,
    })),

  refreshUser: async () => {
    const { isAuthenticated, user } = get();
    if (!isAuthenticated || !user?.id) return;

    // ✅ المستخدم المحلي (dev) لا يحتاج لتحديث من Supabase
    if (user.id.startsWith('dev-')) {
      return;
    }

    try {
      // ✅ استخدام AuthService بدلاً من supabase.auth.getSession()
      const session = await authService.getSession();
      if (!session?.session?.user) {
        console.warn('⚠️ refreshUser: لا توجد جلسة صالحة');
        set({ user: null, isAuthenticated: false });
        return;
      }

      // 🔐 إصلاح أمني: إعادة ضبط سياق الجلسة قبل تحديث البيانات
      try { await authService.setSessionContext(); } catch {}

      // ✅ استخدام UserService بدلاً من supabase.from('profiles')
      const profile = await userService.findUserById(user.id);

      if (profile) {
        set({
          user: normalizeUser({
            ...profile,
            permissions: getEffectivePermissions(
              profile.role as UserRole,
              profile.permissions,
            ),
          }),
        });
        console.log('✅ User refreshed');
      }
    } catch (error) {
      console.error('refreshUser error:', getErrorMessage(error));
    }
  },

  cleanup: () => {
    if (_profileChannel) {
      supabase.removeChannel(_profileChannel);
      _profileChannel = null;
    }
    if (_notificationUnsubscribe) {
      _notificationUnsubscribe();
      _notificationUnsubscribe = null;
    }
  },
}));

// ════════════════════════════════════════════════════════════════
//  Problem Store
// ════════════════════════════════════════════════════════════════

interface ProblemState {
  problems: Problem[];
  addProblem: (problem: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProblem: (id: string, data: Partial<Problem>) => void;
  deleteProblem: (id: string) => void;
  addComment: (
    problemId: string,
    text: string,
    authorId: string,
    authorName: string,
    authorRole: string,
  ) => void;
}

export const useProblemStore = create<ProblemState>((set) => ({
  problems: [],

  addProblem: (problem) =>
    set((state) => ({
      problems: [
        {
          ...problem,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          timeline: [
            {
              id: '1',
              event: 'تم الإنشاء',
              description: 'تم رفع المشكلة',
              timestamp: new Date().toISOString(),
              actor: 'النظام',
              type: 'created',
            },
          ],
        },
        ...state.problems,
      ],
    })),

  updateProblem: (id, data) =>
    set((state) => ({
      problems: state.problems.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p,
      ),
    })),

  deleteProblem: (id) =>
    set((state) => ({ problems: state.problems.filter((p) => p.id !== id) })),

  addComment: (problemId, text, authorId, authorName, authorRole) =>
    set((state) => ({
      problems: state.problems.map((p) =>
        p.id === problemId
          ? {
              ...p,
              comments: [
                ...(p.comments ?? []),
                {
                  id: Date.now().toString(),
                  text,
                  authorId,
                  authorName,
                  authorRole: authorRole as UserRole,
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : p,
      ),
    })),
}));

// ════════════════════════════════════════════════════════════════
//  UI Store
// ════════════════════════════════════════════════════════════════

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export type {
  LandingConfig, LandingVideo, LandingProduct, LandingNavLink, LandingStat,
} from '../../shared/types/landing';

const defaultLandingConfig: LandingConfig = {
  themeColor: '#4f46e5',
  logoSymbol: 'K',
  logoUrl: '',
  logoTextAr: 'Kyvzon',
  logoTextEn: 'Kyvzon',
  heroTitleAr: 'منصة متكاملة لإدارة الموارد البشرية',
  heroTitleEn: 'Comprehensive HR Management Platform',
  heroDescAr: 'نحن في Kyvzon نقدم منصة متكاملة لإدارة الموارد البشرية بأعلى معايير الجودة.',
  heroDescEn: 'At Kyvzon, we deliver a comprehensive HR and operations management platform.',
  aboutP1Ar: 'Kyvzon هي منصة سحابية متكاملة لإدارة الموارد البشرية والعمليات المؤسسية.',
  aboutP1En: 'Kyvzon is a leading cloud-based platform for enterprise resource management.',
  aboutP2Ar: 'تلتزم Kyvzon بتقديم أعلى معايير الجودة والأمان في إدارة الموارد البشرية للشركات.',
  aboutP2En: 'Kyvzon is committed to delivering the highest standards of quality and security in HR management.',
  aboutP3Ar: 'يُعد رضا العملاء أحد الأهداف الرئيسية لـ Kyvzon.',
  aboutP3En: 'Customer satisfaction is a main goal and fundamental pillar of our strategy.',
  addressAr: 'العراق، بغداد',
  addressEn: 'Iraq, Baghdad',
  mapUrl: '',
  showCareSection: true,
  showAgentsSection: true,
  showMarketingSection: true,
  showLocationSection: true,
  marketingTitleAr: 'التسويق والمبيعات',
  marketingTitleEn: 'Marketing & Sales',
  marketingIntroAr: 'منذ تأسيسها، تهدف Kyvzon إلى إنشاء فريق متطور وفعال.',
  marketingIntroEn: 'Since its establishment, Kyvzon has aimed to build an effective team.',
  marketingVisionTitleAr: 'رؤيتنا',
  marketingVisionTitleEn: 'Our Vision',
  marketingVisionTextAr: 'نسعى لتمكين الشركات من إدارة مواردها البشرية بكفاءة عالية في جميع أنحاء المنطقة.',
  marketingVisionTextEn: 'We strive to empower companies to manage their human resources efficiently across the region.',
  marketingCommitmentAr: 'نحن ملتزمون بالعمل من أجل مستقبل أفضل.',
  marketingCommitmentEn: 'We are committed to working for a better future.',
  showVideoSection: false,
  youtubeUrl: '',
  videos: [],
  products: [
    { id: '1', titleAr: 'المنصة الرئيسية', titleEn: 'Main Platform', descAr: 'منصة متكاملة لإدارة الأعمال', descEn: 'Comprehensive business management platform', detailsAr: '', detailsEn: '', imageUrl: '' },
  ],
  stats: [
    { id: 's1', value: 100, suffix: '+', labelAr: 'شركة مشتركة', labelEn: 'Companies' },
    { id: 's2', value: 5000, suffix: '+', labelAr: 'مستخدم نشط', labelEn: 'Active Users' },
  ],
  customNavLinks: [],
  socialLinks: {},
  phone: '',
  email: '',
};

interface UIState {
  sidebarOpen: boolean;
  landingConfig: LandingConfig;
  userPermissions: string[];
  isLoadingConfig?: boolean;
  isSavingConfig?: boolean;
  notifications: Notification[];
  wellnessData: WellnessData[];
  chatMessages: ChatMessage[];
  auditLogs: AuditLog[];
  employees: Employee[];
  analytics: Analytics;
  toasts: Toast[];

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  updateLandingConfig: (config: Partial<LandingConfig>) => void;
  fetchLandingConfig: () => Promise<void>;
  saveLandingConfig: (config: LandingConfig) => Promise<{ success: boolean; error?: string }>;
  uploadImage: (file: File, path: string) => Promise<string | null>;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  addWellnessEntry: (entry: WellnessData) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;

  loadNotificationsFromServer: (userId: string) => Promise<void>;
  subscribeToNotifications: (userId: string) => void;
  unsubscribeFromNotifications: () => void;
  markNotificationReadEnhanced: (userId: string, id: string) => Promise<void>;
  markAllReadEnhanced: (userId: string) => Promise<void>;
  deleteNotificationEnhanced: (userId: string, id: string) => Promise<void>;
  syncNotifications: (userId: string) => Promise<void>;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: false,
      landingConfig: defaultLandingConfig,
      userPermissions: [],
      isLoadingConfig: false,
      isSavingConfig: false,
      notifications: [],
      wellnessData: [],
      chatMessages: [],
      auditLogs: [],
      employees: [],
      analytics: {} as Analytics,
      toasts: [],

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      updateLandingConfig: (config) =>
        set((state) => ({ landingConfig: { ...state.landingConfig, ...config } })),

      fetchLandingConfig: async () => {
        set({ isLoadingConfig: true });
        try {
          // ✅ استخدام SettingsService بدلاً من supabase.from('system_settings')
          const settings = await settingsService.findSystemSettings();
          if (settings?.landing_config) {
            set({ landingConfig: { ...defaultLandingConfig, ...settings.landing_config } });
          }
        } catch (err) {
          console.warn('Failed to fetch landing config:', getErrorMessage(err));
        } finally {
          set({ isLoadingConfig: false });
        }
      },

      saveLandingConfig: async (config) => {
        set({ isSavingConfig: true });
        try {
          const current = await settingsService.findSystemSettings();
          if (current) {
            await settingsService.updateSystemSettings(current.id, {
              landing_config: config,
              updated_at: new Date().toISOString(),
            } as unknown as Record<string, unknown>);
          } else {
            await settingsService.create({
              id: 'singleton',
              landing_config: config,
              updated_at: new Date().toISOString(),
            } as unknown as Record<string, unknown>);
          }
          set({ landingConfig: config });
          return { success: true };
        } catch (err) {
          return { success: false, error: getErrorMessage(err) };
        } finally {
          set({ isSavingConfig: false });
        }
      },

      uploadImage: async (file, path) => {
        try {
          const url = await storageService.uploadPublic('public-assets', path, file);
          return url;
        } catch (err) {
          console.error('Upload failed:', getErrorMessage(err));
          return null;
        }
      },

      addWellnessEntry: (entry) => set((state) => ({ wellnessData: [entry, ...state.wellnessData] })),
      addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
      clearChat: () => set({ chatMessages: [] }),

      addToast: (message, type = 'info') => {
        const id = Date.now().toString();
        set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
        setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 4000);
      },

      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      loadNotificationsFromServer: async (userId) => {
        try {
          const serverNotifications = await fetchNotificationsFromServer(userId, 50);
          const converted = serverNotifications.map((n) => convertServerNotification(n as unknown as ServerNotification));
          const localNotifs = getUserNotifications(userId);
          const serverIds = new Set(converted.map((n) => n.id));
          const uniqueLocal = localNotifs.filter((n) => !serverIds.has(n.id) && n.id.startsWith('notif_'));
          const merged = [...converted, ...uniqueLocal].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          set({ notifications: merged });
        } catch (error) {
          console.error('loadNotificationsFromServer error:', getErrorMessage(error));
          set({ notifications: getUserNotifications(userId) });
        }
      },

      subscribeToNotifications: (userId) => {
        if (_notificationUnsubscribe) _notificationUnsubscribe();
        _notificationUnsubscribe = subscribeToRealtimeNotifications(userId, (event: RealtimeNotificationEvent) => {
          const newNotif = event.notification;
          set((state) => {
            if (state.notifications.some((n) => n.id === newNotif.id)) return state;
            const converted = convertServerNotification(newNotif as unknown as ServerNotification);
            return { notifications: [converted, ...state.notifications] };
          });
        });
      },

      unsubscribeFromNotifications: () => {
        if (_notificationUnsubscribe) { _notificationUnsubscribe(); _notificationUnsubscribe = null; }
      },

      markNotificationReadEnhanced: async (userId, id) => {
        set((state) => ({ notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)) }));
        await markAsReadOnServer(userId, id);
        markAsRead(userId, id);
      },

      markAllReadEnhanced: async (userId) => {
        const now = new Date().toISOString();
        set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true, readAt: n.readAt || now })) }));
        await markAllAsReadOnServer(userId);
        markAllAsRead(userId);
      },

      deleteNotificationEnhanced: async (userId, id) => {
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
        await deleteNotificationOnServer(userId, id);
        deleteNotification(userId, id);
      },

      syncNotifications: async (userId) => { await get().loadNotificationsFromServer(userId); },

      markNotificationRead: (id) => set((state) => ({ notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllRead: () => set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })) })),
    }),
    {
      name: 'kyvzon-platform-ui',
      partialize: (state) => ({ landingConfig: state.landingConfig }),
    },
  ),
);