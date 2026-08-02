import { NUX_SYSEX_HEADER, SYSEX_END } from '../constants.js';
import { SysExCommand, SysExDirection } from '../types.js';

export class SysExEncoder {
  /**
   * Builds a raw NUX MG-30 SysEx packet
   * `F0 43 58 70 [CMD] [DIR] [PAYLOAD...] F7`
   */
  public static buildSysExPacket(
    command: SysExCommand | number,
    direction: SysExDirection | number = SysExDirection.HOST_TO_DEVICE,
    payload: number[] | Uint8Array = []
  ): Uint8Array {
    const payloadArr = Array.from(payload);
    const bytes = [
      ...NUX_SYSEX_HEADER,
      command & 0x7F,
      direction & 0x7F,
      ...payloadArr,
      SYSEX_END
    ];
    return new Uint8Array(bytes);
  }

  /**
   * Request full active patch dump (0x0A)
   */
  public static buildPatchDumpRequest(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.HANDSHAKE_PATCH_DUMP, 0x00, SYSEX_END]);
  }

  /**
   * Request signal routing chain / scene config (0x0F)
   */
  public static buildSignalChainRequest(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.SIGNAL_CHAIN_ROUTING, 0x00, SYSEX_END]);
  }

  /**
   * Request global EQ setup (0x14)
   */
  public static buildGlobalEqRequest(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.GLOBAL_EQ_SETUP, 0x00, SYSEX_END]);
  }

  /**
   * Build connection heartbeat ping (0x0E)
   */
  public static buildHeartbeatPing(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.HEARTBEAT_PING, 0x00, SYSEX_END]);
  }

  /**
   * Build MIDI Program Change message (0xC0 [presetIndex])
   */
  public static buildProgramChange(presetIndex: number, channel: number = 0): Uint8Array {
    const status = 0xC0 | (channel & 0x0F);
    return new Uint8Array([status, presetIndex & 0x7F]);
  }

  /**
   * Build MIDI Control Change message (0xB0 [ccNumber] [value])
   */
  public static buildControlChange(ccNumber: number, value: number, channel: number = 0): Uint8Array {
    const status = 0xB0 | (channel & 0x0F);
    return new Uint8Array([status, ccNumber & 0x7F, value & 0x7F]);
  }
}
