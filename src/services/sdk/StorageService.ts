/**
 * ════════════════════════════════════════════════════════════════
 *  StorageService - خدمة موحّدة لعمليات Supabase Storage
 *
 *  الغرض:
 *  ──────────────────────────────────────────────────────
 *  توحيد كل عمليات upload/getPublicUrl/delete في مكان واحد.
 *  قبل هذه الخدمة، كل صفحة كانت تكرر النمط:
 *
 *    const fileName = `${path}/${Date.now()}.${ext}`;
 *    const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
 *    if (error) throw error;
 *    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
 *    return data.publicUrl;
 *
 *  الآن: storageService.uploadPublic('public-assets', 'profiles', file)
 *
 *  البركة: mocking أسهل في الاختبارات، سلوك موحّد للأخطاء، لوجينج مركزي.
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';
import { SdkError, SdkErrorCode } from './BaseService';
import { logger } from '../utils/logger';

/**
 * الحصول على امتداد الملف من اسمه.
 */
function getExt(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : 'bin';
}

/**
 * تنظيف مقطع مسار من الأحرف غير الآمنة (تحمي من path traversal).
 */
function sanitizePath(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\.+/g, '_');
}

export interface UploadOptions {
  /** حَل تعارض الأسماء بالكتابة فوق الملف (افتراضي: true) */
  upsert?: boolean;
  /** اسم مخصص للملف بدلاً من timestamp (بدون امتداد) */
  fileName?: string;
  /** cache-control header */
  cacheControl?: string;
  /** contentType — يُشتق من الملف افتراضياً */
  contentType?: string;
}

class StorageService {
  /**
   * رفع ملف إلى bucket عام والحصول على رابط عام.
   *
   * @param bucket اسم الـ bucket (يجب أن يكون public في Supabase Dashboard)
   * @param folder المجلد داخل الـ bucket (e.g. 'profiles', 'documents/leaves')
   * @param file الملف
   * @param options خيارات إضافية
   * @returns URL العام للملف
   */
  async uploadPublic(
    bucket: string,
    folder: string,
    file: File,
    options?: UploadOptions,
  ): Promise<string> {
    const path = this.buildPath(folder, file, options?.fileName);

    logger.debug('StorageService.uploadPublic', {
      component: 'StorageService',
      action: 'uploadPublic',
      bucket,
      path,
      size: file.size,
    });

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: options?.upsert ?? true,
      cacheControl: options?.cacheControl ?? '3600',
      contentType: options?.contentType ?? file.type,
    });

    if (upErr) {
      logger.error('StorageService.uploadPublic failed', {
        component: 'StorageService',
        action: 'uploadPublic',
        bucket,
        path,
        error: upErr.message,
      });
      throw new SdkError(
        SdkErrorCode.DATABASE_ERROR,
        `فشل رفع الملف: ${upErr.message}`,
      );
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * رفع ملف إلى bucket خاص. يرجع المسار الداخلي فقط (لا URL عام).
   * للوصول لاحقاً استخدم signedUrl().
   */
  async uploadPrivate(
    bucket: string,
    folder: string,
    file: File,
    options?: UploadOptions,
  ): Promise<string> {
    const path = this.buildPath(folder, file, options?.fileName);

    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: options?.upsert ?? false,
      cacheControl: options?.cacheControl ?? '3600',
      contentType: options?.contentType ?? file.type,
    });

    if (error) {
      throw new SdkError(
        SdkErrorCode.DATABASE_ERROR,
        `فشل رفع الملف (خاص): ${error.message}`,
      );
    }

    return path;
  }

  /**
   * الحصول على رابط مؤقت لملف خاص.
   */
  async signedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new SdkError(
        SdkErrorCode.DATABASE_ERROR,
        error?.message || 'فشل إنشاء رابط موقّع',
      );
    }

    return data.signedUrl;
  }

  /**
   * الحصول على رابط عام لملف موجود.
   */
  publicUrl(bucket: string, path: string): string {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  /**
   * حذف ملف.
   */
  async delete(bucket: string, path: string | string[]): Promise<void> {
    const paths = Array.isArray(path) ? path : [path];
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      throw new SdkError(
        SdkErrorCode.DATABASE_ERROR,
        `فشل حذف الملف: ${error.message}`,
      );
    }
  }

  /**
   * بناء مسار آمن ومُعرَّف زمنياً للملف.
   * @internal
   */
  private buildPath(folder: string, file: File, customName?: string): string {
    const safeFolder = sanitizePath(folder).replace(/^\/+|\/+$/g, '');
    const ext = getExt(file.name);
    const baseName = customName
      ? sanitizePath(customName)
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `${safeFolder}/${baseName}.${ext}`;
  }
}

export const storageService = new StorageService();
