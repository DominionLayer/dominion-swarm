/**
 * Task - Atomic unit of work with inputs, outputs, and relationships
 */

import { v4 as uuidv4 } from 'uuid';
import type { TaskStatus, TaskPriority } from '../../util/schemas.js';
import { logger } from '../../util/logger.js';

export interface TaskInput {
  [key: string]: unknown;
}

export interface TaskOutput {
  [key: string]: unknown;
}

export interface TaskConfig {
  id?: string;
  runId: string;
  type: string;
  input: TaskInput;
  parentId?: string;
  agentId?: string;
  priority?: TaskPriority;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface TaskResult {
  success: boolean;
  output?: TaskOutput;
  error?: string;
  duration: number;
}

export class Task {
  readonly id: string;
  readonly runId: string;
  readonly type: string;
  readonly parentId: string | null;
  readonly priority: TaskPriority;
  readonly maxRetries: number;
  readonly timeoutMs: number | null;
  readonly input: TaskInput;
  
  private _status: TaskStatus = 'pending';
  private _agentId: string | null;
  private _output: TaskOutput | null = null;
  private _error: string | null = null;
  private _retries: number = 0;
  private _children: string[] = [];
  
  readonly createdAt: number;
  private _startedAt: number | null = null;
  private _completedAt: number | null = null;

  constructor(config: TaskConfig) {
    this.id = config.id || uuidv4();
    this.runId = config.runId;
    this.type = config.type;
    this.input = config.input;
    this.parentId = config.parentId || null;
    this._agentId = config.agentId || null;
    this.priority = config.priority || 'normal';
    this.maxRetries = config.maxRetries ?? 3;
    this.timeoutMs = config.timeoutMs || null;
    this.createdAt = Date.now();
  }

  // ─────────────────────────────────────────────────────────────
  // Status Management
  // ─────────────────────────────────────────────────────────────

  get status(): TaskStatus {
    return this._status;
  }

  get agentId(): string | null {
    return this._agentId;
  }

  get output(): TaskOutput | null {
    return this._output;
  }

  get error(): string | null {
    return this._error;
  }

  get retries(): number {
    return this._retries;
  }

  get children(): string[] {
    return [...this._children];
  }

  get startedAt(): number | null {
    return this._startedAt;
  }

  get completedAt(): number | null {
    return this._completedAt;
  }

  get duration(): number | null {
    if (!this._startedAt) return null;
    const endTime = this._completedAt || Date.now();
    return endTime - this._startedAt;
  }

  isTerminal(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this._status);
  }

  canRetry(): boolean {
    return this._retries < this.maxRetries && this._status === 'failed';
  }

  // ─────────────────────────────────────────────────────────────
  // State Transitions
  // ─────────────────────────────────────────────────────────────

  queue(): void {
    if (this._status !== 'pending') {
      throw new Error(`Cannot queue task in status: ${this._status}`);
    }
    this._status = 'queued';
    
    logger.debug('Task queued', {
      taskId: this.id,
      runId: this.runId,
      type: this.type,
    });
  }

  start(agentId?: string): void {
    if (!['pending', 'queued'].includes(this._status)) {
      throw new Error(`Cannot start task in status: ${this._status}`);
    }
    
    this._status = 'running';
    this._startedAt = Date.now();
    
    if (agentId) {
      this._agentId = agentId;
    }
    
    logger.debug('Task started', {
      taskId: this.id,
      runId: this.runId,
      agentId: this._agentId,
    });
  }

  complete(output: TaskOutput): void {
    if (this._status !== 'running') {
      throw new Error(`Cannot complete task in status: ${this._status}`);
    }
    
    this._status = 'completed';
    this._output = output;
    this._completedAt = Date.now();
    
    logger.debug('Task completed', {
      taskId: this.id,
      runId: this.runId,
      duration: this.duration,
    });
  }

  fail(error: string): void {
    if (this._status !== 'running') {
      throw new Error(`Cannot fail task in status: ${this._status}`);
    }
    
    this._status = 'failed';
    this._error = error;
    this._completedAt = Date.now();
    
    logger.debug('Task failed', {
      taskId: this.id,
      runId: this.runId,
      error,
      retries: this._retries,
    });
  }

  cancel(): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot cancel task in status: ${this._status}`);
    }
    
    this._status = 'cancelled';
    this._completedAt = Date.now();
    
    logger.debug('Task cancelled', {
      taskId: this.id,
      runId: this.runId,
    });
  }

  retry(): void {
    if (!this.canRetry()) {
      throw new Error(`Cannot retry task: status=${this._status}, retries=${this._retries}/${this.maxRetries}`);
    }
    
    this._retries++;
    this._status = 'pending';
    this._error = null;
    this._startedAt = null;
    this._completedAt = null;
    
    logger.debug('Task retrying', {
      taskId: this.id,
      runId: this.runId,
      attempt: this._retries + 1,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Child Tasks
  // ─────────────────────────────────────────────────────────────

  addChild(childId: string): void {
    if (!this._children.includes(childId)) {
      this._children.push(childId);
    }
  }

  removeChild(childId: string): void {
    const index = this._children.indexOf(childId);
    if (index !== -1) {
      this._children.splice(index, 1);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      runId: this.runId,
      type: this.type,
      status: this._status,
      priority: this.priority,
      parentId: this.parentId,
      agentId: this._agentId,
      input: this.input,
      output: this._output,
      error: this._error,
      retries: this._retries,
      maxRetries: this.maxRetries,
      children: this._children,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      duration: this.duration,
    };
  }
}

