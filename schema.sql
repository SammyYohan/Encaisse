-- Encaisse — schéma D1 (portail client). Une seule table :
--   npx wrangler d1 create encaisse
--   npx wrangler d1 execute encaisse --remote --file=schema.sql
-- Le binding doit s'appeler « DB » (wrangler.toml ou dashboard Pages → Functions).

CREATE TABLE IF NOT EXISTS portal (
  slug       TEXT PRIMARY KEY,          -- 24 hex aléatoires : possession = autorisation
  payload    TEXT NOT NULL,             -- JSON {doc, biz, lang} — écrit par POST /api/portal
  hash       TEXT NOT NULL,             -- empreinte du payload : évite les réécritures inutiles
  paid_at    INTEGER,                   -- Unix ms — rempli au retour de Stripe (?session_id=)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
