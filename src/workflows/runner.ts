/**
 * Workflow Runner - Executes workflow steps
 */

import { nanoid } from 'nanoid';
import { PluginManager } from '../plugins/index.js';
import type { DominionDatabase } from '../db/database.js';
import type { LLMProvider } from '../providers/base.js';
import type { DominionConfig, WorkflowConfig } from '../util/config.js';
import { logger, createRunLogger } from '../util/logger.js';

export interface WorkflowResult {
  runId: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt: number;
  duration: number;
  steps: StepResult[];
  summary: WorkflowSummary;
  errors: string[];
}

export interface StepResult {
  plugin: string;
  action: string;
  status: 'completed' | 'failed' | 'skipped';
  duration: number;
  result?: unknown;
  error?: string;
}

export interface WorkflowSummary {
  stepsCompleted: number;
  stepsFailed: number;
  observationsCount: number;
  analysesCount: number;
  actionsProposed: number;
  actionsExecuted: number;
  highScoreFindings: number;
}

export interface WorkflowRunnerOptions {
  config: DominionConfig;
  db: DominionDatabase;
  llm: LLMProvider;
  dryRun?: boolean;
  approve?: boolean;
}

export class WorkflowRunner {
  private config: DominionConfig;
  private db: DominionDatabase;
  private llm: LLMProvider;
  private plugins: PluginManager;
  private dryRun: boolean;
  private approve: boolean;

  constructor(options: WorkflowRunnerOptions) {
    this.config = options.config;
    this.db = options.db;
    this.llm = options.llm;
    this.dryRun = options.dryRun ?? this.config.general.dryRun;
    this.approve = options.approve ?? false;
    this.plugins = new PluginManager(this.config, this.db, this.llm);
  }

  async initialize(): Promise<void> {
    await this.plugins.initialize();
  }

  async shutdown(): Promise<void> {
    await this.plugins.shutdown();
  }

  async run(workflowId: string, input?: Record<string, unknown>): Promise<WorkflowResult> {
    const workflow = this.config.workflows[workflowId];
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const runId = nanoid();
    const runLogger = createRunLogger(runId);
    runLogger.info('Starting workflow', { workflowId, dryRun: this.dryRun });

    // Create run record
    this.db.runs.create({
      id: runId,
      workflowId,
      config: { ...input, dryRun: this.dryRun },
    });

    const startedAt = Date.now();
    this.db.runs.update(runId, { status: 'running', startedAt });

    const stepResults: StepResult[] = [];
    const errors: string[] = [];
    let status: 'completed' | 'failed' | 'cancelled' = 'completed';

    try {
      for (const step of workflow.steps) {
        const stepResult = await this.executeStep(runId, step, input);
        stepResults.push(stepResult);

        if (stepResult.status === 'failed') {
          errors.push(`${step.plugin}:${step.action} - ${stepResult.error}`);
          
          // Continue unless it's a critical failure
          if (step.plugin === 'observe') {
            status = 'failed';
            break;
          }
        }
      }
    } catch (error) {
      status = 'failed';
      errors.push((error as Error).message);
      runLogger.error('Workflow failed', error as Error);
    }

    const completedAt = Date.now();

    // Generate summary
    const summary = this.generateSummary(runId, stepResults);

    // Update run record
    this.db.runs.update(runId, {
      status,
      completedAt,
      summary,
    });

    runLogger.info('Workflow completed', { status, duration: completedAt - startedAt });

    return {
      runId,
      workflowId,
      status,
      startedAt,
      completedAt,
      duration: completedAt - startedAt,
      steps: stepResults,
      summary,
      errors,
    };
  }

  private async executeStep(
    runId: string,
    step: WorkflowConfig['steps'][0],
    input?: Record<string, unknown>
  ): Promise<StepResult> {
    const startTime = Date.now();

    // Create task record
    const task = this.db.tasks.create({
      runId,
      type: `${step.plugin}:${step.action}`,
      input: JSON.stringify({ ...input, ...step.config }),
    });

    this.db.tasks.update(task.id, { status: 'running', startedAt: startTime });

    const plugin = this.plugins.get(step.plugin as any);
    if (!plugin) {
      this.db.tasks.update(task.id, { status: 'failed', error: 'Plugin not found', completedAt: Date.now() });
      return {
        plugin: step.plugin,
        action: step.action,
        status: 'failed',
        duration: Date.now() - startTime,
        error: `Plugin not found: ${step.plugin}`,
      };
    }

    try {
      const requireApproval = step.requireApproval ?? this.config.general.requireApproval;
      const effectiveDryRun = this.dryRun && !this.approve;

      const result = await plugin.execute(step.action, {
        runId,
        taskId: task.id,
        dryRun: effectiveDryRun,
        config: this.config,
        db: this.db,
        llm: this.llm,
        logger: logger,
      }, {
        ...input,
        ...step.config,
      });

      const endTime = Date.now();
      this.db.tasks.update(task.id, {
        status: result.success ? 'completed' : 'failed',
        output: result.data ? JSON.stringify(result.data) : null,
        error: result.error || null,
        completedAt: endTime,
      });

      return {
        plugin: step.plugin,
        action: step.action,
        status: result.success ? 'completed' : 'failed',
        duration: endTime - startTime,
        result: result.data,
        error: result.error,
      };
    } catch (error) {
      const endTime = Date.now();
      this.db.tasks.update(task.id, {
        status: 'failed',
        error: (error as Error).message,
        completedAt: endTime,
      });

      return {
        plugin: step.plugin,
        action: step.action,
        status: 'failed',
        duration: endTime - startTime,
        error: (error as Error).message,
      };
    }
  }

  private generateSummary(runId: string, steps: StepResult[]): WorkflowSummary {
    const observations = this.db.observations.findByRun(runId);
    const analyses = this.db.analyses.findByRun(runId);
    const actions = this.db.actions.findByRun(runId);

    const highScoreThreshold = this.config.analyze.scoring.thresholdAlert;
    const highScoreFindings = analyses.filter(a => a.score >= highScoreThreshold).length;

    return {
      stepsCompleted: steps.filter(s => s.status === 'completed').length,
      stepsFailed: steps.filter(s => s.status === 'failed').length,
      observationsCount: observations.length,
      analysesCount: analyses.length,
      actionsProposed: actions.filter(a => a.status === 'proposed').length,
      actionsExecuted: actions.filter(a => a.status === 'executed').length,
      highScoreFindings,
    };
  }
}


