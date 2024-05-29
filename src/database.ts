import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import csv from "csv-parser";
import path from "path";
import cliProgress from "cli-progress";

const initDb = async () => {
	console.log("Initializing database...");
	// Open a database handle
	const db = await open({
		filename: "./database/database.db",
		driver: sqlite3.Database,
	});
	console.log("Database opened.");

	// Create the census_data table with an index on characteristic_id
	console.log("Creating census_data table...");
	await db.exec(`
    CREATE TABLE IF NOT EXISTS census_data (
      dguid TEXT,
      characteristic_id INTEGER,
      c1_count_total INTEGER,
      PRIMARY KEY (dguid, characteristic_id)
    )
  `);
	console.log("census_data table created.");

	console.log("Creating index on characteristic_id...");
	await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characteristic_id
    ON census_data (characteristic_id)
  `);
	console.log("Index created.");

	// Create a composite index on characteristic_id and dguid
	console.log("Creating composite index on characteristic_id and dguid...");
	await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characteristic_dguid
    ON census_data (characteristic_id, dguid)
  `);
	console.log("Composite index created.");

	// Insert census data
	console.log("Inserting census data...");
	await insertCensusData(db);
	console.log("Census data inserted.");

	// Print some sample data
	console.log("Fetching sample data...");
	const sampleData = await db.all("SELECT * FROM census_data LIMIT 5");
	console.log("Sample Data:", sampleData);

	// Test the query function
	const testDguids = ["2021A000011124", "2021A000011124"];
	const characteristicId = 1;
	console.log(
		`Querying data for characteristic_id ${characteristicId} and dguids ${testDguids}...`
	);
	const results = await queryCensusData(db, testDguids, characteristicId);
	console.log(`Results for characteristic_id ${characteristicId}:`, results);

	// Close the database
	console.log("Closing database...");
	await db.close();
	console.log("Database closed.");
};

const insertCensusData = async (db) => {
	const directoryPath = "./data/census";
	const files = fs
		.readdirSync(directoryPath)
		.filter((file) => file.includes("English_CSV_data"));

	console.log("Files", files);

	const fileBar = new cliProgress.SingleBar(
		{},
		cliProgress.Presets.shades_classic
	);
	fileBar.start(files.length, 0);

	for (const file of files) {
		const filePath = path.join(directoryPath, file);
		const results = [];

		console.log(`Starting to process file: ${filePath}`);
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
				.on("end", () => {
					console.log(`Finished reading file: ${filePath}`);
					resolve();
				})
				.on("error", (err) => {
					console.error(`Error reading file: ${filePath}`, err);
					reject(err);
				});
		});

		try {
			const insertStmt = await db.prepare(`
				INSERT INTO census_data (dguid, characteristic_id, c1_count_total)
				VALUES (?, ?, ?)
			`);

			const rowBar = new cliProgress.SingleBar(
				{},
				cliProgress.Presets.shades_classic
			);
			rowBar.start(results.length, 0);

			// Batch insert
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
			console.log(`Data from file ${filePath} inserted into database.`);
			fileBar.increment();
		} catch (err) {
			console.error(`Error inserting data from file ${filePath}:`, err);
		}
		console.log(`Finished processing file: ${filePath}`);
	}

	fileBar.stop();
};

export const queryCensusData = async (db, dguids, characteristicId) => {
	if (
		!Array.isArray(dguids) ||
		dguids.some((dguid) => typeof dguid !== "string")
	) {
		throw new Error("dguids must be an array of strings");
	}

	const placeholders = dguids.map(() => "?").join(",");
	const query = `
		SELECT dguid, c1_count_total
		FROM census_data
		WHERE characteristic_id = ?
		AND dguid IN (${placeholders})
	`;
	console.log(
		`Executing query: ${query} with characteristic_id ${characteristicId} and dguids ${dguids}`
	);
	const results = await db.all(query, [characteristicId, ...dguids]);
	console.log("Query executed successfully.");
	return results;
};

initDb().catch((err) => {
	console.error("Database initialization failed:", err);
});
