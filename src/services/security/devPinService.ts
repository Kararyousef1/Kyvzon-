// ════════════════════════════════════════════════════════════════
//  devPinService — خدمة التحقق الآمن لبوابة المطور
//
//  الميزات:
//  • هذا gate مخصص للتطوير المحلي فقط
//  • لا يمثل authorization في الإنتاج
//  • الإنتاج يحتاج تحققاً خادمياً عبر Supabase/RLS/Edge Function
//  • حد 5 محاولات ثم قفل 10 دقائق للتطوير المحلي
//  • تسجيل كل محاولة في securityService
// ════════════════════════════════════════════════════════════════

import { securityService } from './securityService';
import { supabase } from '../supabase/supabase';

// ── Constants ────────────────────────────────────────────────────
const MAX_ATTEMPTS      = 5;
const LOCKOUT_MS        = 10 * 60 * 1000;   // 10 دقائق
const SESSION_MS        = 60 * 60 * 1000;   // 60 دقيقة
const STORAGE_KEY_PIN   = 'dev_pin_state';
const STORAGE_KEY_SES   = 'dev_session';

// ── Types ─────────────────────────────────────────────────────────
interface SignedPinState {
  attempts:    number;
  lockedUntil: number;   // epoch ms, 0 = غير مقفل
  signature:   string;
}

interface DevSession {
  verifiedAt: number;    // epoch ms
}

export interface PinCheckResult {
  success:   boolean;
  locked:    boolean;
  remaining: number;     // عدد المحاولات المتبقية أو دقائق القفل
  message:   string;
}

// ── Local development state helper ───────────────────────────────
// هذا ليس توقيعاً أمنياً؛ كل ما في المتصفح قابل للتعديل. لا تستخدمه
// لاتخاذ قرار صلاحيات في الإنتاج.
function signData(data: string): string {
  return data;
}

function createSignedState(attempts: number, lockedUntil: number): SignedPinState {
  const raw = `${attempts}:${lockedUntil}`;
  return { attempts, lockedUntil, signature: signData(raw) };
}

function verifySignedState(state: SignedPinState): boolean {
  const raw = `${state.attempts}:${state.lockedUntil}`;
  return state.signature === signData(raw);
}

// ── Helpers ───────────────────────────────────────────────────────
function loadPinState(): SignedPinState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PIN);
    if (raw) {
      const parsed = JSON.parse(raw) as SignedPinState;
      // التحقق من التوقيع — إذا كان التوقيع غير صحيح، نعيد حالة نظيفة
      if (verifySignedState(parsed)) {
        return parsed;
      }
      // تلاعب مشبوه — نقوم بمسح الحالة وتسجيل حدث أمني
      localStorage.removeItem(STORAGE_KEY_PIN);
      securityService.recordEvent({
        type: 'suspicious_activity',
        threatLevel: 'high',
        userId: null,
        userName: null,
        ipAddress: 'session',
        userAgent: navigator.userAgent,
        details: '🚨 تم اكتشاف تلاعب بـ dev_pin_state في localStorage!',
        metadata: { source: 'devPinService.loadPinState' },
      });
    }
  } catch { /* ignore */ }
  return { attempts: 0, lockedUntil: 0, signature: '' };
}

function savePinState(state: SignedPinState): void {
  try {
    localStorage.setItem(STORAGE_KEY_PIN, JSON.stringify(state));
  } catch { /* ignore */ }
}

function clearPinState(): void {
  localStorage.removeItem(STORAGE_KEY_PIN);
}

// ── Session ───────────────────────────────────────────────────────

/** هل الجلسة سارية؟ (تُستدعى من DeveloperDashboard) */
export function isDevSessionActive(): boolean {
  // لا توجد جلسة PIN من المتصفح في الإنتاج.
  if (import.meta.env.PROD) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SES);
    if (!raw) return false;
    const ses = JSON.parse(raw) as DevSession;
    return Date.now() - ses.verifiedAt < SESSION_MS;
  } catch {
    return false;
  }
}

function startDevSession(): void {
  if (import.meta.env.PROD) return;
  const ses: DevSession = { verifiedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY_SES, JSON.stringify(ses));
}

export function clearDevSession(): void {
  localStorage.removeItem(STORAGE_KEY_SES);
  clearPinState();
}

// ── Core — PIN check ─────────────────────────────────────────────

/**
 * يتحقق من PIN للتطوير المحلي فقط.
 * في الإنتاج يُرفض الطلب؛ القرار الأمني يجب أن يصدر من الخادم.
 */
export function checkDevPin(input: string): PinCheckResult {
  if (import.meta.env.PROD) {
    return {
      success: false,
      locked: false,
      remaining: 0,
      message: 'بوابة المطور تحتاج تحققاً خادمياً في بيئة الإنتاج.',
    };
  }

  const state = loadPinState();
  const now   = Date.now();

  // ── مرحلة القفل ──────────────────────────────────────────────
  if (state.lockedUntil > now) {
    const mins = Math.ceil((state.lockedUntil - now) / 60_000);
    return {
      success:   false,
      locked:    true,
      remaining: mins,
      message:   `لوحة المطور مقفلة. المحاولة بعد ${mins} دقيقة.`,
    };
  }

  // ── مقارنة الرمز ─────────────────────────────────────────────
  const expected = import.meta.env.DEV ? import.meta.env.VITE_DEV_PIN as string | undefined : undefined;

  if (!expected) {
    // لم يُضبط المتغير — نرفض دائماً ونُسجّل كخطأ إعداد
    securityService.recordEvent({
      type:        'suspicious_activity',
      threatLevel: 'high',
      userId:      null,
      userName:    null,
      ipAddress:   'session',
      userAgent:   navigator.userAgent,
      details:     'VITE_DEV_PIN غير مُعرَّف — محاولة دخول لوحة المطور',
    });
    return {
      success:   false,
      locked:    false,
      remaining: MAX_ATTEMPTS - state.attempts,
      message:   'خطأ في إعداد النظام. راجع متغيرات البيئة.',
    };
  }

  const isCorrect = input.trim() === expected.trim();

  if (isCorrect) {
    // ── نجاح ────────────────────────────────────────────────────
    clearPinState();
    startDevSession();

    securityService.recordPinAttempt(true, 'developer-dashboard');

    return {
      success:   true,
      locked:    false,
      remaining: MAX_ATTEMPTS,
      message:   'تم التحقق بنجاح.',
    };
  }

  // ── فشل ─────────────────────────────────────────────────────
  const newAttempts  = state.attempts + 1;
  const remaining    = Math.max(0, MAX_ATTEMPTS - newAttempts);
  let   lockedUntil  = 0;

  if (newAttempts >= MAX_ATTEMPTS) {
    lockedUntil = now + LOCKOUT_MS;
  }

  const signedState = createSignedState(newAttempts, lockedUntil);
  savePinState(signedState);
  securityService.recordPinAttempt(false, 'developer-dashboard');

  if (lockedUntil > 0) {
    return {
      success:   false,
      locked:    true,
      remaining: 10,
      message:   `تم قفل لوحة المطور 10 دقائق بعد ${MAX_ATTEMPTS} محاولات فاشلة.`,
    };
  }

  return {
    success:   false,
    locked:    false,
    remaining,
    message:   `رمز خاطئ. تبقّت ${remaining} محاولة.`,
  };
}

// ── Audit helpers ─────────────────────────────────────────────────

/**
 * يُسجّل عملية تصدير بيانات في audit_logs.
 * يجب استدعاؤها قبل كل تصدير.
 */
export async function logDataExport(
  actorId:    string,
  actorRole:  string,
  exportType: string,
  count:      number,
): Promise<void> {
  const details = `تصدير ${count} سجل من: ${exportType}`;

  // تسجيل في securityService (محلي + Supabase)
  await securityService.recordEvent({
    type:        'data_export',
    threatLevel: 'medium',
    userId:      actorId,
    userName:    actorRole,
    ipAddress:   'session',
    userAgent:   navigator.userAgent,
    details,
    metadata:    { exportType, count },
  });

  // تسجيل مستقل في audit_logs
  try {
    await supabase.from('audit_logs').insert({
      action:     'DATA_EXPORT',
      actor_id:   actorId,
      actor_role: actorRole,
      target:     exportType,
      details,
      timestamp:  new Date().toISOString(),
    });
  } catch { /* securityService يكفي */ }
}