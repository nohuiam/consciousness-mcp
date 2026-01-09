import { WebSocketServer, WebSocket } from 'ws';
import type { ConsciousnessEvent, ConsciousnessEventType } from '../types.js';

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private startTime: number = Date.now();
  private readonly MAX_CLIENTS = 100; // Prevent unbounded client accumulation
  private stats = {
    connections: 0,
    messages_sent: 0,
    messages_received: 0,
    rejected_connections: 0
  };

  constructor(port: number) {
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.wss.on('error', (error) => {
        console.error('[WebSocket] Server error:', error);
      });

      console.error(`[WebSocket] Server listening on port ${this.port}`);
      resolve();
    });
  }

  private handleConnection(ws: WebSocket): void {
    // Enforce client limit to prevent unbounded growth
    if (this.clients.size >= this.MAX_CLIENTS) {
      console.error(`[WebSocket] Connection rejected: max clients (${this.MAX_CLIENTS}) reached`);
      this.stats.rejected_connections++;
      ws.close(1013, 'Server at capacity');
      return;
    }

    this.clients.add(ws);
    this.stats.connections++;
    console.error(`[WebSocket] Client connected (total: ${this.clients.size})`);

    // Send welcome message
    this.sendToClient(ws, {
      type: 'awareness_update',
      data: {
        message: 'Connected to Consciousness MCP',
        server: 'consciousness-mcp',
        capabilities: ['awareness', 'patterns', 'reflection', 'reasoning'],
        clients_connected: this.clients.size
      },
      timestamp: new Date().toISOString()
    });

    ws.on('message', (data) => {
      this.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.error(`[WebSocket] Client disconnected (total: ${this.clients.size})`);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, data: string): void {
    this.stats.messages_received++;

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'ping':
          this.sendToClient(ws, {
            type: 'awareness_update',
            data: { pong: true, timestamp: Date.now() },
            timestamp: new Date().toISOString()
          });
          break;

        case 'subscribe':
          // Handle subscription requests
          this.sendToClient(ws, {
            type: 'awareness_update',
            data: {
              subscribed: true,
              channels: message.channels || ['all'],
              message: 'Subscription confirmed'
            },
            timestamp: new Date().toISOString()
          });
          break;

        case 'get_status':
          this.sendToClient(ws, {
            type: 'awareness_update',
            data: {
              status: 'active',
              uptime_ms: Date.now() - this.startTime,
              clients: this.clients.size,
              stats: this.stats
            },
            timestamp: new Date().toISOString()
          });
          break;

        default:
          console.error(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  private sendToClient(ws: WebSocket, event: ConsciousnessEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      this.stats.messages_sent++;
    }
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: ConsciousnessEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        this.stats.messages_sent++;
      }
    }
  }

  /**
   * Emit awareness update to all clients
   */
  emitAwarenessUpdate(data: Record<string, unknown>): void {
    this.broadcast({
      type: 'awareness_update',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit pattern detected event
   */
  emitPatternDetected(data: {
    pattern_type: string;
    description: string;
    confidence: number;
    recommendations?: string[];
  }): void {
    this.broadcast({
      type: 'pattern_detected',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit attention shift event
   */
  emitAttentionShift(data: {
    from: string | null;
    to: string;
    reason?: string;
  }): void {
    this.broadcast({
      type: 'attention_shift',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit blind spot alert
   */
  emitBlindSpotAlert(data: {
    area: string;
    severity: 'low' | 'medium' | 'high';
    suggestion: string;
  }): void {
    this.broadcast({
      type: 'blind_spot_alert',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit reasoning concern
   */
  emitReasoningConcern(data: {
    issue: string;
    assumptions: string[];
    gaps: string[];
    confidence: number;
  }): void {
    this.broadcast({
      type: 'reasoning_concern',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit lesson learned
   */
  emitLessonLearned(data: {
    type: string;
    lesson: string;
    source_operation?: string;
    recommendations?: string[];
  }): void {
    this.broadcast({
      type: 'lesson_learned',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit suggestion ready
   */
  emitSuggestionReady(data: {
    action: string;
    priority: 'low' | 'medium' | 'high';
    reasoning: string;
  }): void {
    this.broadcast({
      type: 'suggestion_ready',
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit error event
   */
  emitError(error: string | Error): void {
    this.broadcast({
      type: 'error',
      data: {
        error: error instanceof Error ? error.message : error
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      clients_connected: this.clients.size,
      uptime_ms: Date.now() - this.startTime
    };
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Notify clients of shutdown
      this.broadcast({
        type: 'awareness_update',
        data: { message: 'Server shutting down' },
        timestamp: new Date().toISOString()
      });

      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      // Close server
      if (this.wss) {
        this.wss.close(() => {
          console.error('[WebSocket] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Singleton instance
let wsServiceInstance: WebSocketService | null = null;

/**
 * Initialize and start WebSocket service (singleton)
 */
export function initWebSocketService(port: number): void {
  if (!wsServiceInstance) {
    wsServiceInstance = new WebSocketService(port);
    wsServiceInstance.start();
  }
}

/**
 * Get the WebSocket service instance
 */
export function getWebSocketService(): WebSocketService | null {
  return wsServiceInstance;
}

export default WebSocketService;
