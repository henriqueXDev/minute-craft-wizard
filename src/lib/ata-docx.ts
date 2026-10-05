import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType, LevelFormat,
} from "docx";
import type { Ata } from "./ata-types";

const W = 9906; // largura útil (A4, margens 1000)
const FONT = "Times New Roman";
const b = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const borders = { top: b, bottom: b, left: b, right: b };
const m = { top: 60, bottom: 60, left: 120, right: 120 };

const run = (text: string, bold = false, size = 24) => new TextRun({ text, bold, font: FONT, size });
const p = (children: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) =>
  new Paragraph({ children, alignment: align });

function cell(children: Paragraph[], width: number | undefined = 0, opts: { span?: number; fill?: string; center?: boolean } = {}) {
  return new TableCell({
    children, borders, margins: m, columnSpan: opts.span,
    width: { size: width ?? 0, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
  });
}
const label = (l: string, v: string) => p([run(l, true), run(" " + (v || ""))]);
const header = (t: string, cols: number[]) =>
  new TableRow({ children: [cell([p([run(t, true, 28)])], W, { span: cols.length, fill: "D9D9D9" })] });
const spacer = () => new Paragraph({ children: [run("")], spacing: { after: 200 } });

export async function gerarDocx(ata: Ata): Promise<Blob> {
  const logo = new Uint8Array(await (await fetch("/brasao.png")).arrayBuffer());

  const topo = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [1700, W - 1700],
    rows: [new TableRow({ children: [
      cell([p([new ImageRun({ type: "png", data: logo, transformation: { width: 80, height: 104 }, altText: { title: "Brasão", description: "Brasão", name: "brasao" } })], AlignmentType.CENTER)], 1700),
      cell([p([run(ata.titulo || "ATA DE REUNIÃO", false, 32)], AlignmentType.CENTER)], W - 1700),
    ] })],
  });

  const c3 = [3300, 3303, 3303];
  const dados = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: c3,
    rows: [
      header("1. DADOS GERAIS DA REUNIÃO", c3),
      new TableRow({ children: [cell([label("ATA", ata.numeroAta)], W, { span: 3 })] }),
      new TableRow({ children: [
        cell([label("Solicitante:", ata.solicitante)], c3[0]! + c3[1]!, { span: 2 }),
        cell([label("Elaboração da Ata:", ata.elaboracao)], c3[2]),
      ] }),
      new TableRow({ children: [
        cell([label("Data:", ata.data)], c3[0]),
        cell([label("Horário de Início:", ata.inicio)], c3[1]),
        cell([label("Horário de Término:", ata.termino)], c3[2]),
      ] }),
      new TableRow({ children: [cell([label("Local:", ata.local)], W, { span: 3 })] }),
    ],
  });

  const c4 = [3330, 2090, 2930, 1556];
  const part = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: c4,
    rows: [
      header("2. PARTICIPANTES", c4),
      new TableRow({ children: ["Nome", "Órgão", "Email", "Assinatura"].map((h, i) => cell([p([run(h, true)], AlignmentType.CENTER)], c4[i]!)) }),
      ...ata.participantes.map((x) => new TableRow({ children: [
        cell([p([run(x.nome)])], c4[0]),
        cell([p([run(x.orgao)], AlignmentType.CENTER)], c4[1]),
        cell([p([run(x.email)])], c4[2]),
        cell([p([run("")])], c4[3]),
      ] })),
    ],
  });

  const c2 = [700, W - 700];
  const pauta = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: c2,
    rows: [
      header("3. PAUTA", c2),
      ...ata.pauta.map((t, i) => new TableRow({ children: [cell([p([run(`${i + 1}.`)])], c2[0]), cell([p([run(t)])], c2[1])] })),
    ],
  });

  const relatoParas: Paragraph[] = [p([run("4. RELATO SUCINTO DA REUNIÃO", true, 28)])];
  ata.relato.forEach((t, i) => {
    relatoParas.push(new Paragraph({ children: [run(`${i + 1}. ${t.titulo}`, true, 26)], spacing: { before: 240, after: 120 } }));
    t.itens.forEach((it) => relatoParas.push(new Paragraph({
      numbering: { reference: "bul", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 },
      children: it.rotulo ? [run(it.rotulo.replace(/:$/, "") + ":", true), run(" " + it.texto)] : [run(it.texto)],
    })));
  });
  const relato = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({ children: relatoParas, borders, width: { size: W, type: WidthType.DXA }, margins: { top: 160, bottom: 160, left: 160, right: 160 } })] })],
  });

  const c5 = [600, 4006, 1700, 2100, 1500];
  const enc = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: c5,
    rows: [
      new TableRow({ tableHeader: true, children: [cell([p([run("5. ENCAMINHAMENTOS", true, 28)])], W, { span: 5, fill: "D9D9D9" })] }),
      new TableRow({ children: ["Nº", "Tarefa", "Prazo", "Responsável", "Situação"].map((h, i) => cell([p([run(h, true)], AlignmentType.CENTER)], c5[i]!)) }),
      ...ata.encaminhamentos.map((e, i) => new TableRow({ children: [
        cell([p([run(`${i + 1}.`)])], c5[0]),
        cell([p([run(e.tarefa)])], c5[1]),
        cell([p([run(e.prazo)], AlignmentType.CENTER)], c5[2]),
        cell([p([run(e.responsavel)], AlignmentType.CENTER)], c5[3]),
        cell([p([run(e.situacao)], AlignmentType.CENTER)], c5[4]),
      ] })),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
      children: [topo, spacer(), dados, spacer(), part, spacer(), pauta, spacer(), relato, spacer(), enc],
    }],
  });
  return Packer.toBlob(doc);
}
