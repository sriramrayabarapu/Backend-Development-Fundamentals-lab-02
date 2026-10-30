const connectToDatabase = require("./database");

async function seedDatabase() {
    const db = await connectToDatabase();

    try {
        const count = await db.get("SELECT COUNT(*) AS count FROM book");

        if (count.count === 0) {
            await db.run(`
                INSERT INTO book (title, author, price, pages) VALUES
                ('Wings of Fire', 'A. P. J. Abdul Kalam', 250, 180),
                ('The Alchemist', 'Paulo Coelho', 300, 208),
                ('Atomic Habits', 'James Clear', 450, 320),
                ('Ikigai', 'Hector Garcia', 350, 194),
                ('Rich Dad Poor Dad', 'Robert Kiyosaki', 400, 336),
                ('The Guide', 'R. K. Narayan', 280, 220),
                ('Deep Work', 'Cal Newport', 500, 304),
                ('Think Like a Monk', 'Jay Shetty', 380, 288),
                ('The Hobbit', 'J. R. R. Tolkien', 420, 310),
                ('1984', 'George Orwell', 320, 328)
            `);

            console.log("10 sample books inserted.");
        } else {
            console.log("Books already exist; skipping seed.");
        }
    } finally {
        await db.close();
    }
}

if (require.main === module) {
    seedDatabase().catch((error) => {
        console.error("Failed to seed database:", error);
        process.exitCode = 1;
    });
}

module.exports = seedDatabase;
