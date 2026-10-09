export interface QueueItem<T> { id: string; payload: T; attempts: number; nextAttemptAt: number; lastError?: string }
import { randomUUID } from 'node:crypto';

export class BoundedQueue<T> {
  private items: QueueItem<T>[] = [];
  constructor(private readonly maxSize = 100) {}
  enqueue(item: T, id = randomUUID()): QueueItem<T> { if (this.items.length >= this.maxSize) throw new Error('Queue is full'); const entry = { id, payload: item, attempts: 0, nextAttemptAt: Date.now() }; this.items.push(entry); return { ...entry }; }
  peek(now = Date.now()): QueueItem<T> | undefined { return this.items.find(x => x.nextAttemptAt <= now); }
  markRetry(id: string, error: unknown, baseMs = 1000) { const x = this.items.find(i => i.id === id); if (!x) return; x.attempts += 1; x.lastError = error instanceof Error ? error.message : 'retry failed'; x.nextAttemptAt = Date.now() + Math.min(baseMs * 2 ** (x.attempts - 1), 15 * 60_000); }
  remove(id: string) { this.items = this.items.filter(x => x.id !== id); }
  get size() { return this.items.length; }
}
