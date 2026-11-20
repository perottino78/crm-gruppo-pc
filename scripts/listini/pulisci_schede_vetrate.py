"""Pulisce le schede tecniche Scintilla e Brillante del fornitore e le mette nei colori P&C: toglie nome e sede del fornitore, QR, social,
certificati con la sua ragione sociale, scrive il nome del prodotto P&C (stesso carattere Montserrat) e cambia l'azzurro in arancio P&C.
Uso: python3 -I pulisci_vepa.py <scintilla.pdf> <brillante.pdf> <cartella-uscita> <cartella-font con reg.ttf semi.ttf bold.ttf>"""
import re, sys, pymupdf

BIANCO = (1, 1, 1)
ARANCIO = (0.914, 0.482, 0.212)   # arancio del logo P&C (233, 123, 54)
FONT = {}

def carica_font(cartella):
    for k, f in (("reg", "reg.ttf"), ("semi", "semi.ttf"), ("bold", "bold.ttf")):
        FONT[k] = (f"mont{k}", pymupdf.Font(fontfile=f"{cartella}/{f}"), f"{cartella}/{f}")

def famiglia(nome):
    n = nome.lower()
    return "bold" if "bold" in n else "semi" if "semi" in n else "reg"

def rgb(c):
    if c == 0x00b3da: return ARANCIO     # azzurro del fornitore
    return (((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)

# refusi e parti in spagnolo/inglese delle schede originali (clienti attenti: si correggono tutti)
CORREZIONI = [
    ("Certifi cazioni", "Certificazioni"),
    ("(?:^ )(?=cazioni)", ""),
    ("rompe la stetica", "rompe l’estetica"), (" and Tests", " e prove"),
    ("adizionale basato nella stetica e la confortabilità", "aggiuntivo basato sull’estetica e sul comfort"),
    ("´", "’"), ("ﬁ ", "fi"), ("ﬂ ", "fl"), ("ﬁ", "fi"), ("ﬂ", "fl"),
    ("profi li", "profili"), ("profi lo", "profilo"), ("superfi cie", "superficie"),
    (r"(?<![e])stetica", "estetica"), ("metereologiche", "meteorologiche"), ("Protezione contra", "Protezione contro"),
    ("sottoutilizzate", "sottoutilizzati"), ("protegendo le loro strutture ed elementi", "proteggendone le strutture e gli elementi"),
    ("per se stesso", "di per sé"), ("sigilare", "sigillare"), ("mal tempo", "maltempo"), ("vetrata..", "vetrata."),
    ("AZZIONAMENTO", "AZIONAMENTO"), ("Azzionamenti", "Azionamenti"), ("Posibilità", "Possibilità"), ("interiore/ esteriore", "interiore/esteriore"),
    ("con il autoblocco", "con l’autoblocco"), ("Cromo mate", "Cromo opaco"), ("- Negro", "- Nero"), ("incassto", "incassato"),
    ("Detagli", "Dettagli"), ("degli cuscineti", "dei cuscinetti"), ("UP TO 5 mm", "FINO A 5 mm"), ("REGULATION", "REGOLAZIONE"),
    ("Opzione de chiave", "Opzione di chiave"), ("Finitura::", "Finitura:"), ("Round opening", "Dispositivo di apertura"), ("device.", "rotondo."),
    ("i remati", "le rifiniture"), ("laterali possiamo", "laterali non sono"), ("non metterli.", "necessarie."),
    ("Número de vie", "Numero di vie"), ("Tipo de profolio", "Tipo di profilo"), ("INCASSATTO", "INCASSATO"), ("Sostengo di vetro", "Sostegno del vetro"),
    ("Finiture disponibile", "Finiture disponibili"), ("puó", "può"), ("SPECIFICAZIONE TECNICHE", "SPECIFICHE TECNICHE"),
    ("Certificazioni and Tests", "Certificazioni e prove"), ("ha le prove che regolano le regole sulla resistenza e tenuta del vento", "ha superato le prove di resistenza e tenuta al vento"),
    ("ha il marcato CE", "ha la marcatura CE"), ("high quality", "di alta qualità"), ("tenere fino a", "reggere fino a"), ("fronte ad", "contro"),
    ("Scintilla serramento adatto", "Scintilla, serramento adatto"), ("ILIMITATO", "ILLIMITATO"), ("Ilimitato", "Illimitato"),
    ("panelli", "pannelli"), ("caratteristrica", "caratteristica"), ("Ad Esempio", "Ad esempio"),
    ("spazii", "spazi"), ("trattii", "tratti"), ("articulato", "articolato"), ("Fisaggio", "Fissaggio"), ("polímero", "polimero"),
    ("TABOLA", "TABELLA"), ("finta legno", "finto legno"), ("Finta Legno", "Finto Legno"), ("Cota Z", "Quota Z"),
    ("El Kit di Blocco", "Il kit di blocco"), ("entrare all’interno. Vedere", "entrare all’interno. Può essere"),
    ("ecc. del cantiere, mattoni a vista, ecc. Facile", "ecc. Facile"), (" y Qualicoat", " e Qualicoat"), ("CLASE", "CLASSE"),
    ("Sigillato dell’acqua", "Sigillatura all’acqua"),
]

def corregge(t):
    for a, b in CORREZIONI:
        t = re.sub(a, b, t) if a.startswith("(?") else t.replace(a, b)
    return t

def sistema(testo, marca):
    t = re.sub(r"Seeglass convenzionale", "convenzionale", testo)
    t = re.sub(r"pomo seeglass", "pomo", t)
    t = re.sub(r"SG RUN", marca.title(), t)
    t = re.sub(r"(?i)seeglass(?:[- ](?:sub|run))?", lambda m: marca.upper() if m.group(0).isupper() else marca.title(), t)
    t = re.sub(r"^SUB ", "", t)
    return corregge(t)

DA_TOGLIERE = re.compile(r"Spagna|C3 |SystemS|Systems\.|Apaprtiene|Seeglass SUB è la nuova|Seeglass SUB nasce|famiglia Seeglass\.|ED\. \d")

def righe(page):
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            yield l, "".join(s["text"] for s in l["spans"])

def riquadro(l):
    x0, y0, x1, y1 = l["bbox"]
    return pymupdf.Rect(x0 - .5, y0 + 3.2, x1 + .5, y1 - 2.4)

def pagina_testo(page, marca, clip=None, tutto=False):
    """toglie le righe del fornitore e riscrive quelle che nominano il sistema, nello stesso carattere"""
    lavori = []
    for l, testo in righe(page):
        if clip is not None and not pymupdf.Rect(l["bbox"]).intersects(clip): continue
        if tutto or DA_TOGLIERE.search(testo):
            page.add_redact_annot(riquadro(l), fill=False)
        elif sistema(testo, marca) != testo:
            page.add_redact_annot(riquadro(l), fill=False)
            lavori.append(l)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
    for l in lavori:
        x = l["bbox"][0]
        for s in l["spans"]:
            t = sistema(s["text"], marca)
            if not t: continue
            nome, font, percorso = FONT[famiglia(s["font"])]
            dx, dy = l["dir"]
            if abs(dy) > .05:      # testo inclinato (es. il bollino «fino a 5 mm»)
                o = pymupdf.Point(s["origin"])
                lung = pymupdf.Rect(l["bbox"]).width * abs(dx) + pymupdf.Rect(l["bbox"]).height * abs(dy)
                fs = min(s["size"], s["size"] * lung / max(font.text_length(t, fontsize=s["size"]), 1))
                page.insert_text(o, t, fontname=nome, fontfile=percorso, fontsize=fs, color=rgb(s["color"]), morph=(o, pymupdf.Matrix(dx, -dy, dy, dx, 0, 0)))
                break
            page.insert_text(pymupdf.Point(x, s["origin"][1]), t, fontname=nome, fontfile=percorso, fontsize=s["size"], color=rgb(s["color"]))
            x += font.text_length(t, fontsize=s["size"])

def paragrafo_ce(page):
    """«Scintilla ha la marcatura CE…»: tolta la parte in inglese e rifatto il capoverso"""
    clip = pymupdf.Rect(326, 262, 582, 340)
    prima = None
    for l, testo in righe(page):
        if pymupdf.Rect(l["bbox"]).intersects(clip):
            page.add_redact_annot(riquadro(l), fill=False)
            if prima is None: prima = l
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
    parole = [("Scintilla", "bold", 11, 0x00b3da)] + [(w, "reg", 10, 0x231f20) for w in "ha la marcatura CE. Garantiamo il processo di certificazione tramite dichiarazione di conformità debitamente sigillata e firmata.".split()]
    x0, x1, y = prima["bbox"][0], 574, prima["spans"][0]["origin"][1]
    x = x0
    for w, fam, size, col in parole:
        nome, font, percorso = FONT[fam]
        larg = font.text_length(w, fontsize=size); spazio = font.text_length(" ", fontsize=size)
        if x + larg > x1: x, y = x0, y + 13.5
        page.insert_text(pymupdf.Point(x, y), w, fontname=nome, fontfile=percorso, fontsize=size, color=rgb(col))
        x += larg + spazio

def cancella(page, rects, colore=BIANCO):
    for r in rects: page.add_redact_annot(pymupdf.Rect(*r), fill=colore)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)

def scintilla(d):
    paragrafo_ce(d[6])
    for p in d: pagina_testo(p, "scintilla")
    cancella(d[6], [(50, 440, 440, 842), (445, 528, 585, 656)])   # certificati con la ragione sociale del fornitore e foto dei campioni colore (porta il suo logo)
    cancella(d[7], [(285, 668, 540, 748), (70, 805, 215, 862)])        # loghi, QR, social, edizione

def brillante(d):
    p = d[1]
    pagina_testo(p, "brillante", clip=pymupdf.Rect(560, 150, 830, 245), tutto=True)
    nome, font, percorso = FONT["reg"]
    p.insert_textbox(pymupdf.Rect(566, 160, 822, 215), "Brillante è la nuova vetrata panoramica scorrevole e a pacchetto.", fontname=nome, fontfile=percorso, fontsize=10, color=rgb(0x231f20))
    for p in d: pagina_testo(p, "brillante")
    cancella(d[11], [(550, 452, 785, 532), (135, 536, 275, 592)])

# azzurro del fornitore -> arancio P&C (a tinte: il chiaro resta chiaro)
BLU = {(0.88, 0, 0.12, 0): 1.0, (0.88, 0, 0, 0): 1.0, (0.876, 0.031, 0.055, 0.001): 1.0, (0.5, 0, 0, 0): .57, (0.21, 0.01, 0.04, 0): .24, (0.925, 0, 0.054, 0): 1.0}
NUM = r"(?<![\w.])(-?\d*\.?\d+)"
def tinta(t): return tuple(round(1 - t * (1 - c), 3) for c in ARANCIO)

def colora(d):
    n = 0
    def cmyk(m):
        v = tuple(float(m.group(i)) for i in range(1, 5))
        for k, t in BLU.items():
            if all(abs(a - b) < .0015 for a, b in zip(v, k)):
                return "%s %s %s %s" % (*tinta(t), "rg" if m.group(5) == "k" else "RG")
        return m.group(0)
    def rgbop(m):
        v = tuple(float(m.group(i)) for i in range(1, 4))
        if abs(v[0]) < .01 and abs(v[1] - .706) < .01 and abs(v[2] - .945) < .01:
            return "%s %s %s %s" % (*tinta(1.0), m.group(4))
        return m.group(0)
    for x in range(1, d.xref_length()):
        try:
            if not d.xref_is_stream(x) or d.xref_get_key(x, "Subtype")[1] == "/Image": continue
            st = d.xref_stream(x)
            if not st: continue
            st = st.decode("latin1")
        except Exception: continue
        nuovo = re.sub(NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+([kK])(?![\w.])", cmyk, st)
        nuovo = re.sub(NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+(rg|RG)(?![\w.])", rgbop, nuovo)
        if nuovo != st:
            d.update_stream(x, nuovo.encode("latin1")); n += 1
    return n

def main(sc, br, out, font):
    carica_font(font)
    for src, nome, fn, titolo in ((sc, "Scintilla", scintilla, "Scheda tecnica Scintilla"), (br, "Brillante", brillante, "Scheda tecnica Brillante")):
        d = pymupdf.open(src)
        fn(d)
        print(nome, "flussi ricolorati:", colora(d))
        for p in d:
            for l in p.get_links(): p.delete_link(l)
        d.set_metadata({"title": titolo + " — Gruppo P&C", "author": "P&C srl", "creator": "", "producer": "", "subject": "", "keywords": ""})
        d.save(f"{out}/{nome}-scheda-tecnica.pdf", garbage=4, deflate=True, clean=True)
        print(nome, len(d), "pagine")

if __name__ == "__main__": main(*sys.argv[1:5])
