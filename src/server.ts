import path from "path";
import { PMTiles, Source, RangeResponse } from "pmtiles";
import express from "express";
import fs from "fs/promises";
import vtt from "vtt";
import { createClient } from "redis";

const app = express();
const redisClient = createClient({
	url: `redis://${encodeURIComponent(
		process.env.DB_USERNAME || ""
	)}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${
		process.env.DB_HOST || ""
	}:${process.env.DB_PORT || ""}`,
	socket: {
		connectTimeout: 5000,
	},
});

/**
 * FileSystemSource class to handle file operations.
 */
class FileSystemSource implements Source {
	private fileHandle: fs.FileHandle;

	constructor(private filePath: string) {
		this.initFileHandle();
	}

	private async initFileHandle() {
		this.fileHandle = await fs.open(this.filePath, "r");
	}

	async getBytes(offset: number, length: number): Promise<RangeResponse> {
		const buffer = Buffer.alloc(length);
		await this.fileHandle.read(buffer, 0, length, offset);
		return {
			data: buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength
			),
		};
	}

	async close() {
		await this.fileHandle?.close();
	}

	getKey(): string {
		return this.filePath;
	}
}

/**
 * Efficiently query cached census data using Redis with MGET.
 */
async function fetchCachedCensusData(
	dguids: Set<string>,
	charId1: string
): Promise<Map<string, any>> {
	const results = new Map<string, any>();
	const batchSize = 1000;
	const dguidArray = Array.from(dguids);

	for (let i = 0; i < dguidArray.length; i += batchSize) {
		const batch = dguidArray.slice(i, i + batchSize);
		const keys = batch.map((dguid) => `${dguid}-${charId1}`);

		// Use mget directly
		const values = await redisClient.mGet(keys);

		values.forEach((value, index) => {
			if (value !== null) {
				try {
					results.set(batch[index], JSON.parse(value));
				} catch (e) {
					if (e instanceof SyntaxError && value === "NaN") {
						results.set(batch[index], null);
					} else {
						throw e;
					}
				}
			}
		});
	}

	return results;
}

/**
 * Initialize the server and set up routes.
 */
const initialiseServer = async () => {
	try {
		await redisClient.connect();

		const pmtilesPath = path.resolve("output/canada-buildings.pmtiles");
		await fs.access(pmtilesPath);

		const fileSource = new FileSystemSource(pmtilesPath);
		const pmtiles = new PMTiles(fileSource);

		// Route to get tile data
		app.get("/tiles/:z/:x/:y.pbf/:charId1", async (req, res, next) => {
			try {
				const { z, x, y, charId1 } = req.params;
				const tile = await pmtiles.getZxy(
					Number(z),
					Number(x),
					Number(y)
				);

				if (!tile) return res.status(404).send("Tile not found");

				const buffer = Buffer.from(tile.data);
				const dguids = await extractDguidsFromTile(buffer);
				const results = await fetchCachedCensusData(dguids, charId1);
				const modifiedTile = await modifyTileData(buffer, results);

				res.setHeader("Content-Type", "application/x-protobuf");
				res.send(modifiedTile);
			} catch (error) {
				next(error);
			}
		});

		// Error handling middleware
		app.use((err, req, res, next) => {
			console.error("Error processing request:", err);
			res.status(500).send("Internal Server Error");
		});

		const port = process.env.PORT || 8080;
		app.listen(port, () => console.log(`Server running on port ${port}`));
	} catch (error) {
		console.error("Initialisation error:", error);
	}
};

/**
 * Extract DGUIDs from tile data.
 */
async function extractDguidsFromTile(buffer: Buffer): Promise<Set<string>> {
	const dguids = new Set<string>();
	await new Promise<void>((resolve) => {
		vtt((layers, done) => {
			layers.forEach((layer) => {
				layer.features.forEach((feature) => {
					dguids.add(feature.properties?.DGUID);
				});
			});
			done(null, layers);
			resolve();
		}).end(buffer);
	});
	return dguids;
}

/**
 * Modify tile data with census results.
 */
async function modifyTileData(
	buffer: Buffer,
	resultsMap: Map<string, any>
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const modifiedTile = vtt((layers, done) => {
			layers.forEach((layer) => {
				layer.features.forEach((feature) => {
					const result = resultsMap.get(feature.properties?.DGUID);
					if (result) {
						feature.properties.value = result;
					}
				});
			});
			done(null, layers);
		});

		const chunks: Buffer[] = [];
		modifiedTile.on("data", (chunk) => chunks.push(chunk));
		modifiedTile.on("end", () => resolve(Buffer.concat(chunks)));
		modifiedTile.on("error", reject);
		modifiedTile.end(buffer);
	});
}

// Start the server
initialiseServer();
