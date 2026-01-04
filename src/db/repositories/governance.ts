/**
 * Governance Repository - Proposals and Votes
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface ProposalRow {
  id: string;
  title: string;
  description: string | null;
  author_id: string;
  status: string;
  category: string;
  actions: string | null;
  discussion_summary: string | null;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  quorum_required: number;
  discussion_end_at: number | null;
  voting_end_at: number | null;
  executed_at: number | null;
  created_at: number;
}

export interface CreateProposalInput {
  id?: string;
  title: string;
  description?: string;
  authorId: string;
  category: string;
  actions?: Record<string, unknown>[];
  quorumRequired?: number;
  discussionEndAt?: number;
  votingEndAt?: number;
}

export interface VoteRow {
  id: string;
  proposal_id: string;
  voter_id: string;
  choice: string;
  weight: number;
  reason: string | null;
  created_at: number;
}

export interface CreateVoteInput {
  id?: string;
  proposalId: string;
  voterId: string;
  choice: 'for' | 'against' | 'abstain';
  weight?: number;
  reason?: string;
}

export class GovernanceRepository extends BaseRepository<ProposalRow> {
  constructor(db: Database.Database) {
    super(db, 'proposals');
  }

  // ─────────────────────────────────────────────────────────────
  // Proposals
  // ─────────────────────────────────────────────────────────────

  createProposal(input: CreateProposalInput): ProposalRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO proposals (
        id, title, description, author_id, status, category, actions,
        quorum_required, discussion_end_at, voting_end_at, created_at
      )
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.title,
      input.description || null,
      input.authorId,
      input.category,
      input.actions ? JSON.stringify(input.actions) : null,
      input.quorumRequired ?? 10,
      input.discussionEndAt || null,
      input.votingEndAt || null,
      now
    );

    return this.getById(id)!;
  }

  updateProposal(
    id: string,
    updates: Partial<{
      status: string;
      discussionSummary: string;
      votesFor: number;
      votesAgainst: number;
      votesAbstain: number;
      discussionEndAt: number;
      votingEndAt: number;
      executedAt: number;
    }>
  ): boolean {
    const setters: string[] = [];
    const params: unknown[] = [];

    if (updates.status !== undefined) {
      setters.push('status = ?');
      params.push(updates.status);
    }
    if (updates.discussionSummary !== undefined) {
      setters.push('discussion_summary = ?');
      params.push(updates.discussionSummary);
    }
    if (updates.votesFor !== undefined) {
      setters.push('votes_for = ?');
      params.push(updates.votesFor);
    }
    if (updates.votesAgainst !== undefined) {
      setters.push('votes_against = ?');
      params.push(updates.votesAgainst);
    }
    if (updates.votesAbstain !== undefined) {
      setters.push('votes_abstain = ?');
      params.push(updates.votesAbstain);
    }
    if (updates.discussionEndAt !== undefined) {
      setters.push('discussion_end_at = ?');
      params.push(updates.discussionEndAt);
    }
    if (updates.votingEndAt !== undefined) {
      setters.push('voting_end_at = ?');
      params.push(updates.votingEndAt);
    }
    if (updates.executedAt !== undefined) {
      setters.push('executed_at = ?');
      params.push(updates.executedAt);
    }

    if (setters.length === 0) return false;

    params.push(id);
    const result = this.db
      .prepare(`UPDATE proposals SET ${setters.join(', ')} WHERE id = ?`)
      .run(...params);
    return result.changes > 0;
  }

  findByStatus(status: string): ProposalRow[] {
    return this.db
      .prepare('SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC')
      .all(status) as ProposalRow[];
  }

  findByAuthor(authorId: string): ProposalRow[] {
    return this.db
      .prepare('SELECT * FROM proposals WHERE author_id = ? ORDER BY created_at DESC')
      .all(authorId) as ProposalRow[];
  }

  findActive(): ProposalRow[] {
    return this.db
      .prepare("SELECT * FROM proposals WHERE status IN ('discussion', 'voting') ORDER BY created_at DESC")
      .all() as ProposalRow[];
  }

  findVotingExpired(): ProposalRow[] {
    const now = this.now();
    return this.db
      .prepare("SELECT * FROM proposals WHERE status = 'voting' AND voting_end_at < ?")
      .all(now) as ProposalRow[];
  }

  // ─────────────────────────────────────────────────────────────
  // Votes
  // ─────────────────────────────────────────────────────────────

  createVote(input: CreateVoteInput): VoteRow {
    const id = input.id || this.generateId();
    const now = this.now();

    // Check for existing vote
    const existing = this.db
      .prepare('SELECT * FROM votes WHERE proposal_id = ? AND voter_id = ?')
      .get(input.proposalId, input.voterId);
    
    if (existing) {
      throw new Error('Voter has already voted on this proposal');
    }

    const stmt = this.db.prepare(`
      INSERT INTO votes (id, proposal_id, voter_id, choice, weight, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.proposalId,
      input.voterId,
      input.choice,
      input.weight ?? 1,
      input.reason || null,
      now
    );

    // Update vote counts on proposal
    const voteColumn = input.choice === 'for' 
      ? 'votes_for' 
      : input.choice === 'against' 
        ? 'votes_against' 
        : 'votes_abstain';
    
    this.db
      .prepare(`UPDATE proposals SET ${voteColumn} = ${voteColumn} + ? WHERE id = ?`)
      .run(input.weight ?? 1, input.proposalId);

    return this.db.prepare('SELECT * FROM votes WHERE id = ?').get(id) as VoteRow;
  }

  getVotesByProposal(proposalId: string): VoteRow[] {
    return this.db
      .prepare('SELECT * FROM votes WHERE proposal_id = ? ORDER BY created_at ASC')
      .all(proposalId) as VoteRow[];
  }

  getVoteByVoter(proposalId: string, voterId: string): VoteRow | undefined {
    return this.db
      .prepare('SELECT * FROM votes WHERE proposal_id = ? AND voter_id = ?')
      .get(proposalId, voterId) as VoteRow | undefined;
  }

  countVotes(proposalId: string): { for: number; against: number; abstain: number; total: number } {
    const result = this.db
      .prepare(`
        SELECT 
          SUM(CASE WHEN choice = 'for' THEN weight ELSE 0 END) as votes_for,
          SUM(CASE WHEN choice = 'against' THEN weight ELSE 0 END) as votes_against,
          SUM(CASE WHEN choice = 'abstain' THEN weight ELSE 0 END) as votes_abstain,
          SUM(weight) as total
        FROM votes WHERE proposal_id = ?
      `)
      .get(proposalId) as { votes_for: number; votes_against: number; votes_abstain: number; total: number };
    
    return {
      for: result.votes_for || 0,
      against: result.votes_against || 0,
      abstain: result.votes_abstain || 0,
      total: result.total || 0,
    };
  }
}


