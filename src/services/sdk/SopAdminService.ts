import { supabase } from '../supabase/supabase';
import type { SOP, SOPStatus } from '../../shared/types/sops';

export interface AdminSopInput {
  title: string;
  titleEn: string;
  code: string;
  description: string;
  descriptionEn: string;
  department: string;
  category: string;
  fileUrl: string;
  version: string;
  status: SOPStatus;
  effectiveDate: string;
  reviewDate: string;
  tags: string[];
  duration: string;
  isMandatory: boolean;
  createdBy?: string;
}

export interface SopReportEmployee {
  id: string;
  full_name: string;
  manufacturing_dept?: string | null;
  department?: string | null;
}

export interface SopReportCatalogItem {
  id: string;
  department?: string | null;
  status: string;
  is_mandatory: boolean;
  duration: number;
}

export interface SopReportReading {
  sop_id: string;
  employee_id: string;
  completed: boolean;
  approved: boolean;
  time_spent: number;
  last_read_at: string | null;
}

interface AdminSopRow {
  id: string;
  title: string;
  title_en: string | null;
  code: string;
  description: string;
  description_en: string | null;
  department: string;
  category: string;
  file_url: string | null;
  version: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  effective_date: string;
  review_date: string;
  tags: string[] | null;
  duration: number;
  is_mandatory: boolean;
}

function toAdminSop(row: AdminSopRow): SOP {
  return {
    id: row.id,
    title: row.title,
    titleEn: row.title_en ?? undefined,
    code: row.code,
    description: row.description,
    descriptionEn: row.description_en ?? undefined,
    department: row.department,
    category: row.category,
    pdfUrl: row.file_url ?? '',
    version: row.version,
    status: row.status as SOPStatus,
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    effectiveDate: row.effective_date,
    reviewDate: row.review_date,
    tags: row.tags ?? [],
    duration: String(row.duration),
    isMandatory: row.is_mandatory,
  };
}

class SopAdminService {
  async findCatalog(tenantId: string): Promise<SOP[]> {
    const { data, error } = await supabase.from('sops')
      .select('id,title,title_en,code,description,description_en,department,category,file_url,version,status,created_by,created_at,updated_at,effective_date,review_date,tags,duration,is_mandatory')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as AdminSopRow[]).map(toAdminSop);
  }

  async updateSop(sopId: string, tenantId: string, input: AdminSopInput): Promise<void> {
    const { error } = await supabase.from('sops').update({
      title: input.title,
      title_en: input.titleEn,
      code: input.code,
      description: input.description,
      description_en: input.descriptionEn,
      department: input.department,
      category: input.category,
      file_url: input.fileUrl,
      version: input.version,
      status: input.status,
      effective_date: input.effectiveDate,
      review_date: input.reviewDate,
      tags: input.tags,
      duration: Number(input.duration),
      is_mandatory: input.isMandatory,
      updated_at: new Date().toISOString(),
    }).eq('id', sopId).eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
  }

  async createSop(tenantId: string, input: AdminSopInput): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase.from('sops').insert({
      tenant_id: tenantId,
      title: input.title,
      title_en: input.titleEn,
      code: input.code,
      description: input.description,
      description_en: input.descriptionEn,
      department: input.department,
      category: input.category,
      file_url: input.fileUrl,
      version: input.version,
      status: input.status,
      effective_date: input.effectiveDate,
      review_date: input.reviewDate,
      tags: input.tags,
      duration: Number(input.duration),
      is_mandatory: input.isMandatory,
      created_by: input.createdBy,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async loadReport(tenantId?: string): Promise<{
    employees: SopReportEmployee[];
    sops: SopReportCatalogItem[];
    readings: SopReportReading[];
  }> {
    let employeeQuery = supabase.from('employees')
      .select('id,full_name,manufacturing_dept,department')
      .eq('status', 'active');
    let sopQuery = supabase.from('sops')
      .select('id,department,status,is_mandatory,duration')
      .eq('status', 'active');
    if (tenantId) {
      employeeQuery = employeeQuery.eq('tenant_id', tenantId);
      sopQuery = sopQuery.eq('tenant_id', tenantId);
    }

    const [employeeResult, sopResult] = await Promise.all([employeeQuery, sopQuery]);
    if (employeeResult.error) throw new Error(employeeResult.error.message);
    if (sopResult.error) throw new Error(sopResult.error.message);
    const employees = (employeeResult.data ?? []) as SopReportEmployee[];
    if (employees.length === 0) return { employees: [], sops: [], readings: [] };

    let readingQuery = supabase.from('sop_readings')
      .select('sop_id,employee_id,completed,approved,time_spent,last_read_at')
      .in('employee_id', employees.map((employee) => employee.id));
    if (tenantId) readingQuery = readingQuery.eq('tenant_id', tenantId);
    const readingResult = await readingQuery;
    if (readingResult.error) throw new Error(readingResult.error.message);

    return {
      employees,
      sops: (sopResult.data ?? []) as SopReportCatalogItem[],
      readings: (readingResult.data ?? []) as SopReportReading[],
    };
  }
}

export const sopAdminService = new SopAdminService();
