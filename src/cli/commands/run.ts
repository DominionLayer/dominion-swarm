/**
 * Run Command - Execute workflows
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';
import { getDefaultProvider } from '../../providers/index.js';
import { Orchestrator } from '../../core/orchestrator/orchestrator.js';

export const runCommand = new Command('run')
  .description('Run a workflow')
  .argument('<workflow>', 'Workflow to run (sentinel, operator, autopilot, or custom)')
  .option('--approve', 'Auto-approve all actions')
  .option('--no-dry-run', 'Execute actions for real')
  .action(async (workflow, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const spinner = ora(`Running workflow: ${workflow}`).start();

    try {
      const config = getConfig();
      
      // Check if workflow exists
      if (!config.workflows[workflow]) {
        const available = Object.keys(config.workflows).join(', ');
        spinner.fail(`Unknown workflow: ${workflow}`);
        console.log(`Available workflows: ${chalk.cyan(available)}`);
        process.exit(1);
      }

      spinner.text = 'Initializing...';
      
      const db = getDatabase({ path: config.database.path });
      const llm = getDefaultProvider();
      
      const orchestrator = new Orchestrator({
        config,
        db,
        llm,
        dryRun: globalOpts.dryRun !== false,
      });

      spinner.text = `Running ${workflow}...`;

      const result = await orchestrator.runWorkflow(workflow, {
        input: {
          approve: options.approve,
        },
      });

      spinner.stop();

      // Display results
      console.log();
      console.log(chalk.bold('─'.repeat(60)));
      console.log(chalk.bold(`Workflow: ${workflow}`));
      console.log(chalk.bold('─'.repeat(60)));
      console.log();

      console.log(`Run ID:     ${chalk.cyan(result.runId)}`);
      console.log(`Status:     ${getStatusColor(result.status)}`);
      console.log(`Duration:   ${chalk.yellow(result.duration + 'ms')}`);
      console.log();

      console.log(chalk.bold('Summary:'));
      console.log(`  Tasks:        ${result.summary.tasksCompleted}/${result.summary.tasksTotal} completed`);
      console.log(`  Observations: ${result.summary.observationsCount}`);
      console.log(`  Analyses:     ${result.summary.analysesCount}`);
      console.log(`  High Score:   ${result.summary.highScoreFindings} findings`);
      console.log(`  Actions:      ${result.summary.actionsExecuted}/${result.summary.actionsProposed} executed`);
      console.log();

      if (result.errors.length > 0) {
        console.log(chalk.red('Errors:'));
        for (const error of result.errors) {
          console.log(chalk.red(`  - ${error}`));
        }
        console.log();
      }

      console.log(`Reports saved to: ${chalk.cyan('./reports/' + result.runId + '.{json,md}')}`);

      db.close();
    } catch (error) {
      spinner.fail(`Workflow failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'cancelled':
      return chalk.yellow(status);
    default:
      return chalk.gray(status);
  }
}


