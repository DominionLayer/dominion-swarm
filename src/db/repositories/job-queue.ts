/**
 * Job Queue Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface JobQueueRow {
  id: string;
  type: string;
  payload: string | null;
  priority: number;
  status: string;
  run_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  attempts: number;
  max_attempts: number;
  error: string | null;
  result: string | null;
  created_at: number;
}

export interface ScheduledJobRow {
  id: string;
  name: string;
  cron_expression: string;
  job_type: string;
  payload: string | null;
  enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateJobInput {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
  priority?: number;
  runAt?: number;
  maxAttempts?: number;
}

export interface CreateScheduledJobInput {
  id?: string;
  name: string;
  cronExpression: string;
  jobType: string;
  payload?: Record<string, unknown>;
  enabled?: boolean;
}

export class JobQueueRepository extends BaseRepository<JobQueueRow> {
  constructor(db: Database.Database) {
    super(db, 'job_queue');
  }

  // ─────────────────────────────────────────────────────────────
  // Queue Jobs
  // ─────────────────────────────────────────────────────────────

  enqueue(input: CreateJobInput): JobQueueRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO job_queue (
        id, type, payload, priority, status, run_at, max_attempts, created_at
      )
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `);

    stmt.run(
      id,
      input.type,
      input.payload ? JSON.stringify(input.payload) : null,
      input.priority ?? 0,
      input.runAt || null,
      input.maxAttempts ?? 3,
      now
    );

    return this.getById(id)!;
  }

  dequeue(types?: string[]): JobQueueRow | undefined {
    const now = this.now();
    let sql = `
      SELECT * FROM job_queue 
      WHERE status = 'pending' 
        AND (run_at IS NULL OR run_at <= ?)
        AND attempts < max_attempts
    `;
    const params: unknown[] = [now];

    if (types && types.length > 0) {
      sql += ` AND type IN (${types.map(() => '?').join(', ')})`;
      params.push(...types);
    }

    sql += ' ORDER BY priority DESC, created_at ASC LIMIT 1';

    const job = this.db.prepare(sql).get(...params) as JobQueueRow | undefined;

    if (job) {
      this.db
        .prepare("UPDATE job_queue SET status = 'processing', started_at = ?, attempts = attempts + 1 WHERE id = ?")
        .run(now, job.id);
    }

    return job ? this.getById(job.id) : undefined;
  }

  complete(id: string, result?: Record<string, unknown>): boolean {
    const now = this.now();
    const res = this.db
      .prepare("UPDATE job_queue SET status = 'completed', completed_at = ?, result = ? WHERE id = ?")
      .run(now, result ? JSON.stringify(result) : null, id);
    return res.changes > 0;
  }

  fail(id: string, error: string): boolean {
    const job = this.getById(id);
    if (!job) return false;

    const status = job.attempts >= job.max_attempts ? 'failed' : 'pending';
    const res = this.db
      .prepare('UPDATE job_queue SET status = ?, error = ?, completed_at = ? WHERE id = ?')
      .run(status, error, status === 'failed' ? this.now() : null, id);
    return res.changes > 0;
  }

  retry(id: string, runAt?: number): boolean {
    const res = this.db
      .prepare("UPDATE job_queue SET status = 'pending', run_at = ?, error = NULL WHERE id = ?")
      .run(runAt || null, id);
    return res.changes > 0;
  }

  findByStatus(status: string): JobQueueRow[] {
    return this.db
      .prepare('SELECT * FROM job_queue WHERE status = ? ORDER BY priority DESC, created_at ASC')
      .all(status) as JobQueueRow[];
  }

  findByType(type: string): JobQueueRow[] {
    return this.db
      .prepare('SELECT * FROM job_queue WHERE type = ? ORDER BY created_at DESC')
      .all(type) as JobQueueRow[];
  }

  getPendingCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM job_queue WHERE status = 'pending'")
      .get() as { count: number };
    return result.count;
  }

  getProcessingCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM job_queue WHERE status = 'processing'")
      .get() as { count: number };
    return result.count;
  }

  pruneCompleted(beforeTimestamp: number): number {
    const result = this.db
      .prepare("DELETE FROM job_queue WHERE status IN ('completed', 'failed') AND completed_at < ?")
      .run(beforeTimestamp);
    return result.changes;
  }

  // ─────────────────────────────────────────────────────────────
  // Scheduled Jobs
  // ─────────────────────────────────────────────────────────────

  createScheduledJob(input: CreateScheduledJobInput): ScheduledJobRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO scheduled_jobs (
        id, name, cron_expression, job_type, payload, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.cronExpression,
      input.jobType,
      input.payload ? JSON.stringify(input.payload) : null,
      input.enabled !== false ? 1 : 0,
      now,
      now
    );

    return this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id) as ScheduledJobRow;
  }

  updateScheduledJob(
    id: string,
    updates: Partial<{
      cronExpression: string;
      payload: Record<string, unknown>;
      enabled: boolean;
      lastRunAt: number;
      nextRunAt: number;
    }>
  ): boolean {
    const setters: string[] = ['updated_at = ?'];
    const params: unknown[] = [this.now()];

    if (updates.cronExpression !== undefined) {
      setters.push('cron_expression = ?');
      params.push(updates.cronExpression);
    }
    if (updates.payload !== undefined) {
      setters.push('payload = ?');
      params.push(JSON.stringify(updates.payload));
    }
    if (updates.enabled !== undefined) {
      setters.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    if (updates.lastRunAt !== undefined) {
      setters.push('last_run_at = ?');
      params.push(updates.lastRunAt);
    }
    if (updates.nextRunAt !== undefined) {
      setters.push('next_run_at = ?');
      params.push(updates.nextRunAt);
    }

    params.push(id);
    const result = this.db
      .prepare(`UPDATE scheduled_jobs SET ${setters.join(', ')} WHERE id = ?`)
      .run(...params);
    return result.changes > 0;
  }

  getScheduledJobByName(name: string): ScheduledJobRow | undefined {
    return this.db
      .prepare('SELECT * FROM scheduled_jobs WHERE name = ?')
      .get(name) as ScheduledJobRow | undefined;
  }

  getEnabledScheduledJobs(): ScheduledJobRow[] {
    return this.db
      .prepare('SELECT * FROM scheduled_jobs WHERE enabled = 1')
      .all() as ScheduledJobRow[];
  }

  getDueScheduledJobs(): ScheduledJobRow[] {
    const now = this.now();
    return this.db
      .prepare('SELECT * FROM scheduled_jobs WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)')
      .all(now) as ScheduledJobRow[];
  }

  deleteScheduledJob(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM scheduled_jobs WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}


