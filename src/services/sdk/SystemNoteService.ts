import { BaseService } from './BaseService';
export class SystemNoteService extends BaseService<any> {
  constructor() { super('system_notes'); }
  async createNote(data: Partial<any>) { return this.create(data); }
  async findByEntity(entityType: string, entityId: string) { return this.findAll({ filters: { entity_type: entityType, entity_id: entityId }, orderBy: 'timestamp', ascending: false }); }
}
export const systemNoteService = new SystemNoteService();
