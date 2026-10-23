"use client";

import { useState, useMemo } from "react";

// --- Costanti di calcolo ---
const BASE_PRODUZIONE = 1200; // kWh/kWp/anno (media Italia)

const ORI_FACTOR: Record<number, number> = {
  0: 1.0,   // Sud
  45: 0.93, // Sud-Est/Ovest
  90: 0.85, // Est/Ovest
};

const TILT_FACTOR = (deg: number) => {
  if (deg <= 15) return 0.93;
  if (deg <= 30) return 1.0;
  if (deg <= 45) return 0.97;
  return 0.92;
};

const BATT_AUTOCONSUME: Record<number, number> = {
  0: 0.60,
  5: 0.75,
  10: 0.85,
};

function calcola(form: FormData) {
  const { consumoKwh, prezzoEnergia, orientamento, inclinazione, batteria } = form;
  const oriFactor = ORI_FACTOR[orientamento] ?? 1;
  const tiltFactor = TILT_FACTOR(inclinazione);
  const prodPerKwp = BASE_PRODUZIONE * oriFactor * tiltFactor;
  const kwp = Math.max(1, consumoKwh / prodPerKwp);
  const produzione = kwp * prodPerKwp;
  const autocons = BATT_AUTOCONSUME[batteria] ?? 0.6;
  const risparmioAnno = produzione * prezzoEnergia * autocons;
  const costo = kwp * 2000 + (batteria === 5 ? 3500 : batteria === 10 ? 6500 : 0);
  const rientro = risparmioAnno > 0 ? costo / risparmioAnno : 0;
  const risparmio25 = risparmioAnno * 25 - costo;
  return {
    kwp: Math.round(kwp * 10) / 10,
    produzione: Math.round(produzione),
    risparmioAnno: Math.round(risparmioAnno),
    rientro: Math.round(rientro * 10) / 10,
    risparmio25: Math.round(risparmio25),
    pannelli: Math.ceil(kwp / 0.44),
    costo: Math.round(costo),
  };
}

// --- Tipi ---
interface FormData {
  consumoKwh: number;
  prezzoEnergia: number;
  orientamento: number;
  inclinazione: number;
  batteria: number;
}

interface LeadData {
  nome: string;
  telefono: string;
  email: string;
  consenso: boolean;
  localita: string;
}

const ORI_OPTIONS = [
  { label: "Sud", value: 0, desc: "Massima produzione" },
  { label: "Sud-Est / Sud-Ovest", value: 45, desc: "-7% produzione" },
  { label: "Est / Ovest", value: 90, desc: "-15% produzione" },
];

const BATT_OPTIONS = [
  { label: "Senza batteria", value: 0, desc: "60% autoconsumo" },
  { label: "Batteria 5 kWh", value: 5, desc: "75% autoconsumo" },
  { label: "Batteria 10 kWh", value: 10, desc: "85% autoconsumo" },
];

// --- Componente principale ---
export default function SimulaPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    consumoKwh: 3500,
    prezzoEnergia: 0.26,
    orientamento: 0,
    inclinazione: 30,
    batteria: 0,
  });
  const [lead, setLead] = useState<LeadData>({
    nome: "",
    telefono: "",
    email: "",
    consenso: false,
    localita: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const risultati = useMemo(() => calcola(form), [form]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lead.nome.trim() || !lead.telefono.trim()) {
      setError("Nome e telefono sono obbligatori.");
      return;
    }
    if (!lead.consenso) {
      setError("Devi accettare l'informativa privacy per procedere.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/solaris/simula/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: lead.nome,
          telefono: lead.telefono,
          email: lead.email,
          consensoPrivacy: lead.consenso,
          localita: lead.localita,
          ...form,
          kwp: risultati.kwp,
          risparmioStimato: risultati.risparmioAnno,
          rientroAnni: risultati.rientro,
          simulazioneJson: { ...form, risultati },
        }),
      });
      if (!res.ok) throw new Error("Errore nell'invio");
      setSubmitted(true);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return <Grazie nome={lead.nome} risultati={risultati} />;

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7ff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#003F87", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, background: "#FFC107", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>☀️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Solaris — Simulatore Fotovoltaico</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Calcola il tuo risparmio in 2 minuti</div>
        </div>
      </div>

      {/* Steps indicator */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", gap: 8, alignItems: "center" }}>
        {[
          { n: 1, label: "I tuoi consumi" },
          { n: 2, label: "Il tuo tetto" },
          { n: 3, label: "Il tuo risparmio" },
        ].map(({ n, label }) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 13,
              background: step >= n ? "#003F87" : "#e2e8f0",
              color: step >= n ? "#fff" : "#94a3b8",
            }}>{n}</div>
            <span style={{ fontSize: 13, color: step >= n ? "#003F87" : "#94a3b8", fontWeight: step === n ? 600 : 400, display: "none" }} className="sm-show">{label}</span>
            {n < 3 && <div style={{ width: 24, height: 2, background: step > n ? "#003F87" : "#e2e8f0" }} />}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
        {step === 1 && (
          <Step1
            form={form}
            setForm={setForm}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2
            form={form}
            setForm={setForm}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3
            risultati={risultati}
            lead={lead}
            setLead={setLead}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
            loading={loading}
            error={error}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "16px 24px 24px", fontSize: 11, color: "#94a3b8" }}>
        Solaris — Gruppo P&amp;C S.r.l. · Corso Moncenisio 28, 10090 Rosta (TO) · Tel. 011 1988 7497
        <br />Le stime sono indicative. Un sopralluogo tecnico gratuito determinerà i valori esatti.
      </div>
    </div>
  );
}

// --- Step 1 ---
function Step1({ form, setForm, onNext }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; onNext: () => void }) {
  return (
    <Card title="⚡ I tuoi consumi">
      <Label>Consumo elettrico annuo</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <input type="range" min={800} max={10000} step={100}
          value={form.consumoKwh}
          onChange={e => setForm(f => ({ ...f, consumoKwh: +e.target.value }))}
          style={{ flex: 1, accentColor: "#003F87" }}
        />
        <ValueBadge>{form.consumoKwh.toLocaleString("it-IT")} kWh</ValueBadge>
      </div>
      <Hint>
        Media famiglia italiana: 3.000–4.500 kWh/anno.<br />
        Leggi il dato dalla tua bolletta (voce "energia consumata").
      </Hint>

      <div style={{ marginTop: 20 }}>
        <Label>Prezzo medio dell&apos;energia</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <input type="range" min={0.15} max={0.45} step={0.01}
            value={form.prezzoEnergia}
            onChange={e => setForm(f => ({ ...f, prezzoEnergia: +e.target.value }))}
            style={{ flex: 1, accentColor: "#003F87" }}
          />
          <ValueBadge>{form.prezzoEnergia.toFixed(2).replace(".", ",")} €/kWh</ValueBadge>
        </div>
        <Hint>Prezzo indicativo attuale: 0,25–0,30 €/kWh (tutto incluso).</Hint>
      </div>

      <NavRow>
        <div />
        <BtnPrimary onClick={onNext}>Avanti →</BtnPrimary>
      </NavRow>
    </Card>
  );
}

// --- Step 2 ---
function Step2({ form, setForm, onBack, onNext }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; onBack: () => void; onNext: () => void }) {
  return (
    <Card title="🏠 Il tuo tetto">
      <Label>Orientamento principale</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {ORI_OPTIONS.map(o => (
          <RadioCard
            key={o.value}
            label={o.label}
            desc={o.desc}
            selected={form.orientamento === o.value}
            onClick={() => setForm(f => ({ ...f, orientamento: o.value }))}
          />
        ))}
      </div>

      <Label>Inclinazione del tetto</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <input type="range" min={10} max={50} step={5}
          value={form.inclinazione}
          onChange={e => setForm(f => ({ ...f, inclinazione: +e.target.value }))}
          style={{ flex: 1, accentColor: "#003F87" }}
        />
        <ValueBadge>{form.inclinazione}°</ValueBadge>
      </div>
      <Hint>Tetto piano = 10–15°. Tetto a falde tipico = 25–35°. Tetto ripido = 40–50°.</Hint>

      <div style={{ marginTop: 20 }}>
        <Label>Batteria di accumulo</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
          {BATT_OPTIONS.map(o => (
            <RadioCard
              key={o.value}
              label={o.label}
              desc={o.desc}
              selected={form.batteria === o.value}
              onClick={() => setForm(f => ({ ...f, batteria: o.value }))}
            />
          ))}
        </div>
      </div>

      <NavRow>
        <BtnSecondary onClick={onBack}>← Indietro</BtnSecondary>
        <BtnPrimary onClick={onNext}>Calcola il risparmio ☀️</BtnPrimary>
      </NavRow>
    </Card>
  );
}

// --- Step 3 ---
function Step3({
  risultati, lead, setLead, onBack, onSubmit, loading, error
}: {
  risultati: ReturnType<typeof calcola>;
  lead: LeadData;
  setLead: React.Dispatch<React.SetStateAction<LeadData>>;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string;
}) {
  return (
    <div>
      {/* Risultati */}
      <div style={{ background: "#003F87", color: "#fff", borderRadius: 12, padding: "20px 20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>☀️ La tua simulazione</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiBox label="Impianto consigliato" value={`${risultati.kwp} kWp`} sub={`~${risultati.pannelli} pannelli`} />
          <KpiBox label="Produzione stimata" value={`${risultati.produzione.toLocaleString("it-IT")} kWh`} sub="all'anno" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
          <KpiBoxGreen label="Risparmio anno 1" value={`€ ${risultati.risparmioAnno.toLocaleString("it-IT")}`} />
          <KpiBoxGreen label="Rientro investimento" value={`${risultati.rientro} anni`} />
          <KpiBoxGreen label="Risparmio in 25 anni" value={`€ ${risparmio25Fmt(risultati.risparmio25)}`} />
        </div>
      </div>

      {/* Form lead */}
      <Card title="📋 Ricevi il progetto gratuito">
        <p style={{ fontSize: 14, color: "#64748b", marginTop: -4, marginBottom: 16 }}>
          Un nostro tecnico verificherà i dati dal vivo e ti invierà il progetto personalizzato senza impegno.
        </p>
        <form onSubmit={onSubmit}>
          <Field label="Nome e cognome *">
            <input
              type="text" required placeholder="Mario Rossi"
              value={lead.nome}
              onChange={e => setLead(l => ({ ...l, nome: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Telefono *">
            <input
              type="tel" required placeholder="333 1234567"
              value={lead.telefono}
              onChange={e => setLead(l => ({ ...l, telefono: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Email">
            <input
              type="email" placeholder="mario@email.it"
              value={lead.email}
              onChange={e => setLead(l => ({ ...l, email: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Comune / Città">
            <input
              type="text" placeholder="Torino"
              value={lead.localita}
              onChange={e => setLead(l => ({ ...l, localita: e.target.value }))}
              style={inputStyle}
            />
          </Field>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, marginBottom: 8 }}>
            <input
              type="checkbox" id="consenso" required
              checked={lead.consenso}
              onChange={e => setLead(l => ({ ...l, consenso: e.target.checked }))}
              style={{ marginTop: 2, accentColor: "#003F87", width: 16, height: 16, flexShrink: 0 }}
            />
            <label htmlFor="consenso" style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, cursor: "pointer" }}>
              Acconsento al trattamento dei miei dati personali da parte di Solaris – Gruppo P&amp;C S.r.l. (Corso Moncenisio 28, Rosta TO) per ricevere informazioni commerciali e il progetto fotovoltaico richiesto. Potrai revocare il consenso in qualsiasi momento scrivendo a info@gruppopec.com. <strong>Privacy policy</strong> disponibile su richiesta. *
            </label>
          </div>

          {error && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, padding: "8px 12px", background: "#fef2f2", borderRadius: 6 }}>
              {error}
            </div>
          )}

          <NavRow>
            <BtnSecondary onClick={onBack}>← Modifica</BtnSecondary>
            <button type="submit" disabled={loading}
              style={{ ...btnPrimaryStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Invio in corso…" : "Ricevi il progetto gratuito ☀️"}
            </button>
          </NavRow>
        </form>
      </Card>
    </div>
  );
}

// --- Grazie ---
function Grazie({ nome, risultati }: { nome: string; risultati: ReturnType<typeof calcola> }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f0f7ff", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, width: "100%", background: "#fff", borderRadius: 16, padding: "40px 32px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,63,135,0.12)" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>☀️</div>
        <h2 style={{ color: "#003F87", fontWeight: 800, fontSize: 24, marginBottom: 8 }}>
          Ottimo, {nome.split(" ")[0]}!
        </h2>
        <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          Abbiamo ricevuto la tua richiesta. Un nostro tecnico ti contatterà entro 24 ore per fissare il sopralluogo gratuito.
        </p>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "16px 20px", marginBottom: 24, textAlign: "left" }}>
          <div style={{ fontWeight: 700, color: "#166534", marginBottom: 8, fontSize: 14 }}>📊 La tua simulazione</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={recapItemStyle}><span style={{ color: "#64748b", fontSize: 12 }}>Impianto</span><br /><strong>{risultati.kwp} kWp</strong></div>
            <div style={recapItemStyle}><span style={{ color: "#64748b", fontSize: 12 }}>Risparmio annuo</span><br /><strong>€ {risultati.risparmioAnno.toLocaleString("it-IT")}</strong></div>
            <div style={recapItemStyle}><span style={{ color: "#64748b", fontSize: 12 }}>Rientro</span><br /><strong>{risultati.rientro} anni</strong></div>
            <div style={recapItemStyle}><span style={{ color: "#64748b", fontSize: 12 }}>Risparmio 25 anni</span><br /><strong>€ {risparmio25Fmt(risultati.risparmio25)}</strong></div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          Solaris – Gruppo P&amp;C S.r.l.<br />
          Tel. <a href="tel:0111988749" style={{ color: "#003F87" }}>011 1988 7497</a> · Cell. <a href="tel:3927431645" style={{ color: "#003F87" }}>392 743 1645</a>
        </p>
      </div>
    </div>
  );
}

// --- Helpers UI ---
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,63,135,0.08)", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ background: "#003F87", color: "#fff", padding: "14px 20px", fontWeight: 700, fontSize: 16 }}>{title}</div>
      <div style={{ padding: "20px 20px" }}>{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b", marginBottom: 8 }}>{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>{children}</p>;
}

function ValueBadge({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "#003F87", whiteSpace: "nowrap" }}>
      {children}
    </div>
  );
}

function RadioCard({ label, desc, selected, onClick }: { label: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      border: `2px solid ${selected ? "#003F87" : "#e2e8f0"}`,
      borderRadius: 8, padding: "10px 14px", cursor: "pointer",
      background: selected ? "#eff6ff" : "#fff",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      transition: "all 0.15s",
    }}>
      <span style={{ fontWeight: selected ? 600 : 400, color: selected ? "#003F87" : "#374151", fontSize: 14 }}>{label}</span>
      <span style={{ fontSize: 12, color: "#94a3b8" }}>{desc}</span>
    </div>
  );
}

function KpiBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function KpiBoxGreen({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#16A34A", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function NavRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>{children}</div>;
}

function BtnPrimary({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={btnPrimaryStyle}>
      {children}
    </button>
  );
}

function BtnSecondary({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "10px 18px", borderRadius: 8, border: "1px solid #cbd5e1",
      background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 14,
      cursor: "pointer",
    }}>
      {children}
    </button>
  );
}

const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 8, border: "none",
  background: "#003F87", color: "#fff", fontWeight: 700, fontSize: 14,
  cursor: "pointer", boxShadow: "0 2px 8px rgba(0,63,135,0.25)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #cbd5e1", fontSize: 14, color: "#1e293b",
  outline: "none", boxSizing: "border-box",
};

const recapItemStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 6, padding: "8px 10px",
  fontSize: 14, color: "#1e293b",
};

function risparmio25Fmt(v: number) {
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return v.toLocaleString("it-IT");
}
