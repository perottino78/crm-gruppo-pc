# Estrae dal listino CERAMICA LA FAENZA 2025 (pdftotext -layout) le piastrelle da esterno spessore 2 cm (codici «AS», ~44 kg/m²)
# adatte ai pavimenti galleggianti su piedini, con i pezzi speciali delle stesse collezioni. Prezzo = colonna «1^ Sc.» del listino.
# Uso: pdftotext -layout listino.pdf t.txt && python3 -I scripts/listini/estrai_pavgal.py t.txt prisma/seed-data/pavgal_articoli.json
import re, sys, json
FAMIGLIE = {"BLANCO": "Blanco", "FVNT": "Cocoon", "LOIRA": "Loira (Cottofaenza)", "DAMA": "Dama", "GEA": "Gea", "MAXXI": "Maxxi",
            "ALGAR": "Algar", "VIS": "Vis", "YKSG": "Yakisugi"}
out = []
for riga in open(sys.argv[1], encoding="utf-8"):
    s = riga.strip()
    m = re.match(r"^(\d{6}) (.+?)\s{2,}(\d+(?:\.\d+)?x\d+(?:\.\d+)?)\s+(MQ|PZ)\s+([\d\.]+,\d\d)\b", s)
    if not m: continue
    codice, nome, formato, um, prezzo = m.groups()
    nome = re.sub(r"\s+", " ", nome.strip())
    fam = next((f for f in FAMIGLIE if nome.replace(" ", "").startswith(f)), None)
    if not fam: continue
    try: kg = float(s.split()[-1].replace(".", "").replace(",", "."))
    except ValueError: kg = 0
    if kg < 40: continue
    out.append({"codice": codice, "nome": nome, "famiglia": fam, "collezione": FAMIGLIE[fam], "formato": formato, "um": um,
                "prezzo": float(prezzo.replace(".", "").replace(",", ".")), "kgMq": kg})
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=0)
from collections import Counter
print(len(out), Counter((o["famiglia"], o["formato"], o["um"]) for o in out))
