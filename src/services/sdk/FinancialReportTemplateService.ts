import { BaseService } from './BaseService';
class FinancialReportTemplateService extends BaseService<any> {
  constructor() { super('financial_report_templates'); }
  async findByType(type: string) { return this.findAll({ filters: { report_type: type, is_active: true }, orderBy: 'template_name' }); }
}
export const financialReportTemplateService = new FinancialReportTemplateService();
