const RATE = 16000;
const CHUNK_SEC = 600;

export const isMidia = (f: File) =>
  f.type.startsWith("audio/") || f.type.startsWith("video/") ||
  /\.(mp3|m4a|wav|ogg|oga|webm|mp4|mov|aac|flac|mkv)$/i.test(f.name);

function wav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function extrairAudio(file: File): Promise<Blob[]> {
  if (file.size > 500 * 1024 * 1024) throw new Error("Arquivo maior que 500 MB.");
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try { decoded = await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error("Não foi possível ler o áudio deste arquivo. Tente MP3, M4A, WAV ou MP4."); }
  finally { void ctx.close(); }
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const step = CHUNK_SEC * RATE, out: Blob[] = [];
  for (let i = 0; i < mono.length; i += step) out.push(wav(mono.subarray(i, i + step)));
  return out;
}

export async function transcreverPartes(partes: Blob[], onProg: (i: number, n: number) => void): Promise<string> {
  const textos: string[] = [];
  for (let i = 0; i < partes.length; i++) {
    onProg(i + 1, partes.length);
    const fd = new FormData(); fd.append("file", partes[i]!, `parte${i + 1}.wav`);
    const r = await fetch("/api/transcrever", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Falha na transcrição (${r.status}).`);
    textos.push(j.texto ?? "");
  }
  const t = textos.join("\n").trim();
  if (t.length < 20) throw new Error("Nenhuma fala reconhecida no arquivo.");
  return t;
}
