#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { initDatabase, getDatabase } from './database/schema.js';
import { startHttpServer, getHttpServer } from './http/server.js';
import { initWebSocketService, getWebSocketService } from './websocket/server.js';
import { initInterLock, getInterLock } from './interlock/index.js';
import { ALL_TOOLS, TOOL_HANDLERS } from './tools/index.js';
import type { InterlockConfig } from './types.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Server metadata
const SERVER_NAME = 'consciousness-mcp';
const SERVER_VERSION = '1.0.0';

// Configuration from environment
const HTTP_PORT = parseInt(process.env.CONSCIOUSNESS_HTTP_PORT || '8028');
const WS_PORT = parseInt(process.env.CONSCIOUSNESS_WS_PORT || '9028');
const UDP_PORT = parseInt(process.env.CONSCIOUSNESS_UDP_PORT || '3028');
const DB_PATH = process.env.CONSCIOUSNESS_DB_PATH || './data/consciousness.db';

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ALL_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${name}` })
        }],
        isError: true
      };
    }

    try {
      const result = handler(args);

      // Broadcast significant events via WebSocket
      broadcastToolResult(name, result);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${SERVER_NAME}] Tool error (${name}):`, errorMessage);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: errorMessage })
        }],
        isError: true
      };
    }
  });

  return server;
}

/**
 * Broadcast tool results to WebSocket clients when appropriate
 */
function broadcastToolResult(toolName: string, result: unknown): void {
  const ws = getWebSocketService();
  if (!ws) return;

  // Map tool results to appropriate events
  switch (toolName) {
    case 'get_ecosystem_awareness':
      ws.broadcast({
        type: 'awareness_update',
        data: result,
        timestamp: new Date().toISOString()
      });
      break;

    case 'analyze_pattern':
      const patternResult = result as { patterns_found?: unknown[] };
      if (patternResult.patterns_found && patternResult.patterns_found.length > 0) {
        ws.broadcast({
          type: 'pattern_detected',
          data: result,
          timestamp: new Date().toISOString()
        });
      }
      break;

    case 'identify_blind_spots':
      const blindSpotResult = result as { blind_spots?: unknown[] };
      if (blindSpotResult.blind_spots && blindSpotResult.blind_spots.length > 0) {
        ws.broadcast({
          type: 'blind_spot_alert',
          data: result,
          timestamp: new Date().toISOString()
        });
      }
      break;

    case 'audit_reasoning':
      const auditResult = result as { confidence_score?: number };
      if (auditResult.confidence_score !== undefined && auditResult.confidence_score < 0.5) {
        ws.broadcast({
          type: 'reasoning_concern',
          data: result,
          timestamp: new Date().toISOString()
        });
      }
      break;

    case 'reflect_on_operation':
      const reflectionResult = result as { lessons_learned?: unknown[] };
      if (reflectionResult.lessons_learned && reflectionResult.lessons_learned.length > 0) {
        ws.broadcast({
          type: 'lesson_learned',
          data: result,
          timestamp: new Date().toISOString()
        });
      }
      break;

    case 'suggest_next_action':
      ws.broadcast({
        type: 'suggestion_ready',
        data: result,
        timestamp: new Date().toISOString()
      });
      break;
  }
}

/**
 * Run periodic cleanup to prevent unbounded data growth
 */
function startCleanupScheduler(): void {
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Daily
  const RETENTION_DAYS = 30;

  // Run cleanup immediately on startup (after a short delay)
  setTimeout(() => {
    try {
      const db = getDatabase();
      db.cleanupOldData(RETENTION_DAYS);
      console.error(`[${SERVER_NAME}] Initial cleanup completed`);
    } catch (error) {
      console.error(`[${SERVER_NAME}] Initial cleanup error:`, error);
    }
  }, 60 * 1000); // 1 minute after startup

  // Schedule daily cleanup
  setInterval(() => {
    try {
      const db = getDatabase();
      db.cleanupOldData(RETENTION_DAYS);
      console.error(`[${SERVER_NAME}] Daily cleanup completed`);
    } catch (error) {
      console.error(`[${SERVER_NAME}] Cleanup error:`, error);
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Take periodic awareness snapshots
 */
function startSnapshotScheduler(): void {
  const SNAPSHOT_INTERVAL = 15 * 60 * 1000; // 15 minutes

  setInterval(() => {
    try {
      const db = getDatabase();
      const interlock = getInterLock();

      // Get current peer states
      const peers = interlock?.getPeers() || [];
      const activeServers = peers.filter(p => p.status === 'active').map(p => p.name);

      // Get current focus from recent attention
      const recentAttention = db.getAttentionHotspots(Date.now() - 60 * 60 * 1000, 1);
      const currentFocus = recentAttention.length > 0 ? recentAttention[0].target : null;

      // Get pending issues from patterns
      const patterns = db.getPatterns('failure', 5);
      const pendingIssues = patterns
        .filter(p => p.confidence > 0.5)
        .map(p => p.description);

      // Calculate health
      const stats = db.getOperationStats(Date.now() - 24 * 60 * 60 * 1000);
      const successRate = stats.total > 0 ? stats.by_outcome.success / stats.total : 1;

      let healthStatus = 'healthy';
      if (activeServers.length < peers.length * 0.5) {
        healthStatus = 'critical';
      } else if (activeServers.length < peers.length * 0.8 || successRate < 0.7) {
        healthStatus = 'degraded';
      }

      // Insert snapshot
      db.insertSnapshot({
        timestamp: Date.now(),
        active_servers: activeServers,
        current_focus: currentFocus || undefined,
        pending_issues: pendingIssues,
        health_summary: {
          overall: healthStatus,
          servers_active: activeServers.length,
          servers_total: peers.length,
          success_rate: successRate
        }
      });

      console.error(`[${SERVER_NAME}] Snapshot taken - ${activeServers.length} servers active, health: ${healthStatus}`);
    } catch (error) {
      console.error(`[${SERVER_NAME}] Snapshot error:`, error);
    }
  }, SNAPSHOT_INTERVAL);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.error(`[${SERVER_NAME}] Starting v${SERVER_VERSION}...`);

  try {
    // Initialize database
    console.error(`[${SERVER_NAME}] Initializing database at ${DB_PATH}...`);
    initDatabase(DB_PATH);

    // Start HTTP server
    console.error(`[${SERVER_NAME}] Starting HTTP server on port ${HTTP_PORT}...`);
    startHttpServer(HTTP_PORT);

    // Initialize WebSocket service
    console.error(`[${SERVER_NAME}] Starting WebSocket server on port ${WS_PORT}...`);
    initWebSocketService(WS_PORT);

    // Load InterLock config
    const configPath = join(__dirname, '..', 'config', 'interlock.json');
    const config: InterlockConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Initialize InterLock mesh
    console.error(`[${SERVER_NAME}] Initializing InterLock mesh on port ${config.ports.udp}...`);
    await initInterLock(config);

    // Start scheduled jobs
    startSnapshotScheduler();
    startCleanupScheduler();

    // Create and run MCP server
    const server = createServer();
    const transport = new StdioServerTransport();

    console.error(`[${SERVER_NAME}] MCP server ready, connecting to stdio transport...`);
    await server.connect(transport);

    console.error(`[${SERVER_NAME}] Server running on:`);
    console.error(`  - MCP: stdio`);
    console.error(`  - InterLock UDP: ${UDP_PORT}`);
    console.error(`  - HTTP REST: ${HTTP_PORT}`);
    console.error(`  - WebSocket: ${WS_PORT}`);
  } catch (error) {
    console.error(`[${SERVER_NAME}] Fatal error:`, error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  console.error(`\n[${SERVER_NAME}] Received ${signal}, shutting down gracefully...`);

  const wsService = getWebSocketService();
  const httpServer = getHttpServer();
  const interlock = getInterLock();

  // 1. Close WebSocket connections first
  if (wsService) {
    console.error(`[${SERVER_NAME}] Closing WebSocket connections...`);
    await wsService.stop();
  }

  // 2. Close HTTP server (wait up to 5s for connections to drain)
  if (httpServer) {
    console.error(`[${SERVER_NAME}] Closing HTTP server...`);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.error(`[${SERVER_NAME}] HTTP server shutdown timeout, forcing close`);
        resolve();
      }, 5000);

      httpServer.stop().then(() => {
        clearTimeout(timeout);
        resolve();
      }).catch(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  // 3. Stop InterLock mesh
  if (interlock) {
    console.error(`[${SERVER_NAME}] Stopping InterLock mesh...`);
    interlock.stop();
  }

  console.error(`[${SERVER_NAME}] Shutdown complete.`);
  process.exit(0);
}

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});

// Run
main().catch((error) => {
  console.error(`[${SERVER_NAME}] Unhandled error:`, error);
  process.exit(1);
});
