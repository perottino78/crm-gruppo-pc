/* eslint-disable */
exports.getCurrentUser = async () => globalThis.__utente ?? null;
exports.isAmministratore = (u) => u?.ruolo === "AMMINISTRATORE";
exports.getSolarisLivello = () => "AMMINISTRATORE";
