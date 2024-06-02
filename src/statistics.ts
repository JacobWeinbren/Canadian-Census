import fs from "fs";
import path from "path";
import csv from "csv-parser";
import ProgressBar from "progress";
import Database from "better-sqlite3";

interface MenuItem {
	id: number;
	name: string;
	divisor: number | null;
}

let db: Database.Database;

const openDatabase = () => {
	db = new Database(":memory:");
	db.exec(`
		CREATE TABLE IF NOT EXISTS keyValues (
			key TEXT PRIMARY KEY,
			value REAL
		);
	`);
};

const getValueFromMemory = (key: string): number | null => {
	const row = db
		.prepare("SELECT value FROM keyValues WHERE key = ?")
		.get(key);
	return row ? row.value : null;
};

const processFile = async (
	filePath: string,
	allItems: Record<number, MenuItem>,
	progressBar: ProgressBar,
	isFirstPass: boolean
) => {
	const batchSize = 1000;
	let batch: { key: string; value: number }[] = [];

	const processRow = async (row: any) => {
		if (row.GEO_LEVEL === "Dissemination area") {
			const dguid = row.DGUID;
			const characteristicId = parseInt(row.CHARACTERISTIC_ID, 10);
			const c1CountTotal = parseFloat(row.C1_COUNT_TOTAL);

			const key = `${dguid}-${characteristicId}`;

			if (isFirstPass) {
				batch.push({ key, value: c1CountTotal });
			} else {
				const item = allItems[characteristicId];
				if (item) {
					const { divisor } = item;
					let value = c1CountTotal;
					if (divisor) {
						const divisorKey = `${dguid}-${divisor}`;
						const divisorValue = getValueFromMemory(divisorKey);
						if (divisorValue) {
							value =
								Math.round(
									((100 * c1CountTotal) / divisorValue) * 100
								) / 100;
						} else {
							value = divisorValue;
						}
					}
					batch.push({ key, value });
				}
			}
			progressBar.tick();

			if (batch.length >= batchSize) {
				writeBatchToDatabase(batch);
				batch = [];
			}
		}
	};

	const writeBatchToDatabase = (batch: { key: string; value: number }[]) => {
		const insert = db.prepare(
			"INSERT OR REPLACE INTO keyValues (key, value) VALUES (?, ?)"
		);
		const transaction = db.transaction((batch) => {
			for (const { key, value } of batch) {
				insert.run(key, value);
			}
		});
		transaction(batch);
	};

	const processFilePass = () => {
		return new Promise<void>((resolve, reject) => {
			const stream = fs.createReadStream(filePath).pipe(csv());
			const concurrencyLimit = 2000;
			let activePromises = 0;
			let paused = false;

			const processRowWithControlledConcurrency = async (row) => {
				activePromises++;
				try {
					await processRow(row);
				} catch (error) {
					console.error("Error processing row:", error);
				} finally {
					activePromises--;
					if (paused && activePromises < concurrencyLimit) {
						paused = false;
						console.log("Resuming stream");
						stream.resume();
					}
				}
			};

			stream.on("data", (row) => {
				if (activePromises >= concurrencyLimit) {
					paused = true;
					console.log("Pausing stream");
					stream.pause();
				}
				processRowWithControlledConcurrency(row);
			});

			stream.on("end", async () => {
				console.log("Stream ended");
				const checkCompletion = setInterval(async () => {
					if (activePromises === 0) {
						clearInterval(checkCompletion);
						if (batch.length > 0) {
							writeBatchToDatabase(batch);
						}
						resolve();
					}
				}, 100);
			});

			stream.on("error", (error) => {
				console.error("Stream error:", error);
				reject(error);
			});
		});
	};

	return processFilePass();
};

const calculateTrimmedRange = async () => {
	try {
		openDatabase();

		const directoryPath = "./data/census";
		const files = fs
			.readdirSync(directoryPath)
			.filter((file) => file.includes("English_CSV_data"));

		const currentDir = path.dirname(new URL(import.meta.url).pathname);
		const menuListPath = path.join(currentDir, "../output/menu_list.json");
		const menuList: Record<string, MenuItem[]> = JSON.parse(
			fs.readFileSync(menuListPath, "utf-8")
		);
		const allItems: Record<number, MenuItem> = Object.values(menuList)
			.flat()
			.reduce((acc, item) => {
				acc[item.id] = item;
				return acc;
			}, {} as Record<number, MenuItem>);

		const totalRows = 152429616 * 2;
		const progressBar = new ProgressBar("[:bar] :percent :etas", {
			total: totalRows,
		});

		// First pass: store c1_count_total values in memory
		console.log("First Pass");
		for (const file of files) {
			const filePath = path.join(directoryPath, file);
			await processFile(filePath, allItems, progressBar, true);
		}

		// Second pass: apply divisor and store final values in memory
		console.log("Second Pass");
		for (const file of files) {
			const filePath = path.join(directoryPath, file);
			await processFile(filePath, allItems, progressBar, false);
		}

		progressBar.terminate();

		// Now perform calculations on the final data in memory
		const ranges: { [id: number]: { min: number; max: number } } = {};

		for (const category in menuList) {
			for (const menuItem of menuList[category]) {
				const { id, name } = menuItem;

				const rows = db
					.prepare("SELECT value FROM keyValues WHERE key LIKE ?")
					.all(`%-${id}`);
				const values = Array.isArray(rows)
					? rows.map((row) => row.value)
					: [];

				const sortedValues = values
					.filter((value) => value !== null && !isNaN(value))
					.sort((a, b) => a - b);

				const initialTrimPercent = 0.05;
				const secondaryTrimPercent = 0.01;
				const noTrimPercent = 0;

				const initialTrimCount = Math.floor(
					sortedValues.length * initialTrimPercent
				);

				const initialTrimmedValues = sortedValues.slice(
					initialTrimCount,
					sortedValues.length - initialTrimCount
				);

				let finalTrimPercent = initialTrimPercent;
				let finalTrimmedValues = initialTrimmedValues;

				if (initialTrimmedValues[initialTrimmedValues.length - 1] < 1) {
					const secondaryTrimCount = Math.floor(
						sortedValues.length * secondaryTrimPercent
					);
					const secondaryTrimmedValues = sortedValues.slice(
						secondaryTrimCount,
						sortedValues.length - secondaryTrimCount
					);

					if (
						secondaryTrimmedValues[
							secondaryTrimmedValues.length - 1
						] < 1
					) {
						finalTrimPercent = noTrimPercent;
						finalTrimmedValues = sortedValues;
					} else {
						finalTrimPercent = secondaryTrimPercent;
						finalTrimmedValues = secondaryTrimmedValues;
					}
				}

				const min = finalTrimmedValues[0];
				const max = finalTrimmedValues[finalTrimmedValues.length - 1];

				ranges[id] = { min, max };

				// Log the name with min and max values
				console.log(
					`Name: ${name}, Trim Percent: ${finalTrimPercent}, Min: ${min}, Max: ${max}`
				);
			}
		}

		// Write ranges to a JSON file
		const rangesFilePath = "output/ranges.json";
		fs.writeFileSync(rangesFilePath, JSON.stringify(ranges, null, 2));

		console.log("Ranges:", ranges);
	} catch (error) {
		console.error("Error processing files:", error);
	}
};

// Run the calculation on file execution
calculateTrimmedRange().catch((error) => {
	console.error("Error calculating trimmed range:", error);
});
