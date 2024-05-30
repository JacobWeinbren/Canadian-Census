import csv
import json
from computed_values import (
    get_total_values,
)


def parse_characteristics(file_path, total_values):
    """
    Parse CSV to extract characteristics, organizing them into a structured list.
    - Indentation determines if a characteristic is a total variable.
    - Avoids duplicate IDs to ensure unique entries.
    - Associates sub-variables with their total variable to calculate proportions.
    - Updates total variable if in total_values set to retain calculated values.
    """
    characteristics = []
    current_total_variable = None
    added_ids = set()

    with open(file_path, mode="r", encoding="latin1") as file:
        reader = csv.DictReader(file)

        for row in reader:
            characteristic_name = row["CHARACTERISTIC_NAME"]
            characteristic_id = int(row["CHARACTERISTIC_ID"])
            indentation = len(characteristic_name) - len(characteristic_name.lstrip())

            # If the characteristic is not indented, it is a total variable
            if indentation == 0:
                current_total_variable = characteristic_id
            total_variable = current_total_variable

            # Skip if the ID has already been added to avoid duplicates
            if characteristic_id in added_ids:
                continue

            # Add the characteristic to the list
            characteristics.append(
                {
                    "characteristic_name": characteristic_name.strip(),
                    "indentation": indentation,
                    "total_variable": total_variable,
                    "characteristic_id": characteristic_id,
                }
            )
            added_ids.add(characteristic_id)

            # If the characteristic name is in the total_values set, update the total_variable
            if characteristic_name.strip() in total_values:
                characteristics[-1]["total_variable"] = characteristic_id

    return characteristics


file_path = "data/census/98-401-X2021006_English_CSV_data_Territories.csv"
output_file_path = "output/menu_list.json"

# Get the total values from the computed_values script
total_values = get_total_values(file_path)

# Parse the characteristics from the CSV file
characteristics_list = parse_characteristics(file_path, total_values)

# Save the list to a JSON file
with open(output_file_path, mode="w", encoding="utf-8") as json_file:
    json.dump(characteristics_list, json_file, ensure_ascii=False, indent=4)
