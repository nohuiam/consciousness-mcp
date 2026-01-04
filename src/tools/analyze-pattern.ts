import { z } from 'zod';
import { getDatabase } from '../database/schema.js';
import type { PatternAnalysisResult, Pattern } from '../types.js';

export const AnalyzePatternSchema = z.object({
  pattern_query: z.string().describe('What pattern to look for'),
  depth: z.enum(['shallow', 'medium', 'deep']).optional().default('medium'),
  time_range: z.enum(['24h', '7d', '30d', '90d']).optional().default('30d'),
  include_recommendations: z.boolean().optional().default(true)
});

export const ANALYZE_PATTERN_TOOL = {
  name: 'analyze_pattern',
  description: 'Find recurring successes or failures across operations. Learn from history to identify patterns like "this type of build usually fails because..."',
  inputSchema: {
    type: 'object',
    properties: {
      pattern_query: { type: 'string', description: 'What pattern to look for' },
      depth: { type: 'string', enum: ['shallow', 'medium', 'deep'] },
      time_range: { type: 'string', enum: ['24h', '7d', '30d', '90d'] },
      include_recommendations: { type: 'boolean' }
    },
    required: ['pattern_query']
  }
};

const TIME_RANGES: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000
};

export function handleAnalyzePattern(args: unknown): PatternAnalysisResult {
  const input = AnalyzePatternSchema.parse(args);
  const db = getDatabase();
  const since = Date.now() - TIME_RANGES[input.time_range];

  // Search existing patterns
  const existingPatterns = db.getPatterns(undefined, 100);
  const matchingPatterns = existingPatterns.filter(p =>
    p.description.toLowerCase().includes(input.pattern_query.toLowerCase())
  );

  // Analyze operations for new patterns
  const operations = db.getOperations(since, 1000);
  const matchingOps = operations.filter(o =>
    o.input_summary.toLowerCase().includes(input.pattern_query.toLowerCase()) ||
    o.operation_type.includes(input.pattern_query.toLowerCase())
  );

  const insights: string[] = [];
  const recommendations: string[] = [];

  if (matchingOps.length > 0) {
    const successRate = matchingOps.filter(o => o.outcome === 'success').length / matchingOps.length;
    insights.push(`Found ${matchingOps.length} matching operations with ${Math.round(successRate * 100)}% success rate`);

    if (successRate < 0.5) {
      insights.push('This pattern has low success rate - consider reviewing approach');
      recommendations.push('Investigate common failure causes');
    }
    if (successRate > 0.8) {
      insights.push('This pattern has high success rate - good approach');
    }

    // Find common servers
    const serverCounts: Record<string, number> = {};
    matchingOps.forEach(o => {
      serverCounts[o.server_name] = (serverCounts[o.server_name] || 0) + 1;
    });
    const topServer = Object.entries(serverCounts).sort((a, b) => b[1] - a[1])[0];
    if (topServer) {
      insights.push(`Most common server: ${topServer[0]} (${topServer[1]} occurrences)`);
    }
  } else {
    insights.push('No matching operations found in the time range');
    recommendations.push('Try a broader search query or longer time range');
  }

  // Create or update pattern if significant
  if (matchingOps.length >= 5) {
    const successRate = matchingOps.filter(o => o.outcome === 'success').length / matchingOps.length;
    const patternType = successRate > 0.7 ? 'success' : successRate < 0.3 ? 'failure' : 'recurring';

    const existing = db.findSimilarPattern(input.pattern_query);
    if (existing) {
      db.updatePattern(existing.id!, {
        frequency: existing.frequency + 1,
        last_seen: Date.now(),
        confidence: Math.min(0.95, existing.confidence + 0.05)
      });
    } else {
      db.insertPattern({
        pattern_type: patternType,
        description: `Pattern: ${input.pattern_query}`,
        frequency: matchingOps.length,
        last_seen: Date.now(),
        confidence: Math.min(0.9, 0.3 + matchingOps.length * 0.05),
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        related_operations: matchingOps.slice(0, 5).map(o => o.operation_id)
      });
    }
  }

  return {
    patterns_found: matchingPatterns.slice(0, 10),
    insights,
    recommendations: input.include_recommendations ? recommendations : [],
    confidence: matchingPatterns.length > 0
      ? matchingPatterns.reduce((sum, p) => sum + p.confidence, 0) / matchingPatterns.length
      : matchingOps.length > 0 ? 0.5 : 0.1
  };
}
