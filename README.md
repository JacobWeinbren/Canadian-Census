# Canadian Census Data Processing

## Notes

-   Variables are worked out as a proportion of the total variable (i.e, their heading)
-   Calculated variables (e.g., median age) are retained
-   Total variables are retained

## Sources

-   [Boundaries](https://www150.statcan.gc.ca/n1/pub/92-160-g/92-160-g2021001-eng.htm)
-   [Census Data](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger.cfm?Lang=E)

## File Summaries

-   **scripts/menu_list.py**: Parses CSV to extract and structure characteristics.
-   **scripts/clean.py**: Filters menu items based on valid IDs from the CSV.
-   **scripts/computed_values.py**: Identifies and collects calculated variables from the CSV.
-   **scripts/intersect.py**: Generates map data by intersecting areas and buildings.
-   **data/census/**: Contains the raw census data in CSV format.
-   **src/database.ts**: Processes CSV files and updates Redis.
-   **src/server.ts**: Sets up an Express server to serve map tiles.
-   **src/statistics.ts**: Calculates percentiles for menu items.

## Build and Run

1. Install dependencies:

```bash
npm install
pip install -r requirements.txt
```

2. Build the TypeScript code:

```bash
npm run build
```

3. Generate menu items and statistics:

```bash
python scripts/menu_list.py
npm run statistics
python scripts/clean.py
```

4. Generate map data:

```bash
python scripts/intersect.py
```

5. Create the database:

```bash
npm run create
```

6. Start the server:

```bash
npm run start
```

## License

This project is licensed under the MIT License.
