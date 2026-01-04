/**
 * Execute Command - Execute actions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';
import { getDefaultProvider } from '../../providers/index.js';
import { ExecutePlugin } from '../../plugins/execute/plugin.js';
import { nanoid } from 'nanoid';

export const executeCommand = new Command('execute')
  .description('Execute actions')
  .addCommand(
    new Command('report')
      .description('Generate a report for a run')
      .argument('<runId>', 'Run ID to generate report for')
      .option('-f, --format <format>', 'Output format (json, markdown, both)', 'both')
      .action(async (runId, options) => {
        await executeReport(runId, options.format);
      })
  )
  .addCommand(
    new Command('webhook')
      .description('Send a webhook')
      .argument('<url>', 'Webhook URL')
      .option('-d, --data <json>', 'JSON data to send')
      .option('--approve', 'Skip confirmation')
      .action(async (url, options, cmd) => {
        const globalOpts = cmd.optsWithGlobals();
        await executeWebhook(url, options.data, options.approve, globalOpts.dryRun);
      })
  )
  .addCommand(
    new Command('pending')
      .description('List pending actions')
      .action(async () => {
        await listPendingActions();
      })
  )
  .addCommand(
    new Command('approve')
      .description('Approve a pending action')
      .argument('<actionId>', 'Action ID to approve')
      .action(async (actionId) => {
        await approveAction(actionId);
      })
  );

async function executeReport(runId: string, format: string): Promise<void> {
  const spinner = ora('Generating report...').start();

  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new ExecutePlugin(config, db, llm);
    await plugin.initialize();

    const result = await plugin.execute('report', {
      runId: nanoid(),
      dryRun: false,
      config,
      db,
      llm,
      logger: console as any,
    }, {
      runId,
      format,
    });

    spinner.stop();

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const data = result.data as any;

    console.log();
    console.log(chalk.green('[OK] Report generated successfully'));
    console.log();
    console.log('Files created:');
    for (const file of data.files) {
      console.log(`  ${chalk.cyan(file)}`);
    }

    await plugin.shutdown();
    db.close();
  } catch (error) {
    spinner.fail(`Report generation failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function executeWebhook(url: string, data: string | undefined, approve: boolean, dryRun: boolean): Promise<void> {
  if (!approve && !dryRun) {
    const answer = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Send webhook to ${url}?`,
      default: false,
    }]);

    if (!answer.confirm) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
  }

  const spinner = ora('Sending webhook...').start();

  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new ExecutePlugin(config, db, llm);
    await plugin.initialize();

    const body = data ? JSON.parse(data) : undefined;

    const result = await plugin.execute('webhook', {
      runId: nanoid(),
      dryRun,
      config,
      db,
      llm,
      logger: console as any,
    }, {
      url,
      method: 'POST',
      body,
    });

    spinner.stop();

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const response = result.data as any;

    if (response.dryRun) {
      console.log(chalk.yellow('DRY RUN: Would send webhook to ') + chalk.cyan(url));
    } else {
      console.log(chalk.green(`[OK] Webhook sent successfully (status: ${response.statusCode})`));
    }

    await plugin.shutdown();
    db.close();
  } catch (error) {
    spinner.fail(`Webhook failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function listPendingActions(): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    const actions = db.actions.findPendingApproval();

    console.log();
    console.log(chalk.bold('Pending Actions'));
    console.log('─'.repeat(60));
    console.log();

    if (actions.length === 0) {
      console.log(chalk.gray('No pending actions'));
    } else {
      for (const action of actions) {
        const params = action.params ? JSON.parse(action.params) : {};
        console.log(`ID:     ${chalk.cyan(action.id)}`);
        console.log(`Type:   ${action.type}`);
        console.log(`Params: ${JSON.stringify(params).slice(0, 60)}`);
        console.log();
      }
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function approveAction(actionId: string): Promise<void> {
  const spinner = ora('Approving action...').start();

  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    const action = db.actions.getById(actionId);
    if (!action) {
      spinner.fail(`Action not found: ${actionId}`);
      process.exit(1);
    }

    db.approvals.create({
      actionId,
      userId: 'cli-user',
      decision: 'approved',
      reason: 'Approved via CLI',
    });

    db.actions.update(actionId, {
      status: 'approved',
      approvedBy: 'cli-user',
      approvedAt: Date.now(),
    });

    spinner.succeed(`Action ${chalk.cyan(actionId)} approved`);

    db.close();
  } catch (error) {
    spinner.fail(`Approval failed: ${(error as Error).message}`);
    process.exit(1);
  }
}


