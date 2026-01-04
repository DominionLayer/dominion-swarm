/**
 * Memories Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface MemoryRow {
  id: string;
  agent_id: string;
  type: string;
  key: string;
  value: string | null;
  importance: number;
  expires_at: number | null;
  created_at: number;
  accessed_at: number;
}

export interface CreateMemoryInput {
  id?: string;
  agentId: string;
  type: string;
  key: string;
  value?: unknown;
  importance?: number;
  expiresAt?: number;
}

export interface UpdateMemoryInput {
  value?: unknown;
  importance?: number;
  expiresAt?: number;
  accessedAt?: number;
}

export class MemoriesRepository extends BaseRepository<MemoryRow> {
  constructor(db: Database.Database) {
    super(db, 'memories');
  }

  create(input: CreateMemoryInput): MemoryRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, agent_id, type, key, value, importance, expires_at, created_at, accessed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.agentId,
      input.type,
      input.key,
      input.value !== undefined ? JSON.stringify(input.value) : null,
      input.importance ?? 0.5,
      input.expiresAt || null,
      now,
      now
    );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateMemoryInput): boolean {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.value !== undefined) {
      updates.push('value = ?');
      params.push(JSON.stringify(input.value));
    }
    if (input.importance !== undefined) {
      updates.push('importance = ?');
      params.push(input.importance);
    }
    if (input.expiresAt !== undefined) {
      updates.push('expires_at = ?');
      params.push(input.expiresAt);
    }
    if (input.accessedAt !== undefined) {
      updates.push('accessed_at = ?');
      params.push(input.accessedAt);
    }

    if (updates.length === 0) return false;

    params.push(id);
    const stmt = this.db.prepare(
      `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  findByAgent(agentId: string): MemoryRow[] {
    return this.db
      .prepare('SELECT * FROM memories WHERE agent_id = ? ORDER BY importance DESC')
      .all(agentId) as MemoryRow[];
  }

  findByKey(agentId: string, key: string): MemoryRow | undefined {
    return this.db
      .prepare('SELECT * FROM memories WHERE agent_id = ? AND key = ?')
      .get(agentId, key) as MemoryRow | undefined;
  }

  findByType(agentId: string, type: string): MemoryRow[] {
    return this.db
      .prepare('SELECT * FROM memories WHERE agent_id = ? AND type = ? ORDER BY importance DESC')
      .all(agentId, type) as MemoryRow[];
  }

  upsert(input: CreateMemoryInput): MemoryRow {
    const existing = this.findByKey(input.agentId, input.key);
    
    if (existing) {
      this.update(existing.id, {
        value: input.value,
        importance: input.importance,
        expiresAt: input.expiresAt,
        accessedAt: this.now(),
      });
      return this.getById(existing.id)!;
    }

    return this.create(input);
  }

  touch(agentId: string, key: string): boolean {
    const result = this.db
      .prepare('UPDATE memories SET accessed_at = ? WHERE agent_id = ? AND key = ?')
      .run(this.now(), agentId, key);
    return result.changes > 0;
  }

  deleteExpired(): number {
    const result = this.db
      .prepare('DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?')
      .run(this.now());
    return result.changes;
  }

  deleteByAgent(agentId: string): number {
    const result = this.db
      .prepare('DELETE FROM memories WHERE agent_id = ?')
      .run(agentId);
    return result.changes;
  }
}


