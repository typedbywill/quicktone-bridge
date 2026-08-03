import { describe, it, expect } from 'vitest';
import { NuxMG30Client } from '../src/client/NuxMG30Client.js';
import { BaseTransport } from '../src/transport/BaseTransport.js';
import { MidiPortInfo } from '../src/types.js';
import { findBlockParam, NUX_BLOCK_PARAM_CATALOG } from '../src/constants.js';

class DummyTransport extends BaseTransport {
  public sentMessages: Uint8Array[] = [];
  public isConnected = false;

  public async connect(): Promise<void> {
    this.isConnected = true;
  }
  public async disconnect(): Promise<void> {
    this.isConnected = false;
  }
  public send(data: Uint8Array): void {
    this.sentMessages.push(data);
  }
  public listInputPorts(): MidiPortInfo[] {
    return [];
  }
  public listOutputPorts(): MidiPortInfo[] {
    return [];
  }
}

describe('NuxMG30Client Preset Navigation Tests', () => {
  it('should navigate preset up and down correctly', () => {
    const transport = new DummyTransport();
    const client = new NuxMG30Client({ transport });

    // Initial preset index should be 0 (01A)
    expect(client.getActivePresetIndex()).toBe(0);
    expect(client.getActivePresetInfo().name).toBe('01A');

    // Preset Up -> 01B (index 1)
    const infoUp1 = client.presetUp();
    expect(infoUp1.name).toBe('01B');
    expect(client.getActivePresetIndex()).toBe(1);

    // Preset Up from 01B -> 01C (index 2)
    const infoUp2 = client.presetUp();
    expect(infoUp2.name).toBe('01C');
    expect(client.getActivePresetIndex()).toBe(2);

    // Preset Down from 01C -> 01B (index 1)
    const infoDown1 = client.presetDown();
    expect(infoDown1.name).toBe('01B');
    expect(client.getActivePresetIndex()).toBe(1);

    // Set to 32D (index 127) and Preset Up -> wraps around to 01A (index 0)
    client.setPreset('32D');
    expect(client.getActivePresetIndex()).toBe(127);
    const wrapUp = client.presetUp();
    expect(wrapUp.name).toBe('01A');
    expect(client.getActivePresetIndex()).toBe(0);

    // Preset Down from 01A -> wraps around to 32D (index 127)
    const wrapDown = client.presetDown();
    expect(wrapDown.name).toBe('32D');
    expect(client.getActivePresetIndex()).toBe(127);
  });
});

describe('NUX Block Parameter Resolution Tests', () => {
  it('should correctly resolve block and paramId for explicit block and param name', () => {
    expect(NUX_BLOCK_PARAM_CATALOG.AMP.length).toBeGreaterThan(0);

    const ampGain = findBlockParam('AMP', 'Gain');
    expect(ampGain.block).toBe('AMP');
    expect(ampGain.paramId).toBe(0);
    expect(ampGain.paramName).toBe('Gain');

    const dlyTime = findBlockParam('DLY', 'Time');
    expect(dlyTime.block).toBe('DLY');
    expect(dlyTime.paramId).toBe(0);
    expect(dlyTime.paramName).toBe('Time');

    const modRate = findBlockParam('MOD', 'Rate');
    expect(modRate.block).toBe('MOD');
    expect(modRate.paramId).toBe(0);
    expect(modRate.paramName).toBe('Rate');

    const modMix = findBlockParam('MOD', 'Mix');
    expect(modMix.block).toBe('MOD');
    expect(modMix.paramId).toBe(2);
    expect(modMix.paramName).toBe('Mix');
  });

  it('should correctly resolve param by single param name or numeric index', () => {
    const timeParam = findBlockParam('Time');
    expect(timeParam.block).toBe('DLY');
    expect(timeParam.paramId).toBe(0);

    const numericParam = findBlockParam('AMP', '3');
    expect(numericParam.block).toBe('AMP');
    expect(numericParam.paramId).toBe(3);
    expect(numericParam.paramName).toBe('Treble');
  });
});
