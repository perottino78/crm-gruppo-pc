// Lettura dei file .xls del vecchio Excel (BIFF8), quelli che esporta BConsole («Esporta» dei prodotti), senza librerie esterne.
// Un .xls è un «Compound File» (come un piccolo disco FAT) che contiene lo stream «Workbook»; dentro, record BIFF:
// stringhe condivise (SST) e celle (LABELSST, NUMBER, RK, MULRK, LABEL, FORMULA…). Si leggono solo i valori, non i formati.
// Tollerante: le catene di settori che tornano su sé stesse (BConsole ne produce) si fermano invece di dare errore.
// Testato in tests/articoli/xls.test.ts.

export type FoglioXls = { nome: string; righe: string[][] };

const FINE_CATENA = 0xfffffffe;

function leggiCfb(buf: Buffer): Map<string, Buffer> {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) throw new Error("Il file .xls non si legge (forse è rovinato): aprilo con Excel e salvalo come «Cartella di lavoro Excel (.xlsx)».");
  const lato = 1 << buf.readUInt16LE(30);
  const latoMini = 1 << buf.readUInt16LE(32);
  const settoreDir = buf.readUInt32LE(48);
  const sogliaMini = buf.readUInt32LE(56);
  const settoreMiniFat = buf.readUInt32LE(60);
  let settoreDifat = buf.readUInt32LE(68);
  const nDifat = buf.readUInt32LE(72);
  const settore = (n: number) => buf.subarray(512 + n * lato, 512 + (n + 1) * lato);

  // tabella FAT: i primi 109 indirizzi sono nell'intestazione, gli altri nei settori DIFAT
  const settoriFat: number[] = [];
  for (let i = 0; i < 109; i++) { const s = buf.readUInt32LE(76 + i * 4); if (s < FINE_CATENA) settoriFat.push(s); }
  for (let k = 0; k < nDifat && settoreDifat < FINE_CATENA; k++) {
    const d = settore(settoreDifat);
    for (let i = 0; i < lato / 4 - 1; i++) { const s = d.readUInt32LE(i * 4); if (s < FINE_CATENA) settoriFat.push(s); }
    settoreDifat = d.readUInt32LE(lato - 4);
  }
  const fat: number[] = [];
  for (const s of settoriFat) { const d = settore(s); for (let i = 0; i < lato / 4; i++) fat.push(d.readUInt32LE(i * 4)); }

  const catena = (inizio: number, tabella: number[], leggi: (n: number) => Buffer, dimensione?: number) => {
    const parti: Buffer[] = [];
    const visti = new Set<number>();
    let tot = 0;
    for (let s = inizio; s < FINE_CATENA && !visti.has(s) && s < tabella.length + 1; s = tabella[s] ?? FINE_CATENA) {
      visti.add(s);
      const p = leggi(s);
      if (!p.length) break;
      parti.push(p); tot += p.length;
      if (dimensione !== undefined && tot >= dimensione) break;
    }
    const tutto = Buffer.concat(parti);
    return dimensione !== undefined ? tutto.subarray(0, dimensione) : tutto;
  };

  const dir = catena(settoreDir, fat, settore);
  type Voce = { nome: string; tipo: number; inizio: number; dimensione: number };
  const voci: Voce[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const lung = dir.readUInt16LE(o + 64);
    const tipo = dir[o + 66];
    if (!tipo || lung < 2) continue;
    voci.push({ nome: dir.toString("utf16le", o, o + lung - 2), tipo, inizio: dir.readUInt32LE(o + 116), dimensione: dir.readUInt32LE(o + 120) });
  }
  const radice = voci.find((v) => v.tipo === 5);
  const miniStream = radice ? catena(radice.inizio, fat, settore, radice.dimensione) : Buffer.alloc(0);
  const miniFat: number[] = [];
  if (settoreMiniFat < FINE_CATENA) {
    const m = catena(settoreMiniFat, fat, settore);
    for (let i = 0; i + 4 <= m.length; i += 4) miniFat.push(m.readUInt32LE(i));
  }
  const out = new Map<string, Buffer>();
  for (const v of voci) {
    if (v.tipo !== 2) continue;
    const dati = v.dimensione < sogliaMini
      ? catena(v.inizio, miniFat, (n) => miniStream.subarray(n * latoMini, (n + 1) * latoMini), v.dimensione)
      : catena(v.inizio, fat, settore, v.dimensione);
    out.set(v.nome, dati);
  }
  return out;
}

type Record_ = { tipo: number; dati: Buffer; continui: Buffer[] };

function records(wb: Buffer, da = 0): Record_[] {
  const out: Record_[] = [];
  for (let o = da; o + 4 <= wb.length;) {
    const tipo = wb.readUInt16LE(o), lung = wb.readUInt16LE(o + 2);
    const dati = wb.subarray(o + 4, o + 4 + lung);
    o += 4 + lung;
    if (tipo === 0x003c && out.length) { out[out.length - 1].continui.push(dati); continue; }
    out.push({ tipo, dati, continui: [] });
    if (tipo === 0x000a && da > 0) break; // EOF del foglio
  }
  return out;
}

/** Lettore di byte su più pezzi (record + CONTINUE): le stringhe che passano da un pezzo all'altro ripetono il byte delle opzioni. */
class Lettore {
  private i = 0;
  private o = 0;
  constructor(private pezzi: Buffer[]) {}
  private pronto() { while (this.i < this.pezzi.length && this.o >= this.pezzi[this.i].length) { this.i++; this.o = 0; } }
  fine() { this.pronto(); return this.i >= this.pezzi.length; }
  byte() { this.pronto(); const b = this.pezzi[this.i]?.[this.o] ?? 0; this.o++; return b; }
  u16() { return this.byte() | (this.byte() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  salta(n: number) { for (let k = 0; k < n; k++) this.byte(); }
  stringa(conLunghezza16 = true) {
    const cch = conLunghezza16 ? this.u16() : this.byte();
    let opz = this.byte();
    const rich = opz & 0x08 ? this.u16() : 0;
    const ext = opz & 0x04 ? this.u32() : 0;
    let s = "", resta = cch;
    while (resta > 0) {
      this.pronto();
      if (this.i >= this.pezzi.length) break;
      const doppio = (opz & 1) === 1;
      const disponibili = Math.floor((this.pezzi[this.i].length - this.o) / (doppio ? 2 : 1));
      const n = Math.min(resta, disponibili);
      const p = this.pezzi[this.i];
      s += doppio ? p.toString("utf16le", this.o, this.o + n * 2) : p.toString("latin1", this.o, this.o + n);
      this.o += n * (doppio ? 2 : 1);
      resta -= n;
      if (resta > 0) { this.i++; this.o = 0; opz = (opz & ~1) | (this.byte() & 1); }
    }
    this.salta(rich * 4 + ext);
    return s;
  }
}

/** Valore di un numero RK (intero o decimale compresso). */
function rk(v: number): number {
  const centesimi = v & 1, intero = v & 2;
  let n: number;
  if (intero) n = v >> 2;
  else { const b = Buffer.alloc(8); b.writeUInt32LE((v & 0xfffffffc) >>> 0, 4); n = b.readDoubleLE(0); }
  return centesimi ? n / 100 : n;
}

const testoNumero = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e9) / 1e9));

/** Fogli del file .xls con le celle come testo. */
export function leggiXls(buf: Buffer): FoglioXls[] {
  const stream = leggiCfb(buf);
  const wb = stream.get("Workbook") ?? stream.get("Book");
  if (!wb) throw new Error("Il file .xls non contiene fogli leggibili: aprilo con Excel e salvalo come .xlsx.");
  const globali = records(wb);
  const sst: string[] = [];
  const fogli: { nome: string; offset: number }[] = [];
  for (const r of globali) {
    if (r.tipo === 0x0085) { // BOUNDSHEET
      const offset = r.dati.readUInt32LE(0), tipo = r.dati[5];
      if (tipo !== 0) continue; // solo fogli di lavoro
      fogli.push({ nome: new Lettore([r.dati.subarray(6)]).stringa(false), offset });
    } else if (r.tipo === 0x00fc) { // SST
      const l = new Lettore([r.dati, ...r.continui]);
      l.u32(); const n = l.u32();
      for (let k = 0; k < n && !l.fine(); k++) sst.push(l.stringa());
    } else if (r.tipo === 0x000a) break;
  }
  return fogli.map((f) => {
    const righe: string[][] = [];
    const metti = (r: number, c: number, v: string) => { (righe[r] ??= [])[c] = v; };
    let formulaStringa: { r: number; c: number } | null = null;
    for (const rec of records(wb, f.offset).slice(1)) {
      const d = rec.dati;
      switch (rec.tipo) {
        case 0x00fd: metti(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] ?? ""); break; // LABELSST
        case 0x0203: metti(d.readUInt16LE(0), d.readUInt16LE(2), testoNumero(d.readDoubleLE(6))); break; // NUMBER
        case 0x027e: metti(d.readUInt16LE(0), d.readUInt16LE(2), testoNumero(rk(d.readInt32LE(6)))); break; // RK
        case 0x00bd: { // MULRK
          const r = d.readUInt16LE(0), c0 = d.readUInt16LE(2), n = (d.length - 6) / 6;
          for (let k = 0; k < n; k++) metti(r, c0 + k, testoNumero(rk(d.readInt32LE(4 + k * 6 + 2))));
          break;
        }
        case 0x0204: case 0x00d6: metti(d.readUInt16LE(0), d.readUInt16LE(2), new Lettore([d.subarray(6), ...rec.continui]).stringa()); break; // LABEL / RSTRING
        case 0x0205: metti(d.readUInt16LE(0), d.readUInt16LE(2), d[7] ? "" : d[6] ? "VERO" : "FALSO"); break; // BOOLERR
        case 0x0006: { // FORMULA: risultato già calcolato
          const r = d.readUInt16LE(0), c = d.readUInt16LE(2);
          if (d.readUInt16LE(12) === 0xffff) { if (d[6] === 0) formulaStringa = { r, c }; else if (d[6] === 1) metti(r, c, d[8] ? "VERO" : "FALSO"); }
          else metti(r, c, testoNumero(d.readDoubleLE(6)));
          break;
        }
        case 0x0207: if (formulaStringa) { metti(formulaStringa.r, formulaStringa.c, new Lettore([d, ...rec.continui]).stringa()); formulaStringa = null; } break; // STRING
      }
    }
    const larghezza = righe.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
    return { nome: f.nome, righe: Array.from(righe, (r) => Array.from({ length: larghezza }, (_, k) => (r?.[k] ?? "").trim())) };
  });
}
