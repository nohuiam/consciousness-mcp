import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { PredictionResult, OperationOutcome } from '../types.js';

export const PredictOutcomeSchema = z.object({
  operation_description: z.string().describe('Description of the planned operation'),
  operation_type: z.enum(['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']).optional(),
  context: z.record(z.unknown()).optional()
});

export const PREDICT_OUTCOME_TOOL = {
  name: 'predict_outcome',
  description: 'Based on historical patterns, predict success/failure likelihood and estimate complexity before starting an operation.',
  inputSchema: {
    type: 'object',
    properties: {
      operation_description: { type: 'string', description: 'Description of the operation' },
      operation_type: {
        type: 'string',
        enum: ['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']
      },
      context: { type: 'object' }
    },
    required: ['operation_description']
  }
};

export function handlePredictOutcome(args: unknown): PredictionResult {
  const input = PredictOutcomeSchema.parse(args);
  const db = getDatabase();
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Get similar operations
  const operations = input.operation_type
    ? db.getOperationsByType(input.operation_type, since)
    : db.getOperations(since, 500);

  // Find similar by description
  const words = new Set(input.operation_description.toLowerCase().split(/\s+/));
  const similarOps = operations
    .map(op => {
      const opWords = new Set(op.input_summary.toLowerCase().split(/\s+/));
      const intersection = [...words].filter(w => opWords.has(w)).length;
      return { ...op, similarity: intersection / Math.max(words.size, 1) };
    })
    .filter(op => op.similarity > 0.1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 20);

  // Calculate predicted outcome
  const successCount = similarOps.filter(o => o.outcome === 'success').length;
  const failCount = similarOps.filter(o => o.outcome === 'failure').length;
  const total = similarOps.length || 1;

  let predictedOutcome: OperationOutcome;
  let confidence: number;

  if (successCount > failCount * 2) {
    predictedOutcome = 'success';
    confidence = Math.min(0.9, 0.5 + (successCount / total) * 0.4);
  } else if (failCount > successCount * 2) {
    predictedOutcome = 'failure';
    confidence = Math.min(0.9, 0.5 + (failCount / total) * 0.4);
  } else {
    predictedOutcome = 'partial';
    confidence = 0.4 + Math.random() * 0.2;
  }

  // Low data confidence adjustment
  if (similarOps.length < 5) {
    confidence *= 0.7;
  }

  // Identify risk factors
  const riskFactors: string[] = [];
  const successFactors: string[] = [];

  if (failCount > successCount) {
    riskFactors.push(`Historical failure rate: ${Math.round(failCount / total * 100)}%`);
  }
  if (input.operation_description.length > 200) {
    riskFactors.push('Complex operation description - may have multiple failure points');
  }
  if (similarOps.length < 3) {
    riskFactors.push('Limited historical data for this type of operation');
  }

  if (successCount > failCount) {
    successFactors.push(`Historical success rate: ${Math.round(successCount / total * 100)}%`);
  }
  if (similarOps.some(o => o.quality_score && o.quality_score > 0.8)) {
    successFactors.push('Similar operations achieved high quality scores');
  }

  // Check patterns
  const patterns = db.getPatterns('failure', 10);
  for (const pattern of patterns) {
    if (input.operation_description.toLowerCase().includes(pattern.description.toLowerCase().substring(0, 20))) {
      riskFactors.push(`Matches failure pattern: ${pattern.description.substring(0, 50)}`);
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (predictedOutcome === 'failure') {
    recommendations.push('Review past failure causes before proceeding');
    recommendations.push('Consider breaking into smaller operations');
  }
  if (riskFactors.length > 2) {
    recommendations.push('High risk factors detected - proceed with caution');
  }
  if (confidence < 0.5) {
    recommendations.push('Low prediction confidence - gather more information');
  }

  return {
    predicted_outcome: predictedOutcome,
    confidence: Math.round(confidence * 100) / 100,
    risk_factors: riskFactors,
    success_factors: successFactors,
    similar_operations: similarOps.slice(0, 5).map(o => ({
      operation_id: o.operation_id,
      outcome: o.outcome,
      similarity: Math.round(o.similarity * 100) / 100
    })),
    recommendations
  };
}
