/**
 * Market Repository - Jobs, Bids, Accounts, Transactions
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

// ─────────────────────────────────────────────────────────────
// Market Jobs
// ─────────────────────────────────────────────────────────────

export interface MarketJobRow {
  id: string;
  title: string;
  description: string | null;
  buyer_id: string;
  provider_id: string | null;
  status: string;
  budget: number;
  escrow: number;
  deadline: number | null;
  sla_terms: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface CreateJobInput {
  id?: string;
  title: string;
  description?: string;
  buyerId: string;
  budget: number;
  deadline?: number;
  slaTerms?: Record<string, unknown>;
}

export interface BidRow {
  id: string;
  job_id: string;
  provider_id: string;
  amount: number;
  proposal: string | null;
  eta: number | null;
  status: string;
  created_at: number;
}

export interface CreateBidInput {
  id?: string;
  jobId: string;
  providerId: string;
  amount: number;
  proposal?: string;
  eta?: number;
}

export interface AccountRow {
  id: string;
  entity_id: string;
  balance: number;
  escrow_held: number;
  reputation: number;
  created_at: number;
  updated_at: number;
}

export interface TransactionRow {
  id: string;
  from_account: string | null;
  to_account: string | null;
  amount: number;
  type: string;
  reference_id: string | null;
  created_at: number;
}

export class MarketRepository extends BaseRepository<MarketJobRow> {
  constructor(db: Database.Database) {
    super(db, 'market_jobs');
  }

  // ─────────────────────────────────────────────────────────────
  // Jobs
  // ─────────────────────────────────────────────────────────────

  createJob(input: CreateJobInput): MarketJobRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO market_jobs (
        id, title, description, buyer_id, status, budget, escrow, deadline, sla_terms, created_at
      )
      VALUES (?, ?, ?, ?, 'open', ?, 0, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.title,
      input.description || null,
      input.buyerId,
      input.budget,
      input.deadline || null,
      input.slaTerms ? JSON.stringify(input.slaTerms) : null,
      now
    );

    return this.getById(id)!;
  }

  updateJob(
    id: string,
    updates: Partial<{
      status: string;
      providerId: string;
      escrow: number;
      completedAt: number;
    }>
  ): boolean {
    const setters: string[] = [];
    const params: unknown[] = [];

    if (updates.status !== undefined) {
      setters.push('status = ?');
      params.push(updates.status);
    }
    if (updates.providerId !== undefined) {
      setters.push('provider_id = ?');
      params.push(updates.providerId);
    }
    if (updates.escrow !== undefined) {
      setters.push('escrow = ?');
      params.push(updates.escrow);
    }
    if (updates.completedAt !== undefined) {
      setters.push('completed_at = ?');
      params.push(updates.completedAt);
    }

    if (setters.length === 0) return false;

    params.push(id);
    const result = this.db
      .prepare(`UPDATE market_jobs SET ${setters.join(', ')} WHERE id = ?`)
      .run(...params);
    return result.changes > 0;
  }

  findJobsByStatus(status: string): MarketJobRow[] {
    return this.db
      .prepare('SELECT * FROM market_jobs WHERE status = ? ORDER BY created_at DESC')
      .all(status) as MarketJobRow[];
  }

  findJobsByBuyer(buyerId: string): MarketJobRow[] {
    return this.db
      .prepare('SELECT * FROM market_jobs WHERE buyer_id = ? ORDER BY created_at DESC')
      .all(buyerId) as MarketJobRow[];
  }

  findJobsByProvider(providerId: string): MarketJobRow[] {
    return this.db
      .prepare('SELECT * FROM market_jobs WHERE provider_id = ? ORDER BY created_at DESC')
      .all(providerId) as MarketJobRow[];
  }

  // ─────────────────────────────────────────────────────────────
  // Bids
  // ─────────────────────────────────────────────────────────────

  createBid(input: CreateBidInput): BidRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO bids (id, job_id, provider_id, amount, proposal, eta, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run(
      id,
      input.jobId,
      input.providerId,
      input.amount,
      input.proposal || null,
      input.eta || null,
      now
    );

    return this.db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as BidRow;
  }

  updateBidStatus(id: string, status: string): boolean {
    const result = this.db
      .prepare('UPDATE bids SET status = ? WHERE id = ?')
      .run(status, id);
    return result.changes > 0;
  }

  findBidsByJob(jobId: string): BidRow[] {
    return this.db
      .prepare('SELECT * FROM bids WHERE job_id = ? ORDER BY amount ASC')
      .all(jobId) as BidRow[];
  }

  findBidsByProvider(providerId: string): BidRow[] {
    return this.db
      .prepare('SELECT * FROM bids WHERE provider_id = ? ORDER BY created_at DESC')
      .all(providerId) as BidRow[];
  }

  getBidById(id: string): BidRow | undefined {
    return this.db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as BidRow | undefined;
  }

  // ─────────────────────────────────────────────────────────────
  // Accounts
  // ─────────────────────────────────────────────────────────────

  getOrCreateAccount(entityId: string, initialBalance: number = 0): AccountRow {
    const existing = this.db
      .prepare('SELECT * FROM market_accounts WHERE entity_id = ?')
      .get(entityId) as AccountRow | undefined;

    if (existing) return existing;

    const id = this.generateId();
    const now = this.now();

    this.db
      .prepare(`
        INSERT INTO market_accounts (id, entity_id, balance, escrow_held, reputation, created_at, updated_at)
        VALUES (?, ?, ?, 0, 50, ?, ?)
      `)
      .run(id, entityId, initialBalance, now, now);

    return this.db.prepare('SELECT * FROM market_accounts WHERE id = ?').get(id) as AccountRow;
  }

  getAccount(entityId: string): AccountRow | undefined {
    return this.db
      .prepare('SELECT * FROM market_accounts WHERE entity_id = ?')
      .get(entityId) as AccountRow | undefined;
  }

  updateBalance(entityId: string, delta: number): boolean {
    const result = this.db
      .prepare('UPDATE market_accounts SET balance = balance + ?, updated_at = ? WHERE entity_id = ?')
      .run(delta, this.now(), entityId);
    return result.changes > 0;
  }

  updateEscrow(entityId: string, delta: number): boolean {
    const result = this.db
      .prepare('UPDATE market_accounts SET escrow_held = escrow_held + ?, updated_at = ? WHERE entity_id = ?')
      .run(delta, this.now(), entityId);
    return result.changes > 0;
  }

  updateReputation(entityId: string, newReputation: number): boolean {
    const result = this.db
      .prepare('UPDATE market_accounts SET reputation = ?, updated_at = ? WHERE entity_id = ?')
      .run(newReputation, this.now(), entityId);
    return result.changes > 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Transactions
  // ─────────────────────────────────────────────────────────────

  recordTransaction(
    type: string,
    amount: number,
    fromAccount?: string,
    toAccount?: string,
    referenceId?: string
  ): TransactionRow {
    const id = this.generateId();
    const now = this.now();

    this.db
      .prepare(`
        INSERT INTO market_transactions (id, from_account, to_account, amount, type, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, fromAccount || null, toAccount || null, amount, type, referenceId || null, now);

    return this.db.prepare('SELECT * FROM market_transactions WHERE id = ?').get(id) as TransactionRow;
  }

  getTransactionHistory(entityId: string, limit?: number): TransactionRow[] {
    let sql = 'SELECT * FROM market_transactions WHERE from_account = ? OR to_account = ? ORDER BY created_at DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(entityId, entityId) as TransactionRow[];
  }
}


