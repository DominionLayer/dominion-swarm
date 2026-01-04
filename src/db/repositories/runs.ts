/**
 * Runs Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface RunRow {
  id: string;
  workflow_id: string;
  status: string;
  config: string | null;
  summary: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

export interface CreateRunInput {
  id?: string;
  workflowId: string;
  config?: Record<string, unknown>;
}

export interface UpdateRunInput {
  status?: string;
  summary?: Record<string, unknown>;
  startedAt?: number;
  completedAt?: number;
}

export class RunsRepository extends BaseRepository<RunRow> {
  constructor(db: Database.Database) {
    super(db, 'runs');
  }

  create(input: CreateRunInput): RunRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO runs (id, workflow_id, status, config, created_at)
      VALUES (?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      id,
      input.workflowId,
      input.config ? JSON.stringify(input.config) : null,
      now
    );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateRunInput): boolean {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.summary !== undefined) {
      updates.push('summary = ?');
      params.push(JSON.stringify(input.summary));
    }
    if (input.startedAt !== undefined) {
      updates.push('started_at = ?');
      params.push(input.startedAt);
    }
    if (input.completedAt !== undefined) {
      updates.push('completed_at = ?');
      params.push(input.completedAt);
    }

    if (updates.length === 0) return false;

    params.push(id);
    const stmt = this.db.prepare(
      `UPDATE runs SET ${updates.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  findByStatus(status: string): RunRow[] {
    return this.db
      .prepare('SELECT * FROM runs WHERE status = ? ORDER BY created_at DESC')
      .all(status) as RunRow[];
  }

  findByWorkflow(workflowId: string, limit?: number): RunRow[] {
    let sql = 'SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(workflowId) as RunRow[];
  }

  getRecent(limit: number = 10): RunRow[] {
    return this.db
      .prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as RunRow[];
  }

  getRunningCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM runs WHERE status = 'running'")
      .get() as { count: number };
    return result.count;
  }
}


