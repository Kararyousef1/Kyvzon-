/**
 * ════════════════════════════════════════════════════════════════
 *  SuccessionService - تخطيط التعاقب والمناصب الحرجة داخل بوابة HR
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type {
  CriticalPositionRecord,
  SuccessionCandidateRecord,
  SuccessionDevelopmentPlanRecord,
} from '../../shared/types/sdk';

class CriticalPositionService extends BaseService<CriticalPositionRecord> {
  constructor() { super('critical_positions'); }

  async findActive(): Promise<CriticalPositionRecord[]> {
    return this.findAll({ filters: { status: 'active' }, orderBy: 'created_at', ascending: false });
  }

  async createPosition(data: Partial<CriticalPositionRecord>): Promise<CriticalPositionRecord> {
    return this.create({ ...data, status: data.status || 'active', risk_level: data.risk_level || 'medium' });
  }
}

class SuccessionCandidateService extends BaseService<SuccessionCandidateRecord> {
  constructor() { super('succession_candidates'); }

  async findByPosition(positionId: string): Promise<SuccessionCandidateRecord[]> {
    return this.findAll({ filters: { critical_position_id: positionId }, orderBy: 'readiness_level', ascending: true });
  }

  async createCandidate(data: Partial<SuccessionCandidateRecord>): Promise<SuccessionCandidateRecord> {
    return this.create({
      ...data,
      status: data.status || 'active',
      readiness_level: data.readiness_level || 'ready_12_months',
    });
  }
}

class SuccessionDevelopmentPlanService extends BaseService<SuccessionDevelopmentPlanRecord> {
  constructor() { super('succession_development_plans'); }

  async findByCandidate(candidateId: string): Promise<SuccessionDevelopmentPlanRecord[]> {
    return this.findAll({ filters: { candidate_id: candidateId }, orderBy: 'target_date', ascending: true });
  }

  async createPlan(data: Partial<SuccessionDevelopmentPlanRecord>): Promise<SuccessionDevelopmentPlanRecord> {
    return this.create({ ...data, status: data.status || 'planned' });
  }
}

export const criticalPositionService = new CriticalPositionService();
export const successionCandidateService = new SuccessionCandidateService();
export const successionDevelopmentPlanService = new SuccessionDevelopmentPlanService();
