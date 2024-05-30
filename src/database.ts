import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import csv from "csv-parser";
import path from "path";
import cliProgress from "cli-progress";

const initDb = async () => {
	// Open a database handle
	const db = await open({
		filename: "./database/database.db",
		driver: sqlite3.Database,
	});

	// Create the census_data table with an index on characteristic_id
	await db.exec(`
    CREATE TABLE IF NOT EXISTS census_data (
      dguid TEXT,
      characteristic_id INTEGER,
      c1_count_total INTEGER,
      PRIMARY KEY (dguid, characteristic_id)
    )
  `);

	await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characteristic_id
    ON census_data (characteristic_id)
  `);

	// Create a composite index on characteristic_id and dguid
	await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characteristic_dguid
    ON census_data (characteristic_id, dguid)
  `);

	// Insert census data
	await insertCensusData(db);

	// Print some sample data
	const sampleData = await db.all("SELECT * FROM census_data LIMIT 5");
	console.log("Sample Data:", sampleData);

	// Test the query function
	const testDguids = ["2021A000011124", "2021A000011124"];
	const characteristicId = 1;
	const results = await queryCensusData(db, testDguids, characteristicId);
	console.log(`Results for characteristic_id ${characteristicId}:`, results);

	// Close the database
	await db.close();
};

const insertCensusData = async (db) => {
	const directoryPath = "./data/census";
	const files = fs
		.readdirSync(directoryPath)
		.filter((file) => file.includes("English_CSV_data"));

	// Initialise progress bar for files
	const fileBar = new cliProgress.SingleBar(
		{},
		cliProgress.Presets.shades_classic
	);
	fileBar.start(files.length, 0);

	for (const file of files) {
		const filePath = path.join(directoryPath, file);
		const results = [];

		// Read and parse CSV file
		await new Promise<void>((resolve, reject) => {
			fs.createReadStream(filePath)
				.pipe(csv())
				.on("data", (data) => {
					if (data.GEO_LEVEL === "Dissemination area") {
						results.push({
							dguid: data.DGUID,
							characteristic_id: data.CHARACTERISTIC_ID,
							c1_count_total: data.C1_COUNT_TOTAL,
						});
					}
				})
				.on("end", resolve)
				.on("error", reject);
		});

		try {
			// Prepare insert statement
			const insertStmt = await db.prepare(`
				INSERT INTO census_data (dguid, characteristic_id, c1_count_total)
				VALUES (?, ?, ?)
			`);

			// Initialise progress bar for rows
			const rowBar = new cliProgress.SingleBar(
				{},
				cliProgress.Presets.shades_classic
			);
			rowBar.start(results.length, 0);

			// Batch insert rows
			await db.run("BEGIN TRANSACTION");
			for (const row of results) {
				await insertStmt.run(
					row.dguid,
					row.characteristic_id,
					row.c1_count_total
				);
				rowBar.increment();
			}
			await db.run("COMMIT");

			rowBar.stop();
			await insertStmt.finalize();
			fileBar.increment();
		} catch (err) {
			console.error(`Error inserting data from file ${filePath}:`, err);
		}
	}

	fileBar.stop();
};

export const queryCensusData = async (db, dguids, characteristicId) => {
	// Validate dguids input
	if (
		!Array.isArray(dguids) ||
		dguids.some((dguid) => typeof dguid !== "string")
	) {
		throw new Error("dguids must be an array of strings");
	}

	// Construct query with placeholders
	const placeholders = dguids.map(() => "?").join(",");
	const query = `
		SELECT dguid, c1_count_total
		FROM census_data
		WHERE characteristic_id = ?
		AND dguid IN (${placeholders})
	`;

	// Execute query and return results
	return await db.all(query, [characteristicId, ...dguids]);
};

initDb().catch((err) => {
	console.error("Database initialization failed:", err);
});
