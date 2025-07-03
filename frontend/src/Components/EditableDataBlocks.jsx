import React, { useState } from "react";
import { Box, Grid, Typography, TextField, Card } from "@mui/material";

function EditableDataBlocks() {
  const [dataBlocks, setDataBlocks] = useState(
    Array.from({ length: 10 }, (_, index) => ({
      text: `Placeholder ${index + 1}`,
      count: Math.floor(Math.random() * 100) + 1
    }))
  );

  // Handle Input Changes
  const handleInputChange = (index, field, value) => {
    const updatedBlocks = [...dataBlocks];
    updatedBlocks[index][field] = value;
    setDataBlocks(updatedBlocks);
  };

  return (
    <Grid container spacing={2}>
      {dataBlocks.map((block, index) => (
        <Grid item xs={6} key={index}>
          <Card sx={{ display: "flex", alignItems: "center", padding: "0.5rem" }}>
            
            {/* Editable Grey Box Text */}
            <Box sx={{ width: "60%", height: "50px", backgroundColor: "#D3D3D3", padding: "0.5rem" }}>
              <TextField
                value={block.text}
                onChange={(e) => handleInputChange(index, "text", e.target.value)}
                variant="outlined"
                fullWidth
                sx={{
                  backgroundColor: "#fff", 
                  "& .MuiInputBase-input": { textAlign: "center" }
                }}
              />
            </Box>

            {/* Editable Number Field */}
            <Box sx={{ paddingLeft: "1rem", flex: 1 }}>
              <Typography variant="caption">Questions Asked</Typography>
              <TextField
                type="number"
                value={block.count}
                onChange={(e) => handleInputChange(index, "count", Number(e.target.value))}
                variant="outlined"
                fullWidth
                sx={{
                  marginTop: "0.5rem",
                  "& .MuiInputBase-input": { textAlign: "center", fontSize: "1.5rem" }
                }}
              />
            </Box>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export default EditableDataBlocks;
