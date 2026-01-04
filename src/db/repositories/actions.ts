/**
 * Actions Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface ActionRow {
  id: string;
  run_id: string;
  task_id: string;
  agent_id: string;
  type: string;
  status: string;
  params: string | null;
  result: string | null;
  dry_run: number;
  approved_by: string | null;
  approved_at: number | null;
  executed_at: number | null;
  created_at: number;
}

export interface CreateActionInput {
  id?: string;
  runId: string;
  taskId: string;
  agentId: string;
  type: string;
  params?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface UpdateActionInput {
  status?: string;
  result?: Record<string, unknown>;
  approvedBy?: string;
  approvedAt?: number;
  executedAt?: number;
}

export class ActionsRepository extends BaseRepository<ActionRow> {
  constructor(db: Database.Database) {
    super(db, 'actions');
  }

  create(input: CreateActionInput): ActionRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO actions (
        id, run_id, task_id, agent_id, type, status, params, dry_run, created_at
      )
      VALUES (?, ?, ?, ?, ?, 'proposed', ?, ?, ?)
    `);

    stmt.run(
      id,
      input.runId,
      input.taskId,
      input.agentId,
      input.type,
      input.params ? JSON.stringify(input.params) : null,
      input.dryRun !== false ? 1 : 0,
      now
    );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateActionInput): boolean {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.result !== undefined) {
      updates.push('result = ?');
      params.push(JSON.stringify(input.result));
    }
    if (input.approvedBy !== undefined) {
      updates.push('approved_by = ?');
      params.push(input.approvedBy);
    }
    if (input.approvedAt !== undefined) {
      updates.push('approved_at = ?');
      params.push(input.approvedAt);
    }
    if (input.executedAt !== undefined) {
      updates.push('executed_at = ?');
      params.push(input.executedAt);
    }

    if (updates.length === 0) return false;

    params.push(id);
    const stmt = this.db.prepare(
      `UPDATE actions SET ${updates.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  findByRun(runId: string): ActionRow[] {
    return this.db
      .prepare('SELECT * FROM actions WHERE run_id = ? ORDER BY created_at DESC')
      .all(runId) as ActionRow[];
  }

  findByStatus(status: string): ActionRow[] {
    return this.db
      .prepare('SELECT * FROM actions WHERE status = ? ORDER BY created_at DESC')
      .all(status) as ActionRow[];
  }

  findPendingApproval(): ActionRow[] {
    return this.db
      .prepare("SELECT * FROM actions WHERE status = 'proposed' AND dry_run = 0 ORDER BY created_at ASC")
      .all() as ActionRow[];
  }

  findByTask(taskId: string): ActionRow[] {
    return this.db
      .prepare('SELECT * FROM actions WHERE task_id = ?')
      .all(taskId) as ActionRow[];
  }

  countByStatus(runId?: string): Record<string, number> {
    let sql = 'SELECT status, COUNT(*) as count FROM actions';
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


