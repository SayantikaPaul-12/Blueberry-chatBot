// AdminAnalytics.jsx

import React, { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Typography,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Card,
} from "@mui/material";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import axios from "axios";

import AdminAppHeader from "./AdminAppHeader";
import { DOCUMENTS_API } from "../utilities/constants";
import { getIdToken } from "../utilities/auth";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const ANALYTICS_API = `${DOCUMENTS_API}session-logs`;

const defaultCategories = [
  "Chemical Registrations and MRL's",
  "Disease",
  "Economics",
  "Field Establishment",
  "Harvest",
  "Insects",
  "Irrigation",
  "Nutrition",
  "Pest Management Guide",
  "Pollination",
  "Post Harvest Handling, Cold Chain",
  "Production",
  "Pruning",
  "Sanitation",
  "Varietal Information",
  "Weeds",
  "Unknown",
];

const redPin = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -41],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function AdminAnalytics() {
  const [timeframe, setTimeframe] = useState("today");
  const [categoryCounts, setCounts] = useState({});
  const [locations, setLocations] = useState([]);         // unique location strings
  const [locationCounts, setLocationCounts] = useState({}); // { "Texas, US": 12, … }
  const [coordsMap, setCoordsMap] = useState({});        // { "Texas, US": [lat, lng], … }
  const [userCount, setUserCount] = useState(0);

  // 1) fetch analytics and build counts per-location
  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const token = await getIdToken();
        const { data } = await axios.get(ANALYTICS_API, {
          params: { timeframe },
          headers: { Authorization: `Bearer ${token}` },
        });

        // normalize categories
        const counts = {};
        defaultCategories.forEach((c) => {
          counts[c] = data.categories?.[c] || 0;
        });
        setCounts(counts);

        // aggregate raw locations
        const raw = data.locations || [];
        const locCounts = {};
        raw.forEach((loc) => {
          locCounts[loc] = (locCounts[loc] || 0) + 1;
        });
        setLocationCounts(locCounts);
        setLocations(Object.keys(locCounts));

        setUserCount(data.user_count || 0);
      } catch (err) {
        console.error("Analytics fetch failed:", err);
      }
    }
    fetchAnalytics();
  }, [timeframe]);

  // 2) geocode each unique location if needed
  useEffect(() => {
    locations.forEach((loc) => {
      if (coordsMap[loc]) return;

      const cached = localStorage.getItem(`coords:${loc}`);
      if (cached) {
        setCoordsMap((m) => ({ ...m, [loc]: JSON.parse(cached) }));
        return;
      }

      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          loc
        )}`
      )
        .then((r) => r.json())
        .then((results) => {
          if (results && results.length) {
            const { lat, lon } = results[0];
            const pair = [parseFloat(lat), parseFloat(lon)];
            setCoordsMap((m) => ({ ...m, [loc]: pair }));
            localStorage.setItem(`coords:${loc}`, JSON.stringify(pair));
          }
        })
        .catch((e) => console.error("Geocode error for", loc, e));
    });
  }, [locations, coordsMap]);

  return (
    <Box sx={{ minHeight: "100vh" }}>
      {/* fixed header */}
      <Box sx={{ position: "fixed", width: "100%", zIndex: 1200 }}>
        <AdminAppHeader showSwitch={false} />
      </Box>

      <Grid container sx={{ flex: 1, pt: "6rem", px: "2rem" }}>
        {/* ─── Left column: categories ─── */}
        <Grid item xs={6} sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Choose Timeframe:
          </Typography>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel />
            <Select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              <MenuItem value="today">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>
          <Grid container spacing={2}>
            {defaultCategories.map((text) => (
              <Grid item xs={6} key={text}>
                <Card
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    p: 1,
                    backgroundColor: "#D3D3D3",
                    boxShadow: "none",
                  }}
                >
                  <Box
                    sx={{
                      width: "60%",
                      height: "50px",
                      backgroundColor: "#FFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography variant="body2" align="center">
                      {text}
                    </Typography>
                  </Box>
                  <Box sx={{ pl: 2 }}>
                    <Typography variant="caption">Questions Asked</Typography>
                    <Typography variant="h5">
                      {categoryCounts[text] ?? 0}
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Divider */}
        <Divider
          orientation="vertical"
          flexItem
          sx={{ borderColor: "#D3D3D3", mx: 5 }}
        />

        {/* ─── Right column: map & user count ─── */}
        <Grid item xs={5} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Grower Location:
          </Typography>
          <MapContainer
            center={[39.8283, -98.5795]}
            zoom={4}
            style={{ height: "600px", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            />
            {locations.map((loc) => {
              const pos = coordsMap[loc];
              return (
                pos && (
                  <Marker position={pos} icon={redPin} key={loc}>
                    <Popup>
                      <div>{loc}</div>
                      <div>
                        {locationCounts[loc]}{" "}
                        {locationCounts[loc] === 1 ? "grower" : "growers"}
                      </div>
                    </Popup>
                  </Marker>
                )
              );
            })}
          </MapContainer>
          <Box sx={{ textAlign: "center", mt: 3 }}>
            <Typography variant="h6">User Count</Typography>
            <Typography variant="h4">{userCount}</Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
