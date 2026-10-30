
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");

async function connectToDatabase() {
    const db = await open({
        filename: process.env.DB_PATH || (
            process.env.VERCEL
                ? path.join("/tmp", "books.db")
                : path.join(__dirname, "books.db")
        ),
        driver: sqlite3.Database
    });

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
