import express, { Application, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { getDatabase } from '../database/schema.js';
import { getInterLock } from '../interlock/index.js';
import type { PatternType, OperationType } from '../types.js';

export class HttpServer {
  private app: Application;
  private server: Server | null = null;
  private port: number;
  private startTime: number = Date.now();

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // JSON parsing
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.error(`[HTTP] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      const interlock = getInterLock();
      res.json({
        status: 'healthy',
        server: 'consciousness-mcp',
        port: this.port,
        uptime_ms: Date.now() - this.startTime,
        interlock: interlock ? {
          active: true,
          peers: interlock.getActivePeerCount(),
          stats: interlock.getStats()
        } : {
          active: false
        },
        timestamp: new Date().toISOString()
      });
    });

    // Get current ecosystem awareness
    this.app.get('/api/awareness', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const interlock = getInterLock();

        const snapshot = db.getLatestSnapshot();
        const peers = interlock?.getPeers() || [];
        const activeServers = peers.filter(p => p.status === 'active').map(p => ({
          name: p.name,
          status: p.status,
          last_seen: p.lastSeen
        }));

        res.json({
          timestamp: new Date().toISOString(),
          active_servers: activeServers,
          servers_active: activeServers.length,
          servers_total: peers.length,
          current_focus: snapshot?.current_focus || null,
          pending_issues: snapshot?.pending_issues || [],
          health_summary: snapshot?.health_summary || {}
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get recent attention events
    this.app.get('/api/attention', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const hours = parseInt(req.query.hours as string) || 24;
        const limit = parseInt(req.query.limit as string) || 100;
        const since = Date.now() - hours * 60 * 60 * 1000;

        const events = db.getAttentionEvents(since, limit);
        res.json({
          events,
          count: events.length,
          time_range: `${hours}h`
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get attention hotspots
    this.app.get('/api/attention/hotspots', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const hours = parseInt(req.query.hours as string) || 24;
        const limit = parseInt(req.query.limit as string) || 20;
        const since = Date.now() - hours * 60 * 60 * 1000;

        const hotspots = db.getAttentionHotspots(since, limit);
        res.json({
          hotspots,
          count: hotspots.length,
          time_range: `${hours}h`
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get detected patterns
    this.app.get('/api/patterns', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const type = req.query.type as PatternType | undefined;
        const limit = parseInt(req.query.limit as string) || 50;

        const patterns = db.getPatterns(type, limit);
        res.json({
          patterns,
          count: patterns.length
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get patterns by type
    this.app.get('/api/patterns/:type', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const type = req.params.type as PatternType;
        const limit = parseInt(req.query.limit as string) || 50;

        const patterns = db.getPatterns(type, limit);
        res.json({
          patterns,
          count: patterns.length,
          type
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Trigger reflection on an operation
    this.app.post('/api/reflect', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const { operation_id, operation_type, context, depth } = req.body;

        // Get operation if ID provided
        let operation = null;
        if (operation_id) {
          operation = db.getOperation(operation_id);
        }

        // Get similar operations
        const since = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
        const operations = operation_type
          ? db.getOperationsByType(operation_type, since)
          : db.getOperations(since, 100);

        // Calculate stats
        const stats = db.getOperationStats(since);

        res.json({
          operation,
          similar_operations: operations.slice(0, 10),
          statistics: stats,
          reflection: {
            depth: depth || 'standard',
            context,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Audit reasoning chain
    this.app.post('/api/audit', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const { reasoning_text, verify_claims, context } = req.body;

        if (!reasoning_text) {
          res.status(400).json({ error: 'reasoning_text is required' });
          return;
        }

        // Simple assumption extraction (could be enhanced with LLM)
        const assumptions = extractAssumptions(reasoning_text);
        const gaps = identifyGaps(reasoning_text);
        const confidence = calculateConfidence(assumptions.length, gaps.length);

        // Store the audit
        const auditId = db.insertReasoningAudit({
          timestamp: Date.now(),
          reasoning_text,
          assumptions,
          gaps,
          confidence_score: confidence,
          recommendations: generateRecommendations(assumptions, gaps)
        });

        res.json({
          audit_id: auditId,
          reasoning_text: reasoning_text.substring(0, 200) + '...',
          assumptions,
          gaps,
          confidence_score: confidence,
          recommendations: generateRecommendations(assumptions, gaps),
          verify_claims_requested: verify_claims,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get operations
    this.app.get('/api/operations', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const hours = parseInt(req.query.hours as string) || 24;
        const limit = parseInt(req.query.limit as string) || 100;
        const since = Date.now() - hours * 60 * 60 * 1000;

        const operations = db.getOperations(since, limit);
        const stats = db.getOperationStats(since);

        res.json({
          operations,
          statistics: stats,
          time_range: `${hours}h`
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get specific operation
    this.app.get('/api/operations/:id', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const operation = db.getOperation(req.params.id);

        if (!operation) {
          res.status(404).json({ error: 'Operation not found' });
          return;
        }

        res.json(operation);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get suggestions
    this.app.get('/api/suggestions', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const since = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

        // Get failure patterns
        const patterns = db.getPatterns('failure', 10);
        const stats = db.getOperationStats(since);

        // Generate suggestions based on patterns
        const suggestions = patterns.map(p => ({
          action: p.recommendations?.[0] || 'Review this pattern',
          priority: p.confidence > 0.7 ? 'high' : p.confidence > 0.4 ? 'medium' : 'low',
          reasoning: p.description,
          frequency: p.frequency
        }));

        res.json({
          suggestions,
          context: {
            success_rate: stats.total > 0
              ? stats.by_outcome.success / stats.total
              : 0,
            total_operations: stats.total
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // InterLock stats
    this.app.get('/api/interlock/stats', (req: Request, res: Response) => {
      const interlock = getInterLock();
      if (!interlock) {
        res.status(503).json({ error: 'InterLock not active' });
        return;
      }

      res.json({
        socket: interlock.getStats(),
        tumbler: interlock.getTumblerStats(),
        peers: interlock.getPeers()
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.error(`[HTTP] Server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.error('[HTTP] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Helper functions for reasoning audit

function extractAssumptions(text: string): string[] {
  const assumptions: string[] = [];

  // Look for assumption indicators
  const indicators = [
    /assum(?:e|ing|ption)/gi,
    /probably/gi,
    /likely/gi,
    /should be/gi,
    /must be/gi,
    /expect(?:ed|ing)?/gi,
    /suppose/gi,
    /presume/gi
  ];

  const sentences = text.split(/[.!?]+/);
  for (const sentence of sentences) {
    for (const indicator of indicators) {
      if (indicator.test(sentence)) {
        assumptions.push(sentence.trim());
        break;
      }
    }
  }

  return assumptions.slice(0, 10); // Limit to 10
}

function identifyGaps(text: string): string[] {
  const gaps: string[] = [];

  // Check for missing considerations
  if (!text.toLowerCase().includes('error') && !text.toLowerCase().includes('fail')) {
    gaps.push('No error handling considerations mentioned');
  }

  if (!text.toLowerCase().includes('edge case') && !text.toLowerCase().includes('boundary')) {
    gaps.push('Edge cases not explicitly considered');
  }

  if (!text.toLowerCase().includes('alternative') && !text.toLowerCase().includes('other option')) {
    gaps.push('Alternative approaches not discussed');
  }

  if (text.length < 100) {
    gaps.push('Reasoning may be too brief for complex decisions');
  }

  return gaps;
}

function calculateConfidence(assumptionCount: number, gapCount: number): number {
  // Base confidence
  let confidence = 0.8;

  // Reduce for each assumption
  confidence -= assumptionCount * 0.05;

  // Reduce for each gap
  confidence -= gapCount * 0.1;

  // Clamp to 0-1 range
  return Math.max(0.1, Math.min(1, confidence));
}

function generateRecommendations(assumptions: string[], gaps: string[]): string[] {
  const recommendations: string[] = [];

  if (assumptions.length > 3) {
    recommendations.push('Consider validating key assumptions before proceeding');
  }

  if (gaps.includes('No error handling considerations mentioned')) {
    recommendations.push('Add error handling analysis');
  }

  if (gaps.includes('Edge cases not explicitly considered')) {
    recommendations.push('Identify and document edge cases');
  }

  if (gaps.includes('Alternative approaches not discussed')) {
    recommendations.push('Evaluate alternative approaches');
  }

  if (recommendations.length === 0) {
    recommendations.push('Reasoning appears sound - proceed with monitoring');
  }

  return recommendations;
}

// Singleton instance
let httpServerInstance: HttpServer | null = null;

/**
 * Start the HTTP server (singleton)
 */
export function startHttpServer(port: number): void {
  if (!httpServerInstance) {
    httpServerInstance = new HttpServer(port);
    httpServerInstance.start();
  }
}

/**
 * Get the HTTP server instance
 */
export function getHttpServer(): HttpServer | null {
  return httpServerInstance;
}

export default HttpServer;
