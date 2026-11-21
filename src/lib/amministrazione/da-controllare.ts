// Pagamenti segnati a mano senza prima nota ancora da controllare con l'estratto conto (anche quelli di prima del campo apposito, dalla nota).
import type { Prisma } from "@prisma/client";

export const whereDaControllare = (): Prisma.ScadenzaWhereInput => ({
  controllatoEstrattoIl: null,
  pagatoManuale: { gt: 0 },
  OR: [{ manualeDaControllare: true }, { note: { contains: "senza movimento in prima nota" } }],
});
