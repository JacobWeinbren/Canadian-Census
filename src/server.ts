import path from "path";
import { PMTiles, Source, RangeResponse } from "pmtiles";
import express from "express";
import fs from "fs/promises";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";
import geobuf from "geobuf";

const app = express();

class FileSource implements Source {
	constructor(private filename: string) {}

	async getBytes(offset: number, length: number): Promise<RangeResponse> {
		const buffer = Buffer.alloc(length);
		const fileHandle = await fs.open(this.filename, "r");
		await fileHandle.read(buffer, 0, length, offset);
		await fileHandle.close();
		return {
			data: buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength
			),
			etag: undefined,
			expires: undefined,
			cacheControl: undefined,
		};
	}

	getKey() {
		return this.filename;
	}
}

const init = async () => {
	try {
		const pmtilesPath = path.resolve("map/canada.pmtiles");
		await fs.access(pmtilesPath);

		const source = new FileSource(pmtilesPath);
		const pmtiles = new PMTiles(source);

		app.get("/tiles/:z/:x/:y.pbf", async (req, res) => {
			try {
				const { z, x, y } = req.params;
				const tile = await pmtiles.getZxy(
					Number(z),
					Number(x),
					Number(y)
				);

				if (!tile) {
					return res.status(404).send("Tile not found");
				}

				const pbf = new Pbf(tile.data);
				const vectorTile = new VectorTile(pbf);

				const features = [];
				for (const layerName in vectorTile.layers) {
					const layer = vectorTile.layers[layerName];
					for (let i = 0; i < layer.length; i++) {
						const feature = layer.feature(i);
						feature.properties.customProperty = `Custom Value for ID ${feature.properties.id}`;
						features.push(
							feature.toGeoJSON(Number(x), Number(y), Number(z))
						);
					}
				}

				let geoJsonLayer = {
					type: "FeatureCollection",
					features: features,
				};

				// Encode GeoJSON to Geobuf
				const geobufBuffer = geobuf.encode(geoJsonLayer, new Pbf());

				// Convert UInt8Array to Node.js Buffer
				const buffer = Buffer.from(geobufBuffer);

				// Set the appropriate content type
				res.setHeader("Content-Type", "application/x-protobuf");
				res.send(buffer);
			} catch (error) {
				console.error("Error processing tile request:", error);
				res.status(500).send("Internal Server Error");
			}
		});

		const port = process.env.PORT || 8080;
		app.listen(port, () => {
			console.log(`Server running on port ${port}`);
		});
	} catch (error) {
		console.error("Initialization error:", error);
	}
};

init();
