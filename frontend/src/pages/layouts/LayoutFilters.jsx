import React from "react";
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";

const LayoutFilters = ({ filters, sizeOptions, onFilterChange }) => {
  const handleTypeChange = (event, newType) => {
    // ToggleButtonGroup fires null when the same button is clicked again
    if (newType !== null) {
      onFilterChange({ ...filters, type: newType });
    }
  };

  const handleSizeChange = (event) => {
    onFilterChange({ ...filters, size: event.target.value });
  };

  const handleSearchChange = (event) => {
    onFilterChange({ ...filters, search: event.target.value });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        alignItems: "center",
        mb: 3,
      }}
    >
      <TextField
        label="Search layouts..."
        size="small"
        value={filters.search}
        onChange={handleSearchChange}
        sx={{ minWidth: 220 }}
      />

      <ToggleButtonGroup
        value={filters.type}
        exclusive
        onChange={handleTypeChange}
        size="small"
      >
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="normal">Normal</ToggleButton>
        <ToggleButton value="special-cut">Special Cut</ToggleButton>
      </ToggleButtonGroup>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="size-filter-label">Size</InputLabel>
        <Select
          labelId="size-filter-label"
          label="Size"
          value={filters.size}
          onChange={handleSizeChange}
        >
          <MenuItem value="all">All Sizes</MenuItem>
          {sizeOptions.map((size) => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default LayoutFilters;
