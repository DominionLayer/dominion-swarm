/**
 * OpenAI Provider Implementation
 */

import OpenAI from 'openai';
import { z, type ZodSchema } from 'zod';
import {
  LLMProvider,
  type LLMCompletionOptions,
  type LLMResponse,
  type LLMProviderConfig,
  zodToJsonSchema,
} from '../base.js';
import { logger } from '../../util/logger.js';

export interface OpenAIProviderConfig extends LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
}

export class OpenAIProvider extends LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl,
      organization: config.organization,
    });
  }

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const tools: OpenAI.Chat.ChatCompletionTool[] | undefined = options.tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools,
        temperature: options.temperature ?? this.config.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
        stop: options.stopSequences,
        response_format: options.outputSchema ? { type: 'json_object' } : undefined,
      });

      const choice = response.choices[0];
      const message = choice?.message;

      const toolCalls = message?.tool_calls?.map((tc) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));

      return {
        content: message?.content || '',
        toolCalls,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        model: response.model,
        finishReason: choice?.finish_reason || null,
      };
    } catch (error) {
      logger.error('OpenAI completion failed', error as Error);
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
      lastMessage.content += `\n\nRespond with a valid JSON object matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`;
    }

    const response = await this.complete({
      ...options,
      messages: messagesWithSchema,
      outputSchema: schema,
    });

    try {
      const parsed = JSON.parse(response.content);
      const validated = schema.parse(parsed);
      return validated;
    } catch (error) {
      logger.error('Failed to parse/validate OpenAI response', error as Error, {
        content: response.content,
      });
      throw new Error(`Invalid LLM response: ${(error as Error).message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}


