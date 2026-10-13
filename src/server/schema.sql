PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cards (oracle_id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT, type_line TEXT NOT NULL DEFAULT '');
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
CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id), collection_target INTEGER CHECK(collection_target>=0), reset_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS deck_settings (deck_id TEXT PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE, target_size INTEGER CHECK(target_size>=0));
CREATE TABLE IF NOT EXISTS card_printings (id TEXT PRIMARY KEY, oracle_id TEXT NOT NULL REFERENCES cards(oracle_id), set_code TEXT, collector_number TEXT, released_at TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS printings_oracle ON card_printings(oracle_id,released_at);
CREATE INDEX IF NOT EXISTS printings_set_number ON card_printings(set_code,collector_number);
CREATE TABLE IF NOT EXISTS collection_entries (
 id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, oracle_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 set_code TEXT, collector_number TEXT, foil INTEGER NOT NULL DEFAULT 0, finish TEXT NOT NULL DEFAULT 'nonfoil', language TEXT, condition TEXT, scryfall_id TEXT,
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
