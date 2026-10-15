PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cards (oracle_id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT, type_line TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS card_display_preferences (oracle_id TEXT PRIMARY KEY REFERENCES cards(oracle_id) ON DELETE CASCADE, lang TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS card_names (name TEXT PRIMARY KEY COLLATE NOCASE, oracle_id TEXT NOT NULL REFERENCES cards(oracle_id));
CREATE TABLE IF NOT EXISTS collection (user_id TEXT NOT NULL REFERENCES users(id), oracle_id TEXT NOT NULL REFERENCES cards(oracle_id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9999), PRIMARY KEY(user_id,oracle_id));
CREATE TABLE IF NOT EXISTS wishlist (user_id TEXT NOT NULL REFERENCES users(id), oracle_id TEXT NOT NULL REFERENCES cards(oracle_id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9999), PRIMARY KEY(user_id,oracle_id));
CREATE TABLE IF NOT EXISTS friendships (id TEXT PRIMARY KEY, requester TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('pending','accepted')), CHECK(requester <> recipient));
CREATE UNIQUE INDEX IF NOT EXISTS friendship_pair ON friendships(min(requester,recipient),max(requester,recipient));
CREATE INDEX IF NOT EXISTS friendship_recipient ON friendships(recipient,status);
CREATE INDEX IF NOT EXISTS collection_card ON collection(oracle_id,user_id);
CREATE INDEX IF NOT EXISTS wishlist_card ON wishlist(oracle_id,user_id);
CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS deck_cards (
 id INTEGER PRIMARY KEY,
 deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
 oracle_id TEXT NOT NULL REFERENCES cards(oracle_id),
 section TEXT NOT NULL CHECK(section IN ('mainboard','sideboard','commander','maybeboard')),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9999),
 set_code TEXT, collector_number TEXT,
 foil INTEGER NOT NULL DEFAULT 0 CHECK(foil IN (0,1)),
 raw_line TEXT, finish TEXT NOT NULL DEFAULT 'nonfoil', language TEXT, condition TEXT, scryfall_id TEXT
);
CREATE INDEX IF NOT EXISTS deck_cards_deck ON deck_cards(deck_id);
CREATE TABLE IF NOT EXISTS card_localizations (
 oracle_id TEXT PRIMARY KEY REFERENCES cards(oracle_id) ON DELETE CASCADE,
 fr_name TEXT,
 checked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS card_type_localizations (
 oracle_id TEXT PRIMARY KEY REFERENCES cards(oracle_id) ON DELETE CASCADE,
 fr_type_line TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id), collection_target INTEGER CHECK(collection_target>=0), reset_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS deck_settings (deck_id TEXT PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE, target_size INTEGER CHECK(target_size>=0));
CREATE TABLE IF NOT EXISTS card_printings (id TEXT PRIMARY KEY, oracle_id TEXT NOT NULL REFERENCES cards(oracle_id), set_code TEXT, collector_number TEXT, released_at TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS printings_oracle ON card_printings(oracle_id,released_at);
CREATE INDEX IF NOT EXISTS printings_set_number ON card_printings(set_code,collector_number);
CREATE TABLE IF NOT EXISTS scryfall_bulk_import (type TEXT PRIMARY KEY, updated_at TEXT NOT NULL, imported_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS collection_groups (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL COLLATE NOCASE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,name));
CREATE TABLE IF NOT EXISTS collection_entries (
 id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, oracle_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 set_code TEXT, collector_number TEXT, foil INTEGER NOT NULL DEFAULT 0, finish TEXT NOT NULL DEFAULT 'nonfoil', language TEXT, condition TEXT, scryfall_id TEXT, group_id TEXT REFERENCES collection_groups(id) ON DELETE SET NULL,
 FOREIGN KEY(user_id,oracle_id) REFERENCES collection(user_id,oracle_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS collection_entries_user ON collection_entries(user_id,oracle_id);
CREATE TABLE IF NOT EXISTS invitations (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
 expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
 used_by TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS site_access (
 user_id TEXT PRIMARY KEY REFERENCES users(id), allowed INTEGER NOT NULL DEFAULT 0
);
--
-- Community deck research is kept separate from user-owned decks and accounts.
CREATE TABLE IF NOT EXISTS commander_sources (
 id TEXT PRIMARY KEY, access_mode TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 terms_reviewed_at TEXT, notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS commander_decks (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES commander_sources(id) ON DELETE CASCADE,
 source_deck_id TEXT NOT NULL, source_url TEXT, name TEXT NOT NULL, author TEXT,
 format TEXT NOT NULL DEFAULT 'commander', color_identity TEXT NOT NULL DEFAULT '[]',
 created_at_source TEXT, updated_at_source TEXT, retrieved_at TEXT NOT NULL,
 content_hash TEXT NOT NULL, validation_status TEXT NOT NULL CHECK(validation_status IN ('valid','partial','rejected')),
 error_json TEXT NOT NULL DEFAULT '[]', UNIQUE(source_id,source_deck_id)
);
CREATE INDEX IF NOT EXISTS commander_decks_commander ON commander_decks(source_id,validation_status);
CREATE TABLE IF NOT EXISTS commander_deck_cards (
 deck_id TEXT NOT NULL REFERENCES commander_decks(id) ON DELETE CASCADE,
 oracle_id TEXT NOT NULL REFERENCES cards(oracle_id), section TEXT NOT NULL CHECK(section IN ('commander','mainboard','sideboard','maybeboard','other')),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9999),
 PRIMARY KEY(deck_id,oracle_id,section)
);
CREATE INDEX IF NOT EXISTS commander_deck_cards_card ON commander_deck_cards(oracle_id,deck_id);
CREATE TABLE IF NOT EXISTS commander_card_stats (
 commander_id TEXT NOT NULL REFERENCES cards(oracle_id), card_id TEXT NOT NULL REFERENCES cards(oracle_id),
 deck_count INTEGER NOT NULL, copy_count INTEGER NOT NULL, population INTEGER NOT NULL, source_count INTEGER NOT NULL DEFAULT 1,
 inclusion_rate REAL NOT NULL, calculated_at TEXT NOT NULL, dataset_version TEXT NOT NULL,
 PRIMARY KEY(commander_id,card_id)
);
CREATE INDEX IF NOT EXISTS commander_card_stats_rank ON commander_card_stats(commander_id,inclusion_rate DESC,deck_count DESC);
CREATE TABLE IF NOT EXISTS commander_card_associations (
 commander_id TEXT NOT NULL REFERENCES cards(oracle_id), seed_card_id TEXT NOT NULL REFERENCES cards(oracle_id),
 card_id TEXT NOT NULL REFERENCES cards(oracle_id), cooccurrence INTEGER NOT NULL,
 conditional_rate REAL NOT NULL, lift REAL NOT NULL, calculated_at TEXT NOT NULL, dataset_version TEXT NOT NULL,
 PRIMARY KEY(commander_id,seed_card_id,card_id)
);
CREATE INDEX IF NOT EXISTS commander_associations_lookup ON commander_card_associations(commander_id,seed_card_id,conditional_rate DESC);
CREATE TABLE IF NOT EXISTS commander_dataset_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
