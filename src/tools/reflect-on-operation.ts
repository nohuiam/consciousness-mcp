import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { ReflectionResult, Operation } from '../types.js';

export const ReflectOnOperationSchema = z.object({
  operation_id: z.string().optional().describe('Specific operation to reflect on'),
  operation_type: z.enum(['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']).optional(),
  context: z.record(z.unknown()).optional(),
  depth: z.enum(['quick', 'standard', 'deep']).optional().default('standard')
});

export const REFLECT_ON_OPERATION_TOOL = {
  name: 'reflect_on_operation',
  description: 'Analyze an operation to understand what worked, what could be better, and extract lessons learned. Finds similar past operations for comparison.',
  inputSchema: {
    type: 'object',
    properties: {
      operation_id: { type: 'string', description: 'Specific operation to reflect on' },
      operation_type: {
        type: 'string',
        enum: ['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']
      },
      context: { type: 'object', description: 'Additional context' },
      depth: { type: 'string', enum: ['quick', 'standard', 'deep'] }
    }
  }
};

export function handleReflectOnOperation(args: unknown): ReflectionResult {
  const input = ReflectOnOperationSchema.parse(args);
  const db = getDatabase();

  // Get the specific operation if ID provided
  let operation: Operation | null = null;
  if (input.operation_id) {
    operation = db.getOperation(input.operation_id);
  }

  // Get similar operations for comparison
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
  const operations = input.operation_type
    ? db.getOperationsByType(input.operation_type, since)
    : db.getOperations(since, 100);

  // Calculate statistics
  const successOps = operations.filter(o => o.outcome === 'success');
  const failureOps = operations.filter(o => o.outcome === 'failure');
  const successRate = operations.length > 0
    ? successOps.length / operations.length
    : 0;

  // Find strengths (common in successes, rare in failures)
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const lessons: string[] = [];

  if (successRate > 0.8) {
    strengths.push('High success rate for this operation type');
  }
  if (successRate < 0.5) {
    weaknesses.push('Low success rate - needs investigation');
  }

  // Analyze specific operation
  if (operation) {
    if (operation.outcome === 'success' && operation.quality_score > 0.8) {
      strengths.push('Operation completed with high quality');
    }
    if (operation.outcome === 'failure') {
      weaknesses.push('Operation failed - review lessons in context');
      if (operation.lessons) {
        lessons.push(`From failure: ${JSON.stringify(operation.lessons)}`);
      }
    }
    if (operation.duration_ms && operation.duration_ms > 60000) {
      weaknesses.push('Operation took over 1 minute');
    }
  }

  // Extract lessons from recent failures
  for (const fail of failureOps.slice(0, 5)) {
    if (fail.lessons) {
      const lessonStr = typeof fail.lessons === 'object'
        ? Object.entries(fail.lessons).map(([k, v]) => `${k}: ${v}`).join(', ')
        : String(fail.lessons);
      lessons.push(`Past failure (${fail.operation_id}): ${lessonStr.substring(0, 100)}`);
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (successRate < 0.7) {
    recommendations.push('Review failure patterns for this operation type');
  }
  if (failureOps.length > successOps.length) {
    recommendations.push('Consider process improvements before next attempt');
  }
  if (lessons.length === 0) {
    recommendations.push('Start logging lessons from operations for future learning');
  }

  // Find similar operations
  const similarOps = operations
    .filter(o => o.operation_id !== input.operation_id)
    .slice(0, 5)
    .map(o => ({
      operation_id: o.operation_id,
      outcome: o.outcome,
      similarity: calculateSimilarity(operation, o)
    }));

  // Quality assessment
  const avgQuality = operations.reduce((sum, o) => sum + (o.quality_score || 0), 0) / (operations.length || 1);

  return {
    operation_summary: operation
      ? `${operation.operation_type} operation "${operation.input_summary}" - ${operation.outcome}`
      : `Analysis of ${operations.length} ${input.operation_type || 'recent'} operations`,
    quality_assessment: {
      score: operation?.quality_score || avgQuality,
      strengths,
      weaknesses
    },
    lessons_learned: lessons.slice(0, 10),
    recommendations,
    similar_operations: similarOps
  };
}

function calculateSimilarity(op1: Operation | null, op2: Operation): number {
  if (!op1) return 0.5;

  let similarity = 0;

  // Same type
  if (op1.operation_type === op2.operation_type) similarity += 0.3;

  // Same outcome
  if (op1.outcome === op2.outcome) similarity += 0.2;

  // Similar quality
  if (Math.abs((op1.quality_score || 0) - (op2.quality_score || 0)) < 0.2) similarity += 0.2;

  // Same server
  if (op1.server_name === op2.server_name) similarity += 0.15;

  // Similar input
  if (op1.input_summary && op2.input_summary) {
    const words1 = new Set(op1.input_summary.toLowerCase().split(/\s+/));
    const words2 = new Set(op2.input_summary.toLowerCase().split(/\s+/));
    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;
    similarity += (intersection / union) * 0.15;
  }

  return Math.min(1, similarity);
}
