import { resetTestDatabase } from "./database.js";

await resetTestDatabase();
console.log("Reset feedme_test database with schema and test seed data.");
