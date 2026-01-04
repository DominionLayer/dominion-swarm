/**
 * Tasks Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface TaskRow {
  id: string;
  run_id: string;
  parent_id: string | null;
  agent_id: string | null;
  type: string;
  status: string;
  priority: string;
  input: string | null;
  output: string | null;
  error: string | null;
  retries: number;
  max_retries: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

export interface CreateTaskInput {
  id?: string;
  runId: string;
  type: string;
  parentId?: string | null;
  agentId?: string | null;
  priority?: string;
  input?: string | null;
  maxRetries?: number;
}

export interface UpdateTaskInput {
  status?: string;
  agentId?: string | null;
  output?: string | null;
  error?: string | null;
  retries?: number;
  startedAt?: number | null;
  completedAt?: number | null;
}

export class TasksRepository extends BaseRepository<TaskRow> {
  constructor(db: Database.Database) {
    super(db, 'tasks');
  }

  create(input: CreateTaskInput): TaskRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, run_id, parent_id, agent_id, type, status, priority, 
        input, max_retries, created_at
      )
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.runId,
      input.parentId || null,
      input.agentId || null,
      input.type,
      input.priority || 'normal',
      input.input || null,
      input.maxRetries ?? 3,
      now
    );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateTaskInput): boolean {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.agentId !== undefined) {
      updates.push('agent_id = ?');
      params.push(input.agentId);
    }
    if (input.output !== undefined) {
      updates.push('output = ?');
      params.push(input.output);
    }
    if (input.error !== undefined) {
      updates.push('error = ?');
      params.push(input.error);
    }
    if (input.retries !== undefined) {
      updates.push('retries = ?');
      params.push(input.retries);
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
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  findByRun(runId: string): TaskRow[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as TaskRow[];
  }

  findByStatus(status: string, limit?: number): TaskRow[] {
    let sql = 'SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at ASC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(status) as TaskRow[];
  }

  findByAgent(agentId: string): TaskRow[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at DESC')
      .all(agentId) as TaskRow[];
  }

  getChildren(parentId: string): TaskRow[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE parent_id = ?')
      .all(parentId) as TaskRow[];
  }

  countByStatus(runId?: string): Record<string, number> {
    let sql = 'SELECT status, COUNT(*) as count FROM tasks';
    const params: unknown[] = [];
    
    if (runId) {
      sql += ' WHERE run_id = ?';
      params.push(runId);
    }
    sql += ' GROUP BY status';

    const rows = this.db.prepare(sql).all(...params) as { status: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }
}


