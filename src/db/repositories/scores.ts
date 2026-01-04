/**
 * Scores Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface ScoreRow {
  id: string;
  agent_id: string;
  metric: string;
  value: number;
  context: string | null;
  created_at: number;
}

export interface CreateScoreInput {
  id?: string;
  agentId: string;
  metric: string;
  value: number;
  context?: Record<string, unknown>;
}

export class ScoresRepository extends BaseRepository<ScoreRow> {
  constructor(db: Database.Database) {
    super(db, 'scores');
  }

  create(input: CreateScoreInput): ScoreRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO scores (id, agent_id, metric, value, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.agentId,
      input.metric,
      input.value,
      input.context ? JSON.stringify(input.context) : null,
      now
    );

    return this.getById(id)!;
  }

  findByAgent(agentId: string, limit?: number): ScoreRow[] {
    let sql = 'SELECT * FROM scores WHERE agent_id = ? ORDER BY created_at DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(agentId) as ScoreRow[];
  }

  findByMetric(metric: string, limit?: number): ScoreRow[] {
    let sql = 'SELECT * FROM scores WHERE metric = ? ORDER BY created_at DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(metric) as ScoreRow[];
  }

  getAgentAverage(agentId: string, metric?: string): number {
    let sql = 'SELECT AVG(value) as avg_value FROM scores WHERE agent_id = ?';
    const params: unknown[] = [agentId];
    
    if (metric) {
      sql += ' AND metric = ?';
      params.push(metric);
    }

    const result = this.db.prepare(sql).get(...params) as { avg_value: number | null };
    return result.avg_value || 0;
  }

  getLatestByMetric(agentId: string, metric: string): ScoreRow | undefined {
    return this.db
      .prepare('SELECT * FROM scores WHERE agent_id = ? AND metric = ? ORDER BY created_at DESC LIMIT 1')
      .get(agentId, metric) as ScoreRow | undefined;
  }

  getTimeSeries(agentId: string, metric: string, startTime: number, endTime: number): ScoreRow[] {
    return this.db
      .prepare(
        'SELECT * FROM scores WHERE agent_id = ? AND metric = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC'
      )
      .all(agentId, metric, startTime, endTime) as ScoreRow[];
  }

  pruneOld(beforeTimestamp: number): number {
    const result = this.db
      .prepare('DELETE FROM scores WHERE created_at < ?')
      .run(beforeTimestamp);
    return result.changes;
  }
}


