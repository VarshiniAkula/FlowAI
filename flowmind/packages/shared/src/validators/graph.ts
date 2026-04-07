import { z } from 'zod';
import { NODE_TYPES } from '../constants/node-types';

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const ConditionExpressionSchema: z.ZodType = z.lazy(() =>
  z.object({
    field: z.string(),
    operator: z.enum([
      'eq',
      'neq',
      'gt',
      'lt',
      'gte',
      'lte',
      'contains',
      'exists',
      'matches',
    ]),
    value: z.unknown(),
    logic: z.enum(['and', 'or']).optional(),
    children: z.array(ConditionExpressionSchema).optional(),
  }),
);

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(NODE_TYPES),
  position: PositionSchema,
  data: z.record(z.string(), z.unknown()),
  label: z.string(),
  description: z.string().optional(),
  group: z.string().optional(),
});

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  condition: ConditionExpressionSchema.optional(),
});

export const GraphVariableSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  scope: z.enum(['session', 'turn', 'profile']),
});

export const GraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  variables: z.array(GraphVariableSchema),
});
