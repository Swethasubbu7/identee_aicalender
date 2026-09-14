import React from "react";
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Divider,
} from "@mui/material";
import logo from "../../assets/identeelogo.jpeg";

const LeftPanel = ({ filters, sizeOptions, onFilterChange }) => {
  const handleTypeChange = (e, newType) => {
    if (newType !== null) onFilterChange({ ...filters, type: newType });
  };

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        borderRight: "1px solid rgba(201,162,39,0.15)",
        background: "#161616",
        display: "flex",
        flexDirection: "column",
        p: 3,
        gap: 3,
        overflowY: "auto",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Box
          component="img"
          src={logo}
          alt="IDENTEE"
          sx={{ width: 120, borderRadius: 1 }}
        />
      </Box>

      <Divider sx={{ borderColor: "rgba(201,162,39,0.15)" }} />

      <Typography
        variant="overline"
        sx={{ color: "#E9C767", letterSpacing: 1 }}
      >
        Filters
      </Typography>

      <TextField
        label="Search layouts..."
        size="small"
        fullWidth
        value={filters.search}
        onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
      />

      <Box>
        <Typography
          variant="caption"
          sx={{ color: "#A9A296", mb: 1, display: "block" }}
        >
          Layout Type
        </Typography>
        <ToggleButtonGroup
          value={filters.type}
          exclusive
          onChange={handleTypeChange}
          orientation="vertical"
          fullWidth
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="normal">Normal</ToggleButton>
          <ToggleButton value="special-cut">Special Cut</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <FormControl size="small" fullWidth>
        <InputLabel id="size-filter-label">Size</InputLabel>
        <Select
          labelId="size-filter-label"
          label="Size"
          value={filters.size}
          onChange={(e) => onFilterChange({ ...filters, size: e.target.value })}
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

export default LeftPanel;
