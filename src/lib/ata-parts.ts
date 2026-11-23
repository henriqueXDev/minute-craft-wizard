import type { Ata } from "./ata-types";

export type AtaResult = { ata?: Ata; erro?: string; tamanhoParte?: number; aguardarMs?: number };
export const GROQ_PART_SIZE = 10_000;

// Preserve every character, preferably splitting at a paragraph boundary.
export function dividirTexto(texto: string, limite = GROQ_PART_SIZE): string[] {
  const partes: string[] = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fim = Math.min(inicio + limite, texto.length);
    if (fim < texto.length) {
      const quebra = texto.lastIndexOf("\n", fim);
      if (quebra > inicio + limite / 2) fim = quebra + 1;
    }
    // Do not leave a final fragment shorter than the server's minimum input.
    if (texto.length - fim > 0 && texto.length - fim < 20) fim -= 20;
    partes.push(texto.slice(inicio, fim));
    inicio = fim;
  }
  return partes;
}

export function unirAtas(partes: Ata[]): Ata {
  const primeira = partes[0];
  if (!primeira) throw new Error("Nenhuma parte da ata foi gerada.");
  const ata: Ata = { ...primeira, participantes: [], pauta: [], relato: [], encaminhamentos: [] };
  const campos = ["titulo", "numeroAta", "solicitante", "elaboracao", "data", "inicio", "termino", "local"] as const;
  for (const parte of partes) {
    for (const campo of campos) if (!ata[campo] && parte[campo]) ata[campo] = parte[campo];
    for (const participante of parte.participantes) {
      const existente = ata.participantes.find(p => p.nome.trim().toLocaleLowerCase() === participante.nome.trim().toLocaleLowerCase());
      if (existente) {
        existente.orgao ||= participante.orgao;
        existente.email ||= participante.email;
      } else ata.participantes.push({ ...participante });
    }
    for (const pauta of parte.pauta) if (!ata.pauta.includes(pauta)) ata.pauta.push(pauta);
    for (const topico of parte.relato) {
      const existente = ata.relato.find(t => t.titulo === topico.titulo);
      if (existente) existente.itens.push(...topico.itens);
      else ata.relato.push({ ...topico, itens: [...topico.itens] });
    }
    for (const tarefa of parte.encaminhamentos) {
      if (!ata.encaminhamentos.some(t => JSON.stringify(t) === JSON.stringify(tarefa))) ata.encaminhamentos.push(tarefa);
    }
  }
  return ata;
}

export async function gerarEmPartes(
  texto: string,
  observacoes: string,
  chamar: (texto: string, observacoes: string) => Promise<AtaResult>,
  progresso: (mensagem: string) => void,
  cache: Map<string, Ata>,
  salvar: () => void,
  esperar: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<Ata> {
  async function processar(trecho: string, rotulo: string): Promise<Ata[]> {
    const chave = `parte-v1|${observacoes}|${trecho}`;
    const salva = cache.get(chave);
    if (salva) return [salva];
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      progresso(rotulo);
      const resultado = await chamar(trecho, observacoes);
      if (resultado.tamanhoParte) {
        if (resultado.tamanhoParte >= trecho.length) throw new Error(resultado.erro || "Não foi possível dividir o texto.");
        const blocos = dividirTexto(trecho, resultado.tamanhoParte);
        const atas: Ata[] = [];
        for (const [i, bloco] of blocos.entries()) atas.push(...await processar(bloco, `parte ${i + 1} de ${blocos.length}`));
        return atas;
      }
      if (resultado.ata) {
        cache.set(chave, resultado.ata);
        salvar();
        return [resultado.ata];
      }
      if (resultado.aguardarMs && tentativa < 2) {
        progresso(`Aguardando o limite do Groq · ${rotulo}`);
        await esperar(resultado.aguardarMs);
        continue;
      }
      throw new Error(resultado.erro || "Falha ao gerar a ata.");
    }
    throw new Error("Limite do Groq atingido. Tente novamente mais tarde.");
  }
  return unirAtas(await processar(texto, "Redigindo a ata…"));
}