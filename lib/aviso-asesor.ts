// Aviso al asesor: sonido + notificación de escritorio.
// Pensado para Chrome, Edge, Firefox y Safari (escritorio). El audio de los
// navegadores solo arranca después de un clic; por eso hay que "desbloquearlo".

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
const LS_SONIDO = "autolujo.aviso.sonido";

export function sonidoActivado(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(LS_SONIDO) !== "off";
  } catch {
    return true;
  }
}

export function setSonidoActivado(on: boolean): void {
  try {
    localStorage.setItem(LS_SONIDO, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

function AC(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext;
}

function getCtx(): AudioContext | null {
  const Ctor = AC();
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Llamar en el primer clic/tecla: Chrome, Safari y Firefox bloquean el audio hasta entonces. */
export function desbloquearAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
  if (typeof Audio !== "undefined" && !htmlAudio) {
    htmlAudio = new Audio(wavAvisoUri());
    htmlAudio.preload = "auto";
  }
}

export function soportaNotificaciones(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof Notification !== "undefined"
  );
}

export function permisoNotificacion(): NotificationPermission | "unsupported" {
  if (!soportaNotificaciones()) return "unsupported";
  return Notification.permission;
}

export function pedirPermisoNotificacion(): Promise<NotificationPermission | "unsupported"> {
  if (!soportaNotificaciones()) return Promise.resolve("unsupported");
  try {
    const out = Notification.requestPermission();
    if (out && typeof (out as Promise<NotificationPermission>).then === "function") {
      return out as Promise<NotificationPermission>;
    }
  } catch {
    /* Safari antiguo: solo callback */
  }
  return new Promise((resolve) => {
    try {
      Notification.requestPermission((p) => resolve(p));
    } catch {
      resolve("denied");
    }
  });
}

export type AvisoEscritorio = {
  titulo: string;
  cuerpo: string;
  tag: string;
  onClick?: () => void;
};

export function lanzarNotificacionEscritorio(a: AvisoEscritorio): boolean {
  if (!soportaNotificaciones() || Notification.permission !== "granted") return false;
  try {
    const n = new Notification(a.titulo, {
      body: a.cuerpo,
      tag: a.tag,
      silent: false,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      a.onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

function beepOsc(c: AudioContext, freq: number, when: number, dur: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.07, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(when);
  o.stop(when + dur + 0.02);
}

async function sonarWebAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    if (c.state !== "running") return false;
    const t = c.currentTime;
    beepOsc(c, 880, t, 0.14);
    beepOsc(c, 1174, t + 0.2, 0.18);
    return true;
  } catch {
    return false;
  }
}

function sonarHtml(): boolean {
  try {
    if (!htmlAudio) htmlAudio = new Audio(wavAvisoUri());
    htmlAudio.currentTime = 0;
    const p = htmlAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Dos tonos cortos. Web Audio (Safari usa webkit) y, si falla, un WAV en un elemento de audio. */
export async function sonarAviso(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!sonidoActivado()) return false;
  desbloquearAudio();
  if (await sonarWebAudio()) return true;
  return sonarHtml();
}

/** WAV PCM 16-bit: dos pitidos. Sirve como respaldo cuando AudioContext sigue suspendido. */
export function wavAvisoUri(): string {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * 0.45);
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    let env = 0;
    let freq = 880;
    if (t < 0.14) {
      env = Math.sin((t / 0.14) * Math.PI);
      freq = 880;
    } else if (t >= 0.2 && t < 0.4) {
      env = Math.sin(((t - 0.2) / 0.2) * Math.PI);
      freq = 1174;
    }
    pcm[i] = Math.round(0.32 * env * Math.sin(2 * Math.PI * freq * t) * 32767);
  }
  const bytes = pcm.byteLength;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, bytes, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
  return "data:audio/wav;base64," + bytesToBase64(new Uint8Array(buf));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}
