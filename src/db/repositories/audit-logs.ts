/**
 * Audit Logs Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface AuditLogRow {
  id: string;
  run_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  level: string;
  event: string;
  message: string;
  data: string | null;
  timestamp: number;
}

export interface CreateAuditLogInput {
  id?: string;
  runId?: string;
  agentId?: string;
  taskId?: string;
  level: string;
  event: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface AuditLogQuery {
  runId?: string;
  agentId?: string;
  taskId?: string;
  level?: string;
  event?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export class AuditLogsRepository extends BaseRepository<AuditLogRow> {
  constructor(db: Database.Database) {
    super(db, 'audit_logs');
  }

  create(input: CreateAuditLogInput): AuditLogRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, run_id, agent_id, task_id, level, event, message, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.runId || null,
      input.agentId || null,
      input.taskId || null,
      input.level,
      input.event,
      input.message,
      input.data ? JSON.stringify(input.data) : null,
      now
    );

    return this.getById(id)!;
  }

  query(query: AuditLogQuery): AuditLogRow[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.runId) {
      conditions.push('run_id = ?');
      params.push(query.runId);
    }
    if (query.agentId) {
      conditions.push('agent_id = ?');
      params.push(query.agentId);
    }
    if (query.taskId) {
      conditions.push('task_id = ?');
      params.push(query.taskId);
    }
    if (query.level) {
      conditions.push('level = ?');
      params.push(query.level);
    }
    if (query.event) {
      conditions.push('event = ?');
      params.push(query.event);
    }
    if (query.startTime) {
      conditions.push('timestamp >= ?');
      params.push(query.startTime);
    }
    if (query.endTime) {
      conditions.push('timestamp <= ?');
      params.push(query.endTime);
    }

    let sql = 'SELECT * FROM audit_logs';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY timestamp DESC';
    if (query.limit) {
      sql += ` LIMIT ${query.limit}`;
    }

    return this.db.prepare(sql).all(...params) as AuditLogRow[];
  }

  findByRun(runId: string): AuditLogRow[] {
    return this.query({ runId });
  }

  findByLevel(level: string, limit?: number): AuditLogRow[] {
    return this.query({ level, limit });
  }

  getRecent(limit: number = 100): AuditLogRow[] {
    return this.query({ limit });
  }

  countByLevel(startTime?: number): Record<string, number> {
    let sql = 'SELECT level, COUNT(*) as count FROM audit_logs';
    const params: unknown[] = [];
    
    if (startTime) {
      sql += ' WHERE timestamp >= ?';
      params.push(startTime);
    }
    sql += ' GROUP BY level';

    const rows = this.db.prepare(sql).all(...params) as { level: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.level] = row.count;
    }
    return result;
  }

  prune(beforeTimestamp: number): number {
    const result = this.db
      .prepare('DELETE FROM audit_logs WHERE timestamp < ?')
      .run(beforeTimestamp);
    return result.changes;
  }
}


