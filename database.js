const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

async function connectToDatabase() {
    const dbPath = process.env.DB_PATH || (
        process.env.VERCEL
            ? path.join("/tmp", "books.db")
            : path.join(__dirname, "books.db")
    );

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Enable WAL mode and busy timeout for high concurrency and to prevent database locking
    await db.run("PRAGMA journal_mode = WAL;");
    await db.run("PRAGMA busy_timeout = 5000;");

    await db.exec(`
        CREATE TABLE IF NOT EXISTS book (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            price INTEGER NOT NULL,
            pages INTEGER NOT NULL
        );
    `);

    return db;
}

module.exports = connectToDatabase;
