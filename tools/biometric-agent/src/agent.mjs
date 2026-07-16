import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, redactConfig } from './config.mjs';
import { createSignedHeaders } from './hmac.mjs';
import { OfflineQueue } from './queue.mjs';
import { fetchPunchesFromDevice } from './zktecoAdapter.mjs';

const config = loadConfig();
const queue = new OfflineQueue();
const statePath = path.resolve(process.cwd(), 'data/state.json');
fs.mkdirSync(path.dirname(statePath), { recursive: true });
if (!fs.existsSync(statePath)) fs.writeFileSync(statePath, '{}');

const runtime = {
  startedAt: new Date().toISOString(),
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  totalSent: 0,
  lastBatchSize: 0,
};

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
  console.log(line);
  fs.appendFileSync(path.resolve(process.cwd(), 'logs/agent.log'), line + '\n');
}

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return {}; }
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function postPunches(records) {
  if (!records.length) return { ok: true, sent: 0 };
  const body = JSON.stringify({
    agent_id: config.agentId,
    tenant_id: config.tenantId,
    records,
  });
  const headers = createSignedHeaders(config.admsSecret, body);
  const response = await fetch(config.edgeFunctionUrl, { method: 'POST', headers, body });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok && response.status !== 207) {
    throw new Error(`Edge sync failed ${response.status}: ${text}`);
  }
  return { ok: true, sent: records.length, payload };
}

async function flushQueue() {
  const queued = queue.take(config.batchSize);
  if (!queued.length) return;
  const result = await postPunches(queued);
  queue.remove(queued.length);
  runtime.totalSent += result.sent;
  log('info', 'flushed offline queue', { count: queued.length });
}

async function pollOnce(reason = 'scheduled') {
  runtime.lastRunAt = new Date().toISOString();
  runtime.lastError = null;
  const state = readState();
  const allRecords = [];

  try {
    await flushQueue();
    for (const device of config.devices) {
      if (!device.enabled) continue;
      const since = state[device.id]?.lastPunchAt;
      try {
        const records = await fetchPunchesFromDevice(device, since);
        if (records.length) {
          allRecords.push(...records);
          const maxTime = records.map(r => r.punch_time).sort().at(-1);
          state[device.id] = { ...(state[device.id] || {}), lastPunchAt: maxTime, lastSeenAt: new Date().toISOString() };
        }
      } catch (err) {
        log('warn', 'device poll failed', { device: device.id, error: err.message });
      }
    }

    runtime.lastBatchSize = allRecords.length;
    if (allRecords.length) {
      const result = await postPunches(allRecords);
      runtime.totalSent += result.sent;
      runtime.lastSuccessAt = new Date().toISOString();
      writeState(state);
      log('info', 'punch batch sent', { reason, count: allRecords.length });
    } else {
      runtime.lastSuccessAt = new Date().toISOString();
      writeState(state);
      log('info', 'no new punches', { reason });
    }
  } catch (err) {
    runtime.lastError = err.message;
    if (allRecords.length) queue.enqueue(allRecords);
    log('error', 'poll failed; records queued', { error: err.message, queued: allRecords.length, queueSize: queue.size() });
  }
}

function startLocalApi() {
  if (!config.localApi?.enabled) return;
  const host = config.localApi.host || '127.0.0.1';
  const port = config.localApi.port || 7755;
  const token = config.localApi.token;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const auth = req.headers.authorization || '';
    const authorized = !token || auth === `Bearer ${token}`;

    if (!authorized) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, runtime, queueSize: queue.size(), config: redactConfig(config) }));
      return;
    }

    if (url.pathname === '/sync' && req.method === 'POST') {
      await pollOnce('manual-api');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, runtime, queueSize: queue.size() }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, host, () => log('info', 'local api listening', { host, port }));
}

log('info', 'Kyvzon Biometric Agent starting', { config: redactConfig(config) });
startLocalApi();
await pollOnce('startup');
setInterval(() => void pollOnce('interval'), config.pollIntervalSeconds * 1000);
