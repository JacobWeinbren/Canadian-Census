import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";

// Interfaces for menu items and results
interface MenuItem {
	id: number;
	name: string;
	divisor: number | null;
}

interface MenuList {
	[key: string]: MenuItem[];
}

interface RangeResults {
	min: number;
	max: number;
}

// Function to calculate trimmed range of values
const calculateTrimmedRange = async () => {
	const db = await open({
		filename: "./database/database.db",
		driver: sqlite3.Database,
	});

	try {
		// Read and parse the menu list from JSON file
		const menuListData = fs.readFileSync("output/menu_list.json", "utf8");
		const menuList: MenuList = JSON.parse(menuListData);

		const ranges = {};

		// Process each menu item to calculate its range
		for (const category in menuList) {
			for (const menuItem of menuList[category]) {
				const { id, name, divisor } = menuItem;

				// Prepare SQL query based on whether a divisor is present
				let valuesQuery =
					divisor !== null
						? `
                    SELECT
                        CASE WHEN CAST(c2.c1_count_total AS FLOAT) = 0 THEN 0
                        ELSE CAST(c1.c1_count_total AS FLOAT) / CAST(c2.c1_count_total AS FLOAT) * 100
                        END AS value
                    FROM census_data c1
                    JOIN census_data c2 ON c1.dguid = c2.dguid
                    WHERE c1.characteristic_id = ? AND c2.characteristic_id = ?
                `
						: `
                    SELECT c1_count_total AS value
                    FROM census_data
                    WHERE characteristic_id = ?
                `;

				// Execute query and fetch values
				const values = await db.all(
					valuesQuery,
					divisor !== null ? [id, divisor] : [id]
				);

				// Sort values to facilitate range calculation
				const sortedValues = values
					.map((v) => v.value)
					.filter((v) => !isNaN(v)) // Filter out NaN values
					.sort((a, b) => a - b);

				// Calculate trimmed ranges
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

				// Adjust trimming based on the presence of zero values
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

				// Calculate final min and max values
				let min = parseFloat(finalTrimmedValues[0]?.toFixed(1) || "0");
				let max = parseFloat(
					finalTrimmedValues[finalTrimmedValues.length - 1]?.toFixed(
						1
					) || "0"
				);

				// Cap off min and max when divisor is present
				if (divisor !== null) {
					min = Math.max(min, 0);
					max = Math.min(max, 100);
				}

				const results: RangeResults = { min, max };
				ranges[id] = results;

				// Log results for each menu item
				console.log(`Menu Item: ${name}`);
				console.log(
					`Trimmed Min ${finalTrimPercent * 100}%: ${results.min}`
				);
				console.log(
					`Trimmed Max ${finalTrimPercent * 100}%: ${results.max}`
				);
				console.log("---");
			}
		}

		// Save the calculated ranges to a JSON file
		fs.writeFileSync("output/ranges.json", JSON.stringify(ranges, null, 2));
		console.log("Ranges saved to output/ranges.json");
	} catch (error) {
		console.error("Error calculating ranges:", error);
	} finally {
		await db.close();
	}
};

// Execute the range calculation
calculateTrimmedRange().catch((err) => {
	console.error("Range calculation failed:", err);
});
