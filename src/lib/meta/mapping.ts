import type { GraphLead } from "./types";

const NOME = new Set(["full_name", "nome_e_cognome", "nome_completo", "nome", "name"]);
const FIRST = new Set(["first_name", "nome_di_battesimo"]);
const LAST = new Set(["last_name", "cognome"]);
const TEL = new Set(["phone_number", "phone", "telefono", "numero_di_telefono", "cellulare", "numero_telefono"]);
const MAIL = new Set(["email", "e-mail", "mail", "work_email"]);

export function mapLead(lead: GraphLead): { nome: string; telefono: string | null; email: string | null; extra: string } {
  let nome = "", first = "", last = "", telefono = "", email = "";
  const extra: string[] = [];
  for (const f of lead.field_data) {
    const k = f.name.toLowerCase().trim();
    const v = (f.values[0] ?? "").trim();
    if (!v) continue;
    if (NOME.has(k) && !nome) nome = v;
    else if (FIRST.has(k)) first = v;
    else if (LAST.has(k)) last = v;
    else if (TEL.has(k) && !telefono) telefono = v;
    else if (MAIL.has(k) && !email) email = v;
    else extra.push(`${f.name}: ${f.values.join(", ")}`);
  }
  if (!nome) nome = [first, last].filter(Boolean).join(" ");
  return {
    nome: nome.slice(0, 200),
    telefono: telefono.slice(0, 40) || null,
    email: email.toLowerCase().slice(0, 200) || null,
    extra: extra.join(" · ").slice(0, 1200),
  };
}
