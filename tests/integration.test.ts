/**
 * Integration tests for consciousness-mcp
 * Tests workflows across multiple components
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { initDatabase, closeDatabase, getDatabase } from '../src/database/schema.js';
import { BaNanoProtocol, SignalTypes } from '../src/interlock/protocol.js';
import { Tumbler } from '../src/interlock/tumbler.js';
import {
  handleTrackFocus,
  handleGetAttentionPatterns,
  handleReflectOnOperation,
  handleAnalyzePattern,
  handlePredictOutcome,
  handleGetEcosystemAwareness,
  handleIdentifyBlindSpots,
  handleSuggestNextAction
} from '../src/tools/index.js';
import type { Signal } from '../src/types.js';

describe('Integration Tests', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    closeDatabase();
    testDir = join(tmpdir(), `consciousness-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  describe('Attention Flow', () => {
    it('should track attention and detect patterns', () => {
      // Simulate multiple focus events on same file
      const now = Date.now();
      const db = getDatabase();

      // Track focus multiple times
      for (let i = 0; i < 10; i++) {
        db.insertAttentionEvent({
          timestamp: now - i * 1000,
          server_name: 'enterspect',
          event_type: 'file',
          target: '/src/index.ts'
        });
      }

      // Also track some tool usage
      for (let i = 0; i < 3; i++) {
        db.insertAttentionEvent({
          timestamp: now - i * 1000,
          server_name: 'test-runner',
          event_type: 'tool',
          target: 'grep'
        });
      }

      // Check attention patterns
      const patterns = handleGetAttentionPatterns({
        time_range: '24h',
        pattern_type: 'hotspots'
      });

      expect(patterns.hotspots.length).toBeGreaterThan(0);
      expect(patterns.summary).toBeDefined();
    });

    it('should integrate attention tracking with ecosystem awareness', () => {
      const db = getDatabase();
      const now = Date.now();

      // Create attention events
      handleTrackFocus({
        event_type: 'file',
        target: '/src/main.ts',
        server_name: 'enterspect'
      });

      // Create snapshot with current focus
      db.insertSnapshot({
        timestamp: now,
        active_servers: ['enterspect', 'neurogenesis'],
        current_focus: '/src/main.ts',
        pending_issues: [],
        health_summary: { overall: 'healthy' }
      });

      // Get ecosystem awareness
      const awareness = handleGetEcosystemAwareness({});

      // Check that the focus is properly retrieved
      expect(awareness.current_focus).toBeDefined();
    });
  });

  describe('Operation Flow', () => {
    it('should track operations and enable prediction', () => {
      const db = getDatabase();
      const now = Date.now();

      // Record historical operations
      for (let i = 0; i < 20; i++) {
        db.insertOperation({
          timestamp: now - i * 60000,
          server_name: 'neurogenesis',
          operation_type: 'build',
          operation_id: `build-${i}`,
          input_summary: 'Build TypeScript project',
          outcome: i < 16 ? 'success' : 'failure', // 80% success rate
          quality_score: i < 16 ? 0.9 : 0.2
        });
      }

      // Predict outcome for similar operation
      const prediction = handlePredictOutcome({
        operation_description: 'Build TypeScript project'
      });

      expect(prediction.predicted_outcome).toBe('success');
      expect(prediction.confidence).toBeGreaterThan(0.5);
    });

    it('should reflect on operations and extract lessons', () => {
      const db = getDatabase();
      const now = Date.now();

      // Record operations with lessons
      db.insertOperation({
        timestamp: now,
        server_name: 'verifier',
        operation_type: 'verify',
        operation_id: 'verify-1',
        input_summary: 'Verify claims in document',
        outcome: 'success',
        quality_score: 0.95,
        lessons: { insight: 'Source verification improved accuracy' }
      });

      db.insertOperation({
        timestamp: now - 60000,
        server_name: 'verifier',
        operation_type: 'verify',
        operation_id: 'verify-2',
        input_summary: 'Verify technical claims',
        outcome: 'failure',
        quality_score: 0.3,
        lessons: { issue: 'Some claims lacked sources' }
      });

      // Reflect on verify operations
      const reflection = handleReflectOnOperation({
        operation_type: 'verify'
      });

      expect(reflection.operation_summary).toBeDefined();
      expect(reflection.lessons_learned.length).toBeGreaterThan(0);
    });
  });

  describe('Pattern Detection Flow', () => {
    it('should detect and store patterns from operations', () => {
      const db = getDatabase();
      const now = Date.now();

      // Create operation history with pattern
      for (let i = 0; i < 10; i++) {
        db.insertOperation({
          timestamp: now - i * 1000,
          server_name: 'test-runner',
          operation_type: 'verify',
          operation_id: `test-${i}`,
          input_summary: 'Run unit tests',
          outcome: i % 3 === 0 ? 'failure' : 'success', // 30% failure rate
          quality_score: i % 3 === 0 ? 0.3 : 0.9
        });
      }

      // Analyze pattern
      const analysis = handleAnalyzePattern({
        pattern_query: 'test',
        depth: 'medium',
        include_recommendations: true
      });

      expect(analysis.insights.length).toBeGreaterThan(0);

      // Pattern should be stored
      const patterns = db.getPatterns(undefined, 10);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should update existing patterns on re-analysis', () => {
      const db = getDatabase();
      const now = Date.now();

      // Create initial pattern
      db.insertPattern({
        pattern_type: 'recurring',
        description: 'Pattern: test operations',
        frequency: 1,
        last_seen: now - 86400000, // 1 day ago
        confidence: 0.5
      });

      // Add more operations
      for (let i = 0; i < 8; i++) {
        db.insertOperation({
          timestamp: now - i * 1000,
          server_name: 'test-runner',
          operation_type: 'verify',
          operation_id: `op-${i}`,
          input_summary: 'Test operations workflow',
          outcome: 'success',
          quality_score: 0.9
        });
      }

      // Re-analyze
      handleAnalyzePattern({
        pattern_query: 'test operations'
      });

      // Pattern should be updated
      const patterns = db.getPatterns(undefined, 10);
      const updated = patterns.find(p => p.description.includes('test operations'));
      expect(updated).toBeDefined();
      expect(updated!.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Signal Processing Flow', () => {
    it('should process signals through tumbler and track operations', () => {
      const tumbler = new Tumbler([]); // Accept all
      const db = getDatabase();

      // Simulate incoming signals
      const signals: Signal[] = [
        BaNanoProtocol.createSignal(SignalTypes.BUILD_STARTED, 'neurogenesis', { project: 'test' }),
        BaNanoProtocol.createSignal(SignalTypes.BUILD_COMPLETED, 'neurogenesis', { success: true }),
        BaNanoProtocol.createSignal(SignalTypes.FILE_INDEXED, 'enterspect', { path: '/src/index.ts' }),
        BaNanoProtocol.createSignal(SignalTypes.VALIDATION_APPROVED, 'context-guardian', { rule: 'format' })
      ];

      // Process each signal
      for (const signal of signals) {
        const result = tumbler.process(signal);
        expect(result.accepted).toBe(true);

        // Track as attention event
        db.insertAttentionEvent({
          timestamp: Date.now(),
          server_name: signal.sender,
          event_type: 'signal',
          target: result.signalName,
          context: signal.data
        });
      }

      // Verify events tracked
      const events = db.getAttentionEvents(0, 100);
      expect(events.length).toBe(4);

      // Check tumbler stats
      const stats = tumbler.getStats();
      expect(stats.accepted).toBe(4);
      expect(stats.byType['BUILD_STARTED']).toBe(1);
      expect(stats.byType['BUILD_COMPLETED']).toBe(1);
    });
  });

  describe('Blind Spot Detection', () => {
    it('should detect missing event types', () => {
      const db = getDatabase();

      // Only track file events, missing other types
      for (let i = 0; i < 5; i++) {
        db.insertAttentionEvent({
          timestamp: Date.now() - i * 1000,
          server_name: 'test-server',
          event_type: 'file',
          target: `/file${i}.ts`
        });
      }

      const result = handleIdentifyBlindSpots({
        scope: 'attention',
        time_range: '7d'
      });

      // Should detect missing event types
      const missingTypes = result.blind_spots.filter(
        b => b.area === 'attention' && b.description.includes('No ')
      );
      expect(missingTypes.length).toBeGreaterThan(0);
    });

    it('should detect unused servers', () => {
      const result = handleIdentifyBlindSpots({
        scope: 'servers',
        time_range: '7d'
      });

      // With no operations, should detect many unused servers
      expect(result.blind_spots.length).toBeGreaterThan(0);
    });

    it('should provide coverage analysis', () => {
      const result = handleIdentifyBlindSpots({
        scope: 'all'
      });

      expect(result.coverage_analysis).toBeDefined();
      expect(Object.keys(result.coverage_analysis).length).toBeGreaterThan(0);
    });
  });

  describe('Action Suggestions', () => {
    it('should suggest actions based on failure patterns', () => {
      const db = getDatabase();
      const now = Date.now();

      // Create failure pattern
      db.insertPattern({
        pattern_type: 'failure',
        description: 'Tests fail without dependencies',
        frequency: 5,
        last_seen: now,
        confidence: 0.8,
        recommendations: ['Run npm install before tests']
      });

      // Add failing operation
      db.insertOperation({
        timestamp: now,
        server_name: 'test-runner',
        operation_type: 'verify',
        operation_id: 'test-fail-1',
        input_summary: 'Run tests',
        outcome: 'failure',
        quality_score: 0.1
      });

      const result = handleSuggestNextAction({
        current_context: { active_task: 'running tests' },
        goals: ['pass tests']
      });

      expect(result.suggested_actions.length).toBeGreaterThan(0);
    });

    it('should identify opportunities from success patterns', () => {
      const db = getDatabase();
      const now = Date.now();

      // Create success pattern
      db.insertPattern({
        pattern_type: 'success',
        description: 'Incremental builds are fast',
        frequency: 10,
        last_seen: now,
        confidence: 0.9,
        recommendations: ['Use incremental builds for speed']
      });

      const result = handleSuggestNextAction({
        current_context: {},
        goals: ['improve build speed']
      });

      expect(result.suggested_actions.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should support complete build workflow tracking', () => {
      const db = getDatabase();
      const now = Date.now();

      // 1. Track focus on project
      handleTrackFocus({
        event_type: 'workflow',
        target: 'build-project',
        server_name: 'neurogenesis',
        context: { project: 'consciousness-mcp' }
      });

      // 2. Simulate build operation
      db.insertOperation({
        timestamp: now,
        server_name: 'neurogenesis',
        operation_type: 'build',
        operation_id: 'build-workflow-1',
        input_summary: 'Build consciousness-mcp',
        outcome: 'success',
        quality_score: 0.95,
        duration_ms: 5000,
        lessons: { message: 'TypeScript compilation successful' }
      });

      // 3. Reflect on build
      const reflection = handleReflectOnOperation({
        operation_id: 'build-workflow-1'
      });

      expect(reflection.operation_summary).toBeDefined();

      // 4. Update awareness snapshot
      db.insertSnapshot({
        timestamp: now,
        active_servers: ['neurogenesis'],
        current_focus: 'build-project',
        pending_issues: [],
        health_summary: {
          overall: 'healthy',
          last_build: 'success'
        }
      });

      // 5. Get ecosystem awareness
      const awareness = handleGetEcosystemAwareness({});
      expect(awareness.health_summary).toBeDefined();

      // 6. Suggest next action
      const suggestions = handleSuggestNextAction({
        current_context: { active_task: 'deploying' },
        goals: ['deploy', 'run tests']
      });

      expect(suggestions.suggested_actions.length).toBeGreaterThan(0);
    });
  });
});
