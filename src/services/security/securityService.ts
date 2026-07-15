// ════════════════════════════════════════════════════════════════
//  Security Service - خدمة الأمان والمراقبة
//  لتسجيل محاولات الدخول، التهديدات، والأنشطة المشبوهة
//
//  ملاحظة: يستخدم securityEventService من SDK لكتابة قاعدة البيانات
//  (يحقن tenant_id تلقائياً + يتعامل مع RLS بأمان).
// ════════════════════════════════════════════════════════════════

import { securityEventService } from '../sdk/SecurityEventService';

// ── Types ─────────────────────────────────────────────────────────────────────
export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';
export type EventType = 
  | 'login_success' 
  | 'login_failed' 
  | 'logout' 
  | 'pin_failed' 
  | 'pin_locked'
  | 'permission_denied'
  | 'unauthorized_access'
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'data_export'
  | 'settings_changed'
  | 'user_created'
  | 'user_deleted'
  | 'role_changed';

export interface SecurityEvent {
  id: string;
  type: EventType;
  threatLevel: ThreatLevel;
  userId: string | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface SecurityStats {
  total: number;
  critical: number;
  high: number;
  failedLogins: number;
  suspiciousActivities: number;
  suspiciousUsers?: number;
  uniqueIPs: number;
  resolved: number;
  unresolved: number;
  last24h: number;
  threatLevel: ThreatLevel;
}

// ── Local Storage Keys ────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  EVENTS: 'hr_security_events',
  ATTEMPTS: 'hr_login_attempts',
  LOCKOUT: 'hr_lockout_state',
  THREATS: 'hr_threats',
};

// ── Security Service Class ────────────────────────────────────────────────────
class SecurityServiceImpl {
  private events: SecurityEvent[] = [];
  private listeners: (() => void)[] = [];
  private maxEvents = 5000;

  constructor() {
    this.loadFromStorage();
    this.setupGlobalHandlers();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (stored) this.events = JSON.parse(stored);
    } catch {
      this.events = [];
    }
  }

  private saveToStorage() {
    try {
      const toSave = this.events.slice(0, this.maxEvents);
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(toSave));
    } catch {
      // تجاوز في حالة امتلاء التخزين
    }
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach(l => l());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  // ── Event Recording ───────────────────────────────────────────────────────
  async recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<SecurityEvent> {
    const fullEvent: SecurityEvent = {
      ...event,
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    this.events.unshift(fullEvent);
    if (this.events.length > this.maxEvents) this.events = this.events.slice(0, this.maxEvents);
    this.notify();

    // محاولة الحفظ في قاعدة البيانات
    this.persistToDb(fullEvent).catch(() => {});

    // إشعار المطور للأحداث الحرجة
    if (event.threatLevel === 'critical' || event.threatLevel === 'high') {
      try {
        const { addNotification } = await import('../notifications/notificationManager');
        addNotification('system', {
          type: 'system_security_alert',
          priority: event.threatLevel === 'critical' ? 'urgent' : 'high',
          title: this.getThreatTitle(event.type, event.threatLevel),
          message: event.details,
          metadata: { eventId: fullEvent.id, threatLevel: event.threatLevel },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch {
        // تجاوز
      }
    }

    return fullEvent;
  }

  private async persistToDb(event: SecurityEvent): Promise<void> {
    // SDK يتولى: حقن tenant_id إن وُجد، إدارة أخطاء الشبكة، عدم رمي أخطاء.
    await securityEventService.recordEvent({
      type: event.type,
      threatLevel: event.threatLevel,
      userId: event.userId,
      userName: event.userName,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      details: event.details,
      metadata: event.metadata,
    });
  }

  private getThreatTitle(type: EventType, level: ThreatLevel): string {
    const prefix = level === 'critical' ? '🚨 حرج' : '⚠️ تحذير';
    const titles: Record<EventType, string> = {
      login_success: 'تسجيل دخول ناجح',
      login_failed: 'فشل تسجيل الدخول',
      logout: 'تسجيل خروج',
      pin_failed: 'فشل رمز PIN',
      pin_locked: 'قفل رمز PIN',
      permission_denied: 'محاولة وصول مرفوضة',
      unauthorized_access: 'وصول غير مصرح',
      suspicious_activity: 'نشاط مشبوه',
      rate_limit_exceeded: 'تجاوز حد الطلبات',
      data_export: 'تصدير بيانات',
      settings_changed: 'تغيير إعدادات',
      user_created: 'مستخدم جديد',
      user_deleted: 'حذف مستخدم',
      role_changed: 'تغيير دور',
    };
    return `${prefix}: ${titles[type]}`;
  }

  // ── Login Attempts Tracking ───────────────────────────────────────────────
  recordLoginAttempt(success: boolean, username?: string): void {
    const attempts = this.getLoginAttempts();
    const newAttempt = {
      timestamp: new Date().toISOString(),
      success,
      username: username || 'unknown',
      ipAddress: 'session',
    };

    attempts.unshift(newAttempt);
    if (attempts.length > 100) attempts.pop();
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(attempts));

    this.recordEvent({
      type: success ? 'login_success' : 'login_failed',
      threatLevel: success ? 'low' : (this.getRecentFailedCount() > 3 ? 'high' : 'medium'),
      userId: null,
      userName: username || null,
      ipAddress: 'session',
      userAgent: navigator.userAgent,
      details: success 
        ? `تسجيل دخول ناجح للمستخدم: ${username}` 
        : `فشل محاولة تسجيل دخول للمستخدم: ${username}`,
      metadata: { attemptCount: this.getRecentFailedCount() },
    });
  }

  recordPinAttempt(success: boolean, source: string): { locked: boolean; remaining: number } {
    const lockout = this.getLockoutState();
    const now = Date.now();

    if (lockout.lockedUntil && lockout.lockedUntil > now) {
      return { locked: true, remaining: Math.ceil((lockout.lockedUntil - now) / 1000 / 60) };
    }

    if (success) {
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT);
      this.recordEvent({
        type: 'login_success',
        threatLevel: 'low',
        userId: null,
        userName: 'developer',
        ipAddress: 'session',
        userAgent: navigator.userAgent,
        details: 'نجاح في إدخال رمز PIN الخاص بالمطور',
      });
      return { locked: false, remaining: 5 };
    }

    const newAttempts = lockout.attempts + 1;
    const remaining = Math.max(0, 5 - newAttempts);
    let lockedUntil = 0;

    if (newAttempts >= 5) {
      lockedUntil = now + 5 * 60 * 1000; // قفل 5 دقائق
      this.recordEvent({
        type: 'pin_locked',
        threatLevel: 'critical',
        userId: null,
        userName: 'unknown',
        ipAddress: 'session',
        userAgent: navigator.userAgent,
        details: `🚨 تم قفل لوحة المطور لمدة 5 دقائق بعد ${newAttempts} محاولات فاشلة`,
        metadata: { source, attempts: newAttempts },
      });
    } else {
      this.recordEvent({
        type: 'pin_failed',
        threatLevel: newAttempts >= 3 ? 'high' : 'medium',
        userId: null,
        userName: 'unknown',
        ipAddress: 'session',
        userAgent: navigator.userAgent,
        details: `فشل في إدخال رمز PIN (المحاولة ${newAttempts}/5)`,
        metadata: { source, attempts: newAttempts },
      });
    }

    localStorage.setItem(STORAGE_KEYS.LOCKOUT, JSON.stringify({ attempts: newAttempts, lockedUntil }));
    return { locked: lockedUntil > 0, remaining };
  }

  getLoginAttempts(): any[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  getRecentFailedCount(): number {
    const attempts = this.getLoginAttempts();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return attempts.filter(a => !a.success && new Date(a.timestamp).getTime() > fiveMinAgo).length;
  }

  getLockoutState(): { attempts: number; lockedUntil: number } {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.LOCKOUT);
      return stored ? JSON.parse(stored) : { attempts: 0, lockedUntil: 0 };
    } catch {
      return { attempts: 0, lockedUntil: 0 };
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  getEvents(filters?: { threatLevel?: ThreatLevel[]; type?: EventType[]; resolved?: boolean; search?: string }): SecurityEvent[] {
    let filtered = [...this.events];
    if (filters?.threatLevel?.length) filtered = filtered.filter(e => filters.threatLevel!.includes(e.threatLevel));
    if (filters?.type?.length) filtered = filtered.filter(e => filters.type!.includes(e.type));
    if (filters?.resolved !== undefined) filtered = filtered.filter(e => e.resolved === filters.resolved);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(e =>
        e.details.toLowerCase().includes(s) ||
        e.userName?.toLowerCase().includes(s) ||
        e.ipAddress?.toLowerCase().includes(s));
    }
    return filtered;
  }

  getStats(): SecurityStats {
    const total = this.events.length;
    const critical = this.events.filter(e => e.threatLevel === 'critical').length;
    const high = this.events.filter(e => e.threatLevel === 'high').length;
    const failedLogins = this.events.filter(e => e.type === 'login_failed' || e.type === 'pin_failed').length;
    const suspiciousActivities = this.events.filter(e => e.type === 'suspicious_activity').length;
    const uniqueIPs = new Set(this.events.map(e => e.ipAddress).filter(Boolean)).size;
    const resolved = this.events.filter(e => e.resolved).length;
    const last24h = this.events.filter(e => new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000).length;

    let threatLevel: ThreatLevel = 'low';
    if (critical > 0) threatLevel = 'critical';
    else if (high > 0) threatLevel = 'high';
    else if (this.events.filter(e => e.threatLevel === 'medium').length > 0) threatLevel = 'medium';

    // عدد المستخدمين المشبوهين (الذين لديهم أكثر من حدث مشبوه)
    const userEventCounts: Record<string, number> = {};
    this.events.filter(e => e.userId).forEach(e => { userEventCounts[e.userId!] = (userEventCounts[e.userId!] || 0) + 1; });
    const suspiciousUsers = Object.values(userEventCounts).filter(c => c >= 2).length;

    return { total, critical, high, failedLogins, suspiciousActivities, suspiciousUsers, uniqueIPs, resolved, unresolved: total - resolved, last24h, threatLevel };
  }

  resolveEvent(id: string, resolvedBy: string): void {
    const event = this.events.find(e => e.id === id);
    if (event) {
      event.resolved = true;
      event.resolvedAt = new Date().toISOString();
      event.resolvedBy = resolvedBy;
      this.notify();
    }
  }

  // ── Global Handlers ────────────────────────────────────────────────────────
  private setupGlobalHandlers() {
    if (typeof window === 'undefined') return;

    // تتبع الأخطاء العامة
    window.addEventListener('error', (e) => {
      this.recordEvent({
        type: 'suspicious_activity',
        threatLevel: 'medium',
        userId: null,
        userName: null,
        ipAddress: 'session',
        userAgent: navigator.userAgent,
        details: `خطأ JavaScript عام: ${e.message}`,
        metadata: { filename: e.filename, lineno: e.lineno },
      });
    });

    // تتبع الوعود المرفوضة
    window.addEventListener('unhandledrejection', (e) => {
      this.recordEvent({
        type: 'suspicious_activity',
        threatLevel: 'medium',
        userId: null,
        userName: null,
        ipAddress: 'session',
        userAgent: navigator.userAgent,
        details: `وعد مرفوض غير معالج: ${e.reason}`,
      });
    });
  }

  clearEvents() {
    this.events = [];
    this.notify();
  }
}

export const securityService = new SecurityServiceImpl();
