/**
 * Approvals Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface ApprovalRow {
  id: string;
  action_id: string;
  agent_id: string | null;
  user_id: string | null;
  decision: string;
  reason: string | null;
  created_at: number;
}

export interface CreateApprovalInput {
  id?: string;
  actionId: string;
  agentId?: string;
  userId?: string;
  decision: 'approved' | 'rejected' | 'vetoed';
  reason?: string;
}

export class ApprovalsRepository extends BaseRepository<ApprovalRow> {
  constructor(db: Database.Database) {
    super(db, 'approvals');
  }

  create(input: CreateApprovalInput): ApprovalRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO approvals (id, action_id, agent_id, user_id, decision, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.actionId,
      input.agentId || null,
      input.userId || null,
      input.decision,
      input.reason || null,
      now
    );

    return this.getById(id)!;
  }

  findByAction(actionId: string): ApprovalRow[] {
    return this.db
      .prepare('SELECT * FROM approvals WHERE action_id = ? ORDER BY created_at DESC')
      .all(actionId) as ApprovalRow[];
  }

  findByDecision(decision: string): ApprovalRow[] {
    return this.db
      .prepare('SELECT * FROM approvals WHERE decision = ? ORDER BY created_at DESC')
      .all(decision) as ApprovalRow[];
  }

  getLatestForAction(actionId: string): ApprovalRow | undefined {
    return this.db
      .prepare('SELECT * FROM approvals WHERE action_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(actionId) as ApprovalRow | undefined;
  }
}


