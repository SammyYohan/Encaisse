-- Encaisse — schéma D1 (portail client). Une seule table :
--   npx wrangler d1 create encaisse
--   npx wrangler d1 execute encaisse --remote --file=schema.sql
-- Le binding doit s'appeler « DB » (wrangler.toml ou dashboard Pages → Functions).

CREATE TABLE IF NOT EXISTS portal (
  slug         TEXT PRIMARY KEY,        -- 24 hex aléatoires : possession = autorisation
  payload      TEXT NOT NULL,           -- JSON {doc, biz, cli, lang} — écrit par POST /api/portal
  hash         TEXT NOT NULL,           -- empreinte du payload : évite les réécritures inutiles
  paid_at      INTEGER,                 -- Unix ms — rempli au retour de Stripe (?session_id=)
  remind_count INTEGER DEFAULT 0,       -- relances e-mail envoyées par le serveur (POST /api/remind)
  remind_at    INTEGER,                 -- Unix ms de la dernière relance : anti-doublon 72 h
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Base existante (avant les relances e-mail) :
--   ALTER TABLE portal ADD COLUMN remind_count INTEGER DEFAULT 0;
--   ALTER TABLE portal ADD COLUMN remind_at INTEGER;
--   ALTER TABLE portal ADD COLUMN owner TEXT;  -- vague 2 : preuve de possession
