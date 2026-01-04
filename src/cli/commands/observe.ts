/**
 * Observe Command - Watch blockchain activity
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';
import { getDefaultProvider } from '../../providers/index.js';
import { ObservePlugin } from '../../plugins/observe/plugin.js';
import { nanoid } from 'nanoid';

export const observeCommand = new Command('observe')
  .description('Watch blockchain activity')
  .option('-b, --blocks <count>', 'Number of blocks to watch', '10')
  .option('-a, --addresses <addresses>', 'Comma-separated addresses to watch')
  .option('-e, --events', 'Watch contract events')
  .action(async (options) => {
    const spinner = ora('Starting observer...').start();

    try {
      const config = getConfig();
      const db = getDatabase({ path: config.database.path });
      const llm = getDefaultProvider();

      const plugin = new ObservePlugin(config, db, llm);
      await plugin.initialize();

      const runId = nanoid();
      const blockCount = parseInt(options.blocks, 10);

      spinner.text = `Watching ${blockCount} blocks...`;

      let result;
      if (options.events) {
        result = await plugin.execute('watch_events', {
          runId,
          dryRun: false,
          config,
          db,
          llm,
          logger: console as any,
        }, {
          blockCount,
        });
      } else if (options.addresses) {
        result = await plugin.execute('watch_addresses', {
          runId,
          dryRun: false,
          config,
          db,
          llm,
          logger: console as any,
        }, {
          addresses: options.addresses.split(','),
          blockCount,
        });
      } else {
        result = await plugin.execute('watch_blocks', {
          runId,
          dryRun: false,
          config,
          db,
          llm,
          logger: console as any,
        }, {
          blockCount,
        });
      }

      spinner.stop();

      if (!result.success) {
        console.log(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }

      const data = result.data as any;

      console.log();
      console.log(chalk.bold('Observation Results'));
      console.log('─'.repeat(60));
      console.log();

      console.log(`Blocks Processed: ${chalk.cyan(data.summary.blocksProcessed)}`);
      console.log(`Observations:     ${chalk.cyan(data.summary.observationsCreated)}`);
      console.log();

      if (data.observations.length > 0) {
        const table = new Table({
          head: ['Type', 'Block', 'Hash/Details', 'Timestamp'],
          style: { head: ['cyan'] },
        });

        for (const obs of data.observations.slice(0, 20)) {
          table.push([
            obs.type,
            obs.blockNumber?.toString() || '-',
            obs.transactionHash?.slice(0, 16) + '...' || JSON.stringify(obs.data).slice(0, 30),
            new Date(obs.timestamp).toISOString().slice(11, 19),
          ]);
        }

        console.log(table.toString());

        if (data.observations.length > 20) {
          console.log(chalk.gray(`... and ${data.observations.length - 20} more`));
        }
      }

      await plugin.shutdown();
      db.close();
    } catch (error) {
      spinner.fail(`Observation failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });


