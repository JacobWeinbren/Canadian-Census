import geopandas as gpd


def intersect_files(file1, file2, output_file):
    # Load the files
    print(f"Loading files: {file1} and {file2}")
    if file1.endswith(".gdb"):
        gdf1 = gpd.read_file(file1, driver="FileGDB")
    else:
        gdf1 = gpd.read_file(file1)
    gdf2 = gpd.read_file(file2)

    # Reproject gdf1 to match the CRS of gdf2
    gdf1 = gdf1.to_crs(gdf2.crs)

    # Perform the intersection
    print("Performing intersection...")
    intersection = gpd.overlay(gdf1, gdf2, how="intersection")

    # Save the result to a new file
    intersection.to_file(output_file, driver="GeoJSON", decimal=6)


if __name__ == "__main__":
    file1 = "data/areas.gdb"
    file2 = "data/canada_cleaned.geojson"
    output_file = "output/canada_buildings.geojson"

    intersect_files(file1, file2, output_file)
