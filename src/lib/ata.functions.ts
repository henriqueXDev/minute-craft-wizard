import { createServerFn } from "@tanstack/react-start";
import { ataSchema, type Ata } from "./ata-types";

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
  .handler(async ({ data }): Promise<{ ata?: Ata; erro?: string }> => {
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
