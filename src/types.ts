import { z } from 'zod';

// ============================================================================
// Attention Events
// ============================================================================

export type EventType = 'file' | 'tool' | 'query' | 'workflow' | 'operation' | 'signal';

export interface AttentionEvent {
  id?: number;
  timestamp: number;
  server_name: string;
  event_type: EventType;
  target: string;
  context?: Record<string, unknown>;
  duration_ms?: number;
}

export const AttentionEventSchema = z.object({
  server_name: z.string().optional(),
  event_type: z.enum(['file', 'tool', 'query', 'workflow', 'operation', 'signal']),
  target: z.string(),
  context: z.record(z.unknown()).optional(),
  duration_ms: z.number().optional()
});

// ============================================================================
// Operations
// ============================================================================

export type OperationType = 'build' | 'search' | 'verify' | 'organize' | 'classify' | 'coordinate' | 'generate' | 'other';
export type OperationOutcome = 'success' | 'partial' | 'failure';

export interface Operation {
  id?: number;
  timestamp: number;
  server_name: string;
  operation_type: OperationType;
  operation_id: string;
  input_summary: string;
  outcome: OperationOutcome;
  quality_score: number;
  lessons?: Record<string, unknown>;
  duration_ms?: number;
}

export const OperationSchema = z.object({
  server_name: z.string(),
  operation_type: z.enum(['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']),
  operation_id: z.string(),
  input_summary: z.string(),
  outcome: z.enum(['success', 'partial', 'failure']),
  quality_score: z.number().min(0).max(1),
  lessons: z.record(z.unknown()).optional(),
  duration_ms: z.number().optional()
});

// ============================================================================
// Patterns
// ============================================================================

export type PatternType = 'success' | 'failure' | 'bottleneck' | 'opportunity' | 'recurring';

export interface Pattern {
  id?: number;
  pattern_type: PatternType;
  description: string;
  frequency: number;
  last_seen: number;
  confidence: number;
  recommendations?: string[];
  related_servers?: string[];
  related_operations?: string[];
}

// ============================================================================
// Awareness Snapshots
// ============================================================================

export interface AwarenessSnapshot {
  id?: number;
  timestamp: number;
  active_servers: string[];
  current_focus?: string;
  pending_issues: string[];
  health_summary: Record<string, unknown>;
}

// ============================================================================
// Reasoning Audits
// ============================================================================

export interface ReasoningAudit {
  id?: number;
  timestamp: number;
  reasoning_text: string;
  extracted_claims?: Record<string, unknown>[];
  assumptions?: string[];
  gaps?: string[];
  confidence_score: number;
  recommendations?: string[];
}

export const AuditReasoningSchema = z.object({
  reasoning_text: z.string(),
  verify_claims: z.boolean().optional().default(false),
  context: z.record(z.unknown()).optional()
});

// ============================================================================
// Tool Input Schemas
// ============================================================================

export const TrackFocusSchema = z.object({
  event_type: z.enum(['file', 'tool', 'query', 'workflow', 'operation', 'signal']),
  target: z.string(),
  server_name: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  duration_ms: z.number().optional()
});

export const GetAttentionPatternsSchema = z.object({
  time_range: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
  server_filter: z.string().optional(),
  pattern_type: z.enum(['hotspots', 'trends', 'anomalies', 'all']).optional().default('all'),
  limit: z.number().optional().default(20)
});

export const IdentifyBlindSpotsSchema = z.object({
  scope: z.enum(['attention', 'capabilities', 'coverage', 'all']).optional().default('all'),
  time_range: z.enum(['24h', '7d', '30d']).optional().default('7d')
});

export const ReflectOnOperationSchema = z.object({
  operation_id: z.string().optional(),
  operation_type: z.enum(['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']).optional(),
  context: z.record(z.unknown()).optional(),
  depth: z.enum(['quick', 'standard', 'deep']).optional().default('standard')
});

export const AnalyzePatternSchema = z.object({
  pattern_query: z.string(),
  depth: z.enum(['shallow', 'medium', 'deep']).optional().default('medium'),
  time_range: z.enum(['24h', '7d', '30d', '90d']).optional().default('30d'),
  include_recommendations: z.boolean().optional().default(true)
});

export const PredictOutcomeSchema = z.object({
  operation_description: z.string(),
  operation_type: z.enum(['build', 'search', 'verify', 'organize', 'classify', 'coordinate', 'generate', 'other']).optional(),
  context: z.record(z.unknown()).optional()
});

export const SynthesizeContextSchema = z.object({
  sources: z.array(z.string()),
  question: z.string(),
  include_patterns: z.boolean().optional().default(true)
});

export const SuggestNextActionSchema = z.object({
  current_context: z.string(),
  goals: z.array(z.string()).optional(),
  avoid_patterns: z.array(z.string()).optional()
});

export const GetEcosystemAwarenessSchema = z.object({
  include_history: z.boolean().optional().default(false),
  history_hours: z.number().optional().default(24)
});

// ============================================================================
// InterLock Types
// ============================================================================

export interface InterlockConfig {
  server_id: string;
  ports: {
    udp: number;
    http: number;
    websocket: number;
  };
  heartbeat: {
    interval: number;
    timeout: number;
  };
  signals: {
    accepted: string[];
    emits: string[];
  };
  peers: Array<{
    name: string;
    host: string;
    port: number;
  }>;
  database: {
    path: string;
  };
}

export interface Signal {
  type: number;
  version: string;
  sender: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface Peer {
  name: string;
  host: string;
  port: number;
  lastSeen?: number;
  status?: 'active' | 'inactive' | 'unknown';
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type ConsciousnessEventType =
  | 'awareness_update'
  | 'pattern_detected'
  | 'attention_shift'
  | 'blind_spot_alert'
  | 'reasoning_concern'
  | 'lesson_learned'
  | 'suggestion_ready'
  | 'error';

export interface ConsciousnessEvent {
  type: ConsciousnessEventType;
  data: unknown;
  timestamp: string;
}

// ============================================================================
// Tool Results
// ============================================================================

export interface AttentionPatternsResult {
  hotspots: Array<{
    target: string;
    event_type: EventType;
    count: number;
    last_seen: number;
    servers: string[];
  }>;
  trends: Array<{
    direction: 'increasing' | 'decreasing' | 'stable';
    target: string;
    change_percent: number;
  }>;
  anomalies: Array<{
    target: string;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  summary: {
    total_events: number;
    unique_targets: number;
    time_range: string;
  };
}

export interface BlindSpotResult {
  blind_spots: Array<{
    area: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    recommendation: string;
  }>;
  coverage_analysis: Record<string, number>;
  suggestions: string[];
  analysis_scope: string;
  time_range: string;
}

export interface ReflectionResult {
  operation_summary: string;
  quality_assessment: {
    score: number;
    strengths: string[];
    weaknesses: string[];
  };
  lessons_learned: string[];
  recommendations: string[];
  similar_operations: Array<{
    operation_id: string;
    outcome: OperationOutcome;
    similarity: number;
  }>;
}

export interface PatternAnalysisResult {
  patterns_found: Pattern[];
  insights: string[];
  recommendations: string[];
  confidence: number;
}

export interface PredictionResult {
  predicted_outcome: OperationOutcome;
  confidence: number;
  risk_factors: string[];
  success_factors: string[];
  similar_operations: Array<{
    operation_id: string;
    outcome: OperationOutcome;
    similarity: number;
  }>;
  recommendations: string[];
}

export interface SynthesisResult {
  unified_perspective: string;
  source_contributions: Array<{
    source: string;
    relevance: number;
    key_points: string[];
  }>;
  connections: Array<{
    from: string;
    to: string;
    relationship: string;
  }>;
  gaps: string[];
  confidence: number;
  recommendations: string[];
}

export interface SuggestionResult {
  suggested_actions: Array<{
    action: string;
    rationale: string;
    confidence: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  warnings: string[];
  opportunities: string[];
  context_summary: {
    goals_analyzed: number;
    patterns_matched: number;
    historical_operations: number;
  };
  confidence: number;
}

export interface EcosystemAwarenessResult {
  timestamp: string;
  active_servers: Array<{
    name: string;
    status: 'active' | 'inactive' | 'unknown';
    last_seen: number;
  }>;
  current_focus: {
    primary: string | null;
    secondary: string[];
  };
  pending_issues: Array<{
    issue: string;
    severity: 'low' | 'medium' | 'high';
    server: string;
  }>;
  recent_patterns: Pattern[];
  health_summary: {
    overall: 'healthy' | 'degraded' | 'critical';
    servers_active: number;
    servers_total: number;
  };
  history?: AwarenessSnapshot[];
}
