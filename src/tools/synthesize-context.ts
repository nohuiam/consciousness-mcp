import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { SynthesisResult } from '../types.js';

export const SynthesizeContextSchema = z.object({
  sources: z.array(z.object({
    type: z.enum(['file', 'operation', 'pattern', 'server', 'attention']),
    id: z.string(),
    weight: z.number().optional().default(1)
  })).describe('Sources to synthesize from'),
  question: z.string().describe('What to understand about these sources'),
  depth: z.enum(['summary', 'detailed', 'comprehensive']).optional().default('detailed')
});

export const SYNTHESIZE_CONTEXT_TOOL = {
  name: 'synthesize_context',
  description: 'Integrate information from multiple sources (files, operations, patterns, servers) to create a unified perspective on a topic or problem.',
  inputSchema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['file', 'operation', 'pattern', 'server', 'attention'] },
            id: { type: 'string' },
            weight: { type: 'number' }
          },
          required: ['type', 'id']
        },
        description: 'Sources to synthesize from'
      },
      question: { type: 'string', description: 'What to understand' },
      depth: { type: 'string', enum: ['summary', 'detailed', 'comprehensive'] }
    },
    required: ['sources', 'question']
  }
};

export function handleSynthesizeContext(args: unknown): SynthesisResult {
  const input = SynthesizeContextSchema.parse(args);
  const db = getDatabase();

  const sourceData: Array<{
    type: string;
    id: string;
    content: string;
    relevance: number;
  }> = [];

  // Gather data from each source
  for (const source of input.sources) {
    const data = gatherSourceData(db, source.type, source.id);
    if (data) {
      sourceData.push({
        type: source.type,
        id: source.id,
        content: data,
        relevance: calculateRelevance(data, input.question) * (source.weight || 1)
      });
    }
  }

  // Sort by relevance
  sourceData.sort((a, b) => b.relevance - a.relevance);

  // Build unified perspective
  const insights: string[] = [];
  const connections: Array<{ from: string; to: string; relationship: string }> = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Analyze source types
  const typeGroups = groupBy(sourceData, s => s.type);

  if (typeGroups.operation && typeGroups.operation.length > 0) {
    insights.push(`Found ${typeGroups.operation.length} relevant operations`);
  }

  if (typeGroups.pattern && typeGroups.pattern.length > 0) {
    insights.push(`Identified ${typeGroups.pattern.length} relevant patterns`);
  }

  if (typeGroups.attention && typeGroups.attention.length > 0) {
    insights.push(`${typeGroups.attention.length} attention events related to query`);
  }

  // Find connections between sources
  for (let i = 0; i < sourceData.length; i++) {
    for (let j = i + 1; j < sourceData.length; j++) {
      const s1 = sourceData[i];
      const s2 = sourceData[j];
      const commonWords = findCommonKeywords(s1.content, s2.content);
      if (commonWords.length > 2) {
        connections.push({
          from: `${s1.type}:${s1.id}`,
          to: `${s2.type}:${s2.id}`,
          relationship: `Share keywords: ${commonWords.slice(0, 3).join(', ')}`
        });
      }
    }
  }

  // Identify gaps
  const questionKeywords = input.question.toLowerCase().split(/\s+/);
  const allContent = sourceData.map(s => s.content.toLowerCase()).join(' ');
  for (const keyword of questionKeywords) {
    if (keyword.length > 4 && !allContent.includes(keyword)) {
      gaps.push(`No source data addresses: "${keyword}"`);
    }
  }

  if (sourceData.length < input.sources.length) {
    gaps.push(`${input.sources.length - sourceData.length} sources could not be retrieved`);
  }

  // Generate recommendations based on depth
  if (input.depth === 'comprehensive' && gaps.length > 0) {
    recommendations.push('Additional sources needed to fully answer the question');
  }

  if (connections.length === 0 && sourceData.length > 1) {
    recommendations.push('Sources appear unrelated - verify the question scope');
  }

  if (sourceData.some(s => s.relevance < 0.3)) {
    recommendations.push('Some sources have low relevance - consider refining the query');
  }

  // Build unified perspective based on depth
  let unifiedPerspective: string;
  if (input.depth === 'summary') {
    unifiedPerspective = buildSummary(sourceData, input.question);
  } else if (input.depth === 'comprehensive') {
    unifiedPerspective = buildComprehensive(sourceData, input.question, connections);
  } else {
    unifiedPerspective = buildDetailed(sourceData, input.question);
  }

  // Calculate confidence
  const avgRelevance = sourceData.reduce((sum, s) => sum + s.relevance, 0) / (sourceData.length || 1);
  const confidence = Math.min(0.95, avgRelevance * 0.7 + (sourceData.length / input.sources.length) * 0.3);

  return {
    unified_perspective: unifiedPerspective,
    source_contributions: sourceData.map(s => ({
      source: `${s.type}:${s.id}`,
      relevance: Math.round(s.relevance * 100) / 100,
      key_points: extractKeyPoints(s.content, 3)
    })),
    connections,
    gaps,
    confidence: Math.round(confidence * 100) / 100,
    recommendations
  };
}

function gatherSourceData(db: ReturnType<typeof getDatabase>, type: string, id: string): string | null {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

  switch (type) {
    case 'operation': {
      const op = db.getOperation(id);
      if (op) {
        return `Operation: ${op.operation_type} - ${op.input_summary} - Outcome: ${op.outcome}`;
      }
      break;
    }
    case 'pattern': {
      const patterns = db.getPatterns(undefined, 100);
      const pattern = patterns.find(p => p.id?.toString() === id);
      if (pattern) {
        return `Pattern: ${pattern.pattern_type} - ${pattern.description}`;
      }
      break;
    }
    case 'attention': {
      const events = db.getAttentionEvents(since, 100);
      const event = events.find(e => e.id?.toString() === id);
      if (event) {
        return `Attention: ${event.event_type} on ${event.target}`;
      }
      break;
    }
    case 'server': {
      // Return known info about a server
      return `Server: ${id} - ecosystem participant`;
    }
    case 'file': {
      // File context - would need external integration
      return `File: ${id}`;
    }
  }
  return null;
}

function calculateRelevance(content: string, question: string): number {
  const contentWords = new Set(content.toLowerCase().split(/\s+/));
  const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  if (questionWords.length === 0) return 0.5;

  const matches = questionWords.filter(w => contentWords.has(w)).length;
  return Math.min(1, matches / questionWords.length);
}

function findCommonKeywords(content1: string, content2: string): string[] {
  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  return [...words1].filter(w => words2.has(w));
}

function extractKeyPoints(content: string, count: number): string[] {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  return sentences.slice(0, count).map(s => s.trim());
}

function buildSummary(sources: Array<{ content: string }>, question: string): string {
  if (sources.length === 0) return 'No relevant sources found.';
  return `Based on ${sources.length} sources: ${sources.slice(0, 2).map(s => s.content).join('; ')}`;
}

function buildDetailed(sources: Array<{ type: string; content: string }>, question: string): string {
  if (sources.length === 0) return 'No relevant sources found.';
  const byType = groupBy(sources, s => s.type);
  const parts: string[] = [];
  for (const [type, items] of Object.entries(byType)) {
    parts.push(`${type}: ${items.map(i => i.content).join(', ')}`);
  }
  return `Synthesized view for "${question}": ${parts.join('. ')}`;
}

function buildComprehensive(
  sources: Array<{ type: string; content: string; relevance: number }>,
  question: string,
  connections: Array<{ relationship: string }>
): string {
  if (sources.length === 0) return 'No relevant sources found.';

  const parts: string[] = [
    `Comprehensive analysis for: "${question}"`,
    `Sources analyzed: ${sources.length}`,
    `Average relevance: ${Math.round(sources.reduce((s, x) => s + x.relevance, 0) / sources.length * 100)}%`,
    `Connections found: ${connections.length}`
  ];

  const highRelevance = sources.filter(s => s.relevance > 0.5);
  if (highRelevance.length > 0) {
    parts.push(`Key sources: ${highRelevance.map(s => s.content).join('; ')}`);
  }

  return parts.join('. ');
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
