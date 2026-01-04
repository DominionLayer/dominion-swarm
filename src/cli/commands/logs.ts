/**
 * Logs Command - View audit logs
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';

export const logsCommand = new Command('logs')
  .description('View audit logs')
  .option('-r, --run <runId>', 'Filter by run ID')
  .option('-l, --level <level>', 'Filter by level (debug, info, warn, error, critical)')
  .option('-n, --limit <count>', 'Number of logs to show', '50')
  .option('-f, --follow', 'Follow logs in real-time')
  .action(async (options) => {
    await viewLogs(options);
  });

async function viewLogs(options: { run?: string; level?: string; limit: string; follow?: boolean }): Promise<void> {
  try {
    const config = getConfig();
    const db = getDatabase({ path: config.database.path });

    const query: { runId?: string; level?: string; limit: number } = {
      limit: parseInt(options.limit, 10),
    };

    if (options.run) {
      query.runId = options.run;
    }

    if (options.level) {
      query.level = options.level;
    }

    const logs = db.auditLogs.query(query);

    console.log();
    console.log(chalk.bold('Audit Logs'));
    console.log('─'.repeat(100));
    console.log();

    if (logs.length === 0) {
      console.log(chalk.gray('No logs found'));
    } else {
      for (const log of logs.reverse()) {
        const timestamp = new Date(log.timestamp).toISOString().slice(11, 23);
        const level = getLevelColor(log.level);
        const context = [
          log.run_id ? `run:${log.run_id.slice(0, 6)}` : null,
          log.agent_id ? `agent:${log.agent_id.slice(0, 6)}` : null,
          log.task_id ? `task:${log.task_id.slice(0, 6)}` : null,
        ].filter(Boolean).join(' ');

        console.log(`${chalk.gray(timestamp)} ${level} ${chalk.bold(log.event)}`);
        console.log(`  ${log.message}`);
        if (context) {
          console.log(`  ${chalk.gray(context)}`);
        }
        if (log.data) {
          const data = JSON.parse(log.data);
          const dataStr = JSON.stringify(data).slice(0, 80);
          console.log(`  ${chalk.gray(dataStr)}${dataStr.length >= 80 ? '...' : ''}`);
        }
        console.log();
      }
    }

    // Show level counts
    const counts = db.auditLogs.countByLevel();
    console.log(chalk.bold('Summary:'));
    console.log(`  Debug: ${counts.debug || 0}, Info: ${counts.info || 0}, Warn: ${chalk.yellow(counts.warn || 0)}, Error: ${chalk.red(counts.error || 0)}, Critical: ${chalk.red(counts.critical || 0)}`);

    if (options.follow) {
      console.log();
      console.log(chalk.yellow('Following logs... (Ctrl+C to stop)'));
      
      let lastTimestamp = logs.length > 0 ? logs[0].timestamp : Date.now();
      
      const interval = setInterval(() => {
        const newLogs = db.auditLogs.query({
          ...query,
          startTime: lastTimestamp + 1,
        });

        for (const log of newLogs.reverse()) {
          const timestamp = new Date(log.timestamp).toISOString().slice(11, 23);
          const level = getLevelColor(log.level);
          console.log(`${chalk.gray(timestamp)} ${level} ${log.event}: ${log.message}`);
          lastTimestamp = Math.max(lastTimestamp, log.timestamp);
        }
      }, 1000);

      process.on('SIGINT', () => {
        clearInterval(interval);
        db.close();
        process.exit(0);
      });
    } else {
      db.close();
    }
  } catch (error) {
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'debug': return chalk.gray('[DEBUG]');
    case 'info': return chalk.blue('[INFO] ');
    case 'warn': return chalk.yellow('[WARN] ');
    case 'error': return chalk.red('[ERROR]');
    case 'critical': return chalk.bgRed.white('[CRIT] ');
    default: return chalk.gray(`[${level}]`);
  }
}


