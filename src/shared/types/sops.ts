// ── أنواع بيانات SOPs (Standard Operating Procedures) ──
import type { RichContent } from './media';

export type SOPStatus = 'active' | 'inactive' | 'draft';
export type SOPApprovalStatus = 'pending' | 'approved' | 'rejected';
export type SOPViewMode = 'catalog' | 'reading' | 'approval';

export interface MediaFile {
  id: string;
  type: 'image' | 'video' | 'document' | 'audio';
  url: string;
  title: string;
  description?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface SOPSection {
  id: string;
  title: string;
  order: number;
  content: string | RichContent;
  duration?: string;            // مدة القراءة المتوقعة للقسم
  isRequired?: boolean;          // هل القسم إلزامي
  mediaFiles?: MediaFile[];
}

export interface SOP {
  id: string;
  title: string;
  titleEn?: string;
  code: string; // كود الـ SOP مثل SOP-001
  description: string;
  descriptionEn?: string;
  department: string; // القسم التصنيعي
  category: string;
  pdfUrl: string; // رابط ملف PDF
  version: string; // رقم الإصدار
  status: SOPStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  effectiveDate: string; // تاريخ التفعيل
  reviewDate: string; // تاريخ المراجعة القادم
  tags: string[];
  duration: string; // مدة القراءة المتوقعة
  isMandatory: boolean;
  content?: string | RichContent; // محتوى النص الكامل أو محتوى غني
  coverImage?: { url: string; alt?: string } | string; // صورة الغلاف
  sections?: SOPSection[];
}

export interface SOPReading {
  id: string;
  sopId: string;
  employeeId: string;
  startedAt: string;
  lastReadAt: string;
  readCount: number;
  timeSpent: number; // بالثواني
  completed: boolean;
  approved: boolean;
  approvedAt?: string;
  approvalStatus: SOPApprovalStatus;
}

export interface SOPDepartment {
  id: string;
  nameAr: string;
  nameEn: string;
  key: string;
}

export const SOP_DEPARTMENTS: SOPDepartment[] = [
  { id: 'd1', nameAr: 'التقنية', nameEn: 'Technology', key: 'tech' },
  { id: 'd2', nameAr: 'المبيعات', nameEn: 'Sales', key: 'sales' },
  { id: 'd3', nameAr: 'التسويق', nameEn: 'Marketing', key: 'marketing' },
  { id: 'd4', nameAr: 'الدعم الفني', nameEn: 'Support', key: 'support' },
  { id: 'd5', nameAr: 'الإدارة', nameEn: 'Management', key: 'management' },
  { id: 'd6', nameAr: 'الموارد البشرية', nameEn: 'HR', key: 'hr' },
  { id: 'd7', nameAr: 'تقنية المعلومات', nameEn: 'IT', key: 'it' },
  { id: 'd8', nameAr: 'المالية', nameEn: 'Finance', key: 'finance' },
  { id: 'd9', nameAr: 'عام', nameEn: 'General', key: 'general' },
];

export const SOP_CATEGORIES = [
  { id: 'c1', nameAr: 'التصنيع', nameEn: 'Manufacturing' },
  { id: 'c2', nameAr: 'التنظيف والتعقيم', nameEn: 'Cleaning & Sanitization' },
  { id: 'c3', nameAr: 'ضبط الجودة', nameEn: 'Quality Control' },
  { id: 'c4', nameAr: 'التوثيق', nameEn: 'Documentation' },
  { id: 'c5', nameAr: 'السلامة', nameEn: 'Safety' },
  { id: 'c6', nameAr: 'المعدات', nameEn: 'Equipment' },
  { id: 'c7', nameAr: 'المختبرات', nameEn: 'Laboratory' },
  { id: 'c8', nameAr: 'التعبئة والتغليف', nameEn: 'Packaging' },
  { id: 'c9', nameAr: 'التخزين', nameEn: 'Storage' },
  { id: 'c10', nameAr: 'النقل', nameEn: 'Transportation' },
  { id: 'c11', nameAr: 'عام', nameEn: 'General' },
];