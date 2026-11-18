"""Coprifili, angolari e listelli in PVC per la posa dei serramenti dal catalogo-listino EXTE 2023/2024 (PDF pubblico).

Uso: pdftotext -layout "Exte Catalogo-Listino Italiano 2023-2024.pdf" exte.txt
     python3 -I scripts/listini/estrai_coprifili_exte.py exte.txt prisma/seed-data/coprifili_exte.json
Prezzi del listino = euro per 100 m, colonne Bianco / Bianco con pellicola protettiva / Rivestito (pellicolato).
"""
import json, re, sys

SEZIONI = {
    "LISTELLI PIATTI": "PIATTI", "LISTELLI PIATTI – AUTOADESIVI": "PIATTI_ADESIVI",
    "LISTELLO PIEGABILE E LISTELLO FLESSIBILE": "PIEGABILI", "LISTELLI SCATOLATI – AUTOADESIVI": "SCATOLATI_SEPARABILI",
    "LISTELLI SCATOLATI 7 MM": "SCATOLATI", "LISTELLI SCATOLATI 7 MM – AUTOADESIVO ESPANSO": "SCATOLATI_ADESIVI",
    "LISTELLI SCATOLATI 7 MM CON BAFFO": "BAFFO", "LISTELLI SCATOLATI CON BAFFO – AUTOADESIVI": "BAFFO_ADESIVI",
    "ANGOLARI CON LATI IDENTICI": "ANGOLARI_UGUALI", "ANGOLARI CON LATI DIVERSI": "ANGOLARI_DIVERSI",
}
PREZZO = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2}) €")
num = lambda s: round(float(s.replace(".", "").replace(",", ".")), 2)


def estrai(righe):
    out, sezione, sospesa = [], None, None
    for l in righe:
        s = l.strip()
        if s in SEZIONI:
            sezione = SEZIONI[s]
            continue
        if s.startswith("PROFILATI TUBOLARI"):
            break
        m = re.match(r"\s*(\d{5,8}R?)\s+(.*)", l)
        if m and sezione:
            prezzi = [(x.start(), num(x.group(1))) for x in PREZZO.finditer(l)]
            if not prezzi:
                continue
            descr = re.split(r"\s{2,}", m.group(2))[0].strip()
            if sospesa:
                descr = f"{sospesa.rstrip(',')}, {descr}"
                sospesa = None
            if descr.endswith(" ed"):
                descr += " autoadesivo espanso"
            v = {"bianco": prezzi[0][1], "protettiva": None, "rivestito": None}
            for pos, p in prezzi[1:]:
                if sezione == "PIEGABILI":
                    v["protettiva" if m.group(1) == "64241" else "rivestito"] = p
                elif sezione.startswith("ANGOLARI") or pos >= 106:
                    v["rivestito"] = p
                else:
                    v["protettiva"] = p
            out.append({"sezione": sezione, "codice": m.group(1), "descrizione": descr, "per100m": v})
            continue
        if s.startswith("PROFILI SCATOLATI MULTIUSO"):
            break
        if sezione and re.match(r"\s+Listello", l) and not PREZZO.search(l) and len(re.split(r"\s{2,}", s)) == 1:
            sospesa = s
    return out


if __name__ == "__main__":
    righe = open(sys.argv[1], encoding="utf-8").read().splitlines()
    i = next(n for n, l in enumerate(righe) if l.strip() == "LISTELLI PIATTI")
    articoli = estrai(righe[i:])
    json.dump(articoli, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(articoli), "articoli")
