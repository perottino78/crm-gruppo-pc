// Lettura e scrittura di fogli Excel (.xlsx) e CSV senza librerie esterne.
// Un .xlsx è un archivio ZIP di file XML: qui si legge l'indice dello ZIP, si decomprimono i file
// necessari (zlib di Node) e si estraggono le celle del foglio. In scrittura si crea un .xlsx minimo
// ma completo (intestazione in grassetto, riga bloccata, larghezze colonne) che Excel, LibreOffice e
// Google Fogli aprono senza avvisi. Testato in tests/articoli/articoli.test.ts.
import { inflateRawSync, deflateRawSync } from "node:zlib";

export type Tabella = string[][];
export type Cella = string | number | null | undefined;
export type FoglioOut = { nome: string; righe: Cella[][]; larghezze?: number[]; numeriDecimali?: number[] };

// ---------------- ZIP ----------------

function voci(buf: Buffer): Map<string, Buffer> {
  let fine = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fine = i; break; }
  if (fine < 0) throw new Error("Il file non è un Excel valido (.xlsx).");
  const n = buf.readUInt16LE(fine + 10);
  let p = buf.readUInt32LE(fine + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20);
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32);
    const loc = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + ln);
    const inizio = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const dati = buf.subarray(inizio, inizio + comp);
    if (metodo === 0) out.set(nome, Buffer.from(dati));
    else if (metodo === 8) out.set(nome, inflateRawSync(dati));
    p += 46 + ln + le + lc;
  }
  return out;
}

const TABELLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(b: Buffer): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = TABELLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function creaZip(file: { nome: string; dati: Buffer }[]): Buffer {
  const locali: Buffer[] = [], centrali: Buffer[] = [];
  let offset = 0;
  for (const f of file) {
    const nome = Buffer.from(f.nome, "utf8"), comp = deflateRawSync(f.dati), crc = crc32(f.dati);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(f.dati.length, 22); h.writeUInt16LE(nome.length, 26); h.writeUInt16LE(0, 28);
    locali.push(h, nome, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.dati.length, 24);
    c.writeUInt16LE(nome.length, 28); c.writeUInt32LE(offset, 42);
    centrali.push(c, nome);
    offset += 30 + nome.length + comp.length;
  }
  const dir = Buffer.concat(centrali);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(file.length, 8); e.writeUInt16LE(file.length, 10);
  e.writeUInt32LE(dir.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locali, dir, e]);
}

// ---------------- XML ----------------

const decodifica = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "amp") return "&"; if (k === "quot") return '"'; if (k === "apos") return "'";
    const n = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
const codifica = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const testi = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodifica(m[1])).join("");

/** Colonna da riferimento: "AB12" → 27 (base 0). */
function colonna(rif: string): number {
  const l = rif.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const nomeColonna = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Numero di Excel scritto all'italiana (virgola decimale), senza esponenziali né code di arrotondamento. */
function numeroTesto(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  const pulito = Number(n.toPrecision(12));
  let s = Math.abs(pulito) < 1e-6 && pulito !== 0 ? pulito.toFixed(10).replace(/0+$/, "") : String(pulito);
  if (/e/i.test(s)) s = pulito.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

export type FoglioLetto = { nome: string; righe: Tabella };

/** Tutti i fogli di un .xlsx come tabelle di testo (numeri con la virgola decimale). */
export function leggiXlsx(buf: Buffer): FoglioLetto[] {
  const z = voci(buf);
  const wb = z.get("xl/workbook.xml")?.toString("utf8");
  if (!wb) throw new Error("Il file non è un Excel valido (.xlsx).");
  const rels = z.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const mappa = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1] ?? "", m[0].match(/Target="([^"]+)"/)?.[1] ?? ""]));
  const ss = z.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const condivise = [...ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => testi(m[1]));
  const fogli: FoglioLetto[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = decodifica(m[0].match(/name="([^"]*)"/)?.[1] ?? "Foglio");
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] ?? m[0].match(/\bid="([^"]+)"/)?.[1] ?? "";
    let t = mappa.get(rid) ?? "";
    t = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
    const xml = z.get(t.replace(/\/\.\//g, "/"))?.toString("utf8");
    if (!xml) continue;
    const righe: Tabella = [];
    let rAuto = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = Number(rm[1].match(/\br="(\d+)"/)?.[1] ?? rAuto + 1) - 1;
      rAuto = rn + 1;
      const riga: string[] = [];
      let cAuto = 0;
      for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const att = cm[1], dentro = cm[2] ?? "";
        const rif = att.match(/\br="([A-Z]+)\d*"/)?.[1];
        const ci = rif ? colonna(rif) : cAuto;
        cAuto = ci + 1;
        const tipo = att.match(/\bt="([^"]+)"/)?.[1];
        const v = dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = "";
        if (tipo === "s") val = condivise[Number(v)] ?? "";
        else if (tipo === "inlineStr") val = testi(dentro);
        else if (tipo === "str" || tipo === "e") val = v !== undefined ? decodifica(v) : "";
        else if (tipo === "b") val = v === "1" ? "VERO" : "FALSO";
        else if (v !== undefined) val = numeroTesto(v);
        while (riga.length < ci) riga.push("");
        riga[ci] = val;
      }
      while (righe.length < rn) righe.push([]);
      righe[rn] = riga;
    }
    fogli.push({ nome, righe });
  }
  return fogli;
}

/** CSV con separatore riconosciuto da solo (; , tab) e campi tra virgolette. */
export function leggiCsvTesto(testo: string): Tabella {
  const t = testo.replace(/^\uFEFF/, "");
  const prime = t.split(/\r?\n/).slice(0, 20).join("\n");
  const sep = [";", "\t", ","].map((s) => ({ s, n: prime.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const out: Tabella = [];
  let riga: string[] = [], campo = "", virg = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (virg) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else virg = false; }
      else campo += ch;
    } else if (ch === '"' && campo === "") virg = true;
    else if (ch === sep) { riga.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      riga.push(campo); out.push(riga); riga = []; campo = "";
    } else campo += ch;
  }
  if (campo !== "" || riga.length) { riga.push(campo); out.push(riga); }
  return out;
}

/** Legge un file caricato (xlsx o csv/txt) e restituisce i fogli. Gli .xls vecchi non sono supportati. */
export function leggiFile(nome: string, buf: Buffer): FoglioLetto[] {
  const n = nome.toLowerCase();
  const zip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (n.endsWith(".xls") && !zip) throw new Error("I file .xls del vecchio Excel non si leggono: apri il file e salvalo come «Cartella di lavoro Excel (.xlsx)» oppure come CSV.");
  if (n.endsWith(".ods")) throw new Error("I file .ods non si leggono: salvali come .xlsx o CSV.");
  if (zip) return leggiXlsx(buf);
  let testo = buf.toString("utf8");
  if (testo.includes("\uFFFD")) testo = buf.toString("latin1");
  return [{ nome: "CSV", righe: leggiCsvTesto(testo) }];
}

// ---------------- Scrittura ----------------

/** Crea un file .xlsx: prima riga di ogni foglio in grassetto e bloccata. */
export function scriviXlsx(fogli: FoglioOut[]): Buffer {
  const fileFogli = fogli.map((f, k) => {
    const dec = new Set(f.numeriDecimali ?? []);
    const larg = f.larghezze?.length ? `<cols>${f.larghezze.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const righe = f.righe.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      if (v === null || v === undefined || v === "") return "";
      const rif = `${nomeColonna(ci)}${ri + 1}`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${rif}"${ri > 0 && dec.has(ci) ? ' s="2"' : ""}><v>${v}</v></c>`;
      return `<c r="${rif}" t="inlineStr"${ri === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${codifica(String(v))}</t></is></c>`;
    }).join("")}</row>`).join("");
    const blocco = f.righe.length > 1 ? `<sheetViews><sheetView workbookViewId="0"${k === 0 ? ' tabSelected="1"' : ""}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${blocco}${larg}<sheetData>${righe}</sheetData></worksheet>`;
  });
  const nomi = fogli.map((f, i) => codifica((f.nome || `Foglio${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31)));
  const B = (s: string) => Buffer.from(s, "utf8");
  return creaZip([
    { nome: "[Content_Types].xml", dati: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`) },
    { nome: "_rels/.rels", dati: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { nome: "xl/workbook.xml", dati: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomi.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { nome: "xl/_rels/workbook.xml.rels", dati: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { nome: "xl/styles.xml", dati: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    ...fileFogli.map((x, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dati: B(x) })),
  ]);
}

/** CSV per Excel italiano: separatore «;», virgola decimale, BOM per gli accenti. */
export function scriviCsv(righe: Cella[][]): string {
  const campo = (v: Cella) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + righe.map((r) => r.map(campo).join(";")).join("\r\n") + "\r\n";
}
