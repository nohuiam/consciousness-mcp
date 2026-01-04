/**
 * Database tests for consciousness-mcp
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager } from '../src/database/schema.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Create unique test directory for each test
    testDir = join(tmpdir(), `consciousness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    db = new DatabaseManager(dbPath);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Attention Events', () => {
    it('should insert and retrieve attention events', () => {
      const eventId = db.insertAttentionEvent({
        timestamp: Date.now(),
        server_name: 'test-server',
        event_type: 'file',
        target: '/path/to/file.ts',
        context: { action: 'read' },
        duration_ms: 150
      });

      expect(eventId).toBeGreaterThan(0);

      const events = db.getAttentionEvents(0, 10);
      expect(events).toHaveLength(1);
      expect(events[0].server_name).toBe('test-server');
      expect(events[0].event_type).toBe('file');
      expect(events[0].target).toBe('/path/to/file.ts');
      expect(events[0].context).toEqual({ action: 'read' });
    });

    it('should filter attention events by timestamp', () => {
      const now = Date.now();

      // Old event
      db.insertAttentionEvent({
        timestamp: now - 100000,
        server_name: 'old-server',
        event_type: 'file',
        target: '/old/file.ts'
      });

      // Recent event
      db.insertAttentionEvent({
        timestamp: now,
        server_name: 'new-server',
        event_type: 'tool',
        target: 'grep'
      });

      const recentEvents = db.getAttentionEvents(now - 1000, 10);
      expect(recentEvents).toHaveLength(1);
      expect(recentEvents[0].target).toBe('grep');
    });

    it('should calculate attention hotspots', () => {
      const now = Date.now();

      // Add multiple events to same target
      for (let i = 0; i < 5; i++) {
        db.insertAttentionEvent({
          timestamp: now,
          server_name: 'server-a',
          event_type: 'file',
          target: '/hot/file.ts'
        });
      }

      // Add fewer events to another target
      for (let i = 0; i < 2; i++) {
        db.insertAttentionEvent({
          timestamp: now,
          server_name: 'server-b',
          event_type: 'file',
          target: '/cool/file.ts'
        });
      }

      const hotspots = db.getAttentionHotspots(0, 10);
      expect(hotspots).toHaveLength(2);
      expect(hotspots[0].target).toBe('/hot/file.ts');
      expect(hotspots[0].count).toBe(5);
      expect(hotspots[1].target).toBe('/cool/file.ts');
      expect(hotspots[1].count).toBe(2);
    });

    it('should filter attention by server', () => {
      const now = Date.now();

      db.insertAttentionEvent({
        timestamp: now,
        server_name: 'server-a',
        event_type: 'file',
        target: '/file-a.ts'
      });

      db.insertAttentionEvent({
        timestamp: now,
        server_name: 'server-b',
        event_type: 'file',
        target: '/file-b.ts'
      });

      const serverAEvents = db.getAttentionByServer('server-a', 0);
      expect(serverAEvents).toHaveLength(1);
      expect(serverAEvents[0].target).toBe('/file-a.ts');
    });
  });

  describe('Operations', () => {
    it('should insert and retrieve operations', () => {
      const opId = db.insertOperation({
        timestamp: Date.now(),
        server_name: 'neurogenesis-engine',
        operation_type: 'build',
        operation_id: 'op-123',
        input_summary: 'Build TypeScript project',
        outcome: 'success',
        quality_score: 0.95,
        lessons: { tip: 'Incremental builds are faster' },
        duration_ms: 5000
      });

      expect(opId).toBeGreaterThan(0);

      const op = db.getOperation('op-123');
      expect(op).not.toBeNull();
      expect(op?.server_name).toBe('neurogenesis-engine');
      expect(op?.operation_type).toBe('build');
      expect(op?.outcome).toBe('success');
      expect(op?.quality_score).toBe(0.95);
      expect(op?.lessons).toEqual({ tip: 'Incremental builds are faster' });
    });

    it('should return null for non-existent operation', () => {
      const op = db.getOperation('non-existent');
      expect(op).toBeNull();
    });

    it('should filter operations by type', () => {
      const now = Date.now();

      db.insertOperation({
        timestamp: now,
        server_name: 'enterspect',
        operation_type: 'search',
        operation_id: 'search-1',
        input_summary: 'Search for files',
        outcome: 'success',
        quality_score: 0.9
      });

      db.insertOperation({
        timestamp: now,
        server_name: 'neurogenesis',
        operation_type: 'build',
        operation_id: 'build-1',
        input_summary: 'Build project',
        outcome: 'success',
        quality_score: 0.85
      });

      const searchOps = db.getOperationsByType('search', 0);
      expect(searchOps).toHaveLength(1);
      expect(searchOps[0].operation_id).toBe('search-1');
    });

    it('should calculate operation stats', () => {
      const now = Date.now();

      // Insert operations with different outcomes
      db.insertOperation({
        timestamp: now,
        server_name: 'test',
        operation_type: 'build',
        operation_id: 'op-1',
        input_summary: 'Build project 1',
        outcome: 'success',
        quality_score: 0.9
      });

      db.insertOperation({
        timestamp: now,
        server_name: 'test',
        operation_type: 'build',
        operation_id: 'op-2',
        input_summary: 'Build project 2',
        outcome: 'success',
        quality_score: 0.8
      });

      db.insertOperation({
        timestamp: now,
        server_name: 'test',
        operation_type: 'verify',
        operation_id: 'op-3',
        input_summary: 'Verify claims',
        outcome: 'failure',
        quality_score: 0.3
      });

      const stats = db.getOperationStats(0);
      expect(stats.total).toBe(3);
      expect(stats.by_outcome.success).toBe(2);
      expect(stats.by_outcome.failure).toBe(1);
      expect(stats.by_type.build).toBe(2);
      expect(stats.by_type.verify).toBe(1);
      expect(stats.avg_quality).toBeCloseTo(0.667, 2);
    });
  });

  describe('Patterns', () => {
    it('should insert and retrieve patterns', () => {
      const patternId = db.insertPattern({
        pattern_type: 'failure',
        description: 'TypeScript builds fail when tsconfig is missing',
        frequency: 3,
        last_seen: Date.now(),
        confidence: 0.85,
        recommendations: ['Check for tsconfig.json', 'Run npm init if needed'],
        related_servers: ['neurogenesis-engine'],
        related_operations: ['build']
      });

      expect(patternId).toBeGreaterThan(0);

      const patterns = db.getPatterns('failure', 10);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].description).toContain('TypeScript builds fail');
      expect(patterns[0].confidence).toBe(0.85);
      expect(patterns[0].recommendations).toContain('Check for tsconfig.json');
    });

    it('should filter patterns by type', () => {
      db.insertPattern({
        pattern_type: 'success',
        description: 'Tests pass with proper setup',
        frequency: 5,
        last_seen: Date.now(),
        confidence: 0.9
      });

      db.insertPattern({
        pattern_type: 'failure',
        description: 'Builds fail without deps',
        frequency: 2,
        last_seen: Date.now(),
        confidence: 0.7
      });

      const successPatterns = db.getPatterns('success', 10);
      expect(successPatterns).toHaveLength(1);
      expect(successPatterns[0].description).toContain('Tests pass');
    });

    it('should update patterns', () => {
      const patternId = db.insertPattern({
        pattern_type: 'recurring',
        description: 'Daily maintenance needed',
        frequency: 1,
        last_seen: Date.now(),
        confidence: 0.5
      });

      db.updatePattern(patternId, {
        frequency: 10,
        confidence: 0.9
      });

      const patterns = db.getPatterns('recurring', 10);
      expect(patterns[0].frequency).toBe(10);
      expect(patterns[0].confidence).toBe(0.9);
    });

    it('should find similar patterns', () => {
      db.insertPattern({
        pattern_type: 'failure',
        description: 'Build fails when node_modules missing',
        frequency: 3,
        last_seen: Date.now(),
        confidence: 0.8
      });

      const similar = db.findSimilarPattern('Build fails when node_modules');
      expect(similar).not.toBeNull();
      expect(similar?.description).toContain('node_modules');
    });
  });

  describe('Awareness Snapshots', () => {
    it('should insert and retrieve snapshots', () => {
      const snapshotId = db.insertSnapshot({
        timestamp: Date.now(),
        active_servers: ['context-guardian', 'enterspect', 'neurogenesis'],
        current_focus: '/repo/project/src/index.ts',
        pending_issues: ['Build warning in catasorter'],
        health_summary: {
          overall: 'healthy',
          servers_active: 15,
          servers_total: 20
        }
      });

      expect(snapshotId).toBeGreaterThan(0);

      const latest = db.getLatestSnapshot();
      expect(latest).not.toBeNull();
      expect(latest?.active_servers).toContain('enterspect');
      expect(latest?.current_focus).toContain('index.ts');
      expect(latest?.health_summary.overall).toBe('healthy');
    });

    it('should return null when no snapshots exist', () => {
      const latest = db.getLatestSnapshot();
      expect(latest).toBeNull();
    });

    it('should retrieve snapshots by time range', () => {
      const now = Date.now();

      // Old snapshot
      db.insertSnapshot({
        timestamp: now - 100000,
        active_servers: ['old-server'],
        pending_issues: [],
        health_summary: {}
      });

      // Recent snapshot
      db.insertSnapshot({
        timestamp: now,
        active_servers: ['new-server'],
        pending_issues: [],
        health_summary: {}
      });

      const recentSnapshots = db.getSnapshots(now - 1000, 10);
      expect(recentSnapshots).toHaveLength(1);
      expect(recentSnapshots[0].active_servers).toContain('new-server');
    });
  });

  describe('Reasoning Audits', () => {
    it('should insert and retrieve reasoning audits', () => {
      const auditId = db.insertReasoningAudit({
        timestamp: Date.now(),
        reasoning_text: 'I will refactor this code because it is complex. This should improve maintainability.',
        extracted_claims: [{ claim: 'Code is complex' }, { claim: 'Refactoring improves maintainability' }],
        assumptions: ['Complexity is bad', 'Team will understand refactored code'],
        gaps: ['No metrics for complexity', 'No tests to verify'],
        confidence_score: 0.6,
        recommendations: ['Add complexity metrics', 'Write tests first']
      });

      expect(auditId).toBeGreaterThan(0);

      const audits = db.getReasoningAudits(0, 10);
      expect(audits).toHaveLength(1);
      expect(audits[0].reasoning_text).toContain('refactor');
      expect(audits[0].assumptions).toContain('Complexity is bad');
      expect(audits[0].confidence_score).toBe(0.6);
    });

    it('should filter audits by timestamp', () => {
      const now = Date.now();

      db.insertReasoningAudit({
        timestamp: now - 100000,
        reasoning_text: 'Old reasoning',
        confidence_score: 0.5
      });

      db.insertReasoningAudit({
        timestamp: now,
        reasoning_text: 'Recent reasoning',
        confidence_score: 0.8
      });

      const recentAudits = db.getReasoningAudits(now - 1000, 10);
      expect(recentAudits).toHaveLength(1);
      expect(recentAudits[0].reasoning_text).toBe('Recent reasoning');
    });
  });

  describe('Data Cleanup', () => {
    it('should clean up old data', () => {
      const now = Date.now();
      const oldTime = now - 40 * 24 * 60 * 60 * 1000; // 40 days ago

      // Insert old data
      db.insertAttentionEvent({
        timestamp: oldTime,
        server_name: 'old-server',
        event_type: 'file',
        target: '/old/file.ts'
      });

      // Insert recent data
      db.insertAttentionEvent({
        timestamp: now,
        server_name: 'new-server',
        event_type: 'file',
        target: '/new/file.ts'
      });

      // Cleanup with 30-day retention
      db.cleanupOldData(30);

      const events = db.getAttentionEvents(0, 100);
      expect(events).toHaveLength(1);
      expect(events[0].target).toBe('/new/file.ts');
    });
  });
});
