import { one } from "../../lib/handlers";
import { makeDeps } from "../../lib/runtime";
// Richieste firmate di P&C ONE: elenco dei moduli istantanei e recupero dei lead di un modulo.
export const POST = one(makeDeps);
