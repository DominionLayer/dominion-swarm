/**
 * Task Manager - Manages task lifecycle, dependencies, and execution
 */

import { Task, type TaskConfig, type TaskResult } from './task.js';
import type { TaskStatus, TaskPriority } from '../../util/schemas.js';
import { logger } from '../../util/logger.js';
import type { Database } from '../../db/database.js';

export interface TaskQuery {
  runId?: string;
  status?: TaskStatus;
  type?: string;
  agentId?: string;
  parentId?: string;
  priority?: TaskPriority;
  limit?: number;
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private tasksByRun: Map<string, Set<string>> = new Map();
  private db?: Database;

  constructor(db?: Database) {
    this.db = db;
  }

  // ─────────────────────────────────────────────────────────────
  // Task Creation
  // ─────────────────────────────────────────────────────────────

  createTask(config: TaskConfig): Task {
    const task = new Task(config);
    this.tasks.set(task.id, task);

    // Index by run
    if (!this.tasksByRun.has(task.runId)) {
      this.tasksByRun.set(task.runId, new Set());
    }
    this.tasksByRun.get(task.runId)!.add(task.id);

    // Link to parent
    if (task.parentId) {
      const parent = this.tasks.get(task.parentId);
      if (parent) {
        parent.addChild(task.id);
      }
    }

    logger.debug('Task created', {
      taskId: task.id,
      runId: task.runId,
      type: task.type,
      parentId: task.parentId,
    });

    // Persist to database
    if (this.db) {
      this.db.tasks.create({
        id: task.id,
        runId: task.runId,
        type: task.type,
        status: task.status,
        priority: task.priority,
        parentId: task.parentId,
        agentId: task.agentId,
        input: JSON.stringify(task.input),
        output: null,
        error: null,
        retries: task.retries,
        maxRetries: task.maxRetries,
        createdAt: task.createdAt,
        startedAt: null,
        completedAt: null,
      });
    }

    return task;
  }

  // ─────────────────────────────────────────────────────────────
  // Task Retrieval
  // ─────────────────────────────────────────────────────────────

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getTasksByRun(runId: string): Task[] {
    const taskIds = this.tasksByRun.get(runId);
    if (!taskIds) return [];
    return Array.from(taskIds)
      .map((id) => this.tasks.get(id))
      .filter((t): t is Task => t !== undefined);
  }

  query(query: TaskQuery): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (query.runId) {
      tasks = tasks.filter((t) => t.runId === query.runId);
    }
    if (query.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }
    if (query.type) {
      tasks = tasks.filter((t) => t.type === query.type);
    }
    if (query.agentId) {
      tasks = tasks.filter((t) => t.agentId === query.agentId);
    }
    if (query.parentId !== undefined) {
      tasks = tasks.filter((t) => t.parentId === query.parentId);
    }
    if (query.priority) {
      tasks = tasks.filter((t) => t.priority === query.priority);
    }

    // Sort by priority and creation time
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    tasks.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt;
    });

    if (query.limit) {
      tasks = tasks.slice(0, query.limit);
    }

    return tasks;
  }

  getPendingTasks(runId?: string): Task[] {
    return this.query({ runId, status: 'pending' });
  }

  getQueuedTasks(runId?: string): Task[] {
    return this.query({ runId, status: 'queued' });
  }

  getRunningTasks(runId?: string): Task[] {
    return this.query({ runId, status: 'running' });
  }

  getFailedTasks(runId?: string): Task[] {
    return this.query({ runId, status: 'failed' });
  }

  // ─────────────────────────────────────────────────────────────
  // Task State Management
  // ─────────────────────────────────────────────────────────────

  queueTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.queue();
    this.syncToDb(task);
  }

  startTask(taskId: string, agentId?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.start(agentId);
    this.syncToDb(task);
  }

  completeTask(taskId: string, output: Record<string, unknown>): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.complete(output);
    this.syncToDb(task);
  }

  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.fail(error);
    this.syncToDb(task);
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.cancel();
    this.syncToDb(task);

    // Cancel children recursively
    for (const childId of task.children) {
      const child = this.tasks.get(childId);
      if (child && !child.isTerminal()) {
        this.cancelTask(childId);
      }
    }
  }

  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.retry();
    this.syncToDb(task);
  }

  // ─────────────────────────────────────────────────────────────
  // Batch Operations
  // ─────────────────────────────────────────────────────────────

  cancelRunTasks(runId: string): number {
    const tasks = this.getTasksByRun(runId);
    let cancelled = 0;

    for (const task of tasks) {
      if (!task.isTerminal()) {
        task.cancel();
        this.syncToDb(task);
        cancelled++;
      }
    }

    return cancelled;
  }

  retryFailedTasks(runId: string): number {
    const failed = this.getFailedTasks(runId);
    let retried = 0;

    for (const task of failed) {
      if (task.canRetry()) {
        task.retry();
        this.syncToDb(task);
        retried++;
      }
    }

    return retried;
  }

  // ─────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────

  getRunStats(runId: string): Record<string, unknown> {
    const tasks = this.getTasksByRun(runId);
    
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalDuration = 0;
    let completedCount = 0;

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      byType[task.type] = (byType[task.type] || 0) + 1;
      
      if (task.duration && task.status === 'completed') {
        totalDuration += task.duration;
        completedCount++;
      }
    }

    return {
      total: tasks.length,
      byStatus,
      byType,
      averageDuration: completedCount > 0 ? totalDuration / completedCount : 0,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────

  clearRunTasks(runId: string): void {
    const taskIds = this.tasksByRun.get(runId);
    if (!taskIds) return;

    for (const taskId of taskIds) {
      this.tasks.delete(taskId);
    }
    this.tasksByRun.delete(runId);
  }

  // ─────────────────────────────────────────────────────────────
  // Database Sync
  // ─────────────────────────────────────────────────────────────

  private syncToDb(task: Task): void {
    if (!this.db) return;

    this.db.tasks.update(task.id, {
      status: task.status,
      agentId: task.agentId,
      output: task.output ? JSON.stringify(task.output) : null,
      error: task.error,
      retries: task.retries,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    });
  }
}

