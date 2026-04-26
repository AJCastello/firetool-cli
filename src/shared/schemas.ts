import { z } from 'zod'

export const ServiceNameSchema = z.enum([
  'auth',
  'firestore',
  'rtdb',
  'storage',
  'functions',
  'pubsub',
  'rules',
])

export const EmulatorStatusSourceSchema = z.enum(['firebase.json', 'env', 'inferred'])

export const CommandTargetSchema = z.object({
  service: ServiceNameSchema,
  projectId: z.string().optional(),
  resourcePath: z.string().optional(),
  identifier: z.string().optional(),
})

export const FiretoolErrorCodeSchema = z.enum([
  'CONTEXT_NOT_FOUND',
  'SERVICE_NOT_CONFIGURED',
  'EMULATOR_NOT_RUNNING',
  'INVALID_INPUT',
  'CONFIRMATION_REQUIRED',
  'RULE_DENIED',
  'AMBIGUOUS_TARGET',
])

export const FiretoolErrorSchema = z.object({
  code: FiretoolErrorCodeSchema,
  message: z.string(),
  hint: z.string().optional(),
})

export const FiretoolResultSchema = z.object({
  ok: z.boolean(),
  operation: z.string(),
  target: CommandTargetSchema.optional(),
  result: z.unknown().optional(),
  warnings: z.array(z.string()),
  error: FiretoolErrorSchema.optional(),
})

export const EmulatorStatusSchema = z.object({
  service: ServiceNameSchema,
  configured: z.boolean(),
  running: z.boolean(),
  host: z.string().optional(),
  port: z.number().optional(),
  source: EmulatorStatusSourceSchema,
})

// Procedure input schemas

export const GetContextInputSchema = z.object({
  cwd: z.string(),
})

export const DescribeInputSchema = z.object({
  service: ServiceNameSchema.optional(),
})

export const ServiceExecuteInputSchema = z.object({
  action: z.string(),
  target: CommandTargetSchema,
  data: z.unknown().optional(),
  filePath: z.string().optional(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
})

export const AuthExecuteInputSchema = z.object({
  action: z.string(),
  target: CommandTargetSchema,
  data: z.unknown().optional(),
  force: z.boolean().optional(),
})

export const FunctionsCallInputSchema = z.object({
  nameOrUrl: z.string(),
  data: z.unknown().optional(),
})

export const PubSubPublishInputSchema = z.object({
  topic: z.string(),
  data: z.unknown(),
  attributes: z.record(z.string(), z.string()).optional(),
})

export const RulesCheckInputSchema = z.object({
  service: z.enum(['firestore', 'storage']),
  target: CommandTargetSchema,
  intent: z.string(),
  auth: z.unknown().optional(),
})
