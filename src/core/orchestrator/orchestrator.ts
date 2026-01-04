/**
 * Orchestrator - Coordinates agents, tasks, and workflows
 */

import { nanoid } from 'nanoid';
import { Agent, type AgentConfig } from '../agent/agent.js';
import { AgentManager } from '../agent/agent-manager.js';
import { Task, type TaskConfig } from '../task/task.js';
import { TaskManager } from '../task/task-manager.js';
import { globalToolRegistry } from '../tools/tool-registry.js';
import { globalPolicyEngine } from '../policy/policy-engine.js';
import { DominionDatabase, getDatabase } from '../../db/database.js';
import { getDefaultProvider, type LLMProvider } from '../../providers/index.js';
import { getConfig, type DominionConfig, type WorkflowConfig } from '../../util/config.js';
import { logger, createRunLogger } from '../../util/logger.js';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RunResult {
  runId: string;
  status: RunStatus;
  startedAt: number;
  completedAt: number;
  duration: number;
  summary: RunSummary;
  errors: string[];
}

export interface RunSummary {
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed: number;
  observationsCount: number;
  analysesCount: number;
  actionsProposed: number;
  actionsExecuted: number;
  highScoreFindings: number;
}

export interface OrchestratorOptions {
  config?: DominionConfig;
  db?: DominionDatabase;
  llm?: LLMProvider;
  dryRun?: boolean;
}

export class Orchestrator {
  private config: DominionConfig;
  private db: DominionDatabase;
  private llm: LLMProvider;
  private dryRun: boolean;

  private agentManager: AgentManager;
  private taskManager: TaskManager;

  private currentRunId: string | null = null;
  private isRunning: boolean = false;

  constructor(options: OrchestratorOptions = {}) {
    this.config = options.config || getConfig();
    this.db = options.db || getDatabase({ path: this.config.database.path });
    this.llm = options.llm || getDefaultProvider();
    this.dryRun = options.dryRun ?? this.config.general.dryRun;

    this.agentManager = new AgentManager(this.db);
    this.taskManager = new TaskManager(this.db);
  }

  // ─────────────────────────────────────────────────────────────
  // Workflow Execution
  // ─────────────────────────────────────────────────────────────

  async runWorkflow(workflowId: string, options: { input?: Record<string, unknown> } = {}): Promise<RunResult> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running a workflow');
    }

    const workflow = this.config.workflows[workflowId];
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const runId = nanoid();
    this.currentRunId = runId;
    this.isRunning = true;

    const runLogger = createRunLogger(runId);
    runLogger.info('Starting workflow', { workflowId, dryRun: this.dryRun });

    // Create run record
    const runRecord = this.db.runs.create({
      id: runId,
      workflowId,
      config: {
        ...options.input,
        dryRun: this.dryRun,
      },
    });

    const startedAt = Date.now();
    const errors: string[] = [];
    let status: RunStatus = 'running';

    try {
      // Update run status
      this.db.runs.update(runId, { status: 'running', startedAt });

      // Initialize agents for this workflow
      await this.initializeAgents();

      // Execute workflow steps
      for (const step of workflow.steps) {
        runLogger.info('Executing workflow step', {
          plugin: step.plugin,
          action: step.action,
        });

        try {
          await this.executeStep(runId, step, options.input);
        } catch (error) {
          const errorMessage = (error as Error).message;
          errors.push(`Step ${step.plugin}:${step.action} failed: ${errorMessage}`);
          runLogger.error('Step failed', error as Error);

          // Continue with other steps unless critical
          if (step.plugin === 'observe') {
            // Observation failure is critical
            throw error;
          }
        }
      }

      status = errors.length > 0 ? 'completed' : 'completed';
    } catch (error) {
      status = 'failed';
      errors.push((error as Error).message);
      runLogger.error('Workflow failed', error as Error);
    } finally {
      this.isRunning = false;
      this.currentRunId = null;
    }

    const completedAt = Date.now();

    // Generate summary
    const summary = await this.generateSummary(runId);

    // Update run record
    this.db.runs.update(runId, {
      status,
      completedAt,
      summary,
    });

    runLogger.info('Workflow completed', { status, duration: completedAt - startedAt });

    return {
      runId,
      status,
      startedAt,
      completedAt,
      duration: completedAt - startedAt,
      summary,
      errors,
    };
  }

  private async executeStep(
    runId: string,
    step: WorkflowConfig['steps'][0],
    input?: Record<string, unknown>
  ): Promise<void> {
    const { plugin, action, requireApproval, config } = step;

    // Create task for this step
    const task = this.taskManager.createTask({
      runId,
      type: `${plugin}:${action}`,
      input: { ...input, ...config },
      priority: 'normal',
    });

    this.taskManager.startTask(task.id);

    try {
      // Execute based on plugin type
      const result = await this.executePluginAction(runId, plugin, action, {
        taskId: task.id,
        requireApproval: requireApproval ?? this.config.general.requireApproval,
        config: { ...input, ...config },
      });

      this.taskManager.completeTask(task.id, { result });
    } catch (error) {
      this.taskManager.failTask(task.id, (error as Error).message);
      throw error;
    }
  }

  private async executePluginAction(
    runId: string,
    plugin: string,
    action: string,
    options: {
      taskId: string;
      requireApproval: boolean;
      config: Record<string, unknown>;
    }
  ): Promise<unknown> {
    // This would delegate to the appropriate plugin
    // For now, return a placeholder
    logger.debug('Executing plugin action', { plugin, action, runId });

    // In actual implementation, this would:
    // 1. Load the plugin
    // 2. Call the action with config
    // 3. Handle approval if required
    // 4. Return the result

    return { executed: true, plugin, action };
  }

  // ─────────────────────────────────────────────────────────────
  // Agent Management
  // ─────────────────────────────────────────────────────────────

  private async initializeAgents(): Promise<void> {
    const agentConfigs = this.config.agents;

    for (const config of agentConfigs) {
      const agent = this.agentManager.createAgent({
        id: config.id,
        role: config.role,
        name: config.name,
        description: config.description,
        tools: config.tools,
        policy: config.policy,
      });

      // Register tools for the agent
      for (const toolName of config.tools) {
        const tool = globalToolRegistry.get(toolName);
        if (tool) {
          agent.registerTool(tool);
        }
      }

      logger.debug('Agent initialized', { agentId: agent.id, role: agent.role });
    }
  }

  async getAgentForRole(role: string): Promise<Agent | undefined> {
    const agents = this.agentManager.getAgentsByRole(role as AgentConfig['role']);
    return agents[0];
  }

  // ─────────────────────────────────────────────────────────────
  // Summary Generation
  // ─────────────────────────────────────────────────────────────

  private async generateSummary(runId: string): Promise<RunSummary> {
    const tasks = this.db.tasks.findByRun(runId);
    const observations = this.db.observations.findByRun(runId);
    const analyses = this.db.analyses.findByRun(runId);
    const actions = this.db.actions.findByRun(runId);

    const taskStats = this.db.tasks.countByStatus(runId);
    const highScoreAnalyses = this.db.analyses.findHighScore(
      this.config.analyze.scoring.thresholdAlert,
      runId
    );

    return {
      tasksTotal: tasks.length,
      tasksCompleted: taskStats['completed'] || 0,
      tasksFailed: taskStats['failed'] || 0,
      observationsCount: observations.length,
      analysesCount: analyses.length,
      actionsProposed: actions.filter((a) => a.status === 'proposed').length,
      actionsExecuted: actions.filter((a) => a.status === 'executed').length,
      highScoreFindings: highScoreAnalyses.length,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Control Methods
  // ─────────────────────────────────────────────────────────────

  async cancel(): Promise<void> {
    if (!this.isRunning || !this.currentRunId) {
      return;
    }

    logger.info('Cancelling workflow', { runId: this.currentRunId });

    // Cancel all pending tasks
    this.taskManager.cancelRunTasks(this.currentRunId);

    // Update run status
    this.db.runs.update(this.currentRunId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });

    this.isRunning = false;
    this.currentRunId = null;
  }

  // ─────────────────────────────────────────────────────────────
  // Status Methods
  // ─────────────────────────────────────────────────────────────

  get running(): boolean {
    return this.isRunning;
  }

  get runId(): string | null {
    return this.currentRunId;
  }

  getStats(): Record<string, unknown> {
    return {
      isRunning: this.isRunning,
      currentRunId: this.currentRunId,
      dryRun: this.dryRun,
      agentCount: this.agentManager.getStats().total,
      taskCount: this.taskManager.getRunStats(this.currentRunId || ''),
    };
  }
}


