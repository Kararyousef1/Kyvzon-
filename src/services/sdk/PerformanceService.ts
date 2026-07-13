/**
 * ════════════════════════════════════════════════════════════════
 *  PerformanceService - خدمة الأداء الوظيفي (نسخة SDK جديدة)
 *  Domain: Performance
 *  تشمل: performance_cycles, performance_reviews
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { PerformanceCycleRecord } from '../../shared/types/sdk';

// ─────────────────────────────────────────────────
//  Performance Cycles
// ─────────────────────────────────────────────────

class PerformanceCycleService extends BaseService<PerformanceCycleRecord> {
  constructor() {
    super('performance_cycles');
  }

  /**
   * جلب جميع دورات الأداء
   */
  async findAllCycles(): Promise<any[]> {
    return this.findAll({
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /**
   * إنشاء دورة أداء جديدة
   */
  async createCycle(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }
}

// ─────────────────────────────────────────────────
//  Performance Reviews
// ─────────────────────────────────────────────────

class PerformanceReviewService extends BaseService {
  constructor() {
    super('performance_reviews');
  }

  /**
   * جلب جميع تقييمات الأداء
   */
  async findAllReviews(): Promise<any[]> {
    return this.findAll({
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /**
   * إنشاء تقييم أداء جديد
   */
  async createReview(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }

  /**
   * تحديث حالة تقييم أداء
   */
  async updateReviewStatus(id: string, status: string): Promise<any> {
    return this.update(id, { status, completed_at: status === 'completed' ? new Date().toISOString() : null } as unknown as Record<string, unknown>);
  }
}

// ─────────────────────────────────────────────────
//  التصدير
// ─────────────────────────────────────────────────

export const performanceCycleService = new PerformanceCycleService();
export const performanceReviewService = new PerformanceReviewService();