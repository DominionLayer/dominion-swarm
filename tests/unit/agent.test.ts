/**
 * Agent Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent } from '../../src/core/agent/agent.js';
import { createTool } from '../../src/core/tools/tool.js';
import { z } from 'zod';

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      role: 'watcher',
      name: 'Test Watcher',
      description: 'A test watcher agent',
    });
  });

  describe('creation', () => {
    it('should create agent with correct properties', () => {
      expect(agent.role).toBe('watcher');
      expect(agent.name).toBe('Test Watcher');
      expect(agent.description).toBe('A test watcher agent');
      expect(agent.status).toBe('idle');
    });

    it('should accept custom ID', () => {
      const customAgent = new Agent({
        id: 'custom-id-123',
        role: 'analyst',
        name: 'Custom Agent',
      });
      expect(customAgent.id).toBe('custom-id-123');
    });
  });

  describe('status management', () => {
    it('should change status', () => {
      agent.setStatus('running');
      expect(agent.status).toBe('running');
      expect(agent.isActive()).toBe(true);
    });

    it('should check execution capability', () => {
      expect(agent.canExecute()).toBe(true);
      
      agent.setStatus('error');
      expect(agent.canExecute()).toBe(false);
    });
  });

  describe('tool management', () => {
    it('should register and retrieve tools', () => {
      const tool = createTool({
        name: 'test:tool',
        description: 'A test tool',
        category: 'test',
        inputSchema: z.object({ input: z.string() }),
        outputSchema: z.object({ output: z.string() }),
        execute: async (input) => ({ output: input.input }),
      });

      agent.registerTool(tool);
      
      expect(agent.hasTool('test:tool')).toBe(true);
      expect(agent.getTool('test:tool')).toBe(tool);
      expect(agent.toolNames).toContain('test:tool');
    });

    it('should unregister tools', () => {
      const tool = createTool({
        name: 'test:tool',
        description: 'A test tool',
        category: 'test',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        execute: async () => ({}),
      });

      agent.registerTool(tool);
      expect(agent.unregisterTool('test:tool')).toBe(true);
      expect(agent.hasTool('test:tool')).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const json = agent.toJSON();
      
      expect(json.id).toBe(agent.id);
      expect(json.role).toBe('watcher');
      expect(json.name).toBe('Test Watcher');
      expect(json.status).toBe('idle');
    });
  });
});


