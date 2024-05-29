import csv
import json


def parse_characteristics(file_path):
    characteristics = []
    current_total_variable = None
    added_ids = set()

    with open(file_path, mode="r", encoding="latin1") as file:
        reader = csv.DictReader(file)

        for row in reader:
            characteristic_name = row["CHARACTERISTIC_NAME"]
            characteristic_id = int(row["CHARACTERISTIC_ID"])
            indentation = len(characteristic_name) - len(characteristic_name.lstrip())

            if indentation == 0:
                current_total_variable = characteristic_id
            total_variable = current_total_variable

            # Skip if the characteristic is its own total or if the ID has already been added
            if characteristic_id == total_variable or characteristic_id in added_ids:
                continue

            characteristics.append(
                {
                    "characteristic_name": characteristic_name.strip(),
                    "indentation": indentation,
                    "total_variable": total_variable,
                    "characteristic_id": characteristic_id,
                }
            )
            added_ids.add(characteristic_id)

    return characteristics


file_path = "data/census/98-401-X2021006_English_CSV_data_Territories.csv"
output_file_path = "output/menu_list.json"

characteristics_list = parse_characteristics(file_path)

# Save the list to a JSON file
with open(output_file_path, mode="w", encoding="utf-8") as json_file:
    json.dump(characteristics_list, json_file, ensure_ascii=False, indent=4)

# Print the list to verify
for characteristic in characteristics_list:
    print(characteristic)
