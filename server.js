
const express = require("express");
const connectToDatabase = require("./database");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let db;
let databaseReady;

function getDatabase() {
    if (!databaseReady) {
        databaseReady = connectToDatabase()
            .then((connection) => {
                db = connection;
            })
            .catch((error) => {
                databaseReady = undefined;
                throw error;
            });
    }

    return databaseReady;
}

app.use(async (req, res, next) => {
    try {
        await getDatabase();
    } catch (error) {
        console.error("Unable to initialize database:", error);
        return res.status(503).json({ error: "Database unavailable" });
    }

    next();
});

// 1. GET all books
app.get("/books/", async (req, res) => {
    try {
        const books = await db.all("SELECT * FROM book");
        res.status(200).json(books);
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve books" });
    }
});


// 2. GET one book
app.get("/books/:bookId/", async (req, res) => {
    try {
        const { bookId } = req.params;

        if (!/^\d+$/.test(bookId) || Number(bookId) < 1) {
            return res.status(400).json({ error: "Invalid book ID" });
        }

        const book = await db.get(
            "SELECT * FROM book WHERE id = ?",
            [Number(bookId)]
        );

        if (!book) {
            return res.status(404).json({ error: "Book not found" });
        }

        res.status(200).json(book);
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve book" });
    }
});

// 3. POST a new book
app.post("/books/", async (req, res) => {
    try {
        const { title, author, price, pages } = req.body;

        if (
            typeof title !== "string" || !title.trim() ||
            typeof author !== "string" || !author.trim() ||
            !Number.isInteger(price) || price < 0 ||
            !Number.isInteger(pages) || pages < 1
        ) {
            return res.status(400).json({ error: "Invalid book details" });
        }

        const result = await db.run(
            `INSERT INTO book (title, author, price, pages)
             VALUES (?, ?, ?, ?)`,
            [title.trim(), author.trim(), price, pages]
        );

        const book = await db.get(
            "SELECT * FROM book WHERE id = ?",
            [result.lastID]
        );

        res.status(201).json(book);
    } catch (error) {
        res.status(500).json({ error: "Failed to add book" });
    }
});

// 4. PUT update a book
app.put("/books/:bookId/", async (req, res) => {
    try {
        const { bookId } = req.params;
        const { title, author, price, pages } = req.body;

        if (!/^\d+$/.test(bookId) || Number(bookId) < 1) {
            return res.status(400).json({ error: "Invalid book ID" });
        }

        if (
            typeof title !== "string" || !title.trim() ||
            typeof author !== "string" || !author.trim() ||
            !Number.isInteger(price) || price < 0 ||
            !Number.isInteger(pages) || pages < 1
        ) {
            return res.status(400).json({ error: "Invalid book details" });
        }

        const result = await db.run(
            `UPDATE book
             SET title = ?, author = ?, price = ?, pages = ?
             WHERE id = ?`,
            [title.trim(), author.trim(), price, pages, Number(bookId)]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Book not found" });
        }

        const book = await db.get(
            "SELECT * FROM book WHERE id = ?",
            [Number(bookId)]
        );

        res.status(200).json(book);
    } catch (error) {
        res.status(500).json({ error: "Failed to update book" });
    }
});

// 5. DELETE a book
app.delete("/books/:bookId/", async (req, res) => {
    try {
        const { bookId } = req.params;

        if (!/^\d+$/.test(bookId) || Number(bookId) < 1) {
            return res.status(400).json({ error: "Invalid book ID" });
        }

        const result = await db.run(
            "DELETE FROM book WHERE id = ?",
            [Number(bookId)]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Book not found" });
        }

        res.status(200).json({ message: "Book deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete book" });
    }
});

if (require.main === module) {
    getDatabase()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server running at http://localhost:${PORT}`);
            });
        })
        .catch((error) => {
            console.error("Unable to start server:", error.message);
            process.exitCode = 1;
        });
}

module.exports = app;
