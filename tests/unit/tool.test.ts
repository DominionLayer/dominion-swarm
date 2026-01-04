/**
 * Tool Tests
 */

import { describe, it, expect } from 'vitest';
import { Tool, createTool } from '../../src/core/tools/tool.js';
import { z } from 'zod';

describe('Tool', () => {
  const InputSchema = z.object({
    value: z.number(),
    multiplier: z.number().optional().default(1),
  });

  const OutputSchema = z.object({
    result: z.number(),
  });

  const testTool = createTool({
    name: 'math:multiply',
    description: 'Multiplies a value',
    category: 'math',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    execute: async (input) => ({ result: input.value * input.multiplier }),
  });

  describe('creation', () => {
    it('should create tool with correct properties', () => {
      expect(testTool.name).toBe('math:multiply');
      expect(testTool.description).toBe('Multiplies a value');
      expect(testTool.category).toBe('math');
      expect(testTool.dangerous).toBe(false);
      expect(testTool.requiresApproval).toBe(false);
    });

    it('should mark dangerous tools', () => {
      const dangerousTool = createTool({
        name: 'danger:action',
        description: 'A dangerous action',
        category: 'danger',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        dangerous: true,
        execute: async () => ({}),
      });

      expect(dangerousTool.dangerous).toBe(true);
      expect(dangerousTool.requiresApproval).toBe(true);
    });
  });

  describe('execution', () => {
    it('should execute with valid input', async () => {
      const result = await testTool.execute(
        { value: 5, multiplier: 3 },
        { runId: 'test', agentId: 'agent1' }
      );
      
      expect(result).toEqual({ result: 15 });
    });

    it('should apply default values', async () => {
      const result = await testTool.execute(
        { value: 10 },
        { runId: 'test', agentId: 'agent1' }
      );
      
      expect(result).toEqual({ result: 10 });
    });

    it('should reject invalid input', async () => {
      await expect(
        testTool.execute(
          { value: 'not a number' },
          { runId: 'test', agentId: 'agent1' }
        )
      ).rejects.toThrow('Invalid tool input');
    });
  });

  describe('validation', () => {
    it('should validate input', () => {
      expect(testTool.validateInput({ value: 5 }).valid).toBe(true);
      expect(testTool.validateInput({ value: 'string' }).valid).toBe(false);
    });

    it('should validate output', () => {
      expect(testTool.validateOutput({ result: 10 }).valid).toBe(true);
      expect(testTool.validateOutput({ result: 'string' }).valid).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const json = testTool.toJSON();
      
      expect(json.name).toBe('math:multiply');
      expect(json.category).toBe('math');
      expect(json.dangerous).toBe(false);
    });
  });
});


