# Canadian Census Data Processing

## Notes

-   Variables are worked out as a proportion of the total variable (i.e, their heading)
-   Calculated variables (e.g., median age) are retained
-   Total variables are retained

## File Summaries

-   **scripts/menu_list.py**: Parses CSV to extract and structure characteristics.
-   **scripts/computed_values.py**: Identifies and collects calculated variables from the CSV.
-   **data/census/**: Contains the raw census data in CSV format.
-   **src/database.ts**: Initializes SQLite database and inserts census data.
-   **src/server.ts**: Sets up an Express server to serve map tiles.

## License

This project is licensed under the MIT License
