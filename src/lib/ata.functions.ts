import { createServerFn } from "@tanstack/react-start";
import { ataSchema, type Ata } from "./ata-types";
import { GROQ_PART_SIZE, type AtaResult } from "./ata-parts";

const SYSTEM = `Você é secretário(a) responsável por redigir atas formais de reunião em português do Brasil, no padrão da Prefeitura (DTIS).
A partir da transcrição recebida, preencha a ata:
- titulo: nome da reunião em MAIÚSCULAS (ex: "REUNIÃO FARMÁCIAS REGIONAIS - DTIS").
- numeroAta: no formato "NN/AAAA" se identificável, senão "".
- solicitante, elaboracao (quem redige), data (DD/MM/AAAA), inicio e termino (HH:MM), local (ex: MEET).
- participantes: nome completo, órgão e email quando citados (senão "").
- pauta: tópicos curtos terminados em ";" (o último em ".").
- relato: um tópico por item da pauta, na mesma ordem. Cada tópico tem itens com rótulo curto (ex: "Discussão", "Esclarecimento (MV)", "Causa raiz confirmada", "Decisão", "Encaminhamento", "Alerta (Nome)", "Situação", "Prazo") ou rótulo "" para parágrafo simples. Texto formal, objetivo, em terceira pessoa, sem falas literais.
- encaminhamentos: tarefas com prazo, responsável e situação ("" ou "Concluído").
Não invente dados: deixe "" quando não houver informação.`;

export const gerarAta = createServerFn({ method: "POST" })
  .inputValidator((d: { texto: string; observacoes?: string }) => {
    if (!d?.texto || typeof d.texto !== "string" || d.texto.trim().length < 20) throw new Error("Transcrição vazia ou muito curta.");
    return { texto: d.texto.slice(0, 400_000), observacoes: (d.observacoes ?? "").slice(0, 4000) };
  })
  .handler(async ({ data }): Promise<AtaResult> => {
    const groq = process.env["GROQ_API_KEY"];
    if (groq) {
      if (data.texto.length > GROQ_PART_SIZE) return { tamanhoParte: GROQ_PART_SIZE };
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${SYSTEM}\nResponda SOMENTE com um JSON válido seguindo exatamente este JSON Schema:\n${JSON.stringify(ataSchema)}` },
            { role: "user", content: `${data.observacoes ? `Observações do usuário: ${data.observacoes}\n\n` : ""}TRANSCRIÇÃO:\n${data.texto.slice(0, 300_000)}` },
          ],
        }),
      });
      const body = await r.text();
      if (!r.ok) {
        console.error("Groq error", r.status, body);
        let m = ""; try { m = JSON.parse(body)?.error?.message ?? ""; } catch {}
        if (/request too large/i.test(m) && data.texto.length > 1000) {
          return { tamanhoParte: Math.max(1000, Math.floor(data.texto.length / 2)) };
        }
        if (r.status === 429) {
          const segundos = Number(r.headers.get("retry-after"));
          return { erro: "Limite gratuito do Groq atingido. Tente novamente mais tarde.", aguardarMs: Math.max(65_000, Number.isFinite(segundos) ? segundos * 1000 : 0) };
        }
        return { erro: m || `Falha ao gerar a ata (${r.status}).` };
      }
      try { return { ata: JSON.parse(JSON.parse(body).choices[0].message.content) as Ata }; }
      catch { return { erro: "A IA não retornou uma ata válida. Tente novamente." }; }
    }
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { erro: "Chave de IA não configurada." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-luna",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: SYSTEM,
        input: [{ role: "user", content: `${data.observacoes ? `Observações do usuário: ${data.observacoes}\n\n` : ""}TRANSCRIÇÃO:\n${data.texto}` }],
        text: { format: { type: "json_schema", name: "ata", strict: true, schema: ataSchema } },
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      console.error("AI error", res.status, body);
      let msg = "";
      try { msg = JSON.parse(body)?.message ?? JSON.parse(body)?.error?.message ?? ""; } catch {}
      if (res.status === 429) return { erro: "Muitas solicitações no momento. Aguarde um pouco e tente novamente." };
      if (res.status === 402) return { erro: msg || "Créditos de IA esgotados." };
      return { erro: msg || `Falha ao gerar a ata (${res.status}).` };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", out = "", failed = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") out += ev.delta;
          else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "Falha na geração.";
        } catch {}
      }
    }
    if (failed) return { erro: failed };
    try {
      return { ata: JSON.parse(out) as Ata };
    } catch {
      return { erro: "A IA não retornou uma ata válida. Tente novamente." };
    }
  });
