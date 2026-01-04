/**
 * Autopilot Workflow - Full Pipeline with Approval Gates
 * 
 * The autopilot workflow is the full autonomous pipeline:
 * 1. Observe blockchain activity
 * 2. Analyze observations
 * 3. Propose and execute actions (with approval gates)
 * 
 * IMPORTANT: Execution is ALWAYS gated by approval.
 */

import { WorkflowRunner, type WorkflowResult } from './runner.js';
import type { DominionDatabase } from '../db/database.js';
import type { LLMProvider } from '../providers/base.js';
import type { DominionConfig } from '../util/config.js';
import { logger } from '../util/logger.js';
import inquirer from 'inquirer';

export interface AutopilotOptions {
  config: DominionConfig;
  db: DominionDatabase;
  llm: LLMProvider;
  dryRun?: boolean;
  approve?: boolean;
  interactive?: boolean;
  blockCount?: number;
}

export interface AutopilotResult extends WorkflowResult {
  actionsExecuted: ExecutedAction[];
  actionsSkipped: SkippedAction[];
}

export interface ExecutedAction {
  id: string;
  type: string;
  result: unknown;
  executedAt: number;
}

export interface SkippedAction {
  id: string;
  type: string;
  reason: string;
}

export async function runAutopilot(options: AutopilotOptions): Promise<AutopilotResult> {
  // Safety check: autopilot should always respect approval unless explicitly overridden
  if (!options.dryRun && !options.approve && !options.interactive) {
    logger.warn('Autopilot running in dry-run mode (use --approve or --interactive for real execution)');
    options.dryRun = true;
  }

  const runner = new WorkflowRunner({
    config: options.config,
    db: options.db,
    llm: options.llm,
    dryRun: options.dryRun ?? true,
    approve: options.approve ?? false,
  });

  await runner.initialize();

  try {
    // Run the autopilot workflow
    const result = await runner.run('autopilot', {
      blockCount: options.blockCount || 10,
    });

    // Get proposed actions
    const proposedActions = options.db.actions.findByRun(result.runId);
    
    const actionsExecuted: ExecutedAction[] = [];
    const actionsSkipped: SkippedAction[] = [];

    // Process actions that need execution
    for (const action of proposedActions) {
      if (action.status !== 'proposed') continue;

      // Check if this action requires approval
      const requiresApproval = action.dry_run === 0;

      if (requiresApproval && !options.approve) {
        if (options.interactive) {
          // Interactive approval
          const approved = await promptForApproval(action);
          if (!approved) {
            actionsSkipped.push({
              id: action.id,
              type: action.type,
              reason: 'Rejected by user',
            });
            options.db.actions.update(action.id, { status: 'rejected' });
            continue;
          }
        } else {
          // Not approved, skip
          actionsSkipped.push({
            id: action.id,
            type: action.type,
            reason: 'Requires approval',
          });
          continue;
        }
      }

      // Execute the action
      try {
        const actionResult = await executeAction(options, action);
        
        options.db.actions.update(action.id, {
          status: 'executed',
          result: actionResult,
          executedAt: Date.now(),
        });

        actionsExecuted.push({
          id: action.id,
          type: action.type,
          result: actionResult,
          executedAt: Date.now(),
        });

        logger.info(`Action executed: ${action.type}`, {
          actionId: action.id,
          runId: result.runId,
        });
      } catch (error) {
        options.db.actions.update(action.id, {
          status: 'failed',
          result: { error: (error as Error).message },
        });

        actionsSkipped.push({
          id: action.id,
          type: action.type,
          reason: `Execution failed: ${(error as Error).message}`,
        });
      }
    }

    return {
      ...result,
      actionsExecuted,
      actionsSkipped,
    };
  } finally {
    await runner.shutdown();
  }
}

async function promptForApproval(action: { id: string; type: string; params: string | null }): Promise<boolean> {
  const params = action.params ? JSON.parse(action.params) : {};
  
  console.log('\n' + '─'.repeat(60));
  console.log(`Action requires approval:`);
  console.log(`  Type: ${action.type}`);
  console.log(`  ID: ${action.id}`);
  console.log(`  Params: ${JSON.stringify(params, null, 2)}`);
  console.log('─'.repeat(60));

  const answer = await inquirer.prompt([{
    type: 'confirm',
    name: 'approve',
    message: 'Approve this action?',
    default: false,
  }]);

  return answer.approve;
}

async function executeAction(
  options: AutopilotOptions,
  action: { type: string; params: string | null }
): Promise<unknown> {
  const params = action.params ? JSON.parse(action.params) : {};

  // In a real implementation, this would delegate to the execute plugin
  // For now, we return a mock result
  logger.debug(`Would execute action: ${action.type}`, params);

  return {
    executed: true,
    type: action.type,
    timestamp: Date.now(),
    dryRun: options.dryRun,
  };
}

/**
 * Safety wrapper that ensures autopilot never runs without proper authorization
 */
export function createSafeAutopilot(
  options: Omit<AutopilotOptions, 'approve'>
): {
  runDryRun: () => Promise<AutopilotResult>;
  runInteractive: () => Promise<AutopilotResult>;
  runWithApproval: (approvalToken: string) => Promise<AutopilotResult>;
} {
  return {
    // Safe: always dry run
    runDryRun: () => runAutopilot({ ...options, dryRun: true, approve: false }),
    
    // Safe: requires interactive approval for each action
    runInteractive: () => runAutopilot({ ...options, dryRun: false, interactive: true }),
    
    // Requires explicit approval token
    runWithApproval: (approvalToken: string) => {
      if (approvalToken !== 'I_UNDERSTAND_THE_RISKS') {
        throw new Error('Invalid approval token. Autopilot with auto-approve requires explicit acknowledgment.');
      }
      logger.warn('Autopilot running with auto-approve enabled!');
      return runAutopilot({ ...options, dryRun: false, approve: true });
    },
  };
}


