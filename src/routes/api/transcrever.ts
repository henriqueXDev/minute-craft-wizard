import { createFileRoute } from "@tanstack/react-router";

const err = (erro: string, status: number) => Response.json({ erro }, { status });

export const Route = createFileRoute("/api/transcrever")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        const groq = process.env["GROQ_API_KEY"];
        if (!key && !groq) return err("Chave de IA não configurada.", 500);
        const len = Number(request.headers.get("content-length") || 0);
        if (len > 25 * 1024 * 1024) return err("Parte de áudio grande demais.", 413);
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File) || !file.size || file.size > 25 * 1024 * 1024) return err("Áudio inválido.", 400);

        if (groq) {
          const g = new FormData();
          g.append("model", "whisper-large-v3-turbo");
          g.append("file", new File([file], "audio.wav", { type: "audio/wav" }));
          g.append("response_format", "json");
          g.append("language", "pt");
          const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST", headers: { Authorization: `Bearer ${groq}` }, body: g,
          });
          const b = await r.text();
          if (!r.ok) {
            console.error("Groq STT error", r.status, b);
            if (r.status === 429) return err("Limite gratuito do Groq atingido. Aguarde alguns minutos e tente novamente.", 429);
            let m = ""; try { m = JSON.parse(b)?.error?.message ?? ""; } catch {}
            return err(m || `Falha na transcrição (${r.status}).`, r.status);
          }
          try { return Response.json({ texto: JSON.parse(b).text ?? "" }); } catch { return err("Resposta inválida da transcrição.", 502); }
        }
        const fd = new FormData();
        fd.append("model", "openai/gpt-transcribe");
        fd.append("file", new File([file], "audio.wav", { type: "audio/wav" }));
        fd.append("response_format", "json");
        fd.append("stream", "true");
        fd.append("language", "pt");
        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd,
        });
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          console.error("STT error", res.status, body);
          let msg = ""; try { const j = JSON.parse(body); msg = j?.message ?? j?.error?.message ?? ""; } catch {}
          if (res.status === 429) return err("Muitas solicitações. Aguarde e tente novamente.", 429);
          return err(msg || `Falha na transcrição (${res.status}).`, res.status);
        }
        const reader = res.body.getReader(); const dec = new TextDecoder();
        let buf = "", out = "", done = "";
        for (;;) {
          const { done: end, value } = await reader.read(); if (end) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() ?? "";
          for (const l of lines) {
            if (!l.startsWith("data:")) continue;
            const p = l.slice(5).trim(); if (!p || p === "[DONE]") continue;
            try {
              const ev = JSON.parse(p);
              if (ev.type === "transcript.text.delta") out += ev.delta ?? "";
              else if (ev.type === "transcript.text.done") done = ev.text ?? "";
              else if (ev.type === "error") return err(ev.message ?? "Falha na transcrição.", 502);
            } catch {}
          }
        }
        return Response.json({ texto: done || out });
      },
    },
  },
});
