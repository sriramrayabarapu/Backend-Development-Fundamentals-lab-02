const express = require("express");
const connectToDatabase = require("./database");

const app = express();

// Middleware: Parse JSON bodies
app.use(express.json());

const PORT = process.env.PORT || 3000;
let db;
let databaseReady;

function getDatabase() {
    if (!databaseReady) {
        databaseReady = connectToDatabase()
            .then((connection) => {
                db = connection;
                return db;
            })
            .catch((error) => {
                databaseReady = undefined;
                throw error;
            });
    }

    return databaseReady;
}

// Database initialization middleware for incoming requests
app.use(async (req, res, next) => {
    try {
        await getDatabase();
        next();
    } catch (error) {
        console.error("Unable to initialize database:", error);
        return res.status(503).json({ error: "Database unavailable" });
    }
});

// Root endpoint: API health check and endpoint documentation
app.get("/", (req, res) => {
    res.status(200).json({
        message: "Welcome to the Book Management REST API",
        status: "OK",
        endpoints: {
            getAllBooks: "GET /books",
            getBookById: "GET /books/:id",
            addBook: "POST /books",
            updateBook: "PUT /books/:id",
            deleteBook: "DELETE /books/:id"
        }
    });
});

// 1. GET all books
app.get(["/books", "/books/"], async (req, res) => {
    try {
        const books = await db.all("SELECT * FROM book ORDER BY id ASC");
        res.status(200).json(books);
    } catch (error) {
        console.error("Failed to retrieve books:", error);
        res.status(500).json({ error: "Failed to retrieve books" });
    }
});

// 2. GET one book by ID
app.get(["/books/:id", "/books/:id/"], async (req, res) => {
    try {
        const bookId = req.params.id;

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
        console.error("Failed to retrieve book:", error);
        res.status(500).json({ error: "Failed to retrieve book" });
    }
});

// 3. POST a new book
app.post(["/books", "/books/"], async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ error: "Invalid request body: expected a JSON object" });
        }

        const { title, author, price, pages } = req.body;

        if (
            typeof title !== "string" || !title.trim() ||
            typeof author !== "string" || !author.trim() ||
            typeof price !== "number" || !Number.isInteger(price) || price < 0 ||
            typeof pages !== "number" || !Number.isInteger(pages) || pages < 1
        ) {
            return res.status(400).json({
                error: "Invalid book details. Required: title (non-empty string), author (non-empty string), price (non-negative integer), pages (positive integer)"
            });
        }

        // Check for duplicate book with identical title and author
        const existingBook = await db.get(
            "SELECT id FROM book WHERE LOWER(TRIM(title)) = LOWER(?) AND LOWER(TRIM(author)) = LOWER(?)",
            [title.trim(), author.trim()]
        );

        if (existingBook) {
            return res.status(409).json({
                error: "A book with the same title and author already exists"
            });
        }

        const result = await db.run(
            `INSERT INTO book (title, author, price, pages)
             VALUES (?, ?, ?, ?)`,
            [title.trim(), author.trim(), price, pages]
        );

        const newBook = await db.get(
            "SELECT * FROM book WHERE id = ?",
            [result.lastID]
        );

        res.status(201).json(newBook);
    } catch (error) {
        console.error("Failed to add book:", error);
        res.status(500).json({ error: "Failed to add book" });
    }
});

// 4. PUT update a book
app.put(["/books/:id", "/books/:id/"], async (req, res) => {
    try {
        const bookId = req.params.id;

        if (!/^\d+$/.test(bookId) || Number(bookId) < 1) {
            return res.status(400).json({ error: "Invalid book ID" });
        }

        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ error: "Invalid request body: expected a JSON object" });
        }

        const { title, author, price, pages } = req.body;

        if (
            typeof title !== "string" || !title.trim() ||
            typeof author !== "string" || !author.trim() ||
            typeof price !== "number" || !Number.isInteger(price) || price < 0 ||
            typeof pages !== "number" || !Number.isInteger(pages) || pages < 1
        ) {
            return res.status(400).json({
                error: "Invalid book details. Required: title (non-empty string), author (non-empty string), price (non-negative integer), pages (positive integer)"
            });
        }

        // Verify book existence before updating
        const existingBook = await db.get(
            "SELECT * FROM book WHERE id = ?",
            [Number(bookId)]
        );

        if (!existingBook) {
            return res.status(404).json({ error: "Book not found" });
        }

        // Check if updating causes a duplicate title and author with another book
        const duplicateBook = await db.get(
            "SELECT id FROM book WHERE LOWER(TRIM(title)) = LOWER(?) AND LOWER(TRIM(author)) = LOWER(?) AND id != ?",
            [title.trim(), author.trim(), Number(bookId)]
        );

        if (duplicateBook) {
            return res.status(409).json({
                error: "Another book with this title and author already exists"
            });
        }

        await db.run(
            `UPDATE book
             SET title = ?, author = ?, price = ?, pages = ?
             WHERE id = ?`,
            [title.trim(), author.trim(), price, pages, Number(bookId)]
        );

        const updatedBook = await db.get(
            "SELECT * FROM book WHERE id = ?",
            [Number(bookId)]
        );

        res.status(200).json(updatedBook);
    } catch (error) {
        console.error("Failed to update book:", error);
        res.status(500).json({ error: "Failed to update book" });
    }
});

// 5. DELETE a book
app.delete(["/books/:id", "/books/:id/"], async (req, res) => {
    try {
        const bookId = req.params.id;

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
        console.error("Failed to delete book:", error);
        res.status(500).json({ error: "Failed to delete book" });
    }
});

// Catch-all 404 handler for unknown routes
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Error-handling middleware (handles JSON parse errors and unexpected exceptions)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({ error: "Malformed JSON in request body" });
    }
    console.error("Unhandled server error:", err);
    res.status(500).json({ error: "Internal server error" });
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
