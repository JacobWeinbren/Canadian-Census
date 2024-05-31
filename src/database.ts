import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import fs from "fs";
import csv from "csv-parser";
import path from "path";
import cliProgress from "cli-progress";

// Declare db variable to hold the database instance
let db: Database | null = null;

// Function to initialize the database connection
const initDb = async () => {
	db = await open({
		filename: "./database/database.db",
		driver: sqlite3.Database,
	});
};

// Function to create the database schema
const createDb = async () => {
	if (!db) {
		throw new Error("Database not initialized. Call initDb first.");
	}

	// Create the census_data table with an index on characteristic_id
	await db.exec(`
        CREATE TABLE IF NOT EXISTS census_data (
            dguid TEXT,
            characteristic_id INTEGER,
            c1_count_total REAL,
            PRIMARY KEY (dguid, characteristic_id)
        )
    `);

	// Create indexes on characteristic_id and dguid
	await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_characteristic_id
        ON census_data (characteristic_id)
    `);
	await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_characteristic_dguid
        ON census_data (characteristic_id, dguid)
    `);
};

// Function to insert census data from CSV files
const insertCensusData = async () => {
	if (!db) {
		throw new Error("Database not initialized. Call initDb first.");
	}

	const directoryPath = "./data/census";
	const files = fs
		.readdirSync(directoryPath)
		.filter((file) => file.includes("English_CSV_data"));
	const fileBar = new cliProgress.SingleBar(
		{},
		cliProgress.Presets.shades_classic
	);
	fileBar.start(files.length, 0);

	for (const file of files) {
		const filePath = path.join(directoryPath, file);
		const results = [];

		await new Promise<void>((resolve, reject) => {
			fs.createReadStream(filePath)
				.pipe(csv())
				.on("data", (data) => {
					if (data.GEO_LEVEL === "Dissemination area") {
						results.push({
							dguid: data.DGUID,
							characteristic_id: parseInt(
								data.CHARACTERISTIC_ID,
								10
							),
							c1_count_total: parseFloat(data.C1_COUNT_TOTAL),
						});
					}
				})
				.on("end", resolve)
				.on("error", reject);
		});

		const insertStmt = await db.prepare(`
            INSERT INTO census_data (dguid, characteristic_id, c1_count_total)
            VALUES (?, ?, ?)
        `);
		const rowBar = new cliProgress.SingleBar(
			{},
			cliProgress.Presets.shades_classic
		);
		rowBar.start(results.length, 0);

		await db.run("BEGIN TRANSACTION");
		for (const row of results) {
			await insertStmt.run(
				row.dguid,
				row.characteristic_id,
				Math.round(row.c1_count_total * 100) / 100
			);
			rowBar.increment();
		}
		await db.run("COMMIT");

		rowBar.stop();
		await insertStmt.finalize();
		fileBar.increment();
	}

	fileBar.stop();
};

// Export a function to get the db instance
export const getDb = async () => {
	if (!db) {
		await initDb();
	}
	return db;
};

// Function to query census data
export const queryCensusData = async (db, dguids, charId1, charId2 = null) => {
	let query;
	if (charId2) {
		query = `
            SELECT dguid, 
                   100.0 * (SELECT c1_count_total FROM census_data WHERE characteristic_id = ? AND dguid = cd.dguid) /
                   (SELECT c1_count_total FROM census_data WHERE characteristic_id = ? AND dguid = cd.dguid) AS value
            FROM census_data cd
            WHERE dguid IN (${dguids.map(() => "?").join(",")})
            GROUP BY dguid
        `;
		return await db.all(query, [charId1, charId2, ...dguids]);
	} else {
		query = `
            SELECT dguid, c1_count_total AS value
            FROM census_data
            WHERE characteristic_id = ?
            AND dguid IN (${dguids.map(() => "?").join(",")})
        `;
		return await db.all(query, [charId1, ...dguids]);
	}
};

// Main function to initialize and set up the database
const main = async () => {
	try {
		await initDb();
		await createDb();
		await insertCensusData();
		console.log("Database setup complete.");
	} catch (err) {
		console.error("Error during database setup:", err);
	}
};

main().catch((err) => {
	console.error("Failed to initialize database:", err);
});
