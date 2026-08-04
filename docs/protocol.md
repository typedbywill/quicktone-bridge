# NUX MG-30 Firmware 5.0.2 Protocol

The communication between QuickTone and the modeler is through MIDI messages. It basically uses two kinds of MIDI messages:

* Channel Voice Messages, specifically Program Change (PC) and Control Change (CC).
* System Exclusive Messages, also called Sysex messages.

## Channel Voice Messages

#### Program Changes (PC)

Both QuickTone and the modeler send Program Changes MIDI messages when a patch is changed:

`C0 01 00`

| Byte | Description                                                    |
| ---- | -------------------------------------------------------------- |
| `C0` | Program Change (PC), Channel 0                                 |
| `01` | Preset number; in this case the second one, they start at zero |
| `00` | Not used in Program Changes messages                           |

#### Control Changes (CC)

For a complete list of Control Changes messages, see [ControlChanges.md](ControlChanges.md).

**Effect knobs are controlled with MIDI CC**, not SysEx. Example: Amp Knob 1 (Gain) = CC 24 → `B0 18 <0..100>`. See [Parameters.md](Parameters.md).

## System Exclusive Messages

Sysex messages include any number of data bytes and always start with `F0` and end with `F7`.  Here's an example of a Sysex message sent from QuickTone to the modeler:

`F0 43 58 70 15 00 F7`

| Byte | Description                                                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F0` | Sysex message start                                                                                                                                                                                                                                                                                                                     |
| `43` | Manufacturer ID: Yamaha (no clue why they use this)                                                                                                                                                                                                                                                                                     |
| `58` | Instrument ID: NUX modeler                                                                                                                                                                                                                                                                                                              |
| `70` | Application ID / Protocol version                                                                                                                                                                                                                                                                                                       |
| `15` | Command (see below). `15` is for get the current preset (0-127) and scene (0-2) numbers                                                                                                                                                                                                                                                 |
| `00` | Operation. Only last two bits are relevant: b a<br><br>b: 1 if response from the modeler.<br>a: 0 for get operation, 1 for set operation.<br><br>`00` is a get operation (QuickTone is asking the modeler). The modeler will respond with a `02`.<br><br>A set operation would be `01` and the modeler will acknowledge it with a `03`. |
| `F7` | Sysex message end                                                                                                                                                                                                                                                                                                                       |

### 8-bits Data Encapsulation

Most of the Sysex MIDI messages encapsulate 8-bits words inside 7-bits system exclusive data. These multi-byte words are stored in big-endian order.

The standard is to encapsule seven 8-bit bytes into eight 7-bit data bytes but for some reason NUX encapsulates two 8-bit bytes into three 7-bit data bytes.

This is a representation of how the bits are encapsulated. The `a`bits are the first byte and the `b`bits are the second byte.

```
x x x x x x a a
x a a a a a a b
x b b b b b b b
```

To decode the data is very simple: assuming we have an array of 7-bits data called `data` that goes from `data[0]` to `data[2]`, to get the 8-bit word (two bytes) we do as follow:
```
c1 = (data[0] << 6) | ((data[1] & 0x7E) >> 1)
c2 = (data[2] & 0x7F) | ((data[1] & 1) << 7)
```

Here's an example from the *Get IR name* command (see below for commands):

```
F0 43 58 70 09 02 00 00 02 00 00 00 00 01 06 48 
01 20 42 01 1E 47 01 12 45 00 64 31 00 64 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 F7
```

If we take the data which is:

`01 06 48 01 20 42 01 1E 47 01 12 45 00 64 31 00 64 00`

And apply the little algorithm above, we get:

```
$ python decode.py 01 06 48 01 20 42 01 1E 47 01 12 45 00 64 31 00 64 00
Decoded String: CHPBOGIE212
Hex Dump: 43 48 50 42 4F 47 49 45 32 31 32 00 
```

For your convenience you can download that Python script from [here](decode.py).

#### Commands

These  are all the commands that I have identified so far. This is by no means a comprehensive list.

| Command | Description                                                       |
| ------- | ----------------------------------------------------------------- |
| `03`    | Get/set tempo                                                     |
| `09`    | Get/set IR name                                                   |
| `0B`    | Get/set scene saved data                                          |
| `0C`    | Get scene current data (on edit)                                  |
| `0D`    | Get/set effects block order and configuration                     |
| `0F`    | Get custom MIDI configuration (QuickTone Settings -> Custom MIDI) |
| `10`    | Upload/Download IR data.                                          |
| `11`    | Unknown                                                           |
| `12`    | Change preset name (set only)                                     |
| `13`    | Get/set Exp and Pedal settings                                    |
| `14`    | Get/set USB Routing mode                                          |
| `15`    | Get current preset number (0-127) and scene number (0-2)          |
| `17`    | Recall default patch / User patch                                 |
| `18`    | Get/set looper settings                                           |
| `19`    | Get/set drum settings                                             |
| `62`    | Set QuickTone version                                             |
| `6C`    | Unknown                                                           |
| `7E`    | Patch status (default/user)                                       |

> **Parameters / knobs:** there is no SysEx “set param” command in this table. Realtime knob control uses MIDI CC ([ControlChanges.md](ControlChanges.md), [Parameters.md](Parameters.md)). Reading knobs uses the decoded body of `0B` / `0C` scene dumps (layout below).

## 03: Get/Set Tempo

**Query** (15 bytes):
```
F0 43 58 70 03 01 00 78 03 00 00 00 00 00 F7
```
**Response** (15 bytes):
```
F0 43 58 70 03 03 00 78 03 00 00 00 00 00 F7
```

| Offset | Example | Description                                                  |
| ------ | ------- | ------------------------------------------------------------ |
| 4      | `03`    | Command: Get/Set tempo                                       |
| 5      | `01`    | Operation: Set                                               |
| 6-7    | `00 78` | Tempo in bpm:<br>`(c1 << 7) \| c2`<br><br>`00 78` is 120 bpm |

## 04: Get/Set IR Name

**Query** (15 bytes):
```
F0 43 58 70 09 00 03 00 00 00 00 00 00 00 F7
```
**Response** (62 bytes):
```
F0 43 58 70 09 02 03 00 02 00 00 00 00 01 06 48 
01 20 42 01 1E 47 01 12 45 00 64 31 00 64 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
00 00 00 00 00 00 00 00 00 00 00 00 00 F7
```

| Offset | Example | Description                           |
| ------ | ------- | ------------------------------------- |
| 4      | `04`    | Command: Get/Set IR Name              |
| 5      | `00`    | Operation: Get                        |
| 6      | `03`    | Preset number                         |
| 8      | `02`    | IR present (0 false, 2 true)          |
| 13-42  |         | IR name (encoded), 20 characters max. |

**Encoded data:** `01 06 48 01 20 42 01 1E 47 01 12 45 00 64 31 00 64 00`
**Decoded data:** `43 48 50 42 4F 47 49 45 32 31 32 00`
**String:** `CHPBOGIE212`

## 0B: Get/Set Scene Data

**Query** (15 bytes):
```
F0 43 58 70 0B 00 02 01 00 00 00 00 00 00 F7
```

**Response** (222 bytes)
```
F0 43 58 70 0B 02 02 01 01 02 41 01 0A 02 00 06 
01 00 04 07 00 0A 14 01 02 01 00 00 32 02 00 02
00 28 35 01 0A 00 00 06 00 00 62 64 00 00 00 00
00 07 00 1C 41 00 48 33 00 76 29 01 0C 4C 00 18
36 00 56 38 00 74 32 00 58 34 00 60 2F 00 60 2F
00 5A 02 00 28 32 00 00 00 00 06 45 00 2B 56 00
00 00 00 00 08 00 26 31 03 2C 45 01 19 55 01 0C
34 00 06 0D 01 10 0D 00 00 06 00 00 00 00 64 25
01 48 00 00 06 32 00 65 00 00 04 00 01 48 32 00
00 00 01 44 00 00 0A 00 00 02 02 00 06 09 00 08
0A 00 0C 07 00 10 0B 01 06 54 00 5A 41 01 5A 62
01 52 65 01 5C 74 01 06 6C 01 4A 61 01 5C 00 00
02 08 00 04 01 00 00 00 01 48 00 01 48 00 00 00
00 01 20 00 03 70 0B 03 70 0B 03 70 0B F7
```

| Offset | Example | Description                 |
| ------ | ------- | --------------------------- |
| 4      | `0B`    | Command: Get/Set Scene Data |
| 5      | `02`    | Operation: Get response     |
| 6      | `02`    | Preset number (0-127)       |
| 7      | `01`    | Scene number (0-2)          |
| 8-220  |         | Encoded data                |
**Decoded data**:

```
41 41 45 02 03 01 02 07 05 14 41 01 00 32 80 02
14 35 45 00 03 00 31 64 00 00 00 07 0E 41 24 33
3B 29 46 4C 0C 36 2B 38 3A 32 2C 34 30 2F 30 2F
2D 02 14 32 00 00 03 45 15 D6 00 00 00 08 13 31
D6 45 4C D5 46 34 03 0D 48 0D 00 06 00 00 32 25
64 00 03 32 32 80 02 00 64 32 00 00 62 00 05 00
01 02 03 09 04 0A 06 07 08 0B 43 54 2D 41 6D 62
69 65 6E 74 43 6C 65 61 6E 00 01 08 02 01 00 00
64 00 64 00 00 00 50 00 F8 0B F8 0B F8 0B
```

For a list of effects types, and block order, go [here](Effects.md). The bit #7 `(0x40)` indicates the effect is turned off.

| Decoded<br>Offset | Example                                                        | Description                            | **Example Description**  |
| ----------------- | -------------------------------------------------------------- | -------------------------------------- | ------------------------ |
| 0                 | `41`                                                           | WAH                                    | Clyde Wah, off           |
| 1                 | `41`                                                           | CMP / EFX                              | Rose compressor, off     |
| 2                 | `45`                                                           | EFX / MOD                              | Tube Scream, off         |
| 3                 | `02`                                                           | AMP                                    | Deluxe Reverb, on        |
| 4                 | `03`                                                           | EQ                                     | 10-band Eq, on           |
| 5                 | `01`                                                           | GATE                                   | Noise gate, on           |
| 6                 | `02`                                                           | MOD                                    | CE-2, on                 |
| 7                 | `07`                                                           | DLY                                    | Duotime, on              |
| 8                 | `05`                                                           | RVB                                    | Shimmer, on              |
| 9                 | `14`                                                           | IR                                     | User IR, on              |
| 10                | `41`                                                           | S/R                                    | Send/Return, off         |
| 11                | `01`                                                           | VOL                                    | Vol, on                  |
| 12                | `00`                                                           | WAH knob count                         | No knobs for Clyde Wah   |
| 13                | `32`                                                           | WAH knob 1                             |                          |
| 14                | `80`                                                           | WAH knob 2                             |                          |
| 15                | `02`                                                           | CMP knob count                         | Rose compressor: 2 knobs |
| 16                | `14`                                                           | CMP knob 1                             | Sustain: 20              |
| 17                | `35`                                                           | CMP knob 2                             | Level: 53                |
| 18                | `45`                                                           | CMP knob 3                             |                          |
| 19                | `00`                                                           | CMP knob 4                             |                          |
| 20                | `03`                                                           | EFX knob count                         | Tube Scream: 3 knobs     |
| 21                | `00`                                                           | EFX knob 1                             | Drive: 0                 |
| 22                | `31`                                                           | EFX knob 2                             | Tone: 49                 |
| 23                | `64`                                                           | EFX knob 3                             | Level: 100               |
| 24                | `00`                                                           | EFX knob 4                             |                          |
| 25                | `00`                                                           | EFX knob 5                             |                          |
| 26                | `00`                                                           | EFX knob 6                             |                          |
| 27                | `07`                                                           | AMP knobs                              | Deluxe Reverb: 7 knobs   |
| 28                | `0E`                                                           | AMP knob 1                             | Gain: 14                 |
| 29                | `41`                                                           | AMP knob 2                             | Master: 65               |
| 30                | `24`                                                           | AMP knob 3                             | Bass: 36                 |
| 31                | `33`                                                           | AMP knob 4                             | Middle: 51               |
| 32                | `3B`                                                           | AMP knob 5                             | Treble: 59               |
| 33                | `29`                                                           | AMP knob 6                             | Power amp Bias: 41       |
| 34                | `46`                                                           | AMP knob 7                             | Power amp Level: 70      |
| 35                | `4C`                                                           | AMP knob 8                             |                          |
| 36                | `0C`                                                           | EQ knob count                          | 10-band EQ: 12 knobs     |
| 37                | `36`                                                           | EQ knob 1                              | 54                       |
| 38                | `2B`                                                           | EQ knob 2                              | 28                       |
| 39                | `38`                                                           | EQ knob 3                              | 56                       |
| 40                | `3A`                                                           | EQ knob 4                              | 58                       |
| 41                | `32`                                                           | EQ knob 5                              | 50                       |
| 42                | `2C`                                                           | EQ knob 6                              | 44                       |
| 43                | `34`                                                           | EQ knob 7                              | 52                       |
| 44                | `30`                                                           | EQ knob 8                              | 48                       |
| 45                | `2F`                                                           | EQ knob 9                              | 47                       |
| 46                | `30`                                                           | EQ knob 10                             | 48                       |
| 47                | `2F`                                                           | EQ knob 11                             | 47                       |
| 48                | `2D`                                                           | EQ knob 12                             | 45                       |
| 49                | `02`                                                           | GATE knobs                             | Always 2 knobs           |
| 50                | `14`                                                           | GATE knob 1                            | Sens: 20                 |
| 51                | `32`                                                           | GATE knob 2                            | Decay: 50                |
| 52                | `00`                                                           | GATE knob 3                            |                          |
| 53                | `00`                                                           | GATE knob 4                            |                          |
| 54                | `03`                                                           | MOD knob count                         | CE-2: 3 knobs (?)        |
| 55                | `45`                                                           | MOD knob 1                             | Rate: 69                 |
| 56                | `15`                                                           | MOD knob 2                             | Depth: 21                |
| 57                | `D6`                                                           | MOD knob 3                             | Hidden knob for CE-2?    |
| 58                | `00`                                                           | MOD knob 4                             |                          |
| 59                | `00`                                                           | MOD knob 5                             |                          |
| 60                | `00`                                                           | MOD knob 6                             |                          |
| 61                | `08`                                                           | DLY knob count                         | Duotime: 8 knobs         |
| 62                | `13`                                                           | DLY knob 1                             | Level: 19                |
| 63                | `31`                                                           | DLY knob 2                             | Time 1: 49               |
| 64                | `D6`                                                           | DLY knob 3                             | Hidden knob?             |
| 65                | `45`                                                           | DLY knob 4                             | Repeat 1: 69             |
| 66                | `4C`                                                           | DLY knob 5                             | Time 2: 76               |
| 67                | `D5`                                                           | DLY knob 6                             | Hidden knob?             |
| 68                | `46`                                                           | DLY knob 7                             | Repeat 2: 70             |
| 69                | `34`                                                           | DLY knob 8                             | Parameter: 52            |
| 70                | `03`                                                           | RVB knob count                         | Shimmer: 3 knobs         |
| 71                | `0D`                                                           | RVB knob 1                             | Mix: 13                  |
| 72                | `48`                                                           | RVB knob 2                             | Decay: 72                |
| 73                | `0D`                                                           | RVB knob 3                             | Shim: 13                 |
| 74                | `00`                                                           | RVB knob 4                             |                          |
| 75                | `06`                                                           | IR knob count                          | IR: 6 knobs              |
| 76                | `00`                                                           | IR knob 1                              |                          |
| 77                | `00`                                                           | IR knob 2                              |                          |
| 78                | `32`                                                           | IR knob 3                              | Level                    |
| 79                | `25`                                                           | IR knob 4                              | Low cut                  |
| 80                | `64`                                                           | IR knob 5                              | High cut                 |
| 81                | `00`                                                           | IR knob 6                              |                          |
| 82                | `03`                                                           | S/R knob count                         | S/R: 3 knobs             |
| 83                | `32`                                                           | SR knob 1                              | Send: 50                 |
| 84                | `32`                                                           | SR knob 2                              | Return: 50               |
| 85                | `80`                                                           | SR knob 3                              | Branch/Serial: Serial    |
| 86                | `02`                                                           | VOL knob count                         | VOL: 2 knobs             |
| 87                | `00`                                                           | VOL knob 1                             | Min: 0                   |
| 88                | `64`                                                           | VOL knob 2                             | Max: 100                 |
| 89                | `32`                                                           |                                        |                          |
| 90                | `00`                                                           |                                        |                          |
| 91-92             | `00 62`                                                        | Tempo in bpm:<br>`(c1 << 7) \| c2`<br> | 98 bpm                   |
| 93                | `00`                                                           |                                        |                          |
| 94                | `05`                                                           | First block                            | GATE (05)                |
| 95                | `00`                                                           | Second block                           | WAH (00)                 |
| 96                | `01`                                                           | Third block                            | CMP / EFX (01)           |
| 97                | `02`                                                           | Fourth block                           | EFX / MOD (02)           |
| 98                | `03`                                                           | Fifth block                            | AMP (03)                 |
| 99                | `09`                                                           | Sixth block                            | IR (09)                  |
| 100               | `04`                                                           | Seventh block                          | EQ (04)                  |
| 101               | `0A`                                                           | Eighth block                           | S/R (0A)                 |
| 102               | `06`                                                           | Ninth block                            | MOD / EFX (06)           |
| 103               | `07`                                                           | Tenth block                            | DLY (07)                 |
| 104               | `08`                                                           | Eleventh block                         | RVB / DLY (08)           |
| 105               | `0B`                                                           | Twelfth block                          | VOL (0B)                 |
| 106-121           | `43 54 2D 41 6D 62`<br>`69 65 6E 74 74 43`<br>`6C 65 61 6E 00` | Preset name <br>(16 characters max)    | CT-AmbientClean          |
| 122               | `01`                                                           | CTRL                                   | TAP (01)                 |
| 123               | `08`                                                           | NMP-2 B                                | DLY (08)                 |
| 124               | `02`                                                           | NMP-2 A                                | CMP (02)                 |
| 125               | `01`                                                           | Expression Pedal                       | WAH (01)                 |
| 126               | `00`                                                           | Expression FX knob                     | Not used for Clyde       |
| 127               | `00`                                                           | External Expression Pedal              |                          |
| 128               | `64`                                                           | External Expression FX knob            |                          |
| 129               | `00`                                                           |                                        |                          |
| 130               | `64`                                                           |                                        |                          |
| 131               | `00`                                                           |                                        |                          |
| 132               | `00`                                                           |                                        |                          |
| 133               | `00`                                                           |                                        |                          |
| 134               | `50`                                                           |                                        |                          |
| 135               | `00`                                                           |                                        |                          |
| 136               | `F8`                                                           |                                        |                          |
| 137               | `0B`                                                           |                                        |                          |
| 138               | `F8`                                                           |                                        |                          |
| 139               | `0B`                                                           |                                        |                          |
| 140               | `F8`                                                           |                                        |                          |
| 141               | `0B`                                                           |                                        |                          |


## 0C: Get Scene Current Data (on edit)

**Query** (15 bytes):
```
F0 43 58 70 0C 00 00 01 00 00 00 00 00 00 F7
```

**Response** (222 bytes)
```
F0 43 58 70 0C 02 02 01 01 02 41 01 0A 02 00 06 
01 00 04 07 00 0A 14 01 02 01 00 00 32 02 00 02
00 28 35 01 0A 00 00 06 00 00 62 64 00 00 00 00
00 07 00 1C 41 00 48 33 00 76 29 01 0C 4C 00 18
36 00 56 38 00 74 32 00 58 34 00 60 2F 00 60 2F
00 5A 02 00 28 32 00 00 00 00 06 45 00 2B 56 00
00 00 00 00 08 00 26 31 03 2C 45 01 19 55 01 0C
34 00 06 0D 01 10 0D 00 00 06 00 00 00 00 64 25
01 48 00 00 06 32 00 65 00 00 04 00 01 48 32 00
00 00 01 44 00 00 0A 00 00 02 02 00 06 09 00 08
0A 00 0C 07 00 10 0B 01 06 54 00 5A 41 01 5A 62
01 52 65 01 5C 74 01 06 6C 01 4A 61 01 5C 00 00
02 08 00 04 01 00 00 00 01 48 00 01 48 00 00 00
00 01 20 00 03 70 0B 03 70 0B 03 70 0B F7
```

| Offset | Example | Description                                   |
| ------ | ------- | --------------------------------------------- |
| 4      | `0C`    | Command: Get Scene Current Data (on edit)     |
| 5      | `02`    | Operation: Get response                       |
| 6      | `02`    | Ignored for query. Preset number in response. |
| 7      | `01`    | Scene number (0-2)                            |
| 8-220  |         | Encoded data                                  |
The decoded data is exactly the same as the `0B` Get/Set Scene Data.

## 0D: Get/Set Effects Block Order and Configuration

**Query** (7 bytes):
```
F0 43 58 70 0D 00 F7
```
**Response** (20 bytes)
```
F0 43 58 70 0D 02 05 00 01 02 03 09 04 0A 06 07
08 0B 0C F7
```

For a list of the effects numbers for the block order, go [here](Effects.md).

| Offset | Example | Description                                                                                                                                                                                                                                                              |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4      | `0D`    | Command: Get/set effects block order and configuration                                                                                                                                                                                                                   |
| 5      | `02`    | Operation: Get response                                                                                                                                                                                                                                                  |
| 6      | `05`    | First block: GATE (05)                                                                                                                                                                                                                                                   |
| 7      | `00`    | Second block: WAH (00)                                                                                                                                                                                                                                                   |
| 8      | `01`    | Third block: CMP/EFX (01)                                                                                                                                                                                                                                                |
| 9      | `02`    | Fourth block: EFX/MOD (02)                                                                                                                                                                                                                                               |
| 10     | `03`    | Fifth block: AMP (03)                                                                                                                                                                                                                                                    |
| 11     | `09`    | Sixth block: IR (09)                                                                                                                                                                                                                                                     |
| 12     | `04`    | Seventh block: EQ (04)                                                                                                                                                                                                                                                   |
| 13     | `0A`    | Eighth block: S/R (0A)                                                                                                                                                                                                                                                   |
| 14     | `06`    | Ninth block: MOD/EFX (06)                                                                                                                                                                                                                                                |
| 15     | `07`    | Tenth block: DLY (07)                                                                                                                                                                                                                                                    |
| 16     | `08`    | Eleventh block: RVB/DLY (08)                                                                                                                                                                                                                                             |
| 17     | `0B`    | Twelfth block: VOL (0B)                                                                                                                                                                                                                                                  |
| 18     | `0C`    | Bits: 7 6 5 4 3 2 1 0<br><br>1: on for parallel, off for serial<br>2: on if WAH is on<br>3: on for EFX in CMP/EFX block<br>4: on for MOD in EFX/MOD block<br>5: on for EFX in MOD/EFX block<br>6: on for DLY in RVB/DLY block<br><br>`0C`: WAH on, EFX in CMP/EFX block. |

## 0F: Get Custom MIDI Configuration

**Query** (7 bytes):
```
F0 43 58 70 0F 00 F7
```

**Response** (93 bytes):
```
F0 43 58 70 0F 02 00 01 02 03 04 05 06 07 08 09
0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19
1A 1B 1C 1D 1E 1F 20 21 22 23 24 25 26 27 28 29
2A 2B 2C 2D 2E 2F 30 31 32 33 34 35 36 37 38 39
3A 3B 3C 3D 3E 3F 40 41 42 43 44 45 46 47 48 49
4A 4B 4C 4D 4E 4F 50 51 52 53 54 55 F7
```

| Offset | Example | Description                                          |
| ------ | ------- | ---------------------------------------------------- |
| 4      | `0D`    | Command: Get Custom MIDI Configuration               |
| 5      | `02`    | Operation: Get response                              |
| 6-91   |         | Order of the [MIDI CC messages](ControlChanges.md).  |
