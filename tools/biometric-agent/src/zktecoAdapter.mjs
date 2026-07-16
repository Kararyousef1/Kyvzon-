/**
 * Device adapters.
 *
 * mock: generates deterministic test punches for staging.
 * file: reads punches from a JSON file at device.filePath.
 * zkteco-tcp: placeholder for a native ZKTeco protocol implementation.
 *
 * Production recommendation:
 *  - Keep this agent inside the client's LAN.
 *  - Add a real adapter using a vetted ZKTeco library or vendor SDK.
 *  - Never expose devices directly to the public internet.
 */

import fs from 'node:fs';

const lastMockPunchAt = new Map();

export async function fetchPunchesFromDevice(device, sinceIso) {
  if (!device.enabled) return [];
  if (device.type === 'mock') return mockPunches(device);
  if (device.type === 'file') return filePunches(device, sinceIso);
  if (device.type === 'zkteco-tcp') {
    throw new Error(`Device ${device.id}: zkteco-tcp adapter is not bundled. Install/implement vendor SDK adapter in this file.`);
  }
  throw new Error(`Unknown device adapter type: ${device.type}`);
}

function mockPunches(device) {
  const now = Date.now();
  const last = lastMockPunchAt.get(device.id) || 0;
  if (now - last < 5 * 60 * 1000) return [];
  lastMockPunchAt.set(device.id, now);
  const employees = device.mockEmployees || ['EMP001'];
  return employees.map((employee_code, index) => ({
    employee_code,
    punch_time: new Date(now + index * 1000).toISOString(),
    punch_type: 'check-in',
    verification_type: 'finger',
    device_id: device.id,
  }));
}

function filePunches(device, sinceIso) {
  if (!device.filePath) throw new Error(`Device ${device.id}: filePath is required for file adapter`);
  const rows = JSON.parse(fs.readFileSync(device.filePath, 'utf8'));
  const since = sinceIso ? Date.parse(sinceIso) : 0;
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row.employee_code && row.punch_time && Date.parse(row.punch_time) > since)
    .map(row => ({
      employee_code: row.employee_code,
      punch_time: new Date(row.punch_time).toISOString(),
      punch_type: row.punch_type || 'check-in',
      verification_type: row.verification_type || 'finger',
      device_id: row.device_id || device.id,
    }));
}
