/**
 * Zod schemas for Dominion data structures
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Base Schemas
// ─────────────────────────────────────────────────────────────

export const UUIDSchema = z.string().uuid();
export const TimestampSchema = z.number().int().positive();
export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const HashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

// ─────────────────────────────────────────────────────────────
// Agent Schemas
// ─────────────────────────────────────────────────────────────

export const AgentRoleSchema = z.enum([
  'watcher',
  'analyst',
  'executor',
  'coordinator',
  'auditor',
  'governor',
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentStatusSchema = z.enum([
  'idle',
  'running',
  'paused',
  'error',
  'terminated',
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSchema = z.object({
  id: UUIDSchema,
  role: AgentRoleSchema,
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  tools: z.array(z.string()),
  policy: z.record(z.unknown()).optional(),
  status: AgentStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Agent = z.infer<typeof AgentSchema>;

// ─────────────────────────────────────────────────────────────
// Task Schemas
// ─────────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum([
  'pending',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSchema = z.object({
  id: UUIDSchema,
  runId: UUIDSchema,
  parentId: UUIDSchema.nullable(),
  agentId: UUIDSchema.nullable(),
  type: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  retries: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
});

export type Task = z.infer<typeof TaskSchema>;

// ─────────────────────────────────────────────────────────────
// Run Schemas
// ─────────────────────────────────────────────────────────────

export const RunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSchema = z.object({
  id: UUIDSchema,
  workflowId: z.string(),
  status: RunStatusSchema,
  config: z.record(z.unknown()),
  summary: z.record(z.unknown()).nullable(),
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
});

export type Run = z.infer<typeof RunSchema>;

// ─────────────────────────────────────────────────────────────
// Observation Schemas
// ─────────────────────────────────────────────────────────────

export const ObservationTypeSchema = z.enum([
  'block',
  'transaction',
  'event',
  'contract_call',
]);

export type ObservationType = z.infer<typeof ObservationTypeSchema>;

export const ObservationSchema = z.object({
  id: UUIDSchema,
  runId: UUIDSchema,
  type: ObservationTypeSchema,
  source: z.string(),
  data: z.record(z.unknown()),
  blockNumber: z.number().int().nonnegative().nullable(),
  transactionHash: HashSchema.nullable(),
  timestamp: TimestampSchema,
  createdAt: TimestampSchema,
});

export type Observation = z.infer<typeof ObservationSchema>;

// ─────────────────────────────────────────────────────────────
// Analysis Schemas
// ─────────────────────────────────────────────────────────────

export const AnalysisSchema = z.object({
  id: UUIDSchema,
  runId: UUIDSchema,
  observationId: UUIDSchema,
  agentId: UUIDSchema,
  category: z.string(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: TimestampSchema,
});

export type Analysis = z.infer<typeof AnalysisSchema>;

// ─────────────────────────────────────────────────────────────
// Action Schemas
// ─────────────────────────────────────────────────────────────

export const ActionTypeSchema = z.enum([
  'webhook',
  'file_write',
  'evm_transaction',
  'notification',
  'report',
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
  'executed',
  'failed',
  'vetoed',
]);

export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const ActionSchema = z.object({
  id: UUIDSchema,
  runId: UUIDSchema,
  taskId: UUIDSchema,
  agentId: UUIDSchema,
  type: ActionTypeSchema,
  status: ActionStatusSchema,
  params: z.record(z.unknown()),
  result: z.record(z.unknown()).nullable(),
  dryRun: z.boolean(),
  approvedBy: UUIDSchema.nullable(),
  approvedAt: TimestampSchema.nullable(),
  executedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});

export type Action = z.infer<typeof ActionSchema>;

// ─────────────────────────────────────────────────────────────
// Approval Schemas
// ─────────────────────────────────────────────────────────────

export const ApprovalDecisionSchema = z.enum([
  'approved',
  'rejected',
  'vetoed',
]);

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalSchema = z.object({
  id: UUIDSchema,
  actionId: UUIDSchema,
  agentId: UUIDSchema.nullable(),
  userId: z.string().nullable(),
  decision: ApprovalDecisionSchema,
  reason: z.string().nullable(),
  createdAt: TimestampSchema,
});

export type Approval = z.infer<typeof ApprovalSchema>;

// ─────────────────────────────────────────────────────────────
// Audit Log Schemas
// ─────────────────────────────────────────────────────────────

export const AuditLogLevelSchema = z.enum([
  'debug',
  'info',
  'warn',
  'error',
  'critical',
]);

export type AuditLogLevel = z.infer<typeof AuditLogLevelSchema>;

export const AuditLogSchema = z.object({
  id: UUIDSchema,
  runId: UUIDSchema.nullable(),
  agentId: UUIDSchema.nullable(),
  taskId: UUIDSchema.nullable(),
  level: AuditLogLevelSchema,
  event: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).nullable(),
  timestamp: TimestampSchema,
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// ─────────────────────────────────────────────────────────────
// Memory Schemas
// ─────────────────────────────────────────────────────────────

export const MemoryTypeSchema = z.enum([
  'short_term',
  'long_term',
  'episodic',
  'semantic',
]);

export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemorySchema = z.object({
  id: UUIDSchema,
  agentId: UUIDSchema,
  type: MemoryTypeSchema,
  key: z.string(),
  value: z.unknown(),
  importance: z.number().min(0).max(1),
  expiresAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  accessedAt: TimestampSchema,
});

export type Memory = z.infer<typeof MemorySchema>;

// ─────────────────────────────────────────────────────────────
// Score Schemas
// ─────────────────────────────────────────────────────────────

export const ScoreSchema = z.object({
  id: UUIDSchema,
  agentId: UUIDSchema,
  metric: z.string(),
  value: z.number(),
  context: z.record(z.unknown()).nullable(),
  createdAt: TimestampSchema,
});

export type Score = z.infer<typeof ScoreSchema>;

// ─────────────────────────────────────────────────────────────
// Decision Schemas
// ─────────────────────────────────────────────────────────────

export const DecisionSchema = z.object({
  id: UUIDSchema,
  runId: UUIDSchema,
  agentId: UUIDSchema,
  type: z.string(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: TimestampSchema,
});

export type Decision = z.infer<typeof DecisionSchema>;

// ─────────────────────────────────────────────────────────────
// Market Schemas
// ─────────────────────────────────────────────────────────────

export const JobStatusSchema = z.enum([
  'open',
  'bidding',
  'assigned',
  'in_progress',
  'completed',
  'disputed',
  'cancelled',
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const MarketJobSchema = z.object({
  id: UUIDSchema,
  title: z.string(),
  description: z.string(),
  buyerId: z.string(),
  providerId: z.string().nullable(),
  status: JobStatusSchema,
  budget: z.number().nonnegative(),
  escrow: z.number().nonnegative(),
  deadline: TimestampSchema.nullable(),
  slaTerms: z.record(z.unknown()).nullable(),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});

export type MarketJob = z.infer<typeof MarketJobSchema>;

export const BidSchema = z.object({
  id: UUIDSchema,
  jobId: UUIDSchema,
  providerId: z.string(),
  amount: z.number().nonnegative(),
  proposal: z.string(),
  eta: TimestampSchema.nullable(),
  status: z.enum(['pending', 'accepted', 'rejected', 'withdrawn']),
  createdAt: TimestampSchema,
});

export type Bid = z.infer<typeof BidSchema>;

// ─────────────────────────────────────────────────────────────
// Governance Schemas
// ─────────────────────────────────────────────────────────────

export const ProposalStatusSchema = z.enum([
  'draft',
  'discussion',
  'voting',
  'passed',
  'rejected',
  'executed',
  'expired',
]);

export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalSchema = z.object({
  id: UUIDSchema,
  title: z.string(),
  description: z.string(),
  authorId: z.string(),
  status: ProposalStatusSchema,
  category: z.string(),
  actions: z.array(z.record(z.unknown())),
  discussionSummary: z.string().nullable(),
  votesFor: z.number().int().nonnegative(),
  votesAgainst: z.number().int().nonnegative(),
  votesAbstain: z.number().int().nonnegative(),
  quorumRequired: z.number().int().nonnegative(),
  discussionEndAt: TimestampSchema.nullable(),
  votingEndAt: TimestampSchema.nullable(),
  executedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});

export type Proposal = z.infer<typeof ProposalSchema>;

export const VoteSchema = z.object({
  id: UUIDSchema,
  proposalId: UUIDSchema,
  voterId: z.string(),
  choice: z.enum(['for', 'against', 'abstain']),
  weight: z.number().nonnegative(),
  reason: z.string().nullable(),
  createdAt: TimestampSchema,
});

export type Vote = z.infer<typeof VoteSchema>;

// ─────────────────────────────────────────────────────────────
// LLM Schemas
// ─────────────────────────────────────────────────────────────

export const LLMResponseSchema = z.object({
  content: z.string(),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  model: z.string(),
  finishReason: z.string().nullable(),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export const AnalysisOutputSchema = z.object({
  category: z.string(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggestedActions: z.array(z.string()).optional(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

// ─────────────────────────────────────────────────────────────
// Config Schemas
// ─────────────────────────────────────────────────────────────

export const LLMProviderConfigSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.1),
  maxTokens: z.number().int().positive().default(4096),
});

export const ConfigSchema = z.object({
  general: z.object({
    name: z.string(),
    environment: z.enum(['development', 'staging', 'production']),
    dryRun: z.boolean().default(true),
    requireApproval: z.boolean().default(true),
  }),
  llm: z.object({
    defaultProvider: z.enum(['openai', 'anthropic', 'stub']),
    openai: LLMProviderConfigSchema.optional(),
    anthropic: LLMProviderConfigSchema.optional(),
    stub: z.object({ deterministic: z.boolean() }).optional(),
  }),
  database: z.object({
    path: z.string(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'pretty']),
    file: z.string().optional(),
  }),
  rateLimits: z.object({
    rpcPerSecond: z.number().int().positive(),
    llmPerMinute: z.number().int().positive(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

