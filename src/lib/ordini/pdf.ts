// Generatore PDF minimale (nessuna libreria esterna): testo Helvetica, linee, più pagine.
// Usato per l'ordine fornitore da scaricare o allegare all'email.

type Op = { t: "testo"; x: number; y: number; s: string; size: number; bold?: boolean } | { t: "linea"; x1: number; y1: number; x2: number; y2: number; w?: number } | { t: "rett"; x: number; y: number; w: number; h: number; grigio: number };

const W = 595.28, H = 841.89; // A4 in punti

// Larghezze medie Helvetica (1/1000 em) per andare a capo senza misurare i glifi uno per uno.
export const larghezzaTesto = (s: string, size: number, bold = false) => [...s].reduce((t, ch) => t + (/[ilIjt.,;:'|!]/.test(ch) ? 280 : /[mwMW@]/.test(ch) ? 830 : /[A-Z0-9]/.test(ch) ? 650 : ch === " " ? 278 : 540), 0) * size / 1000 * (bold ? 1.06 : 1);

/** Divide un testo in righe che stanno nella larghezza indicata. */
export function aCapo(testo: string, larghezza: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const par of (testo ?? "").split(/\r?\n/)) {
    let riga = "";
    for (const parola of par.split(/\s+/).filter(Boolean)) {
      const prova = riga ? `${riga} ${parola}` : parola;
      if (larghezzaTesto(prova, size, bold) <= larghezza || !riga) riga = prova;
      else { out.push(riga); riga = parola; }
      while (larghezzaTesto(riga, size, bold) > larghezza && riga.length > 1) {
        let k = riga.length - 1;
        while (k > 1 && larghezzaTesto(riga.slice(0, k), size, bold) > larghezza) k--;
        out.push(riga.slice(0, k)); riga = riga.slice(k);
      }
    }
    out.push(riga);
  }
  return out;
}

// Codifica WinAnsi (Latin-1 + €) ed escape delle parentesi.
function codifica(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const b = ch === "€" ? 0x80 : ch === "’" || ch === "‘" ? 0x27 : ch === "“" || ch === "”" ? 0x22 : ch === "–" || ch === "—" ? 0x2d : ch === "…" ? 0x85 : ch === "•" ? 0x95 : c < 256 ? c : 0x3f;
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c);
    out.push(b);
  }
  return out;
}

export class DocumentoPdf {
  pagine: Op[][] = [[]];
  y = H - 40;
  readonly margine = 40;
  readonly larghezza = W - 80;
  get pagina() { return this.pagine[this.pagine.length - 1]; }
  nuovaPagina() { this.pagine.push([]); this.y = H - 40; }
  spazio(h: number) { if (this.y - h < 50) { this.nuovaPagina(); return true; } return false; }
  testo(x: number, y: number, s: string, size = 9, bold = false) { this.pagina.push({ t: "testo", x, y, s, size, bold }); }
  /** Testo allineato a destra sul bordo xDestro. */
  testoDx(xDestro: number, y: number, s: string, size = 9, bold = false) { this.testo(xDestro - larghezzaTesto(s, size, bold), y, s, size, bold); }
  linea(x1: number, y1: number, x2: number, y2: number, w = 0.5) { this.pagina.push({ t: "linea", x1, y1, x2, y2, w }); }
  rett(x: number, y: number, w: number, h: number, grigio = 0.92) { this.pagina.push({ t: "rett", x, y, w, h, grigio }); }
  /** Paragrafo a capo automatico dalla posizione corrente. */
  paragrafo(s: string, size = 9, bold = false, x = this.margine, larghezza = this.larghezza) {
    for (const r of aCapo(s, larghezza, size, bold)) { this.spazio(size + 3); this.testo(x, this.y, r, size, bold); this.y -= size + 3; }
  }

  toBytes(piePagina?: (n: number, tot: number) => string): Uint8Array {
    const tot = this.pagine.length;
    const enc = new TextEncoder();
    const parti: (Uint8Array)[] = [];
    const offsets: number[] = [];
    let pos = 0;
    const push = (b: Uint8Array) => { parti.push(b); pos += b.length; };
    const pushStr = (s: string) => push(enc.encode(s));
    pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const nPag = tot;
    // oggetti: 1 catalogo, 2 pagine, 3 font, 4 font bold, poi per pagina: pagina + contenuto
    const obj = (n: number, corpo: Uint8Array | string) => { offsets[n] = pos; pushStr(`${n} 0 obj\n`); typeof corpo === "string" ? pushStr(corpo) : push(corpo); pushStr("\nendobj\n"); };
    const kids = Array.from({ length: nPag }, (_, i) => `${5 + i * 2} 0 R`).join(" ");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${nPag} >>`);
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    this.pagine.forEach((ops, i) => {
      const contenuto: number[] = [];
      const add = (s: string) => contenuto.push(...enc.encode(s));
      const f = (n: number) => (Math.round(n * 100) / 100).toString();
      for (const op of ops) {
        if (op.t === "rett") add(`${f(op.grigio)} g ${f(op.x)} ${f(op.y)} ${f(op.w)} ${f(op.h)} re f 0 g\n`);
        else if (op.t === "linea") add(`${f(op.w ?? 0.5)} w ${f(op.x1)} ${f(op.y1)} m ${f(op.x2)} ${f(op.y2)} l S\n`);
        else { add(`BT /${op.bold ? "F2" : "F1"} ${f(op.size)} Tf ${f(op.x)} ${f(op.y)} Td (`); contenuto.push(...codifica(op.s)); add(") Tj ET\n"); }
      }
      if (piePagina) { add(`BT /F1 7 Tf 40 25 Td (`); contenuto.push(...codifica(piePagina(i + 1, tot))); add(") Tj ET\n"); }
      const flusso = new Uint8Array(contenuto);
      obj(5 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
      offsets[6 + i * 2] = pos;
      pushStr(`${6 + i * 2} 0 obj\n<< /Length ${flusso.length} >>\nstream\n`); push(flusso); pushStr("\nendstream\nendobj\n");
    });
    const nObj = 5 + nPag * 2;
    const xref = pos;
    let x = `xref\n0 ${nObj}\n0000000000 65535 f \n`;
    for (let n = 1; n < nObj; n++) x += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    pushStr(x + `trailer\n<< /Size ${nObj} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos); let k = 0;
    for (const p of parti) { out.set(p, k); k += p.length; }
    return out;
  }
}
