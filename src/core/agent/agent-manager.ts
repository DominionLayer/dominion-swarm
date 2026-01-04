/**
 * Agent Manager - Manages agent lifecycle and coordination
 */

import { Agent, type AgentConfig } from './agent.js';
import type { AgentRole, AgentStatus } from '../../util/schemas.js';
import { logger } from '../../util/logger.js';
import type { DominionDatabase } from '../../db/database.js';

export interface AgentQuery {
  role?: AgentRole;
  status?: AgentStatus;
  hasTools?: string[];
}

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private db?: DominionDatabase;

  constructor(db?: DominionDatabase) {
    this.db = db;
  }

  // ─────────────────────────────────────────────────────────────
  // Agent Lifecycle
  // ─────────────────────────────────────────────────────────────

  createAgent(config: AgentConfig): Agent {
    if (this.agents.has(config.id || '')) {
      throw new Error(`Agent already exists: ${config.id}`);
    }

    const agent = new Agent(config);
    this.agents.set(agent.id, agent);

    // Persist to database
    if (this.db) {
      this.db.agents.create({
        id: agent.id,
        role: agent.role,
        name: agent.name,
        description: agent.description,
        tools: config.tools,
        policy: config.policy,
      });
    }

    logger.debug('Agent created', {
      agentId: agent.id,
      role: agent.role,
      name: agent.name,
    });

    return agent;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  removeAgent(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;

    if (agent.isActive()) {
      throw new Error('Cannot remove active agent');
    }

    this.agents.delete(id);

    // Update in database
    if (this.db) {
      this.db.agents.update(id, { status: 'terminated' });
    }

    logger.debug('Agent removed', { agentId: id });
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // Query Methods
  // ─────────────────────────────────────────────────────────────

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByRole(role: AgentRole): Agent[] {
    return this.getAllAgents().filter((a) => a.role === role);
  }

  getAgentsByStatus(status: AgentStatus): Agent[] {
    return this.getAllAgents().filter((a) => a.status === status);
  }

  query(query: AgentQuery): Agent[] {
    let agents = this.getAllAgents();

    if (query.role) {
      agents = agents.filter((a) => a.role === query.role);
    }

    if (query.status) {
      agents = agents.filter((a) => a.status === query.status);
    }

    if (query.hasTools && query.hasTools.length > 0) {
      agents = agents.filter((a) =>
        query.hasTools!.every((tool) => a.hasTool(tool))
      );
    }

    return agents;
  }

  getActiveAgents(): Agent[] {
    return this.getAgentsByStatus('running');
  }

  getIdleAgents(): Agent[] {
    return this.getAgentsByStatus('idle');
  }

  // ─────────────────────────────────────────────────────────────
  // Status Management
  // ─────────────────────────────────────────────────────────────

  activateAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    
    agent.setStatus('running');
    this.syncToDb(agent);
  }

  pauseAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    
    agent.setStatus('paused');
    this.syncToDb(agent);
  }

  resumeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    
    if (agent.status !== 'paused') {
      throw new Error('Can only resume paused agents');
    }
    
    agent.setStatus('running');
    this.syncToDb(agent);
  }

  deactivateAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    
    agent.setStatus('idle');
    this.syncToDb(agent);
  }

  // ─────────────────────────────────────────────────────────────
  // Batch Operations
  // ─────────────────────────────────────────────────────────────

  activateAll(): void {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle') {
        agent.setStatus('running');
        this.syncToDb(agent);
      }
    }
  }

  pauseAll(): void {
    for (const agent of this.agents.values()) {
      if (agent.status === 'running') {
        agent.setStatus('paused');
        this.syncToDb(agent);
      }
    }
  }

  deactivateAll(): void {
    for (const agent of this.agents.values()) {
      agent.setStatus('idle');
      this.syncToDb(agent);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────

  getStats(): Record<string, unknown> {
    const agents = this.getAllAgents();
    const byRole: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const agent of agents) {
      byRole[agent.role] = (byRole[agent.role] || 0) + 1;
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
    }

    return {
      total: agents.length,
      byRole,
      byStatus,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Database Sync
  // ─────────────────────────────────────────────────────────────

  private syncToDb(agent: Agent): void {
    if (!this.db) return;

    this.db.agents.update(agent.id, {
      status: agent.status,
      tools: agent.toolNames,
    });
  }

  async loadFromDb(): Promise<void> {
    if (!this.db) return;

    const rows = this.db.agents.getActive();
    
    for (const row of rows) {
      const tools = row.tools ? JSON.parse(row.tools) : [];
      const policy = row.policy ? JSON.parse(row.policy) : {};

      const agent = new Agent({
        id: row.id,
        role: row.role as AgentRole,
        name: row.name,
        description: row.description || undefined,
        tools,
        policy,
      });

      this.agents.set(agent.id, agent);
    }

    logger.debug('Agents loaded from database', { count: rows.length });
  }
}
