import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Grid,
  Paper,
  InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import logo from "../assets/identeelogo.jpeg";

const Dashboard = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #FFFFFF 0%, #FAF6EC 60%)",
      }}
    >
      <Container maxWidth="lg" sx={{ py: 5 }}>
        {/* Top bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 5,
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box
            component="img"
            src={logo}
            alt="IDENTEE"
            sx={{ width: 110, borderRadius: 1 }}
          />

          <TextField
            placeholder="Search your projects..."
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flexGrow: 1, maxWidth: 420 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "#7A7266" }} />
                </InputAdornment>
              ),
            }}
          />

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate("/layouts")}
          >
            New Project
          </Button>
        </Box>

        {/* Drafts */}
        <Box sx={{ mb: 5 }}>
          <Typography variant="h6" sx={{ color: "#2A2620", mb: 2 }}>
            Drafts
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 4,
              textAlign: "center",
              background: "#FFFFFF",
              borderColor: "rgba(176,141,53,0.2)",
            }}
          >
            <Typography variant="body2" sx={{ color: "#7A7266" }}>
              No drafts yet. Your in-progress calendars will show up here.
            </Typography>
          </Paper>
        </Box>

        {/* Projects */}
        <Box>
          <Typography variant="h6" sx={{ color: "#2A2620", mb: 2 }}>
            Projects
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={4}>
              <Paper
                variant="outlined"
                onClick={() => navigate("/layouts")}
                sx={{
                  p: 4,
                  textAlign: "center",
                  cursor: "pointer",
                  background: "#FFFFFF",
                  border: "1px dashed rgba(176,141,53,0.4)",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    borderColor: "#B08D35",
                    background: "rgba(176,141,53,0.05)",
                  },
                }}
              >
                <AddIcon sx={{ color: "#B08D35", fontSize: 32, mb: 1 }} />
                <Typography variant="body2" sx={{ color: "#8a6d1f" }}>
                  Create New Project
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default Dashboard;
