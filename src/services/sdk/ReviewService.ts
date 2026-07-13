/**
 * ════════════════════════════════════════════════════════════════
 *  ReviewService - خدمة مراجعات العملاء (نسخة SDK جديدة)
 *  مسؤولة عن: Customer Reviews, Feedback
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { CustomerReviewRecord } from '../../shared/types/sdk';

class ReviewService extends BaseService<CustomerReviewRecord> {
  constructor() {
    super('customer_reviews');
  }

  /**
   * جلب آخر المراجعات
   */
  async findLatest(limit: number = 5): Promise<any[]> {
    return this.findAll({
      orderBy: 'created_at',
      ascending: false,
      limit,
    });
  }

  /**
   * إنشاء مراجعة جديدة
   */
  async createReview(data: {
    full_name?: string;
    rating?: number;
    comment?: string;
    department?: string;
  }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }
}

export const reviewService = new ReviewService();