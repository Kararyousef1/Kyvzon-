/**
 * PlatformService — عمليات منصّية خاصة ببوابة المطوّرين
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ★ حدود صريحة: هذه الطبقة لإدارة **المنصة** لا لبيانات العملاء.
 *
 *   تدقيق 0318 كشف أن current_user_is_platform_owner() كانت تمنح
 *   المطوّر قراءة بيانات كل الشركات عبر 576 سياسة RLS — أُثبت بمسبار:
 *   قرأ 5 كيانات مالية لعملاء مختلفين. وقد قُيِّدت بـ tenant_id.
 *
 *   لذلك: لا تُضَف هنا أي دالة تقرأ بيانات عميل (موظفين · مالية ·
 *   طلبات). المسموح: الاشتراكات · تفعيل البوابات · التدقيق · الصحة.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export interface SubscriptionConflict {
  tenantId: string;
  tenantName: string;
  issue: string;
  detail: string;
}

/** وضع إقفال الوحدات لكل مستأجر (0320) */
export type EnforcementMode = 'off' | 'audit' | 'enforce';

export interface EnforcementTenantRow {
  tenantId: string;
  tenantName: string;
  subscriptionPlan: string;
  mode: EnforcementMode;
  enabledModules: string[];
  wouldBlock: number;
  blocked: number;
  distinctModules: number;
  lastAttempt: string | null;
  /** توصية جاهزة من القاعدة — لا يجتهد المشغّل */
  readiness: string;
}

export interface EnforcementModuleDetail {
  module: string;
  wouldBlock: number;
  blocked: number;
  users: number;
  lastSeen: string | null;
  inPlan: boolean;
}

export interface EnforcementImpactRow {
  module: string;
  allowed: boolean;
  rowCount: number;
  note: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  NO_AUTH: 'انتهت الجلسة — سجّل الدخول من جديد.',
  NO_TENANT: 'لا يوجد مستأجر مرتبط بحسابك.',
  NOT_AUTHORIZED_TO_SET_ENFORCEMENT: 'تبديل وضع الإقفال متاح لمطوّري المنصة وحدهم.',
  MUST_AUDIT_BEFORE_ENFORCE:
    'لا يمكن الانتقال من «معطّل» إلى «إقفال» مباشرةً — شغّل وضع «مراقبة» أولاً وراجع السجل.',
  INVALID_ENFORCEMENT_MODE: 'وضع إقفال غير معروف.',
  TENANT_NOT_FOUND: 'الشركة غير موجودة.',
};

function translateError(message: string): string {
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

class PlatformService {
  /**
   * تعارضات الاشتراك عبر كل الشركات (0318).
   *
   * محروسة بـ current_user_is_platform_admin() **داخل** الاستعلام،
   * فغير المطوّر يحصل على مصفوفة فارغة لا على خطأ — لا نكشف وجود
   * البيانات لمن لا يملكها.
   */
  async findSubscriptionConflicts(): Promise<SubscriptionConflict[]> {
    const { data, error } = await supabase.rpc('detect_subscription_conflicts');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      tenantId: String(r.out_tenant_id),
      tenantName: String(r.out_tenant_name ?? '—'),
      issue: String(r.out_issue),
      detail: String(r.out_detail ?? ''),
    }));
  }

  // ═══ وحدة تحكّم إقفال الاشتراك (0320/0321) ══════════════════════════

  /**
   * كل الشركات مع وضع الإقفال وإحصاء المحاولات.
   * تبدأ من tenants لا من السجل — فتظهر الشركات النظيفة أيضاً.
   */
  async findEnforcementOverview(): Promise<EnforcementTenantRow[]> {
    const { data, error } = await supabase.rpc('enforcement_console_overview');
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      tenantId: String(r.out_tenant_id),
      tenantName: String(r.out_tenant_name ?? '—'),
      subscriptionPlan: String(r.out_subscription_plan ?? ''),
      mode: (String(r.out_mode ?? 'off') as EnforcementMode),
      enabledModules: Array.isArray(r.out_enabled_modules)
        ? (r.out_enabled_modules as unknown[]).map(String)
        : [],
      wouldBlock: Number(r.out_would_block ?? 0),
      blocked: Number(r.out_blocked ?? 0),
      distinctModules: Number(r.out_distinct_modules ?? 0),
      lastAttempt: r.out_last_attempt ? String(r.out_last_attempt) : null,
      readiness: String(r.out_readiness ?? ''),
    }));
  }

  /** تفاصيل محاولات شركة: أي وحدة · كم محاولة · كم مستخدماً */
  async findEnforcementDetail(tenantId: string): Promise<EnforcementModuleDetail[]> {
    const { data, error } = await supabase.rpc('enforcement_tenant_detail', {
      p_tenant_id: tenantId,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      module: String(r.out_module),
      wouldBlock: Number(r.out_would_block ?? 0),
      blocked: Number(r.out_blocked ?? 0),
      users: Number(r.out_users ?? 0),
      lastSeen: r.out_last_seen ? String(r.out_last_seen) : null,
      inPlan: r.out_in_plan === true,
    }));
  }

  /** تقرير الأثر قبل الإقفال: أي وحدة ستُمنَع وكم صفاً فيها */
  async previewImpact(tenantId: string): Promise<EnforcementImpactRow[]> {
    const { data, error } = await supabase.rpc('preview_enforcement_impact', {
      p_tenant_id: tenantId,
    });
    if (error) throw new Error(translateError(error.message));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      module: String(r.out_module),
      allowed: r.out_allowed === true,
      rowCount: Number(r.out_row_count ?? 0),
      note: String(r.out_note ?? ''),
    }));
  }

  /**
   * تبديل وضع الإقفال.
   * القاعدة تمنع القفز من off إلى enforce — الرسالة مترجَمة.
   */
  async setEnforcementMode(tenantId: string, mode: EnforcementMode): Promise<string> {
    const { data, error } = await supabase.rpc('set_module_enforcement', {
      p_tenant_id: tenantId,
      p_mode: mode,
    });
    if (error) throw new Error(translateError(error.message));
    return String(data ?? '');
  }

  /** هل المستخدم الحالي مدير منصة؟ (إدارة الاشتراكات والبوابات) */
  async isPlatformAdmin(): Promise<boolean> {
    const { data, error } = await supabase.rpc('current_user_is_platform_admin');
    if (error) return false;
    return data === true;
  }
}

export const platformService = new PlatformService();
export default platformService;
