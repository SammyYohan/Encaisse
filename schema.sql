-- Encaisse — schéma D1 : deux tables (portail client + sauvegarde chiffrée).
--   npx wrangler d1 create encaisse
--   npx wrangler d1 execute encaisse --remote --file=schema.sql
-- Le binding doit s'appeler « DB » (wrangler.toml ou dashboard Pages → Functions).
-- (La table backup est aussi auto-créée par POST /api/backup : ce schéma sert
-- aux bases neuves pour éviter tout premier appel sans table.)

CREATE TABLE IF NOT EXISTS portal (
  slug         TEXT PRIMARY KEY,        -- 24 hex aléatoires : possession = autorisation
  payload      TEXT NOT NULL,           -- JSON {doc, biz, cli, lang} — écrit par POST /api/portal
  hash         TEXT NOT NULL,           -- empreinte du payload : évite les réécritures inutiles
  owner        TEXT,                    -- empreinte sha256 de la clé propriétaire de l'appareil (possession)
  paid_at      INTEGER,                 -- Unix ms — rempli au retour de Stripe (?session_id=)
  remind_count INTEGER DEFAULT 0,       -- relances e-mail (compteur — envoi serveur retiré pour le moment)
  remind_at    INTEGER,                 -- Unix ms de la dernière relance : anti-doublon 72 h
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Migration douce pour base déjà existante (rétrocompatibilité) :
--   ALTER TABLE portal ADD COLUMN owner TEXT;
--   ALTER TABLE portal ADD COLUMN remind_count INTEGER DEFAULT 0;
--   ALTER TABLE portal ADD COLUMN remind_at INTEGER;

CREATE TABLE IF NOT EXISTS backup (
  owner      TEXT PRIMARY KEY,  -- empreinte sha256 de la clé de récupération (possession)
  blob       TEXT NOT NULL,     -- état S chiffré en AES-GCM sur l'appareil (opaque serveur)
  rev        INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
