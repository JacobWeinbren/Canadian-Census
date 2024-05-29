var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import path from "path";
import { PMTiles } from "pmtiles";
import express from "express";
import fs from "fs/promises";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";
import vtpbf from "vt-pbf";
const app = express();
class FileSource {
    constructor(filename) {
        this.filename = filename;
    }
    getBytes(offset, length) {
        return __awaiter(this, void 0, void 0, function* () {
            const buffer = Buffer.alloc(length);
            const fileHandle = yield fs.open(this.filename, "r");
            yield fileHandle.read(buffer, 0, length, offset);
            yield fileHandle.close();
            return {
                data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
                etag: undefined,
                expires: undefined,
                cacheControl: undefined,
            };
        });
    }
    getKey() {
        return this.filename;
    }
}
const init = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pmtilesPath = path.resolve("map/canada.pmtiles");
        yield fs.access(pmtilesPath);
        const source = new FileSource(pmtilesPath);
        const pmtiles = new PMTiles(source);
        app.get("/tiles/:z/:x/:y.mvt", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { z, x, y } = req.params;
                const tile = yield pmtiles.getZxy(Number(z), Number(x), Number(y));
                if (!tile) {
                    return res.status(404).send("Tile not found");
                }
                const pbf = new Pbf(tile.data);
                const vectorTile = new VectorTile(pbf);
                const layers = {};
                for (const layerName in vectorTile.layers) {
                    const layer = vectorTile.layers[layerName];
                    const features = [];
                    for (let i = 0; i < layer.length; i++) {
                        const feature = layer.feature(i);
                        feature.properties.customProperty = `Custom Value for ID ${feature.properties.id}`;
                        features.push(feature.toGeoJSON(Number(x), Number(y), Number(z)));
                    }
                    layers[layerName] = {
                        type: "FeatureCollection",
                        features: features,
                    };
                }
                console.log(layers);
                // Encode the modified features back to MVT
                const modifiedTileData = vtpbf(layers);
                // Set the appropriate content type for MVT
                res.setHeader("Content-Type", "application/x-protobuf");
                res.send(Buffer.from(modifiedTileData));
            }
            catch (error) {
                console.error("Error processing tile request:", error);
                res.status(500).send("Internal Server Error");
            }
        }));
        const port = process.env.PORT || 8080;
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    }
    catch (error) {
        console.error("Initialization error:", error);
    }
});
init();
