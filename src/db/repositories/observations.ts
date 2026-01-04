/**
 * Observations Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface ObservationRow {
  id: string;
  run_id: string;
  type: string;
  source: string;
  data: string | null;
  block_number: number | null;
  transaction_hash: string | null;
  timestamp: number;
  created_at: number;
}

export interface CreateObservationInput {
  id?: string;
  runId: string;
  type: string;
  source: string;
  data?: Record<string, unknown>;
  blockNumber?: number;
  transactionHash?: string;
  timestamp?: number;
}

export class ObservationsRepository extends BaseRepository<ObservationRow> {
  constructor(db: Database.Database) {
    super(db, 'observations');
  }

  create(input: CreateObservationInput): ObservationRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO observations (
        id, run_id, type, source, data, block_number, transaction_hash, timestamp, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.runId,
      input.type,
      input.source,
      input.data ? JSON.stringify(input.data) : null,
      input.blockNumber || null,
      input.transactionHash || null,
      input.timestamp || now,
      now
    );

    return this.getById(id)!;
  }

  findByRun(runId: string): ObservationRow[] {
    return this.db
      .prepare('SELECT * FROM observations WHERE run_id = ? ORDER BY timestamp ASC')
      .all(runId) as ObservationRow[];
  }

  findByType(type: string, limit?: number): ObservationRow[] {
    let sql = 'SELECT * FROM observations WHERE type = ? ORDER BY timestamp DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(type) as ObservationRow[];
  }

  findByBlockRange(startBlock: number, endBlock: number): ObservationRow[] {
    return this.db
      .prepare(
        'SELECT * FROM observations WHERE block_number >= ? AND block_number <= ? ORDER BY block_number ASC'
      )
      .all(startBlock, endBlock) as ObservationRow[];
  }

  findByTimeRange(startTime: number, endTime: number): ObservationRow[] {
    return this.db
      .prepare(
        'SELECT * FROM observations WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
      )
      .all(startTime, endTime) as ObservationRow[];
  }

  getLatestBlock(): number | null {
    const result = this.db
      .prepare('SELECT MAX(block_number) as max_block FROM observations')
      .get() as { max_block: number | null };
    return result.max_block;
  }

  countByType(runId?: string): Record<string, number> {
    let sql = 'SELECT type, COUNT(*) as count FROM observations';
    const params: unknown[] = [];
    
    if (runId) {
      sql += ' WHERE run_id = ?';
      params.push(runId);
    }
    sql += ' GROUP BY type';

    const rows = this.db.prepare(sql).all(...params) as { type: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.type] = row.count;
    }
    return result;
  }
}


