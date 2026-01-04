/**
 * Market Command - Marketplace operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';

export const marketCommand = new Command('market')
  .description('Marketplace operations')
  .addCommand(
    new Command('jobs')
      .description('List marketplace jobs')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        await listJobs(options);
      })
  )
  .addCommand(
    new Command('stats')
      .description('Show marketplace statistics')
      .action(async () => {
        await showMarketStats();
      })
  )
  .addCommand(
    new Command('accounts')
      .description('List market accounts')
      .action(async () => {
        await listAccounts();
      })
  );

async function listJobs(options: { status?: string }): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    let jobs;
    if (options.status) {
      jobs = db.market.findJobsByStatus(options.status);
    } else {
      jobs = db.market.getAll();
    }

    console.log();
    console.log(chalk.bold('Marketplace Jobs'));
    console.log('─'.repeat(80));
    console.log();

    if (jobs.length === 0) {
      console.log(chalk.gray('No jobs found'));
    } else {
      const table = new Table({
        head: ['ID', 'Title', 'Budget', 'Status', 'Buyer', 'Provider'],
        style: { head: ['cyan'] },
      });

      for (const job of jobs) {
        table.push([
          job.id.slice(0, 8),
          job.title.slice(0, 20),
          `$${job.budget.toFixed(2)}`,
          getStatusColor(job.status),
          job.buyer_id.slice(0, 8),
          job.provider_id?.slice(0, 8) || '-',
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

async function showMarketStats(): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    const allJobs = db.market.getAll();
    const openJobs = db.market.findJobsByStatus('open').length + 
                     db.market.findJobsByStatus('bidding').length;
    const completedJobs = db.market.findJobsByStatus('completed').length;
    const totalVolume = allJobs.reduce((sum, job) => sum + job.budget, 0);

    console.log();
    console.log(chalk.bold('Market Statistics'));
    console.log('─'.repeat(40));
    console.log(`Total Jobs:     ${chalk.cyan(allJobs.length)}`);
    console.log(`Open Jobs:      ${chalk.yellow(openJobs)}`);
    console.log(`Completed Jobs: ${chalk.green(completedJobs)}`);
    console.log(`Total Volume:   ${chalk.cyan('$' + totalVolume.toFixed(2))}`);
    console.log(`Avg Job Size:   ${chalk.cyan('$' + (allJobs.length ? (totalVolume / allJobs.length).toFixed(2) : '0.00'))}`);

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function listAccounts(): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    // Get unique entity IDs from jobs
    const jobs = db.market.getAll();
    const entityIds = new Set<string>();
    for (const job of jobs) {
      entityIds.add(job.buyer_id);
      if (job.provider_id) entityIds.add(job.provider_id);
    }

    console.log();
    console.log(chalk.bold('Market Accounts'));
    console.log('─'.repeat(60));
    console.log();

    if (entityIds.size === 0) {
      console.log(chalk.gray('No accounts found'));
    } else {
      const table = new Table({
        head: ['Entity ID', 'Balance', 'Escrow', 'Reputation'],
        style: { head: ['cyan'] },
      });

      for (const entityId of entityIds) {
        const account = db.market.getAccount(entityId);
        if (account) {
          table.push([
            entityId.slice(0, 16),
            `$${account.balance.toFixed(2)}`,
            `$${account.escrow_held.toFixed(2)}`,
            getReputationColor(account.reputation),
          ]);
        }
      }

      console.log(table.toString());
    }

    db.close();
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'open': return chalk.green(status);
    case 'bidding': return chalk.yellow(status);
    case 'assigned': return chalk.blue(status);
    case 'completed': return chalk.green(status);
    case 'disputed': return chalk.red(status);
    default: return chalk.gray(status);
  }
}

function getReputationColor(reputation: number): string {
  if (reputation >= 80) return chalk.green(reputation.toFixed(0));
  if (reputation >= 50) return chalk.yellow(reputation.toFixed(0));
  return chalk.red(reputation.toFixed(0));
}


