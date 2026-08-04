# Parameters (get / set)

How `nux block set` / `nux block get` read and write effect knobs on the NUX MG-30.

## Set → SysEx scene write (`0B`)

Knob / model / block ON-OFF changes are written by **read-modify-write** of the scene body:

1. Dump scene via `0C`
2. Unpack 7-bit payload, patch the model byte or knob slot
3. Pack and **SET** via SysEx `0B` (saved scene data)
4. Reload the preset (Program Change) so the edit buffer matches

MIDI CC from [ControlChanges.md](ControlChanges.md) is still emitted as a best-effort companion, but on USB the MG-30 does **not** apply those CCs to the edit buffer (verified against hardware). The Custom MIDI map remains useful for external controllers when configured in QuickTone.

| Block | Knob indices | Scene body | Example |
| ----- | ------------ | ---------- | ------- |
| WAH   | 0–1          | slots after models | Knob 1 |
| CMP   | 0–3          | … | Sustain |
| EFX   | 0–5          | … | Drive |
| AMP   | 0–7          | … | **Gain** |
| EQ    | 0–11         | … | Band 1 |
| NG    | 0–3          | … | Sens |
| MOD   | 0–5          | … | Rate |
| DLY   | 0–7          | … | Level |
| RVB   | 0–3          | … | Mix |
| IR    | 0–5          | … | Level (knob 3) |
| SR    | 0–2          | … | Send |
| VOL   | 0–2          | … | Min |
| CAB   | —            | — | No scene model slot (use IR) |

**Value range:** 0–100. The CLI clamps to this range.

Model select and block enable bits live in the first 12 decoded bytes (`bit 0x40` = OFF). There is no dedicated SysEx “MODEL_SELECT” command — protocol `0x03` is tempo.

### Legacy note

Earlier bridge builds tried:

- SysEx `F0 43 58 70 01 01 <block> <param> <value> F7` (not in protocol.md)
- MIDI CC alone for knobs

Neither reliably updates the MG-30 over USB. Use the `0B` path above.

## Get → Scene dump SysEx

MIDI CC cannot query a value. To **read** knobs:

1. Request current scene data: command `0C` (see [protocol.md](protocol.md) §0C).
2. Unpack the 7-bit payload (2×8-bit → 3×7-bit encoding).
3. Read models (offsets 0–11) and knob slots (offsets 12+) per §0B layout.

CLI flow: `nux block get AMP Gain` → `requestPatchDump()` → `PatchDecoder` → `blocks.AMP.params[0]`.

Local JSON cache is only a fallback when the dump fails.

## CLI

```bash
nux block params              # catalog per block
nux block params AMP
nux block show AMP            # state, model, knobs
nux block get AMP Gain
nux block set AMP Gain 80     # scene SysEx 0B RMW (+ optional CC)
nux block min AMP Gain        # 0
nux block max AMP Gain        # 100
nux block model AMP           # list amp models
nux block model AMP 6         # select by id
nux block model AMP "Plexi 100"
```

Knob **names** follow the scene-dump order in protocol.md (e.g. AMP: Gain, Master, Bass, Middle, Treble, Bias, Level). Exact labels still depend on the loaded model; indices always match ControlChanges knob numbers.
