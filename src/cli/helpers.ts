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
  blockStates: Record<string, boolean>;
  paramStates: Record<string, number>;
  activeScene: number;
  sceneStates: Record<number, Record<string, boolean>>;
  lastUpdated: string;
}

export const DEFAULT_BLOCK_STATES: Record<string, boolean> = {
  WAH: false,
  NG: true,
  CMP: false,
  MOD: false,
  EFX: false,
  AMP: true,
  IR: true,
  EQ: false,
  SR: false,
  DLY: false,
  RVB: false,
  VOL: true,
  CAB: true
};

export function loadNuxState(): NuxState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const content = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      if (typeof parsed.currentPresetPc === 'number' && parsed.currentPresetPc >= 0 && parsed.currentPresetPc <= 127) {
        return {
          currentPresetPc: parsed.currentPresetPc,
          currentPresetName: parsed.currentPresetName || '01A',
          blockStates: { ...DEFAULT_BLOCK_STATES, ...(parsed.blockStates || {}) },
          paramStates: parsed.paramStates || {},
          activeScene: parsed.activeScene || 1,
          sceneStates: parsed.sceneStates || {},
          lastUpdated: parsed.lastUpdated || new Date().toISOString()
        };
      }
    }
  } catch {}
  return {
    currentPresetPc: 0,
    currentPresetName: '01A',
    blockStates: { ...DEFAULT_BLOCK_STATES },
    paramStates: {},
    activeScene: 1,
    sceneStates: {},
    lastUpdated: new Date().toISOString()
  };
}

export function saveNuxState(
  pc: number, 
  blockStates?: Record<string, boolean>, 
  paramStates?: Record<string, number>,
  activeScene?: number,
  sceneStates?: Record<number, Record<string, boolean>>
): void {
  try {
    const currentState = loadNuxState();
    const info = programChangeToPresetName(pc);
    const state: NuxState = {
      currentPresetPc: pc,
      currentPresetName: info.name,
      blockStates: blockStates ? { ...currentState.blockStates, ...blockStates } : (pc !== currentState.currentPresetPc ? { ...DEFAULT_BLOCK_STATES } : currentState.blockStates),
      paramStates: paramStates ? { ...currentState.paramStates, ...paramStates } : currentState.paramStates,
      activeScene: activeScene !== undefined ? activeScene : currentState.activeScene,
      sceneStates: sceneStates ? { ...currentState.sceneStates, ...sceneStates } : currentState.sceneStates,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

export function getPersistedBlockState(block: BlockType): boolean {
  const state = loadNuxState();
  return state.blockStates[block] ?? false;
}

export function setPersistedBlockState(block: BlockType, enabled: boolean): void {
  const state = loadNuxState();
  state.blockStates[block] = enabled;
  saveNuxState(state.currentPresetPc, state.blockStates, state.paramStates);
}

export function getPersistedParamState(block: BlockType, paramId: number): number {
  const state = loadNuxState();
  const key = `${block}:${paramId}`;
  return state.paramStates?.[key] ?? 64;
}

export function setPersistedParamState(block: BlockType, paramId: number, value: number): void {
  const state = loadNuxState();
  const paramStates = { ...(state.paramStates || {}), [`${block}:${paramId}`]: value };
  saveNuxState(state.currentPresetPc, state.blockStates, paramStates, state.activeScene, state.sceneStates);
}

export function getPersistedActiveScene(): number {
  const state = loadNuxState();
  return state.activeScene || 1;
}

export function setPersistedActiveScene(scene: number): void {
  const state = loadNuxState();
  const validScene = Math.min(3, Math.max(1, scene));
  saveNuxState(state.currentPresetPc, state.blockStates, state.paramStates, validScene, state.sceneStates);
}

export function getPersistedSceneBlockStates(scene: number): Record<string, boolean> {
  const state = loadNuxState();
  return state.sceneStates?.[scene] ? { ...state.sceneStates[scene] } : { ...state.blockStates };
}

export function setPersistedSceneBlockStates(scene: number, blockStates: Record<string, boolean>): void {
  const state = loadNuxState();
  const sceneStates = { ...(state.sceneStates || {}), [scene]: { ...blockStates } };
  saveNuxState(state.currentPresetPc, state.blockStates, state.paramStates, state.activeScene, sceneStates);
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
