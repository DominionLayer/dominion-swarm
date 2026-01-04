/**
 * Init Command - Initialize Dominion configuration and database
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { generateDefaultConfig, generateEnvExample } from '../../util/config.js';
import { getDatabase } from '../../db/database.js';

export const initCommand = new Command('init')
  .description('Initialize Dominion configuration and database')
  .option('-f, --force', 'Overwrite existing files')
  .option('--db-only', 'Only initialize the database')
  .option('--config-only', 'Only generate config files')
  .action(async (options) => {
    const spinner = ora('Initializing Dominion...').start();

    try {
      const basePath = process.cwd();

      if (!options.dbOnly) {
        // Generate config file
        const configPath = path.join(basePath, 'dominion.config.yaml');
        if (fs.existsSync(configPath) && !options.force) {
          spinner.info('Config file already exists (use --force to overwrite)');
        } else {
          fs.writeFileSync(configPath, generateDefaultConfig());
          spinner.succeed(`Created ${chalk.cyan('dominion.config.yaml')}`);
        }

        // Generate .env.example
        const envPath = path.join(basePath, '.env.example');
        if (fs.existsSync(envPath) && !options.force) {
          spinner.info('.env.example already exists');
        } else {
          fs.writeFileSync(envPath, generateEnvExample());
          spinner.succeed(`Created ${chalk.cyan('.env.example')}`);
        }

        // Create directories
        const dirs = ['data', 'reports', 'logs'];
        for (const dir of dirs) {
          const dirPath = path.join(basePath, dir);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            spinner.succeed(`Created ${chalk.cyan(dir + '/')} directory`);
          }
        }
      }

      if (!options.configOnly) {
        // Initialize database
        spinner.text = 'Initializing database...';
        const dbPath = path.join(basePath, 'data', 'dominion.db');
        const db = getDatabase({ path: dbPath });
        spinner.succeed(`Initialized database at ${chalk.cyan(dbPath)}`);
        db.close();
      }

      console.log();
      console.log(chalk.green('✓ Dominion initialized successfully!'));
      console.log();
      console.log('Next steps:');
      console.log(`  1. Copy ${chalk.cyan('.env.example')} to ${chalk.cyan('.env')} and add your API keys`);
      console.log(`  2. Edit ${chalk.cyan('dominion.config.yaml')} to configure your setup`);
      console.log(`  3. Run ${chalk.cyan('dominion doctor')} to validate your configuration`);
      console.log(`  4. Run ${chalk.cyan('dominion run sentinel')} to start monitoring`);
    } catch (error) {
      spinner.fail(`Initialization failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });


