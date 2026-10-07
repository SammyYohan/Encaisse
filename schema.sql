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
  paid_at      INTEGER,                 -- Unix ms — rempli par le webhook Lemon Squeezy (montant/devise stricts)
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

-- Abonnements Lemon Squeezy (écrit par POST /api/lemon-webhook, lu par GET /api/sub ;
-- la source de vérité reste l'API LS, le jeton signé reste sur l'appareil).
CREATE TABLE IF NOT EXISTS subs (
  sub_id     TEXT PRIMARY KEY,  -- id d'abonnement Lemon Squeezy (vérifié via l'API, jamais du client)
  plan       TEXT NOT NULL,     -- solo | pro (custom au checkout)
  cycle      TEXT NOT NULL,     -- monthly | yearly
  zone       TEXT NOT NULL,     -- EUR | CHF | USD
  oh         TEXT,              -- preuve d'appareil (custom au checkout, liaison anti-partage)
  customer   TEXT,              -- e-mail client Lemon Squeezy
  status     TEXT,              -- statut LS vu en dernier (active, on_trial, cancelled…)
  renews_at  INTEGER,          -- prochain renouvellement (ms) vu en dernier
  updated_at INTEGER NOT NULL
);
