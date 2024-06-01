import fs from "fs";
import path from "path";
import csv from "csv-parser";
import ProgressBar from "progress";

interface MenuItem {
	id: number;
	name: string;
	divisor: number | null;
}

let keyValues: { [id: string]: number } = {};

const loadCSVDataIntoMemory = async (filePath: string) => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	return new Promise<void>((resolve, reject) => {
		const readStream = fs
			.createReadStream(filePath)
			.pipe(csv({ headers: ["key", "value"] }));

		readStream.on("data", (row) => {
			const key = row.key;
			const value = parseFloat(row.value);
			if (!isNaN(value)) {
				keyValues[key] = value;
			} else {
				console.warn(`Invalid value for key ${key}: ${row.value}`);
			}
		});

		readStream.on("end", () => {
			console.log("Finished reading CSV file");
			resolve();
		});

		readStream.on("error", (error) => {
			console.error("Error reading CSV file:", error);
			reject(error);
		});
	});
};

const getValueFromMemory = (key: string): number | null => {
	return keyValues[key] || null;
};

const processFile = async (
	filePath: string,
	allItems: Record<number, MenuItem>,
	writeStream: fs.WriteStream,
	progressBar: ProgressBar,
	isFirstPass: boolean
) => {
	const processRow = async (row: any) => {
		if (row.GEO_LEVEL === "Dissemination area") {
			const dguid = row.DGUID;
			const characteristicId = parseInt(row.CHARACTERISTIC_ID, 10);
			const c1CountTotal = parseFloat(row.C1_COUNT_TOTAL);

			const item = allItems[characteristicId];
			if (item) {
				const { id, divisor } = item;
				const key = `${dguid}-${id}`;

				if (isFirstPass) {
					// First pass: write the c1_count_total value to CSV
					writeStream.write(`${key},${c1CountTotal}\n`);
				} else {
					// Second pass: apply divisor if it exists
					let value = c1CountTotal;
					if (divisor) {
						const divisorKey = `${dguid}-${divisor}`;
						const divisorValue = getValueFromMemory(divisorKey);
						if (divisorValue !== null) {
							value =
								Math.round(
									((100 * c1CountTotal) / divisorValue) * 10
								) / 10;
						}
					}
					writeStream.write(`${key},${value}\n`);
				}

				progressBar.tick();
			}
		}
	};

	const processFilePass = () => {
		return new Promise<void>((resolve, reject) => {
			const stream = fs.createReadStream(filePath).pipe(csv());
			const concurrencyLimit = 1000;
			let activePromises = 0;

			const processRowWithControlledConcurrency = async (row) => {
				activePromises++;
				try {
					await processRow(row);
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

	return processFilePass();
};

const calculateTrimmedRange = async () => {
	const outputFilePath = "output/data_stream.csv";
	const writeStream = fs.createWriteStream(outputFilePath, { flags: "a" });

	try {
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
			}, {} as Record<string, MenuItem>);

		const totalRows = 152429616 * 2;
		const progressBar = new ProgressBar("[:bar] :percent :etas", {
			total: totalRows,
		});

		// First pass: write c1_count_total values to CSV
		console.log("First Pass");
		for (const file of files) {
			const filePath = path.join(directoryPath, file);
			await processFile(
				filePath,
				allItems,
				writeStream,
				progressBar,
				true
			);
		}

		writeStream.end();

		// Load CSV data into memory before the second pass
		await loadCSVDataIntoMemory(outputFilePath);

		// Second pass: apply divisor and write final values to CSV
		console.log("Second Pass");
		const finalOutputFilePath = "output/final_data_stream.csv";
		const finalWriteStream = fs.createWriteStream(finalOutputFilePath);
		for (const file of files) {
			const filePath = path.join(directoryPath, file);
			await processFile(
				filePath,
				allItems,
				finalWriteStream,
				progressBar,
				false
			);
		}

		finalWriteStream.end();
		progressBar.terminate();

		// Now read the final CSV file and perform calculations
		await loadCSVDataIntoMemory(finalOutputFilePath);

		const ranges: { [id: number]: { min: number; max: number } } = {};

		for (const category in menuList) {
			for (const menuItem of menuList[category]) {
				const { id, name } = menuItem;

				const values = Object.keys(keyValues)
					.filter((key) => key.endsWith(`-${id}`))
					.map((key) => keyValues[key]);

				const sortedValues = values
					.filter((value) => !isNaN(value))
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
				console.log(`Name: ${name}, Min: ${min}, Max: ${max}`);
			}
		}

		// Write ranges to a JSON file
		const rangesFilePath = "output/ranges.json";
		fs.writeFileSync(rangesFilePath, JSON.stringify(ranges, null, 2));

		console.log("Ranges:", ranges);
	} catch (error) {
		console.error("Error processing files:", error);
	} finally {
		writeStream.end();
	}
};

// Run the calculation on file execution
calculateTrimmedRange().catch((error) => {
	console.error("Error calculating trimmed range:", error);
});
