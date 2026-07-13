/**
 * ════════════════════════════════════════════════════════════════
 *  SurveyService - خدمة الاستبيانات (نسخة SDK جديدة)
 *  Domain: Survey
 *  تشمل: survey_responses
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { SurveyResponseRecord } from '../../shared/types/sdk';

class SurveyResponseService extends BaseService<SurveyResponseRecord> {
  constructor() { super('survey_responses'); }

  async createResponse(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }
}

export const surveyResponseService = new SurveyResponseService();