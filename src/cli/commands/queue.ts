/**
 * Queue Command - Manage job queue
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';
import { getDefaultProvider } from '../../providers/index.js';
import { InfraPlugin } from '../../plugins/infra/plugin.js';

export const queueCommand = new Command('queue')
  .description('Manage job queue')
  .addCommand(
    new Command('list')
      .description('List jobs in the queue')
      .option('-s, --status <status>', 'Filter by status')
      .option('-l, --limit <count>', 'Limit results', '20')
      .action(async (options) => {
        await listQueue(options);
      })
  )
  .addCommand(
    new Command('add')
      .description('Add a job to the queue')
      .argument('<type>', 'Job type')
      .option('-p, --payload <json>', 'Job payload as JSON')
      .option('--priority <n>', 'Job priority', '0')
      .action(async (type, options) => {
        await addToQueue(type, options);
      })
  )
  .addCommand(
    new Command('process')
      .description('Process jobs from the queue')
      .option('-l, --limit <count>', 'Maximum jobs to process', '10')
      .action(async (options) => {
        await processQueue(options);
      })
  )
  .addCommand(
    new Command('stats')
      .description('Show queue statistics')
      .action(async () => {
        await showQueueStats();
      })
  );

async function listQueue(options: { status?: string; limit: string }): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    let jobs;
    if (options.status) {
      jobs = db.jobQueue.findByStatus(options.status);
    } else {
      jobs = db.jobQueue.getAll(parseInt(options.limit, 10));
    }

    console.log();
    console.log(chalk.bold('Job Queue'));
    console.log('─'.repeat(60));
    console.log();

    if (jobs.length === 0) {
      console.log(chalk.gray('Queue is empty'));
    } else {
      const table = new Table({
        head: ['ID', 'Type', 'Status', 'Priority', 'Attempts', 'Created'],
        style: { head: ['cyan'] },
      });

      for (const job of jobs) {
        table.push([
          job.id.slice(0, 8),
          job.type,
          getStatusColor(job.status),
          job.priority.toString(),
          `${job.attempts}/${job.max_attempts}`,
          new Date(job.created_at).toISOString().slice(0, 16),
        ]);
      }

      console.log(table.toString());
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function addToQueue(type: string, options: { payload?: string; priority: string }): Promise<void> {
  const spinner = ora('Adding job to queue...').start();

  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new InfraPlugin(config, db, llm);
    await plugin.initialize();

    const payload = options.payload ? JSON.parse(options.payload) : undefined;

    const result = await plugin.execute('enqueue', {
      runId: 'cli',
      dryRun: false,
      config,
      db,
      llm,
      logger: console as any,
    }, {
      type,
      payload,
      priority: parseInt(options.priority, 10),
    });

    spinner.stop();

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const data = result.data as any;
    console.log(chalk.green(`[OK] Job added: ${chalk.cyan(data.jobId)}`));

    await plugin.shutdown();
    db.close();
  } catch (error) {
    spinner.fail(`Failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function processQueue(options: { limit: string }): Promise<void> {
  const spinner = ora('Processing queue...').start();

  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new InfraPlugin(config, db, llm);
    await plugin.initialize();

    const result = await plugin.execute('process', {
      runId: 'cli',
      dryRun: false,
      config,
      db,
      llm,
      logger: console as any,
    }, {
      limit: parseInt(options.limit, 10),
    });

    spinner.stop();

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const data = result.data as any;
    console.log();
    console.log(`Processed: ${chalk.cyan(data.processed)}`);
    console.log(`Succeeded: ${chalk.green(data.succeeded)}`);
    console.log(`Failed:    ${chalk.red(data.failed)}`);

    await plugin.shutdown();
    db.close();
  } catch (error) {
    spinner.fail(`Failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function showQueueStats(): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });
    const llm = getDefaultProvider();

    const plugin = new InfraPlugin(config, db, llm);
    await plugin.initialize();

    const result = await plugin.execute('stats', {
      runId: 'cli',
      dryRun: false,
      config,
      db,
      llm,
      logger: console as any,
    }, {});

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    const data = result.data as any;

    console.log();
    console.log(chalk.bold('Queue Statistics'));
    console.log('─'.repeat(40));
    console.log(`Pending:        ${chalk.yellow(data.pending)}`);
    console.log(`Processing:     ${chalk.blue(data.processing)}`);
    console.log(`Completed:      ${chalk.green(data.completed)}`);
    console.log(`Failed:         ${chalk.red(data.failed)}`);
    console.log(`Scheduled Jobs: ${chalk.cyan(data.scheduledJobs)}`);

    await plugin.shutdown();
    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending': return chalk.yellow(status);
    case 'processing': return chalk.blue(status);
    case 'completed': return chalk.green(status);
    case 'failed': return chalk.red(status);
    default: return chalk.gray(status);
  }
}


