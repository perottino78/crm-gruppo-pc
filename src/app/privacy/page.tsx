export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { bloccoDaTesto, leggiInformativa } from "@/lib/privacy/informativa";

export const metadata: Metadata = { title: "Informativa privacy — Gruppo P&C" };

/** Informativa privacy pubblica (senza login): è il link che compare nei moduli, nelle offerte e nelle email. */
export default async function PrivacyPage() {
  const { testo, versione } = await leggiInformativa();
  const blocchi = bloccoDaTesto(testo);
  return (
    <main style={{ background: "#f5f5f4", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
        <div style={{ background: "#ea580c", color: "#fff", padding: "16px 24px", fontWeight: 800, fontSize: 20 }}>Gruppo P&amp;C</div>
        <div style={{ padding: "8px 24px 28px", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 15, lineHeight: 1.6, color: "#1c1917" }}>
          {blocchi.map((b, i) =>
            b.tipo === "titolo" ? <h2 key={i} style={{ fontSize: i === 0 ? 22 : 17, margin: "22px 0 6px", color: "#9a3412" }}>{b.testo}</h2>
            : b.tipo === "voce" ? <ul key={i} style={{ margin: "4px 0", paddingLeft: 22 }}><li>{b.testo}</li></ul>
            : <p key={i} style={{ margin: "8px 0" }}>{b.testo}</p>)}
          <p style={{ marginTop: 28, fontSize: 12, color: "#78716c" }}>Versione del {versione}.</p>
        </div>
      </div>
    </main>
  );
}
