import csv from "csv-parser";
import path from "path";
import cliProgress from "cli-progress";
import fs from "fs";
import { createClient } from "redis";

interface MenuItem {
	id: string;
	divisor?: string;
}

/**
 * Processes a batch of rows and updates Redis.
 */
const processFile = async (
	filePath: string,
	allItems: Record<string, MenuItem>,
	redisClient: any,
	progressBar: any
) => {
	const processRow = async (row: any, isFirstPass: boolean) => {
		if (row.GEO_LEVEL === "Dissemination area") {
			const dguid = row.DGUID;
			const characteristicId = parseInt(row.CHARACTERISTIC_ID, 10);
			const c1CountTotal = parseFloat(row.C1_COUNT_TOTAL);

			const item = allItems[characteristicId];
			if (item) {
				const { id, divisor } = item;
				const key = `${dguid}-${id}`;

				if (isFirstPass) {
					// First pass: store the c1_count_total value
					await redisClient.set(key, c1CountTotal.toString());
				} else {
					// Second pass: apply divisor if it exists
					let value = c1CountTotal;
					if (divisor) {
						const divisorRow = await redisClient.get(
							`${dguid}-${divisor}`
						);
						if (divisorRow) {
							const divisorValue = parseFloat(divisorRow);
							value =
								Math.round(
									((100 * c1CountTotal) / divisorValue) * 10
								) / 10;
						}
					}
					await redisClient.set(key, value.toString());
				}

				progressBar.increment();
			}
		}
	};

	const processFilePass = (isFirstPass: boolean) => {
		return new Promise<void>((resolve, reject) => {
			const stream = fs.createReadStream(filePath).pipe(csv());
			const concurrencyLimit = 1000;
			let activePromises = 0;

			const processRowWithControlledConcurrency = async (row) => {
				activePromises++;
				try {
					await processRow(row, isFirstPass);
				} finally {
					activePromises--;
					if (activePromises < concurrencyLimit) {
						stream.resume(); // Resume the stream if under the limit
					}
				}
			};

			stream.on("data", async (row) => {
				if (activePromises >= concurrencyLimit) {
					stream.pause(); // Pause the stream if the limit is reached
				}
				processRowWithControlledConcurrency(row).catch((error) => {
					reject(error);
					stream.destroy(); // Ensure the stream is properly closed on error
				});
			});

			stream.on("end", () => {
				const checkCompletion = setInterval(() => {
					if (activePromises === 0) {
						// Ensure all processing is complete before resolving
						clearInterval(checkCompletion);
						resolve();
					}
				}, 100);
			});

			stream.on("error", reject);
		});
	};

	// First pass: store c1_count_total values
	console.log("First Pass");
	await processFilePass(true);

	// Second pass: apply divisor and store final values
	console.log("Second Pass");
	await processFilePass(false);
};

/**
 * Checks if all expected keys for each dguid and characteristicId in the "Dissemination area" have been added to Redis.
 */
const verifyDataIntegrity = async (
	filePath: string,
	allItems: Record<string, MenuItem>,
	redisClient: any
) => {
	const missingEntries = [];
	const totalRows = 142129961; // Total number of rows to process
	const progressBar = new cliProgress.SingleBar(
		{},
		cliProgress.Presets.shades_classic
	);
	progressBar.start(totalRows, 0);

	const checkKeyInRedis = async (dguid: string, id: string) => {
		const key = `${dguid}-${id}`;
		const exists = await redisClient.exists(key);
		if (!exists) {
			missingEntries.push(key);
			console.log(key);
		}
		progressBar.increment();
	};

	return new Promise<void>((resolve, reject) => {
		fs.createReadStream(filePath)
			.pipe(csv())
			.on("data", async (row) => {
				if (row.GEO_LEVEL === "Dissemination area") {
					const dguid = row.DGUID;
					const characteristicId = parseInt(
						row.CHARACTERISTIC_ID,
						10
					);
					const item = allItems[characteristicId];
					if (item) {
						await checkKeyInRedis(dguid, item.id);
					}
				}
			})
			.on("end", () => {
				progressBar.stop();
				if (missingEntries.length > 0) {
					console.log("Missing entries:", missingEntries);
				} else {
					console.log("All entries are present in Redis.");
				}
				resolve();
			})
			.on("error", (error) => {
				console.error("Error during data integrity check:", error);
				progressBar.stop();
				reject(error);
			});
	});
};

/**
 * Populates the database with data from CSV files.
 */
const populateDatabase = async () => {
	const directoryPath = "./data/census";
	const files = fs
		.readdirSync(directoryPath)
		.filter((file) => file.includes("English_CSV_data"));

	const currentDir = path.dirname(new URL(import.meta.url).pathname);
	const menuListPath = path.join(currentDir, "../output/menu_list.json");
	const menuList: Record<string, MenuItem[]> = JSON.parse(
		fs.readFileSync(menuListPath, "utf-8")
	);
	const allItems: Record<string, MenuItem> = Object.values(menuList)
		.flat()
		.reduce((acc, item) => {
			acc[parseInt(item.id, 10)] = item;
			return acc;
		}, {});

	const redisClient = createClient({
		url: `redis://${encodeURIComponent(
			process.env.DB_USERNAME
		)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${
			process.env.DB_HOST
		}:${process.env.DB_PORT}`,
		socket: {
			connectTimeout: 5000,
		},
	});

	// Wait for the Redis client to connect
	await redisClient.connect();

	// Initialize progress bar
	const totalRows = 152429616 * 2;
	const progressBar = new cliProgress.SingleBar(
		{
			etaBuffer: 100,
		},
		cliProgress.Presets.shades_classic
	);
	//progressBar.start(totalRows, 0);

	// Process each file
	for (const file of files) {
		console.log("Processing file contents", file);
		const filePath = path.join(directoryPath, file);
		//await processFile(filePath, allItems, redisClient, progressBar);
		await verifyDataIntegrity(filePath, allItems, redisClient);
	}

	progressBar.stop();
	await redisClient.disconnect();
};

// Run populateDatabase on file execution
populateDatabase().catch((error) => {
	console.error("Error populating database:", error);
});
