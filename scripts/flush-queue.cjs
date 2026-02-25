#!/usr/bin/env node
/**
 * flush-queue: Mark all groups' message queues as "caught up" to now.
 *
 * Run this before shutting down to prevent the service from replaying
 * accumulated messages when it restarts. Without this, the service
 * processes every message received since it last ran — which can
 * re-trigger agents, create duplicate scheduled tasks, and cause confusion.
 *
 * Usage:
 *   npm run flush-queue
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../store/messages.db');

let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  console.error('Could not open database:', err.message);
  console.error('Make sure you are in the nanoclaw project directory.');
  process.exit(1);
}

const now = new Date().toISOString();

const row = db.prepare("SELECT value FROM router_state WHERE key = 'last_agent_timestamp'").get();

if (!row) {
  console.log('No message queue state found — nothing to flush.');
  process.exit(0);
}

let timestamps;
try {
  timestamps = JSON.parse(row.value);
} catch {
  console.error('Corrupted last_agent_timestamp in DB.');
  process.exit(1);
}

const groups = Object.keys(timestamps);
if (groups.length === 0) {
  console.log('No groups in queue — nothing to flush.');
  process.exit(0);
}

const updated = {};
for (const group of groups) {
  updated[group] = now;
}

db.prepare("INSERT OR REPLACE INTO router_state (key, value) VALUES ('last_agent_timestamp', ?)").run(JSON.stringify(updated));

console.log(`Queue flushed to ${now}`);
console.log(`Groups updated (${groups.length}): ${groups.join(', ')}`);
