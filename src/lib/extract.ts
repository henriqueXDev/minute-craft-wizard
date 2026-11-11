export async function extrairTexto(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || file.type === "text/plain") return file.text();

  if (name.endsWith(".pdf")) {
    if (!(Uint8Array.prototype as any).toHex) {
      (Uint8Array.prototype as any).toHex = function (this: Uint8Array) {
        return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
      };
    }
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      text += c.items.map((it: any) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("") + "\n";
    }
    return text;
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }

  if (name.endsWith(".doc")) {
    // Formato antigo: extração aproximada do texto legível
    const buf = new Uint8Array(await file.arrayBuffer());
    const raw = new TextDecoder("latin1").decode(buf);
    const parts = raw.match(/[\x20-\x7E\xC0-\xFF\r\n\t]{4,}/g) ?? [];
    const txt = parts.join(" ").replace(/\s+/g, " ").trim();
    if (txt.length < 50) throw new Error("Não foi possível ler este .doc. Salve-o como .docx e tente novamente.");
    return txt;
  }

  throw new Error("Formato não suportado. Use PDF, DOC, DOCX ou TXT.");
}
