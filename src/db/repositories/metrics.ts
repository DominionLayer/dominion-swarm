/**
 * Metrics Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface MetricRow {
  id: string;
  entity_type: string;
  entity_id: string;
  metric_name: string;
  metric_value: number;
  tags: string | null;
  timestamp: number;
}

export interface SuggestionRow {
  id: string;
  type: string;
  target: string;
  suggestion: string;
  rationale: string | null;
  confidence: number;
  status: string;
  approved_by: string | null;
  applied_at: number | null;
  created_at: number;
}

export interface RecordMetricInput {
  id?: string;
  entityType: string;
  entityId: string;
  metricName: string;
  metricValue: number;
  tags?: Record<string, string>;
}

export interface CreateSuggestionInput {
  id?: string;
  type: string;
  target: string;
  suggestion: string;
  rationale?: string;
  confidence: number;
}

export class MetricsRepository extends BaseRepository<MetricRow> {
  constructor(db: Database.Database) {
    super(db, 'metrics');
  }

  // ─────────────────────────────────────────────────────────────
  // Metrics
  // ─────────────────────────────────────────────────────────────

  record(input: RecordMetricInput): MetricRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO metrics (id, entity_type, entity_id, metric_name, metric_value, tags, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.entityType,
      input.entityId,
      input.metricName,
      input.metricValue,
      input.tags ? JSON.stringify(input.tags) : null,
      now
    );

    return this.getById(id)!;
  }

  findByEntity(entityType: string, entityId: string, limit?: number): MetricRow[] {
    let sql = 'SELECT * FROM metrics WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(entityType, entityId) as MetricRow[];
  }

  findByMetricName(metricName: string, limit?: number): MetricRow[] {
    let sql = 'SELECT * FROM metrics WHERE metric_name = ? ORDER BY timestamp DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(metricName) as MetricRow[];
  }

  getTimeSeries(
    entityType: string,
    entityId: string,
    metricName: string,
    startTime: number,
    endTime: number
  ): MetricRow[] {
    return this.db
      .prepare(`
        SELECT * FROM metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ? 
          AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
      `)
      .all(entityType, entityId, metricName, startTime, endTime) as MetricRow[];
  }

  getAggregated(
    entityType: string,
    entityId: string,
    metricName: string,
    startTime: number,
    endTime: number
  ): { avg: number; min: number; max: number; count: number } {
    const result = this.db
      .prepare(`
        SELECT 
          AVG(metric_value) as avg,
          MIN(metric_value) as min,
          MAX(metric_value) as max,
          COUNT(*) as count
        FROM metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ? 
          AND timestamp >= ? AND timestamp <= ?
      `)
      .get(entityType, entityId, metricName, startTime, endTime) as {
        avg: number | null;
        min: number | null;
        max: number | null;
        count: number;
      };

    return {
      avg: result.avg || 0,
      min: result.min || 0,
      max: result.max || 0,
      count: result.count,
    };
  }

  getLatest(entityType: string, entityId: string, metricName: string): MetricRow | undefined {
    return this.db
      .prepare(`
        SELECT * FROM metrics 
        WHERE entity_type = ? AND entity_id = ? AND metric_name = ?
        ORDER BY timestamp DESC LIMIT 1
      `)
      .get(entityType, entityId, metricName) as MetricRow | undefined;
  }

  pruneOld(beforeTimestamp: number): number {
    const result = this.db
      .prepare('DELETE FROM metrics WHERE timestamp < ?')
      .run(beforeTimestamp);
    return result.changes;
  }

  // ─────────────────────────────────────────────────────────────
  // Improvement Suggestions
  // ─────────────────────────────────────────────────────────────

  createSuggestion(input: CreateSuggestionInput): SuggestionRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO improvement_suggestions (
        id, type, target, suggestion, rationale, confidence, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run(
      id,
      input.type,
      input.target,
      input.suggestion,
      input.rationale || null,
      input.confidence,
      now
    );

    return this.db
      .prepare('SELECT * FROM improvement_suggestions WHERE id = ?')
      .get(id) as SuggestionRow;
  }

  updateSuggestionStatus(
    id: string,
    status: string,
    approvedBy?: string
  ): boolean {
    const updates: string[] = ['status = ?'];
    const params: unknown[] = [status];

    if (approvedBy) {
      updates.push('approved_by = ?');
      params.push(approvedBy);
    }

    if (status === 'applied') {
      updates.push('applied_at = ?');
      params.push(this.now());
    }

    params.push(id);
    const result = this.db
      .prepare(`UPDATE improvement_suggestions SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);
    return result.changes > 0;
  }

  getSuggestionById(id: string): SuggestionRow | undefined {
    return this.db
      .prepare('SELECT * FROM improvement_suggestions WHERE id = ?')
      .get(id) as SuggestionRow | undefined;
  }

  findSuggestionsByStatus(status: string): SuggestionRow[] {
    return this.db
      .prepare('SELECT * FROM improvement_suggestions WHERE status = ? ORDER BY confidence DESC')
      .all(status) as SuggestionRow[];
  }

  findSuggestionsByTarget(target: string): SuggestionRow[] {
    return this.db
      .prepare('SELECT * FROM improvement_suggestions WHERE target = ? ORDER BY created_at DESC')
      .all(target) as SuggestionRow[];
  }

  getPendingSuggestions(): SuggestionRow[] {
    return this.findSuggestionsByStatus('pending');
  }
}


