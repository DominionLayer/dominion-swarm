/**
 * Operator Workflow - Watch, Analyze, Propose Actions
 * 
 * The operator workflow extends sentinel by proposing actions:
 * 1. Observe blockchain activity
 * 2. Analyze observations
 * 3. Propose actions based on findings (no execution)
 */

import { WorkflowRunner, type WorkflowResult } from './runner.js';
import type { DominionDatabase } from '../db/database.js';
import type { LLMProvider } from '../providers/base.js';
import type { DominionConfig } from '../util/config.js';
import { logger } from '../util/logger.js';

export interface OperatorOptions {
  config: DominionConfig;
  db: DominionDatabase;
  llm: LLMProvider;
  dryRun?: boolean;
  blockCount?: number;
  actionThreshold?: number;
}

export interface OperatorResult extends WorkflowResult {
  proposedActions: ProposedAction[];
}

export interface ProposedAction {
  id: string;
  type: string;
  trigger: {
    category: string;
    score: number;
    observationId: string;
  };
  params: Record<string, unknown>;
  rationale: string;
  requiresApproval: boolean;
}

export async function runOperator(options: OperatorOptions): Promise<OperatorResult> {
  const runner = new WorkflowRunner({
    config: options.config,
    db: options.db,
    llm: options.llm,
    dryRun: true, // Operator always proposes, never executes
  });

  await runner.initialize();

  try {
    // Run the operator workflow
    const result = await runner.run('operator', {
      blockCount: options.blockCount || 10,
    });

    // Generate proposed actions from high-score analyses
    const proposedActions = await proposeActions(
      options.db,
      options.llm,
      result.runId,
      options.actionThreshold ?? options.config.analyze.scoring.thresholdAction
    );

    // Log proposed actions
    for (const action of proposedActions) {
      logger.info(`[PROPOSED] ${action.type}: ${action.rationale}`, {
        runId: result.runId,
        actionId: action.id,
        score: action.trigger.score,
      });
    }

    return {
      ...result,
      proposedActions,
    };
  } finally {
    await runner.shutdown();
  }
}

async function proposeActions(
  db: DominionDatabase,
  llm: LLMProvider,
  runId: string,
  threshold: number
): Promise<ProposedAction[]> {
  const analyses = db.analyses.findHighScore(threshold, runId);
  const proposedActions: ProposedAction[] = [];

  for (const analysis of analyses) {
    // Get the observation
    const observation = db.observations.getById(analysis.observation_id);
    if (!observation) continue;

    const observationData = observation.data ? JSON.parse(observation.data) : {};

    // Determine action type based on category
    let actionType: string;
    let params: Record<string, unknown>;
    let requiresApproval = true;

    switch (analysis.category) {
      case 'whale_activity':
      case 'large_transfer':
        actionType = 'webhook';
        params = {
          url: '${ALERT_WEBHOOK_URL}',
          body: {
            type: 'high_value_transfer',
            score: analysis.score,
            observation: observationData,
          },
        };
        requiresApproval = false; // Alerts don't need approval
        break;

      case 'suspicious_activity':
        actionType = 'webhook';
        params = {
          url: '${SECURITY_WEBHOOK_URL}',
          body: {
            type: 'security_alert',
            score: analysis.score,
            observation: observationData,
          },
        };
        requiresApproval = true;
        break;

      default:
        actionType = 'report';
        params = {
          runId,
          format: 'both',
        };
        requiresApproval = false;
    }

    // Create action record
    const action = db.actions.create({
      runId,
      taskId: 'operator',
      agentId: 'operator',
      type: actionType,
      params,
      dryRun: true,
    });

    proposedActions.push({
      id: action.id,
      type: actionType,
      trigger: {
        category: analysis.category,
        score: analysis.score,
        observationId: analysis.observation_id,
      },
      params,
      rationale: analysis.rationale || `Action triggered by ${analysis.category} (score: ${analysis.score})`,
      requiresApproval,
    });
  }

  return proposedActions;
}


