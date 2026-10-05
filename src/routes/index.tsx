import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { gerarAta } from "@/lib/ata.functions";
import { extrairTexto } from "@/lib/extract";
import type { Ata } from "@/lib/ata-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gerador de Atas — Transcrição para Ata DTIS" },
      { name: "description", content: "Envie a transcrição em PDF, DOC ou TXT e baixe a ata pronta em Word no modelo oficial." },
      { property: "og:title", content: "Gerador de Atas — Transcrição para Ata DTIS" },
      { property: "og:description", content: "Envie a transcrição e baixe a ata pronta em Word." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [file, setFile] = useState<File | null>(null);
  const [obs, setObs] = useState("");
  const [status, setStatus] = useState<"idle" | "lendo" | "gerando" | "pronto">("idle");
  const [erro, setErro] = useState("");
  const [ata, setAta] = useState<Ata | null>(null);
  const [drag, setDrag] = useState(false);

  async function converter() {
    if (!file) return;
    setErro(""); setAta(null);
    try {
      setStatus("lendo");
      const texto = await extrairTexto(file);
      setStatus("gerando");
      const r = await gerarAta({ data: { texto, observacoes: obs } });
      if (r.erro || !r.ata) throw new Error(r.erro || "Falha ao gerar.");
      setAta(r.ata); setStatus("pronto");
    } catch (e: any) {
      setErro(e?.message ?? "Erro inesperado."); setStatus("idle");
    }
  }

  async function baixar() {
    if (!ata) return;
    const { gerarDocx } = await import("@/lib/ata-docx");
    const blob = await gerarDocx(ata);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ATA - ${ata.titulo || "REUNIAO"}${ata.numeroAta ? " n" + ata.numeroAta.split("/")[0] : ""}.docx`;
    a.click();
  }

  const set = <K extends keyof Ata>(k: K, v: Ata[K]) => ata && setAta({ ...ata, [k]: v });
  const busy = status === "lendo" || status === "gerando";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <img src="/brasao.png" alt="Brasão" className="h-12 w-auto" />
          <div>
            <h1 className="text-xl font-semibold">Gerador de Atas</h1>
            <p className="text-xs text-muted-foreground">Transcrição → Ata no modelo DTIS (Word)</p>
          </div>
        </div>
        <div className="h-1 bg-accent" />
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[360px_1fr]">
        <section className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">1. Envie a transcrição</h2>
            <p className="mt-1 text-sm text-muted-foreground">PDF, DOC, DOCX ou TXT.</p>
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed px-4 py-10 text-center transition ${drag ? "border-primary bg-secondary" : "border-border bg-card hover:bg-secondary"}`}
          >
            <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span className="font-serif text-lg">{file ? file.name : "Arraste o arquivo aqui"}</span>
            <span className="mt-1 text-xs text-muted-foreground">{file ? `${(file.size / 1024).toFixed(0)} KB — clique para trocar` : "ou clique para escolher"}</span>
          </label>
          <div>
            <label className="text-sm font-medium">Informações extras (opcional)</label>
            <textarea className="field mt-1 h-24 resize-none" placeholder="Ex: ATA 04/2026, elaborada por Walayna Abreu, local MEET" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={!file || busy} onClick={converter}>
            {status === "lendo" ? "Lendo arquivo…" : status === "gerando" ? "Redigindo a ata…" : "Gerar ata"}
          </button>
          {erro && <p className="rounded-sm border border-destructive/40 bg-paper p-3 text-sm text-destructive">{erro}</p>}
          {ata && (
            <div className="space-y-3 border-t border-border pt-5">
              <h2 className="text-2xl font-semibold">2. Revise e baixe</h2>
              <p className="text-sm text-muted-foreground">Ajuste os dados principais abaixo, se precisar.</p>
              {([["titulo", "Título"], ["numeroAta", "Nº da ata"], ["solicitante", "Solicitante"], ["elaboracao", "Elaboração"], ["data", "Data"], ["inicio", "Início"], ["termino", "Término"], ["local", "Local"]] as const).map(([k, l]) => (
                <div key={k}>
                  <label className="text-xs font-medium text-muted-foreground">{l}</label>
                  <input className="field" value={ata[k]} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}
              <button className="btn-primary w-full" onClick={baixar}>Baixar ata em Word</button>
            </div>
          )}
        </section>

        <section className="min-w-0">
          {ata ? <Preview ata={ata} /> : (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-sm border border-border bg-card p-10 text-center">
              <div>
                <p className="font-serif text-2xl">{busy ? "Preparando a ata…" : "A prévia da ata aparecerá aqui"}</p>
                <p className="mt-2 text-sm text-muted-foreground">Dados gerais · Participantes · Pauta · Relato · Encaminhamentos</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Preview({ ata }: { ata: Ata }) {
  return (
    <article className="space-y-5 bg-paper p-8 shadow-sm ring-1 ring-border">
      <table className="doc-table"><tbody><tr>
        <td className="w-24 text-center"><img src="/brasao.png" alt="" className="mx-auto h-16" /></td>
        <td className="text-center text-lg">{ata.titulo}</td>
      </tr></tbody></table>

      <table className="doc-table"><tbody>
        <tr><td colSpan={3} className="doc-head">1. DADOS GERAIS DA REUNIÃO</td></tr>
        <tr><td colSpan={3}><b>ATA</b> {ata.numeroAta}</td></tr>
        <tr><td colSpan={2}><b>Solicitante:</b> {ata.solicitante}</td><td><b>Elaboração da Ata:</b> {ata.elaboracao}</td></tr>
        <tr><td><b>Data:</b> {ata.data}</td><td><b>Horário de Início:</b> {ata.inicio}</td><td><b>Horário de Término:</b> {ata.termino}</td></tr>
        <tr><td colSpan={3}><b>Local:</b> {ata.local}</td></tr>
      </tbody></table>

      <table className="doc-table"><tbody>
        <tr><td colSpan={4} className="doc-head">2. PARTICIPANTES</td></tr>
        <tr className="text-center font-bold"><td>Nome</td><td>Órgão</td><td>Email</td><td>Assinatura</td></tr>
        {ata.participantes.map((p, i) => <tr key={i}><td>{p.nome}</td><td className="text-center">{p.orgao}</td><td>{p.email}</td><td /></tr>)}
      </tbody></table>

      <table className="doc-table"><tbody>
        <tr><td colSpan={2} className="doc-head">3. PAUTA</td></tr>
        {ata.pauta.map((t, i) => <tr key={i}><td className="w-10">{i + 1}.</td><td>{t}</td></tr>)}
      </tbody></table>

      <div className="border border-rule p-4 font-serif text-[13px]">
        <p className="text-[15px] font-bold">4. RELATO SUCINTO DA REUNIÃO</p>
        {ata.relato.map((t, i) => (
          <div key={i} className="mt-3">
            <p className="font-bold">{i + 1}. {t.titulo}</p>
            <ul className="mt-1 list-disc space-y-1 pl-6 text-justify">
              {t.itens.map((it, j) => <li key={j}>{it.rotulo && <b>{it.rotulo.replace(/:$/, "")}: </b>}{it.texto}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <table className="doc-table"><tbody>
        <tr><td colSpan={5} className="doc-head">5. ENCAMINHAMENTOS</td></tr>
        <tr className="text-center font-bold"><td>Nº</td><td>Tarefa</td><td>Prazo</td><td>Responsável</td><td>Situação</td></tr>
        {ata.encaminhamentos.map((e, i) => <tr key={i}><td>{i + 1}.</td><td>{e.tarefa}</td><td className="text-center">{e.prazo}</td><td className="text-center">{e.responsavel}</td><td className="text-center">{e.situacao}</td></tr>)}
      </tbody></table>
    </article>
  );
}
