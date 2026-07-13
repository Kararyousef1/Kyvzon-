/**
 * ════════════════════════════════════════════════════════════════
 *  RecruitmentService - خدمة التوظيف (نسخة SDK جديدة)
 *  Domain: Recruitment
 *  تشمل: job_postings, job_applications
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { JobPostingRecord } from '../../shared/types/sdk';

class JobPostingService extends BaseService<JobPostingRecord> {
  constructor() { super('job_postings'); }
  async findAllPostings(): Promise<any[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false });
  }
  async createPosting(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }
}

class JobApplicationService extends BaseService {
  constructor() { super('job_applications'); }
  async findByJob(jobId: string): Promise<any[]> {
    return this.findAll({ filters: { job_id: jobId }, orderBy: 'applied_at', ascending: false });
  }
  async updateStatus(id: string, status: string): Promise<any> {
    return this.update(id, { status } as unknown as Record<string, unknown>);
  }
}

export const jobPostingService = new JobPostingService();
export const jobApplicationService = new JobApplicationService();