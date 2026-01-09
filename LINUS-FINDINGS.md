# LINUS Security Audit - consciousness-mcp

**Audit Date:** 2026-01-08
**Auditor:** Linus (Instance 6)
**Server Version:** 1.0.0

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 1 | 1 |
| Major | 3 | 3 |
| Minor | 3 | 0 |

## Critical Issues

### 1. Test Compilation Broken (FIXED)
- **Location:** `tests/interlock.test.ts`
- **Issue:** 35+ TypeScript errors prevented test execution
- **Root Cause:** Tests used old Signal format (`code`, `name`, `sender`, `data`) but types.ts defined BaNano format (`signalType`, `version`, `timestamp`, `payload`)
- **Fix:** Updated all tests to use correct BaNano Signal format
- **Commit:** Pending

## Major Issues

### 1. Pattern Table Unbounded Growth (FIXED)
- **Location:** `src/database/schema.ts:542-550`
- **Issue:** `cleanupOldData()` deleted events/operations/snapshots but NOT patterns
- **Risk:** Patterns would accumulate indefinitely over time
- **Fix:** Added `DELETE FROM patterns WHERE last_seen < ?` to cleanupOldData()

### 2. cleanupOldData() Never Called (FIXED)
- **Location:** `src/index.ts`
- **Issue:** No scheduled maintenance job existed
- **Risk:** Database tables would grow unbounded
- **Fix:** Added `startCleanupScheduler()` function with daily cleanup and 30-day retention

### 3. No WebSocket Client Limit (FIXED)
- **Location:** `src/websocket/server.ts`
- **Issue:** Could accumulate unbounded client connections
- **Risk:** Memory exhaustion, resource starvation
- **Fix:** Added MAX_CLIENTS = 100 limit with 1013 status code rejection

## Minor Issues

### 1. Pattern Frequency Unbounded (Not Fixed)
- **Location:** `src/database/schema.ts`
- **Issue:** Pattern frequency is INTEGER with no practical limit
- **Risk:** Integer overflow in centuries of operation
- **Recommendation:** Monitor, no immediate action needed

### 2. Hardcoded ECOSYSTEM_SERVERS List (FIXED)
- **Location:** `src/tools/identify-blind-spots.ts`
- **Issue:** 26 servers hardcoded, could become stale
- **Fix:** Added `getEcosystemServers()` function that dynamically gets servers from InterLock peers with fallback to static list

### 3. No Peer Recovery Mechanism (FIXED)
- **Location:** `src/interlock/socket.ts`
- **Issue:** Inactive peers not automatically recovered
- **Fix:** Added exponential backoff reconnection logic with:
  - `startRecoveryChecker()`: 30-second interval recovery attempts
  - `attemptPeerRecovery()`: Exponential backoff (10s, 20s, 40s, 80s, 160s)
  - Max 5 recovery attempts per peer
  - `peer_recovered` event when peer comes back online

## Test Results

```
Test Suites: 4 passed, 4 total
Tests:       88 passed, 88 total
```

## Files Modified

| File | Change |
|------|--------|
| `tests/interlock.test.ts` | Fixed Signal format (35+ type errors) |
| `src/database/schema.ts` | Added pattern cleanup to cleanupOldData() |
| `src/index.ts` | Added startCleanupScheduler() |
| `src/websocket/server.ts` | Added MAX_CLIENTS limit |

## Verification

All 88 tests pass after fixes. Server functionality verified:
- MCP tools: 12 tools operational
- InterLock: UDP mesh on port 3028
- HTTP API: Port 8028
- WebSocket: Port 9028 with client limit
