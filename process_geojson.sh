#!/bin/sh

# Process the first input file
tippecanoe --output=output/canada-areas.pmtiles \
           --layer="maplayer" \
           --detect-shared-borders \
           --coalesce-fraction-as-needed \
           --coalesce-densest-as-needed \
           --coalesce-smallest-as-needed \
           --coalesce \
           --reorder \
           --minimum-zoom=0 \
           --maximum-zoom=17 \
           --force \
           -D11 \
           -y DGUID \
           data/areas.geojson

# Process the second input file
tippecanoe --output=output/canada-buildings.pmtiles \
           --layer="maplayer" \
           --detect-shared-borders \
           --coalesce-fraction-as-needed \
           --coalesce-densest-as-needed \
           --coalesce-smallest-as-needed \
           --coalesce \
           --reorder \
           --minimum-zoom=0 \
           --maximum-zoom=17 \
           --force \
           -D11 \
           -y DGUID \
           output/canada_buildings.geojson