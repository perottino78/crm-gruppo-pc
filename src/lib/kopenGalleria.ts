// Galleria di modelli reali Kopen (foto ufficiali + link alla scheda prodotto reale su
// kopendoors.com), organizzata per "linea" reale del produttore. Ogni tipologia interna
// KOPEN_* (che rappresenta una combinazione di finitura/materiale a listino) è associata
// alla propria linea reale, cosi' che nel selettore di preventivo si possano mostrare
// foto vere e verificate dei modelli Kopen di quella linea — per risolvere il problema
// "non si capisce ben quale sia il modello se non correli l'immagine al modello".
//
// Tutte le immagini e i link sono stati verificati direttamente sul sito ufficiale
// https://kopendoors.com/it/ (foto meta-og:image delle schede prodotto reali). Nessun
// prezzo o dato commerciale è tratto da Kopen: i prezzi restano quelli del listino P&C
// già a sistema, invariati.

export type ModelloKopenReale = { codice: string; immagineUrl: string; url: string };

export const KOPEN_GALLERIA: Record<string, ModelloKopenReale[]> = {
  pure: [
    { codice: "PU 01 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Pure-PU-01-KP-5.jpg", url: "https://kopendoors.com/it/product/pu-01-kp/" },
    { codice: "PU 09 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Pure-PU-09-KP.jpg", url: "https://kopendoors.com/it/product/pu-09-kp/" },
    { codice: "PU 18 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Pure-PU-18-KP.jpg", url: "https://kopendoors.com/it/product/pu-18-kp/" },
    { codice: "PU 30 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/PU30KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/pu-30-kp-2/" },
    { codice: "PU 50 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/PU50KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/pu-50-kp/" },
  ],
  style: [
    { codice: "ST 01 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Style-ST-01-KP.jpg", url: "https://kopendoors.com/it/product/st-01-kp/" },
    { codice: "ST 05 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Style-ST-05-KP.jpg", url: "https://kopendoors.com/it/product/st-05-kp/" },
    { codice: "ST 09 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Style-ST-09-KP.jpg", url: "https://kopendoors.com/it/product/st-09-kp/" },
    { codice: "ST 13 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/ST13KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/st-13-kp-2/" },
    { codice: "ST 17 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/ST17KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/st-17-kp-2/" },
  ],
  vitrum: [
    { codice: "VI 01 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Vitrum-VI-01-KP.jpg", url: "https://kopendoors.com/it/product/vi-01-kp/" },
    { codice: "VI 08 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Vitrum-VI-08-KP.jpg", url: "https://kopendoors.com/it/product/vi-08-kp/" },
    { codice: "VI 15 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Vitrum-VI-15-KP.jpg", url: "https://kopendoors.com/it/product/vi-15-kp/" },
    { codice: "VI 24 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/VI24KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/vi-24-kp/" },
    { codice: "VI 32 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/VI26KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/vi-32-kp/" },
    { codice: "LU 01 KP (Lumiere)", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Vitrum-LU-01-KP.jpg", url: "https://kopendoors.com/it/product/lu-01-kp/" },
  ],
  frame: [
    { codice: "FR 01 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Frame-FR-01-KP.jpg", url: "https://kopendoors.com/it/product/fr-01-kp/" },
    { codice: "FR 05 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Frame-FR-05-KP.jpg", url: "https://kopendoors.com/it/product/fr-05-kp/" },
    { codice: "FR 09 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Frame-FR-09-KP.jpg", url: "https://kopendoors.com/it/product/fr-09-kp/" },
    { codice: "FR 13 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Frame-FR-13-KP.jpg", url: "https://kopendoors.com/it/product/fr-13-kp/" },
    { codice: "FR 17 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Frame-FR-17-KP.jpg", url: "https://kopendoors.com/it/product/fr-17-kp/" },
  ],
  classic: [
    { codice: "CL 01 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/CL01KP.jpg", url: "https://kopendoors.com/it/product/cl-01-kp/" },
    { codice: "CL 03 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/CL03KP.jpg", url: "https://kopendoors.com/it/product/cl-03-kp/" },
    { codice: "CL 04 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/CL04KP.jpg", url: "https://kopendoors.com/it/product/cl-04-kp/" },
    { codice: "CL 05 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Clasic-CL-05-KP.jpg", url: "https://kopendoors.com/it/product/cl-05-kp/" },
    { codice: "CL 06 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Classic-CL-06-KP.jpg", url: "https://kopendoors.com/it/product/cl-06-kp/" },
  ],
  effect: [
    { codice: "EF 01 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Effect-EF-01-KP.jpg", url: "https://kopendoors.com/it/product/ef-01-kp/" },
    { codice: "EF 08 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/EF08KP.jpg", url: "https://kopendoors.com/it/product/ef-08-kp/" },
    { codice: "EF 14 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/Kopen-Linea-Effect-EF-14-KP-997x1024.webp", url: "https://kopendoors.com/it/product/ef-14-kp/" },
    { codice: "EF 18 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2023/07/Kopen-Linea-Effect-EF-18_KP.jpg", url: "https://kopendoors.com/it/product/ef-18-kp/" },
    { codice: "EF 27 KP", immagineUrl: "https://kopendoors.com/wp-content/uploads/2022/11/EF27KP-1-997x1024.webp", url: "https://kopendoors.com/it/product/ef-27-kp/" },
  ],
};

/** Nome leggibile della linea reale, per l'etichetta mostrata sopra la galleria. */
export const KOPEN_LINEA_NOME: Record<string, string> = {
  pure: "Pure",
  style: "Style",
  vitrum: "Vitrum",
  frame: "Frame",
  classic: "Classic",
  effect: "Effect",
};

/**
 * Mappa ogni tipologia interna KOPEN_* (combinazione di finitura/materiale già a
 * listino, con prezzi P&C invariati) alla linea reale Kopen corrispondente, cosi' da
 * poter mostrare le foto vere dei modelli di quella linea. Mappatura verificata
 * confrontando la terminologia interna (liscio/fresato/bugnato/inserti/style/
 * vitrum/frame/lumiere/classic/effect) con le linee ufficiali del sito Kopen.
 */
export function lineaRealeDiTipologiaKopen(tipologia: string): keyof typeof KOPEN_GALLERIA | null {
  if (!tipologia.startsWith("KOPEN_")) return null;
  if (
    tipologia.startsWith("KOPEN_LISCIO") ||
    tipologia.startsWith("KOPEN_FRESATURE") ||
    tipologia.startsWith("KOPEN_BUGNATI") ||
    tipologia.startsWith("KOPEN_INSERTI")
  )
    return "pure";
  if (tipologia.startsWith("KOPEN_STYLE")) return "style";
  if (tipologia.startsWith("KOPEN_VITRUM")) return "vitrum"; // copre VITRUM, VITRUMINS, VITRUMBUG
  if (tipologia.startsWith("KOPEN_FRAME")) return "frame";
  if (tipologia.startsWith("KOPEN_LUMIERE")) return "vitrum"; // Lumiere è un modello specifico della linea Vitrum
  if (tipologia.startsWith("KOPEN_CLASSIC")) return "classic";
  if (tipologia.startsWith("KOPEN_EFFECT")) return "effect"; // copre EFFECT, EFFECTVETRO
  return null;
}

/** Ritorna la galleria di modelli reali (foto + link) per la tipologia scelta, o null. */
export function galleriaKopenPerTipologia(tipologia: string): ModelloKopenReale[] | null {
  const linea = lineaRealeDiTipologiaKopen(tipologia);
  return linea ? KOPEN_GALLERIA[linea] : null;
}
