// src/Components/AdminLogin.js
import React, { useState } from "react";
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Alert
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import Logo from "../Assets/logo.svg";
import {
  CognitoUser,
  AuthenticationDetails
} from "amazon-cognito-identity-js";
import UserPool from "../utilities/cognitoConfig";

function AdminLogin() {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    setLoginError("");
    const user = new CognitoUser({
      Username: fullName,
      Pool: UserPool,
    });
    const authDetails = new AuthenticationDetails({
      Username: fullName,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        // Successful login with permanent password
        const accessToken = session.getAccessToken().getJwtToken();
        const idToken     = session.getIdToken().getJwtToken();
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("idToken",     idToken);
        navigate("/admin-dashboard", { replace: true });
      },

      onFailure: (err) => {
        setLoginError(err.message || "Authentication failed");
      },

      newPasswordRequired: (userAttributes, requiredAttributes) => {
        // 1) Prompt for the new password
        const newPass = window.prompt(
          "Your password must be reset. Please enter a new password:"
        );
        if (!newPass) {
          setLoginError("A new password is required to continue.");
          return;
        }

        // 2) Prompt for *all* other required attributes
        const updatedAttrs = {};
        requiredAttributes.forEach((attrName) => {
          const cleanName = attrName.replace(/^custom:/, "");
          const val = window.prompt(
            `Please enter ${cleanName.replace(/_/g, " ")}:`
          );
          if (val) {
            updatedAttrs[attrName] = val;
          } else {
            setLoginError(`You must supply ${cleanName} to continue.`);
          }
        });

        // 3) Remove immutable attributes
        delete userAttributes.email_verified;

        // 4) Complete the challenge
        user.completeNewPasswordChallenge(
          newPass,
          updatedAttrs,
          {
            onSuccess: (session) => {
              // Now permanent password is set
              const accessToken = session.getAccessToken().getJwtToken();
              const idToken     = session.getIdToken().getJwtToken();
              localStorage.setItem("accessToken", accessToken);
              localStorage.setItem("idToken",     idToken);
              navigate("/admin-dashboard", { replace: true });
            },
            onFailure: (err) => {
              setLoginError(err.message || "Failed to set new password");
            },
          }
        );
      },
    });
  };

  return (
    <>
      <Box sx={{ position: "absolute", top: "1rem", left: "2rem" }}>
        <img src={Logo} alt="Admin Logo" height={80} />
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
        <Typography variant="h4" sx={{ mb: 3, fontWeight: "bold" }}>
          Admin Login
        </Typography>

        {loginError && (
          <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
            {loginError}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Email"
          variant="outlined"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          type="password"
          label="Password"
          variant="outlined"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 3 }}
        />

        <Button
          variant="contained"
          onClick={handleLogin}
          sx={{
            backgroundColor: "#D63F09",
            "&:hover": { backgroundColor: "#B53207" },
            color: "white",
            fontWeight: "bold",
            padding: "0.75rem 2rem",
            fontSize: "1rem",
            borderRadius: "8px",
            boxShadow: "0px 4px 10px rgba(0,0,0,0.2)",
          }}
        >
          Login
        </Button>
      </Container>
    </>
  );
}

export default AdminLogin;
