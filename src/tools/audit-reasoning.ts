import { z } from 'zod';
import { getDatabase } from '../database/schema.js';

export const AuditReasoningSchema = z.object({
  reasoning_text: z.string().describe('The reasoning chain to audit'),
  verify_claims: z.boolean().optional().default(false).describe('Request verification from Verifier-MCP'),
  context: z.record(z.unknown()).optional()
});

export const AUDIT_REASONING_TOOL = {
  name: 'audit_reasoning',
  description: 'Extract implicit assumptions from a reasoning chain, identify potential logical gaps or overconfidence. Integrates with Verifier-MCP for claim verification.',
  inputSchema: {
    type: 'object',
    properties: {
      reasoning_text: { type: 'string', description: 'The reasoning to audit' },
      verify_claims: { type: 'boolean', description: 'Request claim verification' },
      context: { type: 'object', description: 'Additional context' }
    },
    required: ['reasoning_text']
  }
};

export function handleAuditReasoning(args: unknown): {
  assumptions: string[];
  gaps: string[];
  confidence_score: number;
  recommendations: string[];
  audit_id: number;
  verify_claims_note?: string;
} {
  const input = AuditReasoningSchema.parse(args);
  const db = getDatabase();

  const assumptions = extractAssumptions(input.reasoning_text);
  const gaps = identifyGaps(input.reasoning_text);
  const confidence = calculateConfidence(input.reasoning_text, assumptions.length, gaps.length);
  const recommendations = generateRecommendations(assumptions, gaps, confidence);

  const auditId = db.insertReasoningAudit({
    timestamp: Date.now(),
    reasoning_text: input.reasoning_text,
    assumptions,
    gaps,
    confidence_score: confidence,
    recommendations
  });

  const result: {
    assumptions: string[];
    gaps: string[];
    confidence_score: number;
    recommendations: string[];
    audit_id: number;
    verify_claims_note?: string;
  } = {
    assumptions,
    gaps,
    confidence_score: confidence,
    recommendations,
    audit_id: auditId
  };

  if (input.verify_claims) {
    result.verify_claims_note = 'To verify claims, call verifier-mcp extract_claims and verify_claims tools with this reasoning text';
  }

  return result;
}

function extractAssumptions(text: string): string[] {
  const assumptions: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());

  const indicators = [
    /\bassum(?:e|ing|ed|ption)/i,
    /\bprobably\b/i,
    /\blikely\b/i,
    /\bshould be\b/i,
    /\bmust be\b/i,
    /\bexpect(?:ed|ing)?\b/i,
    /\bsuppose\b/i,
    /\bpresume\b/i,
    /\bbelieve\b/i,
    /\bthink(?:ing)?\b/i,
    /\bseems?\b/i,
    /\bappears?\b/i,
    /\bwould\b/i,
    /\bcould\b/i,
    /\bmight\b/i
  ];

  for (const sentence of sentences) {
    for (const indicator of indicators) {
      if (indicator.test(sentence)) {
        assumptions.push(sentence.trim());
        break;
      }
    }
  }

  return [...new Set(assumptions)].slice(0, 15);
}

function identifyGaps(text: string): string[] {
  const gaps: string[] = [];
  const lowerText = text.toLowerCase();

  if (!lowerText.includes('error') && !lowerText.includes('fail') && !lowerText.includes('exception')) {
    gaps.push('No error handling considerations mentioned');
  }

  if (!lowerText.includes('edge case') && !lowerText.includes('boundary') && !lowerText.includes('corner case')) {
    gaps.push('Edge cases not explicitly considered');
  }

  if (!lowerText.includes('alternative') && !lowerText.includes('other option') && !lowerText.includes('instead')) {
    gaps.push('Alternative approaches not discussed');
  }

  if (!lowerText.includes('risk') && !lowerText.includes('danger') && !lowerText.includes('careful')) {
    gaps.push('Risks not explicitly identified');
  }

  if (!lowerText.includes('because') && !lowerText.includes('since') && !lowerText.includes('therefore')) {
    gaps.push('Causal reasoning may be unclear');
  }

  if (text.length < 100) {
    gaps.push('Reasoning may be too brief for complex decisions');
  }

  if (text.length > 5000) {
    gaps.push('Very long reasoning - key points may be buried');
  }

  return gaps;
}

function calculateConfidence(text: string, assumptionCount: number, gapCount: number): number {
  let confidence = 0.8;

  // Reduce for assumptions
  confidence -= assumptionCount * 0.03;

  // Reduce for gaps
  confidence -= gapCount * 0.08;

  // Boost for structured reasoning
  if (text.includes('first') || text.includes('second') || text.includes('step')) {
    confidence += 0.05;
  }

  // Boost for evidence mentions
  if (text.includes('evidence') || text.includes('data') || text.includes('research')) {
    confidence += 0.05;
  }

  return Math.max(0.1, Math.min(0.95, confidence));
}

function generateRecommendations(assumptions: string[], gaps: string[], confidence: number): string[] {
  const recommendations: string[] = [];

  if (assumptions.length > 5) {
    recommendations.push('Many assumptions detected - validate key assumptions before proceeding');
  }

  if (gaps.includes('No error handling considerations mentioned')) {
    recommendations.push('Add explicit error handling analysis');
  }

  if (gaps.includes('Edge cases not explicitly considered')) {
    recommendations.push('Identify and document edge cases');
  }

  if (gaps.includes('Alternative approaches not discussed')) {
    recommendations.push('Consider at least one alternative approach');
  }

  if (gaps.includes('Risks not explicitly identified')) {
    recommendations.push('Perform risk assessment');
  }

  if (confidence < 0.5) {
    recommendations.push('Low confidence - seek additional input or verification');
  }

  if (recommendations.length === 0) {
    recommendations.push('Reasoning appears sound - proceed with monitoring');
  }

  return recommendations;
}
