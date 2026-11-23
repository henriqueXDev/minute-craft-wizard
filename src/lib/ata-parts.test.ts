import { describe, it, expect } from "vitest";
import { dividirTexto, gerarEmPartes, unirAtas, type AtaResult } from "./ata-parts";
import type { Ata } from "./ata-types";

const ata = (titulo: string): Ata => ({ titulo, numeroAta: "", solicitante: "", elaboracao: "", data: "", inicio: "", termino: "", local: "", participantes: [], pauta: [], relato: [], encaminhamentos: [] });

describe("long Groq transcripts", () => {
  it("retains the full oversized transcript within 10000-character parts", () => {
    const texto = "Discussão sobre nome social e decisão.\n".repeat(1800);
    const partes = dividirTexto(texto);
    expect(partes.join("")).toBe(texto);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every(p => p.length <= 10000 && p.trim().length >= 20)).toBe(true);
  });
  it("merges decisions and fills participant data without duplicating people", () => {
    const primeira = ata("REUNIÃO");
    primeira.participantes = [{ nome: "Ana", orgao: "", email: "" }];
    const segunda = ata("");
    segunda.participantes = [{ nome: "Ana", orgao: "DTIS", email: "" }];
    segunda.encaminhamentos = [{ tarefa: "Atualizar cadastro", prazo: "25/11/2026", responsavel: "Ana", situacao: "" }];
    const unida = unirAtas([primeira, segunda]);
    expect(unida.participantes).toEqual([{ nome: "Ana", orgao: "DTIS", email: "" }]);
    expect(unida.encaminhamentos).toEqual(segunda.encaminhamentos);
    expect(primeira.participantes[0]?.orgao).toBe("");
  });
  it("splits before sending oversized input, waits for rate limits and reuses completed parts", async () => {
    const texto = "A".repeat(21000);
    let chamadas = 0;
    let limitou = false;
    const esperas: number[] = [];
    const cache = new Map<string, Ata>();
    const chamar = async (trecho: string): Promise<AtaResult> => {
      chamadas++;
      if (trecho.length > 10000) return { tamanhoParte: 10000 };
      if (!limitou) { limitou = true; return { aguardarMs: 65000 }; }
      return { ata: ata("REUNIÃO") };
    };
    await gerarEmPartes(texto, "", chamar, () => {}, cache, () => {}, async ms => { esperas.push(ms); });
    expect(esperas).toEqual([65000]);
    const anteriores = chamadas;
    await gerarEmPartes(texto, "", chamar, () => {}, cache, () => {}, async () => {});
    expect(chamadas - anteriores).toBe(1); // Only the free size check; all paid parts cached.
  });
  it("never retries terminal failures", async () => {
    let chamadas = 0;
    await expect(gerarEmPartes("Transcrição com mais de vinte caracteres.", "", async () => { chamadas++; return { erro: "Acesso negado" }; }, () => {}, new Map(), () => {})).rejects.toThrow("Acesso negado");
    expect(chamadas).toBe(1);
  });
});