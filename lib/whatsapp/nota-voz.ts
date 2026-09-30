// WhatsApp solo muestra nota de voz con OGG Opus y voice:true.
// El navegador graba WAV; esto lo convierte antes de enviarlo.

import OpusScript from "opusscript";

const RATE = 16000;
const FRAME = 320; // 20 ms
const SAMPLES_48 = 960n;
/** Retraso del codificador a 48 kHz. Sin esto la nota empieza cortada. */
const PRE_SKIP = 1836;
const BITRATE = 24_000;

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

function lace(packet: Uint8Array): { lens: number[]; chunks: Uint8Array[] } {
  const lens: number[] = [];
  const chunks: Uint8Array[] = [];
  let off = 0;
  while (true) {
    const n = Math.min(255, packet.length - off);
    lens.push(n);
    if (n > 0) chunks.push(packet.subarray(off, off + n));
    off += n;
    if (n < 255) break;
  }
  return { lens, chunks };
}

function oggPage(opts: {
  type: number;
  granule: bigint;
  serial: number;
  seq: number;
  packets: Uint8Array[];
}): Buffer {
  const lens: number[] = [];
  const chunks: Uint8Array[] = [];
  for (const packet of opts.packets) {
    const laced = lace(packet);
    lens.push(...laced.lens);
    chunks.push(...laced.chunks);
  }
  if (lens.length > 255) throw new Error("Página de audio demasiado grande.");
  const header = Buffer.alloc(27 + lens.length);
  header.write("OggS", 0, "ascii");
  header[5] = opts.type;
  header.writeBigInt64LE(opts.granule, 6);
  header.writeUInt32LE(opts.serial >>> 0, 14);
  header.writeUInt32LE(opts.seq >>> 0, 18);
  header[26] = lens.length;
  for (let i = 0; i < lens.length; i++) header[27 + i] = lens[i]!;
  const page = Buffer.concat([header, ...chunks.map((c) => Buffer.from(c))]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function opusHead(): Buffer {
  const b = Buffer.alloc(19);
  b.write("OpusHead", 0, "ascii");
  b[8] = 1;
  b[9] = 1;
  b.writeUInt16LE(PRE_SKIP, 10);
  b.writeUInt32LE(RATE, 12);
  return b;
}

function opusTags(): Buffer {
  const vendor = Buffer.from("autolujo");
  const b = Buffer.alloc(8 + 4 + vendor.length + 4);
  b.write("OpusTags", 0, "ascii");
  b.writeUInt32LE(vendor.length, 8);
  vendor.copy(b, 12);
  b.writeUInt32LE(0, 12 + vendor.length);
  return b;
}

function leerWavPcm(bytes: Buffer): { sampleRate: number; pcm: Int16Array } {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("La nota no llegó en un formato que pueda enviar.");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let data: Buffer | null = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) break;
    if (id === "fmt ") {
      const format = bytes.readUInt16LE(start);
      if (format !== 1) throw new Error("La nota no llegó en un formato que pueda enviar.");
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bits = bytes.readUInt16LE(start + 14);
    } else if (id === "data") {
      data = bytes.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!data || bits !== 16 || channels < 1 || sampleRate < 8000) {
    throw new Error("La nota no llegó en un formato que pueda enviar.");
  }
  const samples = Math.floor(data.length / (2 * channels));
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
    const mixed = Math.round(sum / channels);
    pcm[i] = Math.max(-32768, Math.min(32767, mixed));
  }
  return { sampleRate, pcm };
}

function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return pcm;
  const outLen = Math.max(1, Math.round((pcm.length * to) / from));
  const out = new Int16Array(outLen);
  const last = pcm.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = (i * from) / to;
    const i0 = Math.min(last, Math.floor(x));
    const i1 = Math.min(last, i0 + 1);
    const t = x - i0;
    const s = (pcm[i0] ?? 0) * (1 - t) + (pcm[i1] ?? 0) * t;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s)));
  }
  return out;
}

/** WAV PCM → OGG Opus mono, listo para una nota de voz de WhatsApp. */
export function wavANotaOpus(wav: Buffer): Buffer {
  const leido = leerWavPcm(wav);
  const pcm = resample(leido.pcm, leido.sampleRate, RATE);
  if (pcm.length < FRAME / 2) throw new Error("La nota quedó demasiado corta.");

  const enc = new OpusScript(RATE, 1, OpusScript.Application.VOIP);
  const packets: Buffer[] = [];
  try {
    enc.setBitrate(BITRATE);
    for (let i = 0; i < pcm.length; i += FRAME) {
      const frame = new Int16Array(FRAME);
      frame.set(pcm.subarray(i, Math.min(pcm.length, i + FRAME)));
      packets.push(enc.encode(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength), FRAME));
    }
  } finally {
    enc.delete();
  }
  if (packets.length === 0) throw new Error("La nota quedó demasiado corta.");

  const serial = 0x41554c58;
  const pages: Buffer[] = [
    oggPage({ type: 0x02, granule: 0n, serial, seq: 0, packets: [opusHead()] }),
    oggPage({ type: 0x00, granule: 0n, serial, seq: 1, packets: [opusTags()] }),
  ];
  let granule = BigInt(PRE_SKIP);
  let seq = 2;
  let batch: Buffer[] = [];
  const flush = (eos: boolean) => {
    if (batch.length === 0) return;
    pages.push(oggPage({ type: eos ? 0x04 : 0, granule, serial, seq, packets: batch }));
    seq += 1;
    batch = [];
  };
  for (let i = 0; i < packets.length; i++) {
    batch.push(packets[i]!);
    granule += SAMPLES_48;
    if (batch.length >= 48 || i === packets.length - 1) flush(i === packets.length - 1);
  }
  return Buffer.concat(pages);
}
