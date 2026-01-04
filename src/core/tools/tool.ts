/**
 * Tool - Typed capability that agents can execute
 */

import { z, type ZodSchema } from 'zod';
import { logger } from '../../util/logger.js';

export interface ToolContext {
  runId: string;
  agentId: string;
  taskId?: string;
  dryRun?: boolean;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  dangerous?: boolean;
  requiresApproval?: boolean;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

export class Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  readonly dangerous: boolean;
  readonly requiresApproval: boolean;
  
  private _executeFn: (input: TInput, context: ToolContext) => Promise<TOutput>;

  constructor(definition: ToolDefinition<TInput, TOutput>) {
    this.name = definition.name;
    this.description = definition.description;
    this.category = definition.category;
    this.inputSchema = definition.inputSchema;
    this.outputSchema = definition.outputSchema;
    this.dangerous = definition.dangerous ?? false;
    this.requiresApproval = definition.requiresApproval ?? definition.dangerous ?? false;
    this._executeFn = definition.execute;
  }

  async execute(input: unknown, context: ToolContext): Promise<TOutput> {
    // Validate input
    const inputResult = this.inputSchema.safeParse(input);
    if (!inputResult.success) {
      throw new Error(`Invalid tool input: ${inputResult.error.message}`);
    }

    logger.debug('Executing tool', {
      tool: this.name,
      runId: context.runId,
      agentId: context.agentId,
      taskId: context.taskId,
      dryRun: context.dryRun,
    });

    // Execute
    const output = await this._executeFn(inputResult.data, context);

    // Validate output
    const outputResult = this.outputSchema.safeParse(output);
    if (!outputResult.success) {
      throw new Error(`Invalid tool output: ${outputResult.error.message}`);
    }

    return outputResult.data;
  }

  validateInput(input: unknown): { valid: boolean; error?: string } {
    const result = this.inputSchema.safeParse(input);
    return result.success 
      ? { valid: true }
      : { valid: false, error: result.error.message };
  }

  validateOutput(output: unknown): { valid: boolean; error?: string } {
    const result = this.outputSchema.safeParse(output);
    return result.success
      ? { valid: true }
      : { valid: false, error: result.error.message };
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      dangerous: this.dangerous,
      requiresApproval: this.requiresApproval,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Tool Factory Helpers
// ─────────────────────────────────────────────────────────────

export function createTool<TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>
): Tool<TInput, TOutput> {
  return new Tool(definition);
}

// Common tool input/output schemas
export const VoidInputSchema = z.object({});
export const VoidOutputSchema = z.object({ success: z.boolean() });

export const StatusOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

export type VoidInput = z.infer<typeof VoidInputSchema>;
export type VoidOutput = z.infer<typeof VoidOutputSchema>;
export type StatusOutput = z.infer<typeof StatusOutputSchema>;

