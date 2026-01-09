import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import type {
  AttentionEvent,
  Operation,
  Pattern,
  AwarenessSnapshot,
  ReasoningAudit,
  EventType,
  OperationType,
  OperationOutcome,
  PatternType
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let dbInstance: DatabaseManager | null = null;

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dataDir = dbPath ? dirname(dbPath) : join(__dirname, '..', '..', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const fullPath = dbPath || join(dataDir, 'consciousness.db');
    this.db = new Database(fullPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    // Attention events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attention_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        server_name TEXT,
        event_type TEXT NOT NULL,
        target TEXT NOT NULL,
        context TEXT,
        duration_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_attention_timestamp ON attention_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_attention_server ON attention_events(server_name);
      CREATE INDEX IF NOT EXISTS idx_attention_target ON attention_events(target);
      CREATE INDEX IF NOT EXISTS idx_attention_type ON attention_events(event_type);
    `);

    // Operations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        server_name TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        operation_id TEXT UNIQUE NOT NULL,
        input_summary TEXT,
        outcome TEXT NOT NULL,
        quality_score REAL,
        lessons TEXT,
        duration_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_operations_server ON operations(server_name);
      CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(operation_type);
      CREATE INDEX IF NOT EXISTS idx_operations_outcome ON operations(outcome);
    `);

    // Patterns table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        description TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        last_seen INTEGER NOT NULL,
        confidence REAL DEFAULT 0.5,
        recommendations TEXT,
        related_servers TEXT,
        related_operations TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence);
    `);

    // Awareness snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS awareness_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        active_servers TEXT,
        current_focus TEXT,
        pending_issues TEXT,
        health_summary TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON awareness_snapshots(timestamp);
    `);

    // Reasoning audits table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reasoning_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        reasoning_text TEXT NOT NULL,
        extracted_claims TEXT,
        assumptions TEXT,
        gaps TEXT,
        confidence_score REAL,
        recommendations TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audits_timestamp ON reasoning_audits(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audits_confidence ON reasoning_audits(confidence_score);
    `);

    console.error('[Database] Schema initialized');
  }

  // ============================================================================
  // Attention Events
  // ============================================================================

  insertAttentionEvent(event: AttentionEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO attention_events (timestamp, server_name, event_type, target, context, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      event.timestamp,
      event.server_name || null,
      event.event_type,
      event.target,
      event.context ? JSON.stringify(event.context) : null,
      event.duration_ms || null
    );
    return result.lastInsertRowid as number;
  }

  getAttentionEvents(since: number, limit: number = 100): AttentionEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM attention_events
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(since, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      server_name: row.server_name,
      event_type: row.event_type as EventType,
      target: row.target,
      context: row.context ? JSON.parse(row.context) : undefined,
      duration_ms: row.duration_ms
    }));
  }

  getAttentionHotspots(since: number, limit: number = 20): Array<{
    target: string;
    event_type: EventType;
    count: number;
    last_seen: number;
    servers: string[];
  }> {
    const stmt = this.db.prepare(`
      SELECT
        target,
        event_type,
        COUNT(*) as count,
        MAX(timestamp) as last_seen,
        GROUP_CONCAT(DISTINCT server_name) as servers
      FROM attention_events
      WHERE timestamp >= ?
      GROUP BY target, event_type
      ORDER BY count DESC
      LIMIT ?
    `);
    const rows = stmt.all(since, limit) as any[];
    return rows.map(row => ({
      target: row.target,
      event_type: row.event_type as EventType,
      count: row.count,
      last_seen: row.last_seen,
      servers: row.servers ? row.servers.split(',') : []
    }));
  }

  getAttentionByServer(serverName: string, since: number): AttentionEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM attention_events
      WHERE server_name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
    `);
    const rows = stmt.all(serverName, since) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      server_name: row.server_name,
      event_type: row.event_type as EventType,
      target: row.target,
      context: row.context ? JSON.parse(row.context) : undefined,
      duration_ms: row.duration_ms
    }));
  }

  // ============================================================================
  // Operations
  // ============================================================================

  insertOperation(op: Operation): number {
    const stmt = this.db.prepare(`
      INSERT INTO operations (timestamp, server_name, operation_type, operation_id, input_summary, outcome, quality_score, lessons, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      op.timestamp,
      op.server_name,
      op.operation_type,
      op.operation_id,
      op.input_summary,
      op.outcome,
      op.quality_score,
      op.lessons ? JSON.stringify(op.lessons) : null,
      op.duration_ms || null
    );
    return result.lastInsertRowid as number;
  }

  getOperation(operationId: string): Operation | null {
    const stmt = this.db.prepare(`SELECT * FROM operations WHERE operation_id = ?`);
    const row = stmt.get(operationId) as any;
    if (!row) return null;
    return {
      id: row.id,
      timestamp: row.timestamp,
      server_name: row.server_name,
      operation_type: row.operation_type as OperationType,
      operation_id: row.operation_id,
      input_summary: row.input_summary,
      outcome: row.outcome as OperationOutcome,
      quality_score: row.quality_score,
      lessons: row.lessons ? JSON.parse(row.lessons) : undefined,
      duration_ms: row.duration_ms
    };
  }

  getOperations(since: number, limit: number = 100): Operation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(since, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      server_name: row.server_name,
      operation_type: row.operation_type as OperationType,
      operation_id: row.operation_id,
      input_summary: row.input_summary,
      outcome: row.outcome as OperationOutcome,
      quality_score: row.quality_score,
      lessons: row.lessons ? JSON.parse(row.lessons) : undefined,
      duration_ms: row.duration_ms
    }));
  }

  getOperationsByType(opType: OperationType, since: number): Operation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE operation_type = ? AND timestamp >= ?
      ORDER BY timestamp DESC
    `);
    const rows = stmt.all(opType, since) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      server_name: row.server_name,
      operation_type: row.operation_type as OperationType,
      operation_id: row.operation_id,
      input_summary: row.input_summary,
      outcome: row.outcome as OperationOutcome,
      quality_score: row.quality_score,
      lessons: row.lessons ? JSON.parse(row.lessons) : undefined,
      duration_ms: row.duration_ms
    }));
  }

  getOperationStats(since: number): {
    total: number;
    by_outcome: Record<OperationOutcome, number>;
    by_type: Record<OperationType, number>;
    avg_quality: number;
  } {
    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM operations WHERE timestamp >= ?
    `).get(since) as any;

    const byOutcome = this.db.prepare(`
      SELECT outcome, COUNT(*) as count FROM operations
      WHERE timestamp >= ?
      GROUP BY outcome
    `).all(since) as any[];

    const byType = this.db.prepare(`
      SELECT operation_type, COUNT(*) as count FROM operations
      WHERE timestamp >= ?
      GROUP BY operation_type
    `).all(since) as any[];

    const avgQuality = this.db.prepare(`
      SELECT AVG(quality_score) as avg FROM operations
      WHERE timestamp >= ? AND quality_score IS NOT NULL
    `).get(since) as any;

    const outcomeMap: Record<OperationOutcome, number> = { success: 0, partial: 0, failure: 0 };
    byOutcome.forEach(row => { outcomeMap[row.outcome as OperationOutcome] = row.count; });

    const typeMap: Record<string, number> = {};
    byType.forEach(row => { typeMap[row.operation_type] = row.count; });

    return {
      total: total.count,
      by_outcome: outcomeMap,
      by_type: typeMap as Record<OperationType, number>,
      avg_quality: avgQuality.avg || 0
    };
  }

  // ============================================================================
  // Patterns
  // ============================================================================

  insertPattern(pattern: Pattern): number {
    const stmt = this.db.prepare(`
      INSERT INTO patterns (pattern_type, description, frequency, last_seen, confidence, recommendations, related_servers, related_operations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      pattern.pattern_type,
      pattern.description,
      pattern.frequency,
      pattern.last_seen,
      pattern.confidence,
      pattern.recommendations ? JSON.stringify(pattern.recommendations) : null,
      pattern.related_servers ? JSON.stringify(pattern.related_servers) : null,
      pattern.related_operations ? JSON.stringify(pattern.related_operations) : null
    );
    return result.lastInsertRowid as number;
  }

  updatePattern(id: number, updates: Partial<Pattern>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.frequency !== undefined) {
      fields.push('frequency = ?');
      values.push(updates.frequency);
    }
    if (updates.last_seen !== undefined) {
      fields.push('last_seen = ?');
      values.push(updates.last_seen);
    }
    if (updates.confidence !== undefined) {
      fields.push('confidence = ?');
      values.push(updates.confidence);
    }
    if (updates.recommendations !== undefined) {
      fields.push('recommendations = ?');
      values.push(JSON.stringify(updates.recommendations));
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE patterns SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  getPatterns(type?: PatternType, limit: number = 50): Pattern[] {
    let query = 'SELECT * FROM patterns';
    const params: any[] = [];

    if (type) {
      query += ' WHERE pattern_type = ?';
      params.push(type);
    }

    query += ' ORDER BY confidence DESC, frequency DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      pattern_type: row.pattern_type as PatternType,
      description: row.description,
      frequency: row.frequency,
      last_seen: row.last_seen,
      confidence: row.confidence,
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : undefined,
      related_servers: row.related_servers ? JSON.parse(row.related_servers) : undefined,
      related_operations: row.related_operations ? JSON.parse(row.related_operations) : undefined
    }));
  }

  findSimilarPattern(description: string): Pattern | null {
    // Simple similarity check - could be enhanced with embeddings
    const stmt = this.db.prepare(`
      SELECT * FROM patterns
      WHERE description LIKE ?
      ORDER BY confidence DESC
      LIMIT 1
    `);
    const row = stmt.get(`%${description.substring(0, 50)}%`) as any;
    if (!row) return null;
    return {
      id: row.id,
      pattern_type: row.pattern_type as PatternType,
      description: row.description,
      frequency: row.frequency,
      last_seen: row.last_seen,
      confidence: row.confidence,
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : undefined,
      related_servers: row.related_servers ? JSON.parse(row.related_servers) : undefined,
      related_operations: row.related_operations ? JSON.parse(row.related_operations) : undefined
    };
  }

  // ============================================================================
  // Awareness Snapshots
  // ============================================================================

  insertSnapshot(snapshot: AwarenessSnapshot): number {
    const stmt = this.db.prepare(`
      INSERT INTO awareness_snapshots (timestamp, active_servers, current_focus, pending_issues, health_summary)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      snapshot.timestamp,
      JSON.stringify(snapshot.active_servers),
      snapshot.current_focus || null,
      JSON.stringify(snapshot.pending_issues),
      JSON.stringify(snapshot.health_summary)
    );
    return result.lastInsertRowid as number;
  }

  getLatestSnapshot(): AwarenessSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT * FROM awareness_snapshots
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const row = stmt.get() as any;
    if (!row) return null;
    return {
      id: row.id,
      timestamp: row.timestamp,
      active_servers: JSON.parse(row.active_servers || '[]'),
      current_focus: row.current_focus,
      pending_issues: JSON.parse(row.pending_issues || '[]'),
      health_summary: JSON.parse(row.health_summary || '{}')
    };
  }

  getSnapshots(since: number, limit: number = 24): AwarenessSnapshot[] {
    const stmt = this.db.prepare(`
      SELECT * FROM awareness_snapshots
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(since, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      active_servers: JSON.parse(row.active_servers || '[]'),
      current_focus: row.current_focus,
      pending_issues: JSON.parse(row.pending_issues || '[]'),
      health_summary: JSON.parse(row.health_summary || '{}')
    }));
  }

  // ============================================================================
  // Reasoning Audits
  // ============================================================================

  insertReasoningAudit(audit: ReasoningAudit): number {
    const stmt = this.db.prepare(`
      INSERT INTO reasoning_audits (timestamp, reasoning_text, extracted_claims, assumptions, gaps, confidence_score, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      audit.timestamp,
      audit.reasoning_text,
      audit.extracted_claims ? JSON.stringify(audit.extracted_claims) : null,
      audit.assumptions ? JSON.stringify(audit.assumptions) : null,
      audit.gaps ? JSON.stringify(audit.gaps) : null,
      audit.confidence_score,
      audit.recommendations ? JSON.stringify(audit.recommendations) : null
    );
    return result.lastInsertRowid as number;
  }

  getReasoningAudits(since: number, limit: number = 50): ReasoningAudit[] {
    const stmt = this.db.prepare(`
      SELECT * FROM reasoning_audits
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(since, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      reasoning_text: row.reasoning_text,
      extracted_claims: row.extracted_claims ? JSON.parse(row.extracted_claims) : undefined,
      assumptions: row.assumptions ? JSON.parse(row.assumptions) : undefined,
      gaps: row.gaps ? JSON.parse(row.gaps) : undefined,
      confidence_score: row.confidence_score,
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : undefined
    }));
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  cleanupOldData(retentionDays: number = 30): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    this.db.prepare('DELETE FROM attention_events WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM operations WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM awareness_snapshots WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM reasoning_audits WHERE timestamp < ?').run(cutoff);
    // Clean up stale patterns not seen recently (prevents unbounded growth)
    this.db.prepare('DELETE FROM patterns WHERE last_seen < ?').run(cutoff);

    console.error(`[Database] Cleaned up data older than ${retentionDays} days`);
  }

  close(): void {
    this.db.close();
    console.error('[Database] Connection closed');
  }
}

// Singleton accessor
export function getDatabase(dbPath?: string): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function initDatabase(dbPath?: string): DatabaseManager {
  return getDatabase(dbPath);
}
