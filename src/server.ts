import path from "path";
import { PMTiles, Source, RangeResponse } from "pmtiles";
import express from "express";
import fs from "fs/promises";
import vtt from "vtt";
import { getDb, queryCensusData } from "./database";

const app = express();

// Implements the Source interface for PMTiles using a file system.
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

const cache = new Map();

async function queryCensusDataWithCache(db, dguids, charId1, charId2?) {
	const key = `${charId1}-${charId2}-${dguids.join(",")}`;
	if (cache.has(key)) {
		return cache.get(key);
	}
	const result = await queryCensusData(db, dguids, charId1, charId2);
	cache.set(key, result);
	return result;
}

// Initialises the server and sets up routes.
const initialiseServer = async () => {
	try {
		const db = await getDb();
		const pmtilesPath = path.resolve("output/canada_areas.pmtiles");
		await fs.access(pmtilesPath);

		const fileSource = new FileSystemSource(pmtilesPath);
		const pmtiles = new PMTiles(fileSource);

		// Route to handle tile requests.
		app.get(
			"/tiles/:z/:x/:y.pbf/:charId1/:charId2?",
			async (req, res, next) => {
				try {
					const { z, x, y, charId1, charId2 } = req.params;
					const tile = await pmtiles.getZxy(
						Number(z),
						Number(x),
						Number(y)
					);

					if (!tile) return res.status(404).send("Tile not found");

					const buffer = Buffer.from(tile.data);
					const dguids = await extractDguidsFromTile(buffer);

					const results = charId2
						? await queryCensusDataWithCache(
								db,
								dguids,
								charId1,
								charId2
						  )
						: await queryCensusDataWithCache(
								db,
								dguids,
								charId1,
								undefined
						  );

					const modifiedTile = await modifyTileData(buffer, results);

					res.setHeader("Content-Type", "application/x-protobuf");
					res.send(modifiedTile);
				} catch (error) {
					next(error);
				}
			}
		);

		// Error handling middleware
		app.use((err, req, res, next) => {
			console.error("Error processing request:", err);
			res.status(500).send("Internal Server Error");
		});

		// Start the server.
		const port = process.env.PORT || 8080;
		app.listen(port, () => console.log(`Server running on port ${port}`));
	} catch (error) {
		console.error("Initialisation error:", error);
	}
};

// Extracts DGIDs from the tile data.
async function extractDguidsFromTile(buffer: Buffer): Promise<string[]> {
	const dguids = new Set<string>();
	await new Promise<void>((resolve, reject) => {
		vtt((layers, done) => {
			layers.forEach((layer) => {
				layer.features.forEach((feature) => {
					if (feature.properties.dguid) {
						dguids.add(feature.properties.dguid);
					}
				});
			});
			done(null, layers);
			resolve();
		}).end(buffer);
	});
	return Array.from(dguids);
}

// Modifies tile data based on the results from the database.
async function modifyTileData(buffer: Buffer, results: any[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const modifiedTile = vtt((layers, done) => {
			layers.forEach((layer) => {
				layer.features.forEach((feature) => {
					const result = results.find(
						(r) => r.dguid === feature.properties.dguid
					);
					if (result) {
						feature.properties.value = result.value;
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

initialiseServer();
