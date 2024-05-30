import csv


def get_computed_values(file_path):
    computed_values = set()
    current_header = None

    # Open the CSV file for reading
    with open(file_path, mode="r", newline="", encoding="latin1") as file:
        reader = csv.DictReader(file)

        for row in reader:
            # Check if the row is for the country level
            if row["GEO_LEVEL"] == "Country":
                characteristic_name = row["CHARACTERISTIC_NAME"]
                char_id = row["CHARACTERISTIC_ID"]

                # Check if the characteristic name is a header
                if (
                    "Average" in characteristic_name
                    or "Median" in characteristic_name
                    or " %" in characteristic_name
                    or "(%)" in characteristic_name
                    or "index" in characteristic_name
                    or " rate" in characteristic_name
                    or "($)" in characteristic_name
                ):
                    # Add the characteristic name to the set of computed values
                    computed_values.add(char_id)

                    # If the characteristic name is a header, set it as the current header
                    if not characteristic_name.startswith(" "):
                        current_header = characteristic_name

                # If the characteristic name is not a header and there is a current header
                elif characteristic_name.startswith(" ") and current_header:
                    computed_values.add(char_id)

                else:
                    current_header = None

    return computed_values
