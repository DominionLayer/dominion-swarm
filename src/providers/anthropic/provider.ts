/**
 * Anthropic Provider Implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import { type ZodSchema } from 'zod';
import {
  LLMProvider,
  type LLMCompletionOptions,
  type LLMResponse,
  type LLMProviderConfig,
  zodToJsonSchema,
} from '../base.js';
import { logger } from '../../util/logger.js';

export interface AnthropicProviderConfig extends LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class AnthropicProvider extends LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
    });
  }

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    // Extract system message
    let systemMessage = '';
    const messages: Anthropic.MessageParam[] = [];

    for (const m of options.messages) {
      if (m.role === 'system') {
        systemMessage = m.content;
      } else {
        messages.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        });
      }
    }

    // Convert tools to Anthropic format
    const tools: Anthropic.Tool[] | undefined = options.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        system: systemMessage || undefined,
        messages,
        tools,
        temperature: options.temperature ?? this.config.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
        stop_sequences: options.stopSequences,
      });

      // Extract content and tool uses
      let content = '';
      const toolCalls: { name: string; arguments: Record<string, unknown> }[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        finishReason: response.stop_reason,
      };
    } catch (error) {
      logger.error('Anthropic completion failed', error as Error);
      throw error;
    }
  }

  async completeWithSchema<T>(
    options: LLMCompletionOptions,
    schema: ZodSchema<T>
  ): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema);
    
    // Add instruction for JSON output
    const messagesWithSchema = [...options.messages];
    const lastMessage = messagesWithSchema[messagesWithSchema.length - 1];
    
    if (lastMessage && lastMessage.role === 'user') {
      lastMessage.content += `\n\nRespond ONLY with a valid JSON object matching this schema. No other text:\n${JSON.stringify(jsonSchema, null, 2)}`;
    }

    const response = await this.complete({
      ...options,
      messages: messagesWithSchema,
    });

    try {
      // Extract JSON from response (Anthropic might add some text around it)
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = schema.parse(parsed);
      return validated;
    } catch (error) {
      logger.error('Failed to parse/validate Anthropic response', error as Error, {
        content: response.content,
      });
      throw new Error(`Invalid LLM response: ${(error as Error).message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple check - try to create a minimal message
      await this.client.messages.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10,
      });
      return true;
    } catch {
      return false;
    }
  }
}


