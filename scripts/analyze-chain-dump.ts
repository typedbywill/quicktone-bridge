/**
 * Analisa o dump hex do NUX MG-30 procurando onde a cadeia de sinal é armazenada.
 */

const BLOCK_LIST = ['WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'CAB', 'IR', 'SR', 'VOL'];

// Dump capturado com DLY/RVB trocados (RVB antes de DLY)
const swappedHex = `10020106010024100102010110020004
1401020100003200000200140a010a00
00083200643200000000000700643201
4800014864006436000e320068340064
32006a32006432006432006402004632
000000000650003d5600000000000400
3228007e0500000000000000084b0000
4b002806000000006400014800000632
00640000040001483200000001480000
00050002060004030012040014070010
0b011a45012641004044012420005620
011c6f01446501587300140700180100
04000148000148000000000120000074
0b00740b00740b`.replace(/\n/g, '');

const bytes = [];
for (let i = 0; i < swappedHex.length; i += 2) {
  bytes.push(parseInt(swappedHex.substring(i, i + 2), 16));
}

console.log(`Total bytes: ${bytes.length}`);
console.log('\n=== Procurando sequências que possam representar a cadeia (13 blocos = índices 0-12) ===\n');

// Procurar sequências de 13 bytes consecutivos onde cada valor está entre 0-12
for (let start = 0; start < bytes.length - 12; start++) {
  const window = bytes.slice(start, start + 13);
  const allValid = window.every(b => b >= 0 && b <= 12);
  const uniqueVals = new Set(window);
  
  if (allValid && uniqueVals.size >= 8) {
    console.log(`  Offset ${start} (0x${start.toString(16)}): [${window.join(', ')}]`);
    console.log(`    Blocos: ${window.map(i => BLOCK_LIST[i] || '??').join(' → ')}`);
    console.log(`    Valores únicos: ${uniqueVals.size}`);
    console.log('');
  }
}

// Procurar em janelas maiores com possíveis gaps
console.log('=== Procurando pares de bytes onde o índice de RVB(8) e DLY(7) aparecem próximos ===\n');
for (let i = 0; i < bytes.length; i++) {
  if (bytes[i] === 8 || bytes[i] === 7) {
    const context = bytes.slice(Math.max(0, i - 3), Math.min(bytes.length, i + 4));
    console.log(`  Offset ${i} (0x${i.toString(16)}): valor=${bytes[i]} (${BLOCK_LIST[bytes[i]]}), contexto: [${context.map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
  }
}

// Também mostrar a mensagem SysEx que o QuickTone mandou
console.log('\n=== Análise da mensagem SysEx capturada pelo sniffer ===');
const sysex = [0xF0, 0x43, 0x58, 0x70, 0x7E, 0x02, 0x0D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7];
console.log(`Bytes: ${sysex.map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
console.log(`Header: F0 43 58 70 7E`);
console.log(`Byte 5: 0x02 (${sysex[5]}) - Possível comando de chain reorder`);
console.log(`Byte 6: 0x0D (${sysex[6]} = 13) - Número de blocos`);
console.log(`Bytes 7-13: ${sysex.slice(7, 14).map(b => b.toString(16).padStart(2, '0')).join(' ')} - Dados (7 bytes de zeros?)`);

// Mostrar dump com offsets formatados
console.log('\n=== DUMP COMPLETO COM OFFSETS ===');
for (let i = 0; i < bytes.length; i += 16) {
  const slice = bytes.slice(i, Math.min(i + 16, bytes.length));
  const hex = slice.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const ascii = slice.map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
  console.log(`  ${i.toString().padStart(3, '0')} (0x${i.toString(16).padStart(3, '0')}): ${hex.padEnd(48)} ${ascii}`);
}
