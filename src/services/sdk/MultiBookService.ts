import { BaseService } from './BaseService';
class MultiBookService extends BaseService<any> {
  constructor() { super('journal_books'); }
  async findActive() { return this.findAll({ filters: { is_active: true }, orderBy: 'book_name' }); }
  async createBook(data: Partial<any>) { return this.create(data); }
}
export const multiBookService = new MultiBookService();
