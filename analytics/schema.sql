CREATE TABLE IF NOT EXISTS downloads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 fingerprint TEXT NOT NULL UNIQUE,
 at TEXT NOT NULL,
 app TEXT NOT NULL,
 build TEXT NOT NULL,
 country TEXT NOT NULL,
 region TEXT NOT NULL,
 city TEXT NOT NULL,
 device TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_at ON downloads(at);
CREATE INDEX IF NOT EXISTS downloads_app_at ON downloads(app,at);
