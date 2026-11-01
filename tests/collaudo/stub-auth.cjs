/* eslint-disable */
exports.getCurrentUser = async () => globalThis.__utente ?? null;
exports.isAmministratore = (u) => u?.ruolo === "AMMINISTRATORE";
exports.getSolarisLivello = () => "AMMINISTRATORE";
// password vere (bcrypt) e sessione finta: servono ai collaudi del login
const bcrypt = require("bcryptjs");
exports.hashPassword = (p) => bcrypt.hash(p, 4);
exports.verificaPassword = (p, h) => bcrypt.compare(p, h);
exports.creaSessione = async (id) => { globalThis.__sessione = id; };
exports.distruggiSessione = async () => { globalThis.__sessione = null; };
