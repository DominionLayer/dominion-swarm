/**
 * Analyze Command - Analyze observations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getConfig } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';
import { getDefaultProvider } from '../../providers/index.js';
import { AnalyzePlugin } from '../../plugins/analyze/plugin.js';
import { nanoid } from 'nanoid';

export const analyzeCommand = new Command('analyze')
  .description('Analyze observations')
  .option('-r, --run <runId>', 'Analyze observations from a specific run')
  .option('-l, --limit <count>', 'Maximum observations to analyze', '50')
  .option('-t, --threshold <score>', 'Only show findings above this score', '0')
  .action(async (options) => {
    const spinner = ora('Starting analysis...').start();

    try {
      const config = getConfig();
      const db = getDatabase({ path: config.database.path });
      const llm = getDefaultProvider();

      const plugin = new AnalyzePlugin(config, db, llm);
      await plugin.initialize();

      const runId = options.run || nanoid();

      spinner.text = 'Analyzing observations...';

      const result = await plugin.execute('analyze', {
        runId,
        dryRun: false,
        config,
        db,
        llm,
        logger: console as any,
      }, {
        runId: options.run,
        limit: parseInt(options.limit, 10),
      });

      spinner.stop();

      if (!result.success) {
        console.log(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }

      const data = result.data as any;
      const threshold = parseFloat(options.threshold);

      console.log();
      console.log(chalk.bold('Analysis Results'));
      console.log('─'.repeat(60));
      console.log();

      console.log(`Total Analyzed:    ${chalk.cyan(data.summary.total)}`);
      console.log(`Average Score:     ${chalk.cyan(data.summary.averageScore.toFixed(2))}`);
      console.log(`High Score Count:  ${chalk.yellow(data.summary.highScoreCount)}`);
      console.log();

      console.log(chalk.bold('Categories:'));
      for (const [category, count] of Object.entries(data.summary.categories)) {
        console.log(`  ${category}: ${count}`);
      }
      console.log();

      // Filter by threshold
      const filtered = data.analyses.filter((a: any) => a.score >= threshold);

      if (filtered.length > 0) {
        console.log(chalk.bold('Top Findings:'));
        console.log();

        const table = new Table({
          head: ['Score', 'Category', 'Confidence', 'Rationale'],
          style: { head: ['cyan'] },
          colWidths: [8, 15, 12, 45],
        });

        for (const analysis of filtered.slice(0, 15)) {
          const scoreColor = analysis.score >= 70 ? chalk.red : 
                            analysis.score >= 50 ? chalk.yellow : chalk.green;
          
          table.push([
            scoreColor(analysis.score.toFixed(0)),
            analysis.category,
            (analysis.confidence * 100).toFixed(0) + '%',
            analysis.rationale.slice(0, 42) + (analysis.rationale.length > 42 ? '...' : ''),
          ]);
        }

        console.log(table.toString());
      }

      await plugin.shutdown();
      db.close();
    } catch (error) {
      spinner.fail(`Analysis failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });


