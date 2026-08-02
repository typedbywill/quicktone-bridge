#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { NuxMG30Client } from './client/NuxMG30Client.js';
import { BlockType } from './types.js';

const server = new McpServer({
  name: 'quicktone-bridge',
  version: '1.0.0'
});

const blockTypeSchema = z.enum(['WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'CAB']);

// Helper to get connected client
async function getConnectedClient() {
  const client = new NuxMG30Client();
  await client.connect();
  return client;
}

// Tool 1: list_midi_ports
server.tool(
  'list_midi_ports',
  'Lists available MIDI input and output ports detected on the system',
  {},
  async () => {
    const client = new NuxMG30Client();
    const inputs = client.listInputPorts();
    const outputs = client.listOutputPorts();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ inputs, outputs }, null, 2)
      }]
    };
  }
);

// Tool 2: get_active_patch
server.tool(
  'get_active_patch',
  'Queries the connected NUX MG-30 for the current active patch state (BPM, active scene, signal chain, block ON/OFF statuses, model IDs)',
  {},
  async () => {
    let client: NuxMG30Client | null = null;
    try {
      client = await getConnectedClient();
      const patch = await client.requestPatchDump(3000);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            presetName: patch.presetName,
            userPatchName: patch.userPatchName,
            bpm: patch.bpm,
            scene: patch.scene,
            signalChain: patch.signalChain,
            blocks: patch.blocks
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to fetch patch dump: ${err.message}` }]
      };
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
);

// Tool 3: switch_preset
server.tool(
  'switch_preset',
  'Switches the NUX MG-30 to a specific preset bank (e.g. "01A", "02B", "15C" or index 0..127)',
  {
    preset: z.union([z.string(), z.number()]).describe('Preset string name like "01A" or 0-indexed number 0..127')
  },
  async ({ preset }) => {
    let client: NuxMG30Client | null = null;
    try {
      client = await getConnectedClient();
      client.setPreset(preset);
      return {
        content: [{
          type: 'text',
          text: `Successfully switched NUX MG-30 to preset "${preset}".`
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to switch preset: ${err.message}` }]
      };
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
);

// Tool 4: toggle_effect_block
server.tool(
  'toggle_effect_block',
  'Toggles an effect block ON or OFF in real time on the NUX MG-30',
  {
    block: blockTypeSchema.describe('Effect block identifier (WAH, CMP, EFX, AMP, EQ, NG, MOD, DLY, RVB, CAB)'),
    enabled: z.boolean().describe('True to turn ON, false to turn OFF')
  },
  async ({ block, enabled }) => {
    let client: NuxMG30Client | null = null;
    try {
      client = await getConnectedClient();
      client.setBlockState(block as BlockType, enabled);
      return {
        content: [{
          type: 'text',
          text: `Successfully toggled effect block [${block}] to ${enabled ? 'ON' : 'OFF'}.`
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to toggle effect block: ${err.message}` }]
      };
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
);

// Tool 5: set_effect_model
server.tool(
  'set_effect_model',
  'Selects an effect model for a specific block on the NUX MG-30',
  {
    block: blockTypeSchema.describe('Effect block identifier'),
    modelId: z.number().int().min(0).max(127).describe('Model ID index (0..127)')
  },
  async ({ block, modelId }) => {
    let client: NuxMG30Client | null = null;
    try {
      client = await getConnectedClient();
      client.setModel(block as BlockType, modelId);
      return {
        content: [{
          type: 'text',
          text: `Successfully set effect block [${block}] model to #${modelId}.`
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to set effect model: ${err.message}` }]
      };
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
);

// Tool 6: set_parameter
server.tool(
  'set_parameter',
  'Adjusts a knob parameter value in real time for a block on the NUX MG-30',
  {
    block: blockTypeSchema.describe('Effect block identifier'),
    paramId: z.number().int().min(0).max(127).describe('Parameter index (0=Gain/Time, 1=Master/Feedback, 2=Bass/Mix, etc.)'),
    value: z.number().int().min(0).max(127).describe('Parameter value (0..127)')
  },
  async ({ block, paramId, value }) => {
    let client: NuxMG30Client | null = null;
    try {
      client = await getConnectedClient();
      client.setParameter(block as BlockType, paramId, value);
      return {
        content: [{
          type: 'text',
          text: `Successfully set block [${block}] parameter #${paramId} to value ${value}.`
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to set parameter: ${err.message}` }]
      };
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
);

// Tool 7: save_patch
server.tool(
  'save_patch',
  'Saves/stores current edits directly into hardware preset memory',
  {
    preset: z.union([z.string(), z.number()]).optional().describe('Target preset name like "01A" or index 0..127')
  },
  async ({ preset }) => {
    let client: NuxMG30Client | null = null;
    try {
      client = await getConnectedClient();
      client.savePatch(preset);
      return {
        content: [{
          type: 'text',
          text: `Successfully saved patch edits to hardware memory${preset ? ` (preset ${preset})` : ''}.`
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to save patch: ${err.message}` }]
      };
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
);

// Start STDIO transport
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(err => {
  console.error('MCP Server Error:', err);
  process.exit(1);
});
