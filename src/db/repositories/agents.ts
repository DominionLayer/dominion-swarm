/**
 * Agents Repository
 */

import type Database from 'better-sqlite3';
import { BaseRepository } from './base.js';

export interface AgentRow {
  id: string;
  role: string;
  name: string;
  description: string | null;
  tools: string | null;
  policy: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface CreateAgentInput {
  id?: string;
  role: string;
  name: string;
  description?: string;
  tools?: string[];
  policy?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  tools?: string[];
  policy?: Record<string, unknown>;
  status?: string;
}

export class AgentsRepository extends BaseRepository<AgentRow> {
  constructor(db: Database.Database) {
    super(db, 'agents');
  }

  create(input: CreateAgentInput): AgentRow {
    const id = input.id || this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO agents (id, role, name, description, tools, policy, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?)
    `);

    stmt.run(
      id,
      input.role,
      input.name,
      input.description || null,
      input.tools ? JSON.stringify(input.tools) : null,
      input.policy ? JSON.stringify(input.policy) : null,
      now,
      now
    );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateAgentInput): boolean {
    const updates: string[] = ['updated_at = ?'];
    const params: unknown[] = [this.now()];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }
    if (input.tools !== undefined) {
      updates.push('tools = ?');
      params.push(JSON.stringify(input.tools));
    }
    if (input.policy !== undefined) {
      updates.push('policy = ?');
      params.push(JSON.stringify(input.policy));
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    params.push(id);
    const stmt = this.db.prepare(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  findByRole(role: string): AgentRow[] {
    return this.db
      .prepare('SELECT * FROM agents WHERE role = ?')
      .all(role) as AgentRow[];
  }

  findByStatus(status: string): AgentRow[] {
    return this.db
      .prepare('SELECT * FROM agents WHERE status = ?')
      .all(status) as AgentRow[];
  }

  getActive(): AgentRow[] {
    return this.db
      .prepare("SELECT * FROM agents WHERE status != 'terminated'")
      .all() as AgentRow[];
  }
}


