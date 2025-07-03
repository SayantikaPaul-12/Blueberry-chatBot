import React from "react";
import { Container, Button, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Logo from "../Assets/logo.svg";

function AdminDashboard() {
  const navigate = useNavigate();

  return (
    <>
      {/* Logo at the top-left corner */}
      <Box sx={{ position: "absolute", top: "1rem", left: "2rem" }}>
        <img src={Logo} alt="Admin Logo" height={100} />
      </Box>

      <Container
        maxWidth="sm"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Typography variant="h4" sx={{ mb: 4, fontWeight: "bold" }}>
          Welcome!
        </Typography>

        <Button
          variant="contained"
          onClick={() => navigate("/admin-documents")} // Redirect
          sx={{
            backgroundColor: "#D63F09",
            color: "white",
            fontSize: "1.2rem",
            fontWeight: "bold",
            padding: "1rem 3rem",
            borderRadius: "10px",
            width:"500px",
            boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
            mb: 3,
            "&:hover": { backgroundColor: "#B53207" },
          }}
        >
          Manage Documents
        </Button>

        <Button
          variant="contained"
          onClick={() => navigate("/admin-analytics")} // Redirect
          sx={{
            backgroundColor: "#D63F09",
            color: "white",
            fontSize: "1.2rem",
            fontWeight: "bold",
            padding: "1rem 3rem",
            borderRadius: "10px",
            width:"500px",
            boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
            "&:hover": { backgroundColor: "#B53207" },
          }}
        >
          Analytics
        </Button>
      </Container>
    </>
  );
}

export default AdminDashboard;
