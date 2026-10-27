/* eslint-disable */
// Solo collaudo: sostituisce sessione (cookie) e cache di Next per eseguire le Server Actions fuori da Next.
// L'utente simulato si imposta con globalThis.__utente.
const Module = require("module");
const path = require("path");
const stubAuth = path.join(__dirname, "stub-auth.cjs");
const stubCache = path.join(__dirname, "stub-cache.cjs");
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === "next/cache") return stubCache;
  const r = orig.call(this, req, parent, ...rest);
  return /[\\/]src[\\/]lib[\\/]auth\.ts$/.test(r) ? stubAuth : r;
};
