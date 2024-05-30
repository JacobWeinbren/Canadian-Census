import csv
import json
from collections import OrderedDict
from computed_values import get_computed_values


def extract_menu_items(file_path, computed_values):
    # Initialize an ordered dictionary to store menu items
    menu_items = OrderedDict()
    current_heading = "Aggregate"
    current_heading_id = None
    processed_ids = set()
    computed_keys = [int(key) for key in computed_values]

    # Open the CSV file for reading
    with open(file_path, mode="r", encoding="latin1") as file:
        reader = csv.DictReader(file)
        rows = list(reader)

    for i, row in enumerate(rows):
        name = row["CHARACTERISTIC_NAME"].strip()
        char_id = int(row["CHARACTERISTIC_ID"])
        indentation = len(row["CHARACTERISTIC_NAME"]) - len(name)

        # Skip already processed IDs to avoid duplicates
        if char_id in processed_ids:
            continue

        # Calculate next_indentation before performing the test
        next_indentation = 0
        if i + 1 < len(rows):
            next_row = rows[i + 1]
            next_name = next_row["CHARACTERISTIC_NAME"].strip()
            next_indentation = len(next_row["CHARACTERISTIC_NAME"]) - len(next_name)

        # If no indentation and no indented items below, add to "Aggregate"
        if indentation == 0 and next_indentation == 0:
            current_heading = "Aggregate"
            current_heading_id = None
            divisor = None

        # If no indentation but indented items below, set current heading to the name
        if indentation == 0 and next_indentation > 0:
            current_heading = name.replace("Total - ", "")
            current_heading_id = char_id
            continue

        # If the item is indented, determine if it is a computed value
        if indentation > 0:
            if char_id in computed_keys:
                divisor = None
            else:
                divisor = current_heading_id

        # Initialise the heading in the dictionary if not already present
        if current_heading not in menu_items:
            menu_items[current_heading] = []

        # Append the current item to the list under the current heading
        menu_items[current_heading].append(
            {"id": char_id, "name": name, "divisor": divisor}
        )

        # Mark the current ID as processed
        processed_ids.add(char_id)

    return menu_items


# File paths
file_path = "data/census/98-401-X2021006_English_CSV_data_Territories.csv"
output_file_path = "output/menu_list.json"

# Get computed values
computed_values = get_computed_values(file_path)

# Extract menu items from the CSV file
menu_items = extract_menu_items(file_path, computed_values)

# Write the menu items to a JSON file
with open(output_file_path, mode="w", encoding="utf-8") as json_file:
    json.dump(menu_items, json_file, ensure_ascii=False, indent=4)
