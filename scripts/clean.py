import ujson
import sqlite3


def load_and_filter_data(json_file_path, db_file_path):
    print("Connecting to database at:", db_file_path)
    # Connect to SQLite database
    conn = sqlite3.connect(db_file_path)
    cursor = conn.cursor()

    print("Loading JSON data from:", json_file_path)
    # Load JSON data
    with open(json_file_path, "r", encoding="utf-8") as file:
        json_data = ujson.load(file)

    print("Executing database query to filter valid IDs.")
    # Query to aggregate counts from the database
    cursor.execute(
        """
        SELECT CHARACTERISTIC_ID, SUM(C1_COUNT_TOTAL)
        FROM census_data
        GROUP BY CHARACTERISTIC_ID
        HAVING SUM(C1_COUNT_TOTAL) > 0
        """
    )
    valid_ids = {row[0] for row in cursor.fetchall()}
    print("Valid IDs fetched:", valid_ids)

    # Track removed IDs
    removed_ids = set()

    # Filter JSON data
    new_json_data = {}
    for heading, items in json_data.items():
        filtered_items = [item for item in items if item["id"] in valid_ids]
        if filtered_items:
            new_json_data[heading] = filtered_items
            removed_ids.update(
                {item["id"] for item in items if item["id"] not in valid_ids}
            )
        else:
            removed_ids.update({item["id"] for item in items})

    print("Filtered JSON data. Removed IDs:", removed_ids)

    # Close database connection
    conn.close()
    print("Database connection closed.")

    return new_json_data


def save_json_data(data, file_path):
    print("Saving filtered data to:", file_path)
    with open(file_path, "w", encoding="utf-8") as file:
        ujson.dump(data, file, ensure_ascii=False, indent=4)
    print("Data saved successfully.")


# Paths
json_file_path = "output/menu_list.json"
db_file_path = "database/database.db"

# Process
print("Starting data filtering process.")
filtered_menu_json_data = load_and_filter_data(json_file_path, db_file_path)
save_json_data(filtered_menu_json_data, json_file_path)
print("Data processing completed.")
