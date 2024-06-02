import ujson as json

# Load the JSON files
with open("output/menu_list.json", "r") as f:
    menu_list = json.load(f)

with open("output/ranges.json", "r") as f:
    ranges = json.load(f)

# Filter the menu list and ranges based on the max value
updated_menu_list = {}
updated_ranges = {}
for category, items in menu_list.items():
    updated_menu_list[category] = []
    for item in items:
        item_id = str(item["id"])
        max_value = ranges.get(item_id, {}).get("max")
        if max_value:
            updated_menu_list[category].append(item)
            updated_ranges[item_id] = ranges[item_id]

# Write the updated menu list and ranges to new JSON files
with open("output/updated_menu_list.json", "w") as f:
    json.dump(updated_menu_list, f, indent=4)

with open("output/updated_ranges.json", "w") as f:
    json.dump(updated_ranges, f, indent=4)

print("Updated menu list and updated ranges have been created.")
