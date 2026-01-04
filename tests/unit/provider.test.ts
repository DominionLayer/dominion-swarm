/**
 * LLM Provider Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StubProvider } from '../../src/providers/stub/provider.js';
import { z } from 'zod';

describe('StubProvider', () => {
  let provider: StubProvider;

  beforeEach(() => {
    provider = new StubProvider({
      model: 'stub-1.0',
      deterministic: true,
    });
  });

  describe('completion', () => {
    it('should complete messages', async () => {
      const response = await provider.complete({
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(response.content).toBeDefined();
      expect(response.model).toBe('stub-1.0');
      expect(response.finishReason).toBe('stop');
      expect(response.usage).toBeDefined();
    });

    it('should return deterministic responses when configured', async () => {
      const response1 = await provider.complete({
        messages: [{ role: 'user', content: 'analyze this' }],
      });

      const response2 = await provider.complete({
        messages: [{ role: 'user', content: 'analyze this' }],
      });

      expect(response1.content).toBe(response2.content);
    });
  });

  describe('structured output', () => {
    it('should complete with schema', async () => {
      const schema = z.object({
        category: z.string(),
        score: z.number(),
        confidence: z.number(),
        rationale: z.string(),
      });

      const result = await provider.completeWithSchema({
        messages: [{ role: 'user', content: 'analyze some data' }],
      }, schema);

      expect(result.category).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(result.rationale).toBeDefined();
    });
  });

  describe('availability', () => {
    it('should always be available', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe('custom responses', () => {
    it('should return custom response for matching prompt', async () => {
      provider.setResponse('custom-key', JSON.stringify({ custom: 'response' }));

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'This contains custom-key in it' }],
      });

      expect(response.content).toContain('custom');
    });
  });

  describe('tool calls', () => {
    it('should return tool calls when tools provided', async () => {
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Use a tool' }],
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0].name).toBe('test_tool');
    });
  });
});


