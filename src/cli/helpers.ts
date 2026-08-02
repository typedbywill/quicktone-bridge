import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NuxMG30Client, NuxClientOptions } from '../client/NuxMG30Client.js';
import { programChangeToPresetName, presetNameToProgramChange, NUX_MODEL_CATALOG, BLOCK_LIST } from '../constants.js';
import { BlockType, PatchData } from '../types.js';

const STATE_FILE_PATH = path.join(os.homedir(), '.nux-mg30-state.json');

export interface NuxState {
  currentPresetPc: number;
  currentPresetName: string;
  lastUpdated: string;
}

export function loadNuxState(): NuxState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const content = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      if (typeof parsed.currentPresetPc === 'number' && parsed.currentPresetPc >= 0 && parsed.currentPresetPc <= 127) {
        return parsed;
      }
    }
  } catch {}
  return {
    currentPresetPc: 0,
    currentPresetName: '01A',
    lastUpdated: new Date().toISOString()
  };
}

export function saveNuxState(pc: number): void {
  try {
    const info = programChangeToPresetName(pc);
    const state: NuxState = {
      currentPresetPc: pc,
      currentPresetName: info.name,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

export async function finishCommand(client?: NuxMG30Client, exitCode = 0): Promise<never> {
  if (client) {
    try {
      await client.disconnect();
    } catch {}
  }
  await new Promise(resolve => setTimeout(resolve, 50));
  process.exit(exitCode);
}

export interface CommandContext {
  client: NuxMG30Client;
  connected: boolean;
}

/**
 * Creates and connects a NuxMG30Client instance.
 */
export async function createConnectedClient(options: NuxClientOptions = {}): Promise<CommandContext> {
  const client = new NuxMG30Client(options);
  let connected = false;

  try {
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection attempt timed out')), 2000));
    await Promise.race([connectPromise, timeoutPromise]);
    connected = true;
  } catch (err: any) {
    connected = false;
  }

  return { client, connected };
}

/**
 * Ensures device is connected or throws/prints a helpful message.
 */
export async function requireConnection(options: NuxClientOptions = {}): Promise<NuxMG30Client> {
  const { client, connected } = await createConnectedClient(options);
  if (!connected) {
    console.error('\n❌ Error: Failed to connect to NUX MG-30 device.');
    console.error('Please ensure the device is powered on and connected via USB MIDI.\n');
    console.error('Available MIDI Input Ports:', client.listInputPorts().map(p => p.name).join(', ') || 'None');
    console.error('Available MIDI Output Ports:', client.listOutputPorts().map(p => p.name).join(', ') || 'None');
    await finishCommand(client, 1);
  }
  return client;
}

/**
 * Normalizes preset string or number to program change number (0..127) and preset name (e.g. "01A").
 */
export function normalizePresetId(id: string | number): { pc: number; name: string } {
  let pc: number;
  if (typeof id === 'number' || !isNaN(Number(id))) {
    pc = Math.min(127, Math.max(0, Number(id)));
  } else {
    pc = presetNameToProgramChange(id);
  }
  const info = programChangeToPresetName(pc);
  return { pc, name: info.name };
}

/**
 * Normalizes block identifier (e.g., "amp", "AMP", 3).
 */
export function normalizeBlockId(blockStr: string | number): BlockType {
  const str = String(blockStr).toUpperCase();
  const found = BLOCK_LIST.find(b => b === str);
  if (!found) {
    throw new Error(`Unknown block "${blockStr}". Valid blocks: ${BLOCK_LIST.join(', ')}`);
  }
  return found;
}

/**
 * Formats a key-value header card for console output.
 */
export function printCard(title: string, data: Record<string, any>) {
  console.log(`\n========================================`);
  console.log(`  ${title.toUpperCase()}`);
  console.log(`========================================`);
  for (const [key, val] of Object.entries(data)) {
    console.log(`  ${key.padEnd(16)} : ${val}`);
  }
  console.log(`========================================\n`);
}

/**
 * Reads a JSON file safely.
 */
export function readJsonFile<T>(filePath: string): T {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Writes a JSON file safely.
 */
export function writeJsonFile(filePath: string, data: any): void {
  const absPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');
}
