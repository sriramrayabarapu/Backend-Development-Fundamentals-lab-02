const http = require("http");
const app = require("./server");
const seedDatabase = require("./seed");

// Helper function to send HTTP requests to test server
function request(server, options, body = null) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        const reqOptions = {
            hostname: "127.0.0.1",
            port: address.port,
            path: options.path,
            method: options.method || "GET",
            headers: options.headers || {}
        };

        let requestBody = body;
        if (body && typeof body === "object" && !(typeof body === "string")) {
            requestBody = JSON.stringify(body);
            reqOptions.headers["Content-Type"] = "application/json";
            reqOptions.headers["Content-Length"] = Buffer.byteLength(requestBody);
        } else if (typeof body === "string") {
            reqOptions.headers["Content-Type"] = reqOptions.headers["Content-Type"] || "application/json";
            reqOptions.headers["Content-Length"] = Buffer.byteLength(body);
        }

        const req = http.request(reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on("error", reject);

        if (requestBody) {
            req.write(requestBody);
        }
        req.end();
    });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passedTests++;
    } else {
        console.error(`  FAIL: ${testName} - ${details}`);
        failedTests++;
    }
}

async function runTestSuite() {
    console.log("=========================================");
    console.log(" Running Book Management API Test Suite ");
    console.log("=========================================\n");

    // 1. Seed database first
    try {
        await seedDatabase();
        console.log("Database seeded successfully.\n");
    } catch (err) {
        console.warn("Seeding notice:", err.message);
    }

    // 2. Start server on dynamic port
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    console.log(`Test server running on port ${port}\n`);

    try {
        // Test 1: Root Health Check
        console.log("[Category 1: Health Check & General]");
        const rootRes = await request(server, { path: "/", method: "GET" });
        assert(rootRes.status === 200 && rootRes.body.status === "OK", "GET / returns 200 OK and endpoint docs");

        // Test 2: Unknown Route
        const unknownRes = await request(server, { path: "/nonexistent-route", method: "GET" });
        assert(unknownRes.status === 404 && unknownRes.body.error === "Route not found", "Unknown route returns 404 JSON");

        // Test 3: GET all books
        console.log("\n[Category 2: GET /books - Retrieve All Books]");
        const allBooksRes = await request(server, { path: "/books", method: "GET" });
        assert(allBooksRes.status === 200, "GET /books returns 200 status code");
        assert(Array.isArray(allBooksRes.body), "GET /books returns an array");
        assert(allBooksRes.body.length >= 10, "GET /books returns at least 10 seed books");
        const sampleBook = allBooksRes.body[0];
        assert(
            sampleBook &&
            "id" in sampleBook &&
            "title" in sampleBook &&
            "author" in sampleBook &&
            "price" in sampleBook &&
            "pages" in sampleBook,
            "Each book has all required fields: id, title, author, price, pages"
        );

        // Test 4: GET single book by ID
        console.log("\n[Category 3: GET /books/:id - Retrieve Specific Book]");
        const singleBookRes = await request(server, { path: "/books/1", method: "GET" });
        assert(singleBookRes.status === 200, "GET /books/1 returns 200 status code");
        assert(singleBookRes.body.id === 1, "GET /books/1 returns book with id 1");

        // Test 5: GET book with non-existent ID
        const notFoundRes = await request(server, { path: "/books/999999", method: "GET" });
        assert(notFoundRes.status === 404, "GET /books/999999 returns 404 Not Found");
        assert(notFoundRes.body.error === "Book not found", "GET /books/999999 returns proper error message");

        // Test 6: GET book with invalid ID formats
        const invalidIdRes = await request(server, { path: "/books/abc", method: "GET" });
        assert(invalidIdRes.status === 400 && invalidIdRes.body.error === "Invalid book ID", "GET /books/abc returns 400 Bad Request");

        const zeroIdRes = await request(server, { path: "/books/0", method: "GET" });
        assert(zeroIdRes.status === 400 && zeroIdRes.body.error === "Invalid book ID", "GET /books/0 returns 400 Bad Request");

        // Test 7: POST a new book
        console.log("\n[Category 4: POST /books - Add New Book]");
        const newBookPayload = {
            title: "Automated Testing in Node.js",
            author: "Senior QA Engineer",
            price: 550,
            pages: 380
        };
        const postRes = await request(server, { path: "/books", method: "POST" }, newBookPayload);
        assert(postRes.status === 201, "POST /books returns 201 Created");
        assert(postRes.body.title === newBookPayload.title, "Created book has correct title");
        assert(postRes.body.author === newBookPayload.author, "Created book has correct author");
        assert(postRes.body.price === 550, "Created book has correct price");
        assert(postRes.body.pages === 380, "Created book has correct pages");
        assert(typeof postRes.body.id === "number", "Created book has auto-generated numeric ID");
        const createdBookId = postRes.body.id;

        // Test 8: POST duplicate book
        const duplicateRes = await request(server, { path: "/books", method: "POST" }, newBookPayload);
        assert(duplicateRes.status === 409, "POST duplicate book returns 409 Conflict");

        // Test 9: POST with invalid payloads
        const missingFieldsRes = await request(server, { path: "/books", method: "POST" }, { title: "Only Title" });
        assert(missingFieldsRes.status === 400, "POST with missing fields returns 400 Bad Request");

        const negativePriceRes = await request(server, { path: "/books", method: "POST" }, {
            title: "Test Negative",
            author: "Tester",
            price: -10,
            pages: 100
        });
        assert(negativePriceRes.status === 400, "POST with negative price returns 400 Bad Request");

        // Test 10: Malformed JSON handling
        const malformedRes = await request(
            server,
            { path: "/books", method: "POST", headers: { "Content-Type": "application/json" } },
            "{ broken json string: 123"
        );
        assert(malformedRes.status === 400 && malformedRes.body.error === "Malformed JSON in request body", "Malformed JSON returns 400 Bad Request");

        // Test 11: PUT update existing book
        console.log("\n[Category 5: PUT /books/:id - Update Book]");
        const updatePayload = {
            title: "Automated Testing in Node.js (Revised Edition)",
            author: "Senior QA Engineer",
            price: 599,
            pages: 420
        };
        const putRes = await request(server, { path: `/books/${createdBookId}`, method: "PUT" }, updatePayload);
        assert(putRes.status === 200, "PUT /books/:id returns 200 OK");
        assert(putRes.body.title === updatePayload.title, "Book title updated successfully");
        assert(putRes.body.price === 599, "Book price updated successfully");

        // Test 12: PUT with non-existent ID
        const putNotFoundRes = await request(server, { path: "/books/999999", method: "PUT" }, updatePayload);
        assert(putNotFoundRes.status === 404 && putNotFoundRes.body.error === "Book not found", "PUT with non-existent ID returns 404 Not Found");

        // Test 13: PUT with invalid ID
        const putInvalidIdRes = await request(server, { path: "/books/xyz", method: "PUT" }, updatePayload);
        assert(putInvalidIdRes.status === 400 && putInvalidIdRes.body.error === "Invalid book ID", "PUT with invalid ID format returns 400 Bad Request");

        // Test 14: DELETE existing book
        console.log("\n[Category 6: DELETE /books/:id - Delete Book]");
        const deleteRes = await request(server, { path: `/books/${createdBookId}`, method: "DELETE" });
        assert(deleteRes.status === 200, "DELETE /books/:id returns 200 OK");
        assert(deleteRes.body.message === "Book deleted successfully", "DELETE returns success message");

        // Test 15: Verify book was really deleted
        const verifyDeletedRes = await request(server, { path: `/books/${createdBookId}`, method: "GET" });
        assert(verifyDeletedRes.status === 404, "Subsequent GET for deleted book returns 404 Not Found");

        // Test 16: DELETE non-existent book
        const deleteNotFoundRes = await request(server, { path: `/books/${createdBookId}`, method: "DELETE" });
        assert(deleteNotFoundRes.status === 404, "DELETE already deleted book returns 404 Not Found");

        // Test 17: DELETE invalid ID
        const deleteInvalidIdRes = await request(server, { path: "/books/xyz", method: "DELETE" });
        assert(deleteInvalidIdRes.status === 400 && deleteInvalidIdRes.body.error === "Invalid book ID", "DELETE with invalid ID format returns 400 Bad Request");

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("\n=========================================");
    console.log(` Test Summary: ${passedTests} Passed, ${failedTests} Failed`);
    console.log("=========================================\n");

    if (failedTests > 0) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    runTestSuite().catch((err) => {
        console.error("Test suite runner error:", err);
        process.exit(1);
    });
}

module.exports = runTestSuite;
