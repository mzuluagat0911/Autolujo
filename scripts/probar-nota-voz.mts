// La nota que sale del chat tiene que ser OGG Opus y decodificar el audio original.
import { wavANotaOpus } from "../lib/whatsapp/nota-voz.ts";
import OpusScript from "opusscript";

function wavTono(segundos: number, rate: number): Buffer {
  const samples = Math.round(segundos * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const s = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000);
    data.writeInt16LE(s, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function paginas(ogg: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let off = 0;
  while (off + 27 <= ogg.length) {
    if (ogg.toString("ascii", off, off + 4) !== "OggS") throw new Error("Página Ogg inválida");
    const segs = ogg[off + 26]!;
    let body = 0;
    for (let i = 0; i < segs; i++) body += ogg[off + 27 + i]!;
    const end = off + 27 + segs + body;
    out.push(ogg.subarray(off, end));
    off = end;
  }
  if (off !== ogg.length) throw new Error("El Ogg quedó truncado");
  return out;
}

function paquetes(page: Buffer): Buffer[] {
  const segs = page[26]!;
  const lens: number[] = [];
  for (let i = 0; i < segs; i++) lens.push(page[27 + i]!);
  let off = 27 + segs;
  const packets: Buffer[] = [];
  let cur: Buffer[] = [];
  for (const n of lens) {
    if (n > 0) cur.push(page.subarray(off, off + n));
    off += n;
    if (n < 255) {
      packets.push(Buffer.concat(cur));
      cur = [];
    }
  }
  return packets;
}

const wav = wavTono(1, 44100);
const ogg = wavANotaOpus(wav);
if (!ogg.subarray(0, 4).equals(Buffer.from("OggS"))) throw new Error("No empieza en OggS");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = (r & 0x80000000) !== 0 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]!) & 0xff]!) >>> 0;
  }
  return crc >>> 0;
}

const pages = paginas(ogg);
for (const page of pages) {
  const stored = page.readUInt32LE(22);
  const copy = Buffer.from(page);
  copy.writeUInt32LE(0, 22);
  if (oggCrc(copy) !== stored) throw new Error("Checksum Ogg inválido");
}
const packets = pages.flatMap(paquetes);
if (!packets[0]?.subarray(0, 8).equals(Buffer.from("OpusHead"))) throw new Error("Falta OpusHead");
if (!packets[1]?.subarray(0, 8).equals(Buffer.from("OpusTags"))) throw new Error("Falta OpusTags");

const dec = new OpusScript(16000, 1, OpusScript.Application.VOIP);
const pcm = Buffer.concat(packets.slice(2).map((p) => dec.decode(p)));
dec.delete();

const original = wav.subarray(44);
const rateIn = 44100;
const n = Math.floor(pcm.length / 2);
let best = -1;
for (let lag = 0; lag < 2000; lag++) {
  let dot = 0;
  let a = 0;
  let b = 0;
  const usable = Math.min(n - lag, Math.floor(original.length / 2));
  for (let i = 0; i < usable; i += 8) {
    const s = pcm.readInt16LE((i + lag) * 2);
    const x = (i * rateIn) / 16000;
    const i0 = Math.min(original.length / 2 - 1, Math.floor(x));
    const p = original.readInt16LE(i0 * 2);
    dot += s * p;
    a += s * s;
    b += p * p;
  }
  const c = dot / Math.sqrt(a * b);
  if (c > best) best = c;
}
if (best < 0.95) throw new Error(`La nota no conserva el audio (${best.toFixed(3)})`);
console.log(`nota de voz ok · ${ogg.length} bytes · correlación ${best.toFixed(3)}`);
