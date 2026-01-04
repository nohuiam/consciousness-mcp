/**
 * Tool handler tests for consciousness-mcp
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { initDatabase, closeDatabase, getDatabase } from '../src/database/schema.js';
import {
  handleTrackFocus,
  handleGetAttentionPatterns,
  handleIdentifyBlindSpots,
  handleReflectOnOperation,
  handleAnalyzePattern,
  handleAuditReasoning,
  handlePredictOutcome,
  handleSynthesizeContext,
  handleSuggestNextAction,
  handleGetEcosystemAwareness,
  ALL_TOOLS,
  TOOL_HANDLERS
} from '../src/tools/index.js';

describe('Tool Handlers', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Close any existing database connection
    closeDatabase();

    // Create unique test directory
    testDir = join(tmpdir(), `consciousness-tools-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    initDatabase(dbPath);
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Tool Definitions', () => {
    it('should export all 10 tools', () => {
      expect(ALL_TOOLS).toHaveLength(10);
    });

    it('should have handler for each tool', () => {
      const toolNames = ALL_TOOLS.map(t => t.name);
      for (const name of toolNames) {
        expect(TOOL_HANDLERS).toHaveProperty(name);
        expect(typeof TOOL_HANDLERS[name]).toBe('function');
      }
    });

    it('should have valid input schemas for all tools', () => {
      for (const tool of ALL_TOOLS) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('track_focus', () => {
    it('should track focus event', () => {
      const result = handleTrackFocus({
        event_type: 'file',
        target: '/path/to/file.ts',
        server_name: 'test-server',
        context: { action: 'read' }
      });

      expect(result.success).toBe(true);
      expect(result.event_id).toBeGreaterThan(0);
      expect(result.message).toContain('file');
      expect(result.timestamp).toBeDefined();
    });

    it('should require event_type and target', () => {
      expect(() => handleTrackFocus({ event_type: 'file' })).toThrow();
      expect(() => handleTrackFocus({ target: '/file.ts' })).toThrow();
    });

    it('should accept all event types', () => {
      const eventTypes = ['file', 'tool', 'query', 'workflow', 'operation', 'signal'];

      for (const eventType of eventTypes) {
        const result = handleTrackFocus({
          event_type: eventType,
          target: 'test-target'
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('get_attention_patterns', () => {
    beforeEach(() => {
      // Seed some attention data
      const db = getDatabase();
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        db.insertAttentionEvent({
          timestamp: now - i * 1000,
          server_name: 'test-server',
          event_type: 'file',
          target: '/hot/file.ts'
        });
      }

      for (let i = 0; i < 2; i++) {
        db.insertAttentionEvent({
          timestamp: now - i * 1000,
          server_name: 'other-server',
          event_type: 'tool',
          target: 'grep'
        });
      }
    });

    it('should return attention patterns', () => {
      const result = handleGetAttentionPatterns({
        time_range: '24h',
        pattern_type: 'hotspots'
      });

      expect(result).toHaveProperty('hotspots');
      expect(result).toHaveProperty('summary');
      expect(result.hotspots.length).toBeGreaterThan(0);
    });

    it('should filter by server', () => {
      const result = handleGetAttentionPatterns({
        time_range: '24h',
        server_filter: 'test-server'
      });

      expect(result).toHaveProperty('hotspots');
    });
  });

  describe('identify_blind_spots', () => {
    it('should identify blind spots with all scope', () => {
      const result = handleIdentifyBlindSpots({
        scope: 'all',
        time_range: '7d'
      });

      expect(result).toHaveProperty('blind_spots');
      expect(result).toHaveProperty('coverage_analysis');
      expect(result).toHaveProperty('suggestions');
      expect(result.analysis_scope).toBe('all');
    });

    it('should analyze specific scopes', () => {
      const scopes = ['attention', 'servers', 'operations', 'patterns'] as const;

      for (const scope of scopes) {
        const result = handleIdentifyBlindSpots({ scope });
        expect(result.analysis_scope).toBe(scope);
      }
    });
  });

  describe('reflect_on_operation', () => {
    it('should reflect on operation by type', () => {
      // Seed operation data
      const db = getDatabase();
      db.insertOperation({
        timestamp: Date.now(),
        server_name: 'neurogenesis',
        operation_type: 'build',
        operation_id: 'op-1',
        input_summary: 'Build TypeScript project',
        outcome: 'success',
        quality_score: 0.9
      });

      const result = handleReflectOnOperation({
        operation_type: 'build'
      });

      expect(result).toHaveProperty('operation_summary');
      expect(result).toHaveProperty('lessons_learned');
      expect(result).toHaveProperty('recommendations');
    });

    it('should reflect on specific operation', () => {
      const db = getDatabase();
      db.insertOperation({
        timestamp: Date.now(),
        server_name: 'test',
        operation_type: 'verify',
        operation_id: 'specific-op',
        input_summary: 'Verify claims',
        outcome: 'success',
        quality_score: 0.8
      });

      const result = handleReflectOnOperation({
        operation_id: 'specific-op'
      });

      expect(result).toHaveProperty('operation_summary');
    });
  });

  describe('analyze_pattern', () => {
    beforeEach(() => {
      // Seed operations for pattern analysis
      const db = getDatabase();
      const now = Date.now();

      for (let i = 0; i < 10; i++) {
        db.insertOperation({
          timestamp: now - i * 1000,
          server_name: 'neurogenesis',
          operation_type: 'build',
          operation_id: `build-${i}`,
          input_summary: 'Build TypeScript project',
          outcome: i < 7 ? 'success' : 'failure',
          quality_score: i < 7 ? 0.9 : 0.3
        });
      }
    });

    it('should analyze patterns', () => {
      const result = handleAnalyzePattern({
        pattern_query: 'build',
        depth: 'medium',
        time_range: '30d'
      });

      expect(result).toHaveProperty('patterns_found');
      expect(result).toHaveProperty('insights');
      expect(result.insights.length).toBeGreaterThan(0);
    });

    it('should generate recommendations', () => {
      const result = handleAnalyzePattern({
        pattern_query: 'build',
        include_recommendations: true
      });

      expect(result).toHaveProperty('recommendations');
    });

    it('should handle no matching patterns', () => {
      const result = handleAnalyzePattern({
        pattern_query: 'nonexistent-pattern'
      });

      expect(result.patterns_found).toHaveLength(0);
      expect(result.insights).toContain('No matching operations found in the time range');
    });
  });

  describe('audit_reasoning', () => {
    it('should audit reasoning text', () => {
      const result = handleAuditReasoning({
        reasoning_text: 'I assume the server is running. I will probably succeed if I connect now. I expect the database to be healthy.'
      });

      expect(result).toHaveProperty('assumptions');
      expect(result).toHaveProperty('gaps');
      expect(result).toHaveProperty('confidence_score');
      expect(result.confidence_score).toBeGreaterThanOrEqual(0);
      expect(result.confidence_score).toBeLessThanOrEqual(1);
    });

    it('should identify assumptions from key phrases', () => {
      const result = handleAuditReasoning({
        reasoning_text: 'I assume this will work. We should probably test it. I expect it to pass.'
      });

      expect(result.assumptions.length).toBeGreaterThan(0);
    });

    it('should identify gaps in reasoning', () => {
      const result = handleAuditReasoning({
        reasoning_text: 'This is a brief plan.' // Too short, no error handling, no edge cases
      });

      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('should store audit in database', () => {
      handleAuditReasoning({
        reasoning_text: 'Test reasoning for storage'
      });

      const db = getDatabase();
      const audits = db.getReasoningAudits(0, 10);
      expect(audits.length).toBeGreaterThan(0);
    });
  });

  describe('predict_outcome', () => {
    beforeEach(() => {
      // Seed historical data
      const db = getDatabase();
      const now = Date.now();

      // Add successful build operations
      for (let i = 0; i < 8; i++) {
        db.insertOperation({
          timestamp: now - i * 60000,
          server_name: 'neurogenesis',
          operation_type: 'build',
          operation_id: `build-success-${i}`,
          input_summary: 'Build project',
          outcome: 'success',
          quality_score: 0.9
        });
      }

      // Add some failures
      for (let i = 0; i < 2; i++) {
        db.insertOperation({
          timestamp: now - i * 60000,
          server_name: 'neurogenesis',
          operation_type: 'build',
          operation_id: `build-fail-${i}`,
          input_summary: 'Build project',
          outcome: 'failure',
          quality_score: 0.2
        });
      }
    });

    it('should predict outcome based on history', () => {
      const result = handlePredictOutcome({
        operation_description: 'Build TypeScript project'
      });

      expect(result).toHaveProperty('predicted_outcome');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('risk_factors');
      expect(result).toHaveProperty('success_factors');
      expect(['success', 'partial', 'failure']).toContain(result.predicted_outcome);
    });

    it('should return factors affecting prediction', () => {
      const result = handlePredictOutcome({
        operation_description: 'Build project',
        context: { server: 'neurogenesis' }
      });

      expect(result.risk_factors.length + result.success_factors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('synthesize_context', () => {
    beforeEach(() => {
      // Seed data from multiple sources
      const db = getDatabase();
      const now = Date.now();

      db.insertAttentionEvent({
        timestamp: now,
        server_name: 'enterspect',
        event_type: 'file',
        target: '/src/index.ts',
        context: { matches: 5 }
      });

      db.insertOperation({
        timestamp: now,
        server_name: 'neurogenesis',
        operation_type: 'build',
        operation_id: 'build-1',
        input_summary: 'Build index.ts',
        outcome: 'success',
        quality_score: 0.9
      });

      db.insertPattern({
        pattern_type: 'success',
        description: 'Builds succeed with clean source',
        frequency: 5,
        last_seen: now,
        confidence: 0.8
      });
    });

    it('should synthesize context from sources', () => {
      const result = handleSynthesizeContext({
        sources: [
          { type: 'attention', id: 'recent' },
          { type: 'operation', id: 'build-1' },
          { type: 'pattern', id: 'success-1' }
        ],
        question: 'What is the state of index.ts?'
      });

      expect(result).toHaveProperty('unified_perspective');
      expect(result).toHaveProperty('source_contributions');
      expect(result).toHaveProperty('connections');
    });

    it('should identify connections between sources', () => {
      const result = handleSynthesizeContext({
        sources: [
          { type: 'attention', id: 'recent' },
          { type: 'operation', id: 'build-1' }
        ],
        question: 'How are files being used?'
      });

      expect(Array.isArray(result.connections)).toBe(true);
    });
  });

  describe('suggest_next_action', () => {
    beforeEach(() => {
      // Seed patterns and operations
      const db = getDatabase();
      const now = Date.now();

      db.insertPattern({
        pattern_type: 'failure',
        description: 'Tests fail without setup',
        frequency: 3,
        last_seen: now,
        confidence: 0.7,
        recommendations: ['Run setup before tests']
      });

      db.insertOperation({
        timestamp: now,
        server_name: 'test-runner',
        operation_type: 'verify',
        operation_id: 'test-1',
        input_summary: 'Run tests',
        outcome: 'failure',
        quality_score: 0.2
      });
    });

    it('should suggest next actions', () => {
      const result = handleSuggestNextAction({
        current_context: { active_task: 'running tests' },
        goals: ['pass tests', 'complete build']
      });

      expect(result).toHaveProperty('suggested_actions');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('opportunities');
      expect(result.suggested_actions.length).toBeGreaterThan(0);
    });

    it('should include rationale for suggestions', () => {
      const result = handleSuggestNextAction({
        current_context: {},
        goals: ['improve code quality']
      });

      for (const action of result.suggested_actions) {
        expect(action).toHaveProperty('action');
        expect(action).toHaveProperty('priority');
        expect(action).toHaveProperty('rationale');
      }
    });
  });

  describe('get_ecosystem_awareness', () => {
    beforeEach(() => {
      // Create awareness snapshot
      const db = getDatabase();
      db.insertSnapshot({
        timestamp: Date.now(),
        active_servers: ['context-guardian', 'enterspect', 'neurogenesis'],
        current_focus: '/src/main.ts',
        pending_issues: ['Build warning'],
        health_summary: {
          overall: 'healthy',
          servers_active: 15,
          servers_total: 20
        }
      });
    });

    it('should return ecosystem awareness', () => {
      const result = handleGetEcosystemAwareness({});

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('active_servers');
      expect(result).toHaveProperty('current_focus');
      expect(result).toHaveProperty('pending_issues');
      expect(result).toHaveProperty('health_summary');
    });

    it('should include health summary and focus', () => {
      const result = handleGetEcosystemAwareness({
        include_history: false
      });

      expect(result).toHaveProperty('health_summary');
      expect(result).toHaveProperty('current_focus');
      expect(result.health_summary).toHaveProperty('overall');
    });
  });
});
