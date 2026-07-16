import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config/agent.config.json');

export function loadConfig() {
  const configPath = path.resolve(process.env.KYVZON_AGENT_CONFIG || DEFAULT_CONFIG_PATH);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}\nCopy config/agent.config.example.json to config/agent.config.json and edit it.`);
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  validateConfig(raw);
  return raw;
}

function validateConfig(config) {
  const required = ['agentId', 'tenantId', 'edgeFunctionUrl', 'admsSecret'];
  for (const key of required) {
    if (!config[key] || typeof config[key] !== 'string') throw new Error(`Missing required config key: ${key}`);
  }
  if (!Array.isArray(config.devices)) throw new Error('config.devices must be an array');
  if (!config.devices.length) throw new Error('At least one device is required');
  for (const device of config.devices) {
    if (!device.id || !device.name || !device.type) throw new Error('Each device requires id, name and type');
  }
  if (!Number.isFinite(config.pollIntervalSeconds) || config.pollIntervalSeconds < 10) config.pollIntervalSeconds = 60;
  if (!Number.isFinite(config.batchSize) || config.batchSize < 1) config.batchSize = 100;
}

export function redactConfig(config) {
  return {
    ...config,
    admsSecret: '***',
    localApi: config.localApi ? { ...config.localApi, token: config.localApi.token ? '***' : undefined } : undefined,
  };
}
