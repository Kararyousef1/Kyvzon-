import fs from 'node:fs';
import path from 'node:path';

export class OfflineQueue {
  constructor(filePath = path.resolve(process.cwd(), 'data/offline-queue.json')) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]');
  }

  read() {
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
    catch { return []; }
  }

  write(items) {
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }

  enqueue(records) {
    if (!records?.length) return;
    const current = this.read();
    this.write([...current, ...records]);
  }

  take(limit) {
    const current = this.read();
    return current.slice(0, limit);
  }

  remove(count) {
    const current = this.read();
    this.write(current.slice(count));
  }

  size() {
    return this.read().length;
  }
}
