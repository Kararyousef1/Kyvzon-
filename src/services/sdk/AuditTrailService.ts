import { BaseService } from './BaseService';
class AuditTrailService extends BaseService<any> {
  constructor() { super('audit_vault'); }
  async findByTable(tableName: string) { return this.findAll({ filters: { table_name: tableName }, orderBy: 'timestamp', ascending: false }); }
  async findByRecord(tableName: string, recordId: string) { return this.findAll({ filters: { table_name: tableName, record_id: recordId }, orderBy: 'timestamp', ascending: false }); }
}
export const auditTrailService = new AuditTrailService();
