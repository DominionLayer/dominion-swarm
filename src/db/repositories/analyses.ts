/**
 * Analyses Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface AnalysisRow {
  id: string;
  run_id: string;
  observation_id: string;
  agent_id: string;
  category: string;
  score: number;
  confidence: number;
  rationale: string | null;
  metadata: string | null;
  created_at: number;
}

export interface CreateAnalysisInput {
  id?: string;
  runId: string;
  observationId: string;
  agentId: string;
  category: string;
  score: number;
  confidence: number;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export class AnalysesRepository extends BaseRepository<AnalysisRow> {
  constructor(db: Database.Database) {
    super(db, 'analyses');
  }

  create(input: CreateAnalysisInput): AnalysisRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO analyses (
        id, run_id, observation_id, agent_id, category, score, confidence, rationale, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.runId,
      input.observationId,
      input.agentId,
      input.category,
      input.score,
      input.confidence,
      input.rationale || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now
    );

    return this.getById(id)!;
  }

  findByRun(runId: string): AnalysisRow[] {
    return this.db
      .prepare('SELECT * FROM analyses WHERE run_id = ? ORDER BY score DESC')
      .all(runId) as AnalysisRow[];
  }

  findByObservation(observationId: string): AnalysisRow[] {
    return this.db
      .prepare('SELECT * FROM analyses WHERE observation_id = ?')
      .all(observationId) as AnalysisRow[];
  }

  findByCategory(category: string, limit?: number): AnalysisRow[] {
    let sql = 'SELECT * FROM analyses WHERE category = ? ORDER BY score DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(category) as AnalysisRow[];
  }

  findHighScore(threshold: number, runId?: string): AnalysisRow[] {
    let sql = 'SELECT * FROM analyses WHERE score >= ?';
    const params: unknown[] = [threshold];
    
    if (runId) {
      sql += ' AND run_id = ?';
      params.push(runId);
    }
    sql += ' ORDER BY score DESC';

    return this.db.prepare(sql).all(...params) as AnalysisRow[];
  }

  getAverageScore(runId?: string): number {
    let sql = 'SELECT AVG(score) as avg_score FROM analyses';
    const params: unknown[] = [];
    
    if (runId) {
      sql += ' WHERE run_id = ?';
      params.push(runId);
    }

    const result = this.db.prepare(sql).get(...params) as { avg_score: number | null };
    return result.avg_score || 0;
  }

  getScoreDistribution(runId?: string): Record<string, number> {
    let sql = `
      SELECT 
        CASE 
          WHEN score >= 90 THEN 'critical'
          WHEN score >= 70 THEN 'high'
          WHEN score >= 50 THEN 'medium'
          WHEN score >= 30 THEN 'low'
          ELSE 'minimal'
        END as tier,
        COUNT(*) as count
      FROM analyses
    `;
    const params: unknown[] = [];
    
    if (runId) {
      sql += ' WHERE run_id = ?';
      params.push(runId);
    }
    sql += ' GROUP BY tier';

    const rows = this.db.prepare(sql).all(...params) as { tier: string; count: number }[];
    const result: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      minimal: 0,
    };
    for (const row of rows) {
      result[row.tier] = row.count;
    }
    return result;
  }
}


