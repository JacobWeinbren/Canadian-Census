import csv


def get_total_values(file_path):
    """
    Identify and collect total variables from the CSV file.
    - Uses a threshold (10,000) to identify calculated variables.
    - Tracks current total variable to group related sub-variables.
    - Ensures calculated variables are retained as proportions of themselves.
    """
    total_values = set()
    current_total = None

    with open(file_path, mode="r", newline="", encoding="latin1") as file:
        reader = csv.DictReader(file)

        for row in reader:
            # Check if the row is for the country level and has a total count less than 10,000
            if (
                row["GEO_LEVEL"] == "Country"
                and row["C1_COUNT_TOTAL"]
                and float(row["C1_COUNT_TOTAL"]) < 10000
            ):
                characteristic_name = row["CHARACTERISTIC_NAME"]

                # If the characteristic name is not indented, it is a total variable
                if not characteristic_name.startswith(" "):
                    current_total = characteristic_name

                # Add the current total variable to the set
                if current_total not in total_values:
                    total_values.add(current_total)

                    print(current_total)

    return total_values
