import React, { useState, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import updatedMenuList from "../updated_menu_list.json";

const options = Object.keys(updatedMenuList).flatMap((header) => [
	{ value: header, label: header, isHeader: true },
	...updatedMenuList[header].map((item) => ({
		value: item.id,
		label: item.name,
	})),
]);

const filterOption = (option, inputValue) => {
	const searchValue = inputValue.toLowerCase();
	return option.isHeader
		? updatedMenuList[option.label].some((item) =>
				item.name.toLowerCase().includes(searchValue)
		  )
		: option.label.toLowerCase().includes(searchValue);
};

const ListPicker = () => {
	const [searchTerm, setSearchTerm] = useState("");
	const [isVisible, setIsVisible] = useState(false);
	const parentRef = useRef(null);
	const searchInputRef = useRef(null);
	const filteredOptions = options.filter((option) =>
		filterOption(option, searchTerm)
	);

	const rowVirtualizer = useVirtualizer({
		count: filteredOptions.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 35,
		overscan: 5,
	});

	const handleClickOutside = (event) => {
		if (
			parentRef.current &&
			!parentRef.current.contains(event.target) &&
			!searchInputRef.current.contains(event.target)
		) {
			setIsVisible(false);
		}
	};

	useEffect(() => {
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const handleOptionClick = (option) => {
		setIsVisible(false);

		const heading = option.isHeader
			? option.label
			: Object.keys(updatedMenuList).find((header) =>
					updatedMenuList[header].some(
						(item) => item.id === option.value
					)
			  );

		const event = new CustomEvent("optionSelected", {
			detail: {
				value: option.value,
				name: option.label,
				heading: heading,
			},
		});
		window.dispatchEvent(event);
	};

	return (
		<div className="list-picker relative bg-white shadow-lg rounded-lg">
			<input
				type="text"
				placeholder="Search"
				value={searchTerm}
				ref={searchInputRef}
				onFocus={() => setIsVisible(true)}
				onChange={(e) => setSearchTerm(e.target.value)}
				className="search-input p-2 w-full border-b"
			/>
			{isVisible && (
				<div
					ref={parentRef}
					className="List"
					style={{ height: "400px", width: "100%", overflow: "auto" }}
				>
					<div
						style={{
							height: `${rowVirtualizer.getTotalSize()}px`,
							width: "100%",
							position: "relative",
						}}
					>
						{rowVirtualizer.getVirtualItems().map((virtualRow) => {
							const option = filteredOptions[virtualRow.index];
							return (
								<div
									key={virtualRow.key}
									ref={rowVirtualizer.measureElement}
									data-index={virtualRow.index}
									className={`p-2 leading-5 ${
										option.isHeader
											? "font-bold bg-gray-200"
											: "bg-white hover:bg-gray-100 cursor-pointer"
									}`}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										transform: `translateY(${virtualRow.start}px)`,
									}}
									onClick={() => handleOptionClick(option)}
								>
									{option.label}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
};

export default ListPicker;
