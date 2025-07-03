import React, { useState, useEffect } from "react";
import {
  Container,
  TextField,
  Typography,
  Box,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Checkbox,
  Modal,
  Paper,
  Button,
  CircularProgress,
} from "@mui/material";
import RefreshIcon   from "@mui/icons-material/Refresh";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import CloseIcon     from "@mui/icons-material/Close";
import FolderIcon    from "@mui/icons-material/Folder";
import { styled }    from "@mui/system";
import AdminAppHeader from "./AdminAppHeader";
import { DOCUMENTS_API } from "../utilities/constants";
import { getIdToken } from "../utilities/auth";

const FolderIconContainer = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
});
const FolderBackground = styled(Box)({
  width: "32px",
  height: "32px",
  backgroundColor: "#D63F09",
  borderRadius: "5px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const modalStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 400,
  backgroundColor: "white",
  boxShadow: 24,
  p: 3,
  borderRadius: "10px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const formatSize = (bytes) => {
  if (bytes == null) return "--";
  const mb = bytes / (1024 * 1024);
  return mb < 1
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${mb.toFixed(1)} MB`;
};

const formatDate = (isoString) => {
  if (!isoString) return "--";
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    year:  "numeric",
    month: "short",
    day:   "numeric",
  });
};

export default function ManageDocuments() {
  const [documents, setDocuments]       = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [searchTerm, setSearchTerm]     = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  // 1) List
  const fetchDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`${DOCUMENTS_API}/files`, {
        method: "GET",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error(`List failed: ${res.status}`);
      const data = await res.json();
      // data.files is an array of filenames
      const parsed = (data.files || []).map((doc) => ({
        name: doc.key,
        type: doc.key.split(".").pop().toUpperCase(),
        size: formatSize(doc.size),
        lastModified: formatDate(doc.last_modified),
        url:            `${DOCUMENTS_API}files/${encodeURIComponent(doc.key)}`,
        deleteEndpoint: `${DOCUMENTS_API}files/${encodeURIComponent(doc.key)}`,
      }));

      setDocuments(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2) Delete
  const handleDeleteFiles = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      for (const doc of documents.filter(d => selectedFiles.includes(d.name))) {
        await fetch(doc.deleteEndpoint, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      // refresh
      await fetchDocuments();
      setSelectedFiles([]);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  // 3) Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getIdToken();
        const base64 = reader.result.split(",")[1];
        await fetch(`${DOCUMENTS_API}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:   `Bearer ${token}`,
          },
          body: JSON.stringify({
            filename:     file.name,
            content_type: file.type,
            content:      base64,
          }),
        });
        setUploadModalOpen(false);
        await fetchDocuments();
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 4) Download
  const handleDownloadFile = async (url, fileName) => {
    setError("");
    try {
      const token  = await getIdToken();
      const res    = await fetch(url, {
        method:  "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
  
      if (!res.ok) throw new Error("Download failed");
  
      // The Lambda returns a plain text body that is BASE-64 of the bytes
      const b64Data = await res.text();
  
      // Convert base64 → Uint8Array → Blob
      const byteString = atob(b64Data.trim());
      const byteArray  = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      // Use the Content-Type the Lambda sent back (falls back to octet-stream)
      const contentType = res.headers.get("Content-Type") || "application/octet-stream";
      const blob = new Blob([byteArray], { type: contentType });
  
      // Create a blob URL and download
      const blobUrl = URL.createObjectURL(blob);
      const link    = document.createElement("a");
      link.href     = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Checkbox toggle
  const handleCheckboxChange = (name) =>
    setSelectedFiles((prev) =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );

  return (
    <>
      <Box sx={{ position: "fixed", width: "100%", zIndex: 1200 }}>
        <AdminAppHeader showSwitch={false} />
      </Box>

      <Container maxWidth="md" sx={{ pt: 10, display: "flex", gap: 1 }}>
        <TextField
          placeholder="Search…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          sx={{ flex: 1 }}
        />
        <IconButton onClick={fetchDocuments} disabled={loading}>
          <RefreshIcon />
        </IconButton>
        <IconButton onClick={() => setUploadModalOpen(true)}>
          <FileUploadIcon />
        </IconButton>
        <IconButton
          onClick={handleDeleteFiles}
          disabled={!selectedFiles.length || loading}
        >
          <CloseIcon />
        </IconButton>
      </Container>

      <Container maxWidth="md" sx={{ mt: 4, height: "70vh", overflow: "auto" }}>
        {error && (
          <Typography color="error" mb={2}>
            {error}
          </Typography>
        )}
        {loading && !documents.length ? (
          <Box textAlign="center" mt={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Last Modified</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents
                .filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((doc) => (
                  <TableRow key={doc.name}>
                    <TableCell>
                      <Checkbox
                        checked={selectedFiles.includes(doc.name)}
                        onChange={() => handleCheckboxChange(doc.name)}
                      />
                      <FolderIconContainer>
                        <FolderBackground>
                          <FolderIcon sx={{ color: "white" }} />
                        </FolderBackground>
                        {doc.name}
                      </FolderIconContainer>
                    </TableCell>
                    <TableCell>{doc.type}</TableCell>
                    <TableCell>{doc.lastModified}</TableCell>
                    <TableCell>{doc.size}</TableCell>
                    <TableCell>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleDownloadFile(doc.url, doc.name)}
                      >
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Container>

      {/* Upload Modal */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
      >
        <Paper sx={modalStyle}>
          <Typography variant="h6" mb={2}>
            Upload File
          </Typography>
          <Button
            variant="contained"
            component="label"
            sx={{ backgroundColor: "#D63F09", "&:hover": { backgroundColor: "#B53207" } }}
          >
            Select File
            <input type="file" hidden onChange={handleFileUpload} />
          </Button>
        </Paper>
      </Modal>
    </>
  );
}
