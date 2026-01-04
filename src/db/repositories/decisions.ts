/**
 * Decisions Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface DecisionRow {
  id: string;
  run_id: string;
  agent_id: string;
  type: string;
  input: string | null;
  output: string | null;
  rationale: string | null;
  confidence: number;
  created_at: number;
}

export interface CreateDecisionInput {
  id?: string;
  runId: string;
  agentId: string;
  type: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  rationale?: string;
  confidence: number;
}

export class DecisionsRepository extends BaseRepository<DecisionRow> {
  constructor(db: Database.Database) {
    super(db, 'decisions');
  }

  create(input: CreateDecisionInput): DecisionRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO decisions (id, run_id, agent_id, type, input, output, rationale, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.runId,
      input.agentId,
      input.type,
      input.input ? JSON.stringify(input.input) : null,
      input.output ? JSON.stringify(input.output) : null,
      input.rationale || null,
      input.confidence,
      now
    );

    return this.getById(id)!;
  }

  findByRun(runId: string): DecisionRow[] {
    return this.db
      .prepare('SELECT * FROM decisions WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as DecisionRow[];
  }

  findByAgent(agentId: string, limit?: number): DecisionRow[] {
    let sql = 'SELECT * FROM decisions WHERE agent_id = ? ORDER BY created_at DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(agentId) as DecisionRow[];
  }

  findByType(type: string, limit?: number): DecisionRow[] {
    let sql = 'SELECT * FROM decisions WHERE type = ? ORDER BY created_at DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(type) as DecisionRow[];
  }

  getAverageConfidence(agentId?: string): number {
    let sql = 'SELECT AVG(confidence) as avg_confidence FROM decisions';
    const params: unknown[] = [];
    
    if (agentId) {
      sql += ' WHERE agent_id = ?';
      params.push(agentId);
    }

    const result = this.db.prepare(sql).get(...params) as { avg_confidence: number | null };
    return result.avg_confidence || 0;
  }
}


