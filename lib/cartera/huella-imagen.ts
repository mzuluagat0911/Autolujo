// Huella perceptual (dHash de 64 bits). La misma captura, recompresa o
// un poco recortada en el brillo, queda cerca. Otra imagen queda lejos.
// No rechaza pagos: solo produce la huella para compararla en sombra.

import { unzlibSync, zlibSync } from "fflate";
import { decode as decodificarJpeg } from "jpeg-js";

export const UMBRAL_IMAGEN = 10;

const TOPE_PIXELES = 8_000_000;

export function huellaPerceptual(gris: Uint8Array, ancho: number, alto: number): string | null {
  if (ancho < 2 || alto < 2 || gris.length < ancho * alto) return null;
  const w = 9;
  const h = 8;
  const small = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * alto) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * alto) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * ancho) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * ancho) / w));
      let suma = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < alto; yy++) {
        for (let xx = x0; xx < x1 && xx < ancho; xx++) {
          suma += gris[yy * ancho + xx] ?? 0;
          n++;
        }
      }
      small[y * w + x] = n ? Math.round(suma / n) : 0;
    }
  }
  let bits = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 8; x++) {
      bits += (small[y * w + x] ?? 0) < (small[y * w + x + 1] ?? 0) ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function distanciaHuella(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    if (Number.isNaN(x)) return 64;
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

export function mismaImagen(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return distanciaHuella(a, b) <= UMBRAL_IMAGEN;
}

export function huellaDesdeBytes(bytes: Uint8Array): string | null {
  const img = rasterizar(bytes);
  if (!img) return null;
  return huellaPerceptual(img.gris, img.ancho, img.alto);
}

function rasterizar(bytes: Uint8Array): { gris: Uint8Array; ancho: number; alto: number } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return leerPng(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return leerJpeg(bytes);
  return null;
}

function leerJpeg(bytes: Uint8Array): { gris: Uint8Array; ancho: number; alto: number } | null {
  try {
    const raw = decodificarJpeg(bytes, { useTArray: true, maxMemoryUsageInMB: 32 });
    if (!raw.width || !raw.height || raw.width * raw.height > TOPE_PIXELES) return null;
    return { gris: grisDeRgba(raw.data, raw.width, raw.height), ancho: raw.width, alto: raw.height };
  } catch {
    return null;
  }
}

function grisDeRgba(data: Uint8Array, ancho: number, alto: number): Uint8Array {
  const gris = new Uint8Array(ancho * alto);
  for (let i = 0; i < ancho * alto; i++) {
    const o = i * 4;
    gris[i] = Math.round(((data[o] ?? 0) + (data[o + 1] ?? 0) + (data[o + 2] ?? 0)) / 3);
  }
  return gris;
}

function leerPng(bytes: Uint8Array): { gris: Uint8Array; ancho: number; alto: number } | null {
  const firma = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || firma.some((b, i) => bytes[i] !== b)) return null;
  let o = 8;
  let ancho = 0;
  let alto = 0;
  let bit = 0;
  let color = 0;
  let entrelazado = 1;
  const idats: Uint8Array[] = [];
  while (o + 12 <= bytes.length) {
    const len = u32(bytes, o);
    const tipo = String.fromCharCode(bytes[o + 4]!, bytes[o + 5]!, bytes[o + 6]!, bytes[o + 7]!);
    if (o + 12 + len > bytes.length) return null;
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (tipo === "IHDR" && data.length >= 13) {
      ancho = u32(data, 0);
      alto = u32(data, 4);
      bit = data[8] ?? 0;
      color = data[9] ?? 0;
      entrelazado = data[12] ?? 1;
    } else if (tipo === "IDAT") {
      idats.push(data);
    } else if (tipo === "IEND") {
      break;
    }
    o += 12 + len;
  }
  if (bit !== 8 || entrelazado !== 0 || (color !== 0 && color !== 2 && color !== 6)) return null;
  if (ancho < 2 || alto < 2 || ancho * alto > TOPE_PIXELES) return null;
  const bpp = color === 6 ? 4 : color === 2 ? 3 : 1;
  let crudo: Uint8Array;
  try {
    crudo = unzlibSync(unir(idats));
  } catch {
    return null;
  }
  const stride = ancho * bpp;
  if (crudo.length < (stride + 1) * alto) return null;
  const gris = new Uint8Array(ancho * alto);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let i = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[i++] ?? 99;
    if (filtro > 4) return null;
    const fila = crudo.subarray(i, i + stride);
    i += stride;
    if (!desfiltrar(filtro, fila, cur, prev, bpp)) return null;
    for (let x = 0; x < ancho; x++) {
      const p = x * bpp;
      const r = cur[p] ?? 0;
      const g = bpp === 1 ? r : (cur[p + 1] ?? 0);
      const b = bpp === 1 ? r : (cur[p + 2] ?? 0);
      gris[y * ancho + x] = Math.round((r + g + b) / 3);
    }
    prev.set(cur);
  }
  return { gris, ancho, alto };
}

function desfiltrar(filtro: number, fila: Uint8Array, cur: Uint8Array, prev: Uint8Array, bpp: number): boolean {
  for (let i = 0; i < fila.length; i++) {
    const left = i >= bpp ? (cur[i - bpp] ?? 0) : 0;
    const up = prev[i] ?? 0;
    const ul = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
    let v = fila[i] ?? 0;
    if (filtro === 1) v += left;
    else if (filtro === 2) v += up;
    else if (filtro === 3) v += Math.floor((left + up) / 2);
    else if (filtro === 4) v += paeth(left, up, ul);
    cur[i] = v & 255;
  }
  return true;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

function unir(partes: Uint8Array[]): Uint8Array {
  const n = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** PNG RGB de 8 bits, sin entrelazar. Sirve para probar el lector. */
export function pngDeRgba(ancho: number, alto: number, rgba: Uint8Array): Uint8Array {
  const stride = ancho * 4;
  const raw = new Uint8Array((stride + 1) * alto);
  for (let y = 0; y < alto; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const z = zlibSync(raw);
  const ihdr = new Uint8Array(13);
  escribirU32(ihdr, 0, ancho);
  escribirU32(ihdr, 4, alto);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const trozos = [firmaPng(), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array())];
  return unir(trozos);
}

const CRC = tablaCrc();

function firmaPng(): Uint8Array {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
}

function chunk(tipo: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  escribirU32(out, 0, data.length);
  out[4] = tipo.charCodeAt(0);
  out[5] = tipo.charCodeAt(1);
  out[6] = tipo.charCodeAt(2);
  out[7] = tipo.charCodeAt(3);
  out.set(data, 8);
  escribirU32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function escribirU32(b: Uint8Array, o: number, n: number) {
  b[o] = (n >>> 24) & 255;
  b[o + 1] = (n >>> 16) & 255;
  b[o + 2] = (n >>> 8) & 255;
  b[o + 3] = n & 255;
}

function tablaCrc(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
