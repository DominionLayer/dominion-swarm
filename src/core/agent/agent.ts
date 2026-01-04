/**
 * Agent - Autonomous unit with role, tools, policy, and memory
 */

import { v4 as uuidv4 } from 'uuid';
import type { AgentRole, AgentStatus } from '../../util/schemas.js';
import { logger } from '../../util/logger.js';
import type { Policy } from '../policy/policy.js';
import type { Tool } from '../tools/tool.js';
import type { AgentMemory } from './memory.js';

export interface AgentConfig {
  id?: string;
  role: AgentRole;
  name: string;
  description?: string;
  tools?: string[];
  policy?: Record<string, unknown>;
}

export interface AgentContext {
  runId: string;
  taskId?: string;
  input?: Record<string, unknown>;
}

export class Agent {
  readonly id: string;
  readonly role: AgentRole;
  readonly name: string;
  readonly description?: string;
  
  private _status: AgentStatus = 'idle';
  private _tools: Map<string, Tool> = new Map();
  private _policy?: Policy;
  private _memory?: AgentMemory;
  private _config: Record<string, unknown>;
  
  readonly createdAt: number;
  private _updatedAt: number;

  constructor(config: AgentConfig) {
    this.id = config.id || uuidv4();
    this.role = config.role;
    this.name = config.name;
    this.description = config.description;
    this._config = config.policy || {};
    this.createdAt = Date.now();
    this._updatedAt = this.createdAt;
  }

  get status(): AgentStatus {
    return this._status;
  }

  get tools(): Tool[] {
    return Array.from(this._tools.values());
  }

  get toolNames(): string[] {
    return Array.from(this._tools.keys());
  }

  get policy(): Policy | undefined {
    return this._policy;
  }

  get memory(): AgentMemory | undefined {
    return this._memory;
  }

  get config(): Record<string, unknown> {
    return { ...this._config };
  }

  get updatedAt(): number {
    return this._updatedAt;
  }

  // ─────────────────────────────────────────────────────────────
  // Status Management
  // ─────────────────────────────────────────────────────────────

  setStatus(status: AgentStatus): void {
    const oldStatus = this._status;
    this._status = status;
    this._updatedAt = Date.now();
    
    logger.debug('Agent status changed', {
      agentId: this.id,
      oldStatus,
      newStatus: status,
    });
  }

  isActive(): boolean {
    return this._status === 'running';
  }

  canExecute(): boolean {
    return this._status === 'idle' || this._status === 'running';
  }

  // ─────────────────────────────────────────────────────────────
  // Tool Management
  // ─────────────────────────────────────────────────────────────

  registerTool(tool: Tool): void {
    this._tools.set(tool.name, tool);
    this._updatedAt = Date.now();
    
    logger.debug('Tool registered to agent', {
      agentId: this.id,
      toolName: tool.name,
    });
  }

  unregisterTool(toolName: string): boolean {
    const removed = this._tools.delete(toolName);
    if (removed) {
      this._updatedAt = Date.now();
    }
    return removed;
  }

  getTool(name: string): Tool | undefined {
    return this._tools.get(name);
  }

  hasTool(name: string): boolean {
    return this._tools.has(name);
  }

  // ─────────────────────────────────────────────────────────────
  // Policy Management
  // ─────────────────────────────────────────────────────────────

  setPolicy(policy: Policy): void {
    this._policy = policy;
    this._updatedAt = Date.now();
  }

  // ─────────────────────────────────────────────────────────────
  // Memory Management
  // ─────────────────────────────────────────────────────────────

  setMemory(memory: AgentMemory): void {
    this._memory = memory;
    this._updatedAt = Date.now();
  }

  // ─────────────────────────────────────────────────────────────
  // Execution
  // ─────────────────────────────────────────────────────────────

  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: AgentContext
  ): Promise<unknown> {
    const tool = this._tools.get(toolName);
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    if (!this.canExecute()) {
      throw new Error(`Agent cannot execute in status: ${this._status}`);
    }

    // Check policy if set
    if (this._policy) {
      const allowed = await this._policy.checkPermission(this, toolName, params);
      if (!allowed) {
        throw new Error(`Policy denied execution of tool: ${toolName}`);
      }
    }

    logger.debug('Agent executing tool', {
      agentId: this.id,
      runId: context.runId,
      taskId: context.taskId,
      toolName,
    });

    try {
      const result = await tool.execute(params, {
        agentId: this.id,
        ...context,
      });
      
      return result;
    } catch (error) {
      logger.error('Tool execution failed', error as Error, {
        agentId: this.id,
        toolName,
      });
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      role: this.role,
      name: this.name,
      description: this.description,
      status: this._status,
      tools: Array.from(this._tools.keys()),
      config: this._config,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  static fromConfig(config: AgentConfig): Agent {
    return new Agent(config);
  }
}

