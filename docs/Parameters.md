# Parameters (get / set)

How `nux block set` / `nux block get` read and write effect knobs on the NUX MG-30.

## Set → MIDI Control Change

Knob changes are **not** SysEx. They use the MIDI CC map from QuickTone Settings → Custom MIDI ([ControlChanges.md](ControlChanges.md)).

| Block | Knob indices | Base CC | Example |
| ----- | ------------ | ------- | ------- |
| WAH   | 0–1          | 12      | Knob 1 → CC 12 |
| CMP   | 0–3          | 14      | Sustain → CC 14 |
| EFX   | 0–5          | 18      | Drive → CC 18 |
| AMP   | 0–7          | 24      | **Gain → CC 24** |
| EQ    | 0–11         | 32      | Band 1 → CC 32 |
| NG    | 0–3          | 44      | Sens → CC 44 |
| MOD   | 0–5          | 48      | Rate → CC 48 |
| DLY   | 0–7          | 54      | Level → CC 54 |
| RVB   | 0–3          | 62      | Mix → CC 62 |
| IR    | 0–5          | 66      | Level (knob 3) → CC 68 |
| SR    | 0–2          | 72      | Send → CC 72 |
| VOL   | 0–2          | 75      | Min → CC 75 |
| CAB   | —            | —       | No dedicated CCs (use IR) |

Wire format:

```
B0 <cc> <value>
```

Example — set AMP Gain to 80:

```
B0 18 50
```

(`0x18` = 24, `0x50` = 80)

**Value range:** 0–100 (as in ControlChanges.md). The CLI clamps to this range.

CCs 0–11 select the **model** for each block (not knobs). The bridge CLI uses SysEx `MODEL_SELECT` via `nux block model` / `client.setModel`.

### Legacy note

An earlier bridge build sent SysEx `F0 43 58 70 01 01 <block> <param> <value> F7`. That command is **not** in [protocol.md](protocol.md) and does not work on the MG-30. It was removed in favor of MIDI CC.

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
nux block set AMP Gain 80     # sends B0 18 50
nux block min AMP Gain        # 0
nux block max AMP Gain        # 100
nux block model AMP           # list amp models
nux block model AMP 6         # select by id
nux block model AMP "Plexi 100"
```

Knob **names** follow the scene-dump order in protocol.md (e.g. AMP: Gain, Master, Bass, Middle, Treble, Bias, Level). Exact labels still depend on the loaded model; indices always match ControlChanges knob numbers.
