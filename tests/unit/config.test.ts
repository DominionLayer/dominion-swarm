/**
 * Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, clearConfigCache, DominionConfigSchema } from '../../src/util/config.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Configuration', () => {
  const testConfigPath = path.join(process.cwd(), 'test-config.yaml');

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    clearConfigCache();
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should load default configuration when no file exists', () => {
    const config = loadConfig('nonexistent.yaml');
    
    expect(config.general.dryRun).toBe(true);
    expect(config.general.requireApproval).toBe(true);
    expect(config.llm.defaultProvider).toBe('stub');
  });

  it('should validate configuration schema', () => {
    const validConfig = {
      general: {
        name: 'test',
        environment: 'development',
        dryRun: true,
        requireApproval: true,
      },
      llm: {
        defaultProvider: 'stub',
      },
      database: {
        path: './data/test.db',
      },
    };

    const result = DominionConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid configuration', () => {
    const invalidConfig = {
      general: {
        environment: 'invalid_environment', // Invalid enum value
      },
    };

    const result = DominionConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should apply default values', () => {
    const minimalConfig = {};
    const result = DominionConfigSchema.safeParse(minimalConfig);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.general.dryRun).toBe(true);
      expect(result.data.infra.workers.concurrency).toBe(4);
    }
  });
});


