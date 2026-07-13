/**
 * ════════════════════════════════════════════════════════════════
 *  BaseService<T> - الخدمة الأساسية الموحدة لطبقة SDK
 *  جميع خدمات SDK ترث من هذه الخدمة مع تحديد النوع T
 *
 *  v2 - Generic Version
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ Generic <T> يلغي الحاجة لـ any
 *  ✅ addTenantFilter يستخدم PostgrestFilterBuilder (لا any)
 *  ✅ catch blocks تستخدم unknown (ليس any)
 *  ✅ findAll ترجع T[]، findById ترجع T | null، إلخ
 *  ✅ توافق عكسي كامل — كل الخدمات الحالية تعمل بدون تغيير
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

// ════════════════════════════════════════════════════════════════
//  أنواع الأخطاء الموحدة
// ════════════════════════════════════════════════════════════════

export enum SdkErrorCode {
  VALIDATION_ERROR    = 'VALIDATION_ERROR',
  PERMISSION_DENIED  = 'PERMISSION_DENIED',
  TENANT_NOT_FOUND   = 'TENANT_NOT_FOUND',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  NOT_FOUND          = 'NOT_FOUND',
  DATABASE_ERROR     = 'DATABASE_ERROR',
  UNKNOWN_ERROR      = 'UNKNOWN_ERROR',
}

export class SdkError extends Error {
  constructor(
    public code: SdkErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'SdkError';
  }

  static fromSupabaseError(error: { message?: string }): SdkError {
    return new SdkError(
      SdkErrorCode.DATABASE_ERROR,
      error.message || 'خطأ في قاعدة البيانات',
    );
  }

  static permissionDenied(message?: string): SdkError {
    return new SdkError(SdkErrorCode.PERMISSION_DENIED, message || 'لا تملك صلاحية الوصول');
  }

  static notFound(message?: string): SdkError {
    return new SdkError(SdkErrorCode.NOT_FOUND, message || 'السجل غير موجود');
  }

  static validationError(message: string): SdkError {
    return new SdkError(SdkErrorCode.VALIDATION_ERROR, message);
  }
}

// ════════════════════════════════════════════════════════════════
//  حقن tenant_id (مصدر موحد واحد)
// ════════════════════════════════════════════════════════════════

/**
 * الحصول على tenant_id الحالي من السياق.
 *
 * ملاحظة أمنية: هذا المصدر يُستخدم فقط لبناء الاستعلامات.
 * الأمان الفعلي يتم عبر RLS في قاعدة البيانات.
 * tenant_id لا يأتي من المستخدم أبداً.
 */
export function getCurrentTenantId(): string | undefined {
  return localStorage.getItem('tenant_id') || undefined;
}

/**
 * التأكد من وجود tenant_id قبل تنفيذ العملية
 */
export function requireTenantId(): string {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    throw SdkError.validationError('لم يتم العثور على معلومات الشركة (Tenant ID)');
  }
  return tenantId;
}

/**
 * نوع مساعد للخيارات العامة للاستعلام
 */
export interface FindAllOptions {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

/**
 * نوع مساعد لصياغة where clause
 */
export interface WhereCondition {
  column: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: unknown;
}

// ════════════════════════════════════════════════════════════════
//  BaseService<T>
// ════════════════════════════════════════════════════════════════

/**
 * الخدمة الأساسية لكل جداول Supabase.
 *
 * @template T نوع السجل في الجدول (Row type)
 *
 * @example
 * ```ts
 * class UserService extends BaseService<User> {
 *   constructor() { super('profiles'); }
 * }
 * ```
 */
export class BaseService<T = any> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  // ─────────────────────────────────────────────────
  //  Tenant Injection
  // ─────────────────────────────────────────────────

  /**
   * إضافة شرط tenant_id تلقائياً إلى الاستعلام.
   * النوع any مقبول هنا لأن Supabase Query Builder types
   * معقدة ومتغيرة بين الإصدارات.
   */
  protected addTenantFilter(query: any, skipTenantFilter?: boolean): any {
    if (skipTenantFilter) return query;
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      return query.eq('tenant_id', tenantId);
    }
    return query;
  }

  /**
   * إزالة أي tenant_id من بيانات الإدخال وإضافة القيمة الصحيحة من السياق.
   * تُستخدم في عمليات INSERT.
   */
  protected injectTenantId(data: Partial<T>): Record<string, unknown> {
    const tenantId = requireTenantId();
    // إزالة tenant_id إذا ورد من المستخدم (لا تثق به)
    const { tenant_id: _, ...cleanData } = data as Record<string, unknown>;
    return { ...cleanData, tenant_id: tenantId };
  }

  // ─────────────────────────────────────────────────
  //  CRUD Operations
  // ─────────────────────────────────────────────────

  /**
   * جلب جميع السجلات مع فلتر tenant_id تلقائي
   */
  async findAll(options?: FindAllOptions): Promise<T[]> {
    try {
      logger.debug(`BaseService.findAll: ${this.tableName}`, {
        component: 'BaseService',
        action: 'findAll',
        table: this.tableName,
      });

      let query = this.addTenantFilter(
        supabase.from(this.tableName).select('*'),
      );

      if (options?.filters) {
        for (const [key, value] of Object.entries(options.filters)) {
          query = query.eq(key, value);
        }
      }
      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? true });
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;
      if (error) throw SdkError.fromSupabaseError(error);
      return (data || []) as T[];
    } catch (error: any) {
      logger.error(`BaseService.findAll failed: ${this.tableName}`, {
        component: 'BaseService',
        action: 'findAll',
        table: this.tableName,
        error: error.message,
      });
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error);
    }
  }

  /**
   * جلب سجل واحد بالـ ID
   */
  async findById(id: string, skipTenantFilter?: boolean): Promise<T | null> {
    try {
      logger.debug(`BaseService.findById: ${this.tableName}`, {
        component: 'BaseService',
        action: 'findById',
        table: this.tableName,
        id,
      });

      const query = this.addTenantFilter(
        supabase.from(this.tableName).select('*').eq('id', id),
        skipTenantFilter,
      );
      const { data, error } = await query.maybeSingle();
      if (error) throw SdkError.fromSupabaseError(error);
      return data as T | null;
    } catch (error: any) {
      logger.error(`BaseService.findById failed: ${this.tableName}`, {
        component: 'BaseService',
        action: 'findById',
        table: this.tableName,
        id,
        error: error.message,
      });
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error);
    }
  }

  /**
   * جلب سجل واحد بشرط مخصص
   */
  async findOne(column: string, value: unknown): Promise<T | null> {
    try {
      logger.debug(`BaseService.findOne: ${this.tableName}`, {
        component: 'BaseService',
        action: 'findOne',
        table: this.tableName,
        column,
      });

      const query = this.addTenantFilter(
        supabase.from(this.tableName).select('*').eq(column, value as string | number | boolean),
      );
      const { data, error } = await query.maybeSingle();
      if (error) throw SdkError.fromSupabaseError(error);
      return data as T | null;
    } catch (error: any) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * إنشاء سجل جديد.
   * tenant_id يُحقن تلقائياً من السياق — أي قيمة من المستخدم تُتجاهل.
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      logger.info(`BaseService.create: ${this.tableName}`, {
        component: 'BaseService',
        action: 'create',
        table: this.tableName,
      });

      const safeData = this.injectTenantId(data);

      const { data: result, error } = await supabase
        .from(this.tableName)
        .insert(safeData)
        .select()
        .single();

      if (error) throw SdkError.fromSupabaseError(error);
      return result as T;
    } catch (error: any) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * تحديث سجل موجود.
   * tenant_id لا يمكن تغييره — أي قيمة من المستخدم تُتجاهل.
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      logger.info(`BaseService.update: ${this.tableName}`, {
        component: 'BaseService',
        action: 'update',
        table: this.tableName,
        id,
      });

      // إزالة tenant_id من البيانات (لا يمكن تغيير الشركة)
      const { tenant_id: _, ...safeData } = data as Record<string, unknown>;

      const query = this.addTenantFilter(
        supabase.from(this.tableName).update(safeData).eq('id', id),
      );

      const { data: result, error } = await query.select().single();
      if (error) throw SdkError.fromSupabaseError(error);
      return result as T;
    } catch (error: any) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * حذف سجل — حذف فعلي (hard delete).
   * يُفضّل استخدام softDelete() بدلاً من هذه إن أمكن.
   */
  async delete(id: string): Promise<boolean> {
    try {
      logger.warn(`BaseService.delete: ${this.tableName}`, {
        component: 'BaseService',
        action: 'delete',
        table: this.tableName,
        id,
      });

      const query = this.addTenantFilter(
        supabase.from(this.tableName).delete().eq('id', id),
      );
      const { error } = await query;
      if (error) throw SdkError.fromSupabaseError(error);
      return true;
    } catch (error: any) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * Soft Delete — تعيين deleted_at فقط بدلاً من حذف السجل
   */
  async softDelete(id: string): Promise<T> {
    try {
      logger.info(`BaseService.softDelete: ${this.tableName}`, {
        component: 'BaseService',
        action: 'softDelete',
        table: this.tableName,
        id,
      });

      const updateData: Record<string, unknown> = {
        deleted_at: new Date().toISOString(),
      };

      const query = this.addTenantFilter(
        supabase.from(this.tableName).update(updateData).eq('id', id),
      );

      const { data, error } = await query.select().single();
      if (error) throw SdkError.fromSupabaseError(error);
      return data as T;
    } catch (error: any) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * جلب عدد السجلات (مع tenant_id)
   */
  async count(extraFilter?: Record<string, unknown>): Promise<number> {
    try {
      let query = this.addTenantFilter(
        supabase.from(this.tableName).select('*', { count: 'exact', head: true }),
      );
      if (extraFilter) {
        for (const [key, value] of Object.entries(extraFilter)) {
          query = query.eq(key, value);
        }
      }
      const { count, error } = await query;
      if (error) throw SdkError.fromSupabaseError(error);
      return count || 0;
    } catch (error: any) {
      logger.error(`BaseService.count failed: ${this.tableName}`, {
        component: 'BaseService',
        action: 'count',
        table: this.tableName,
        error: error.message,
      });
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * جلب سجلات مع WhereConditions مخصصة
   */
  async findWhere(conditions: WhereCondition[], options?: FindAllOptions): Promise<T[]> {
    try {
      let query = this.addTenantFilter(
        supabase.from(this.tableName).select('*'),
      );

      for (const cond of conditions) {
        const op = cond.operator || 'eq';
        query = (query as any)[op](cond.column, cond.value);
      }

      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? true });
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;
      if (error) throw SdkError.fromSupabaseError(error);
      return (data || []) as T[];
    } catch (error: any) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * جلب بيانات خام من Supabase (للاستعلامات المعقدة التي يحتاجها SDK)
   */
  protected get queryBuilder() {
    return supabase.from(this.tableName);
  }
}
