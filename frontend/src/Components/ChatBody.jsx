import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography, Box } from "@mui/material";
import { v4 as uuidv4 } from "uuid";
import UserAvatar from "../Assets/UserAvatar.svg";

import ChatInput from "./ChatInput";
import StreamingResponse from "./StreamingResponse";           
import BotFileCheckReply from "./BotFileCheckReply";             
import createMessageBlock from "../utilities/createMessageBlock";
import { ALLOW_FILE_UPLOAD, WEBSOCKET_API } from "../utilities/constants";

function ChatBody() {
  /* ───────────────────────────────── state ───────────────────────────── */
  const sessionId = useRef(uuidv4()).current;                     // stable per component mount

  const [messages, setMessages] = useState([
    createMessageBlock(
      "Welcome user! In order to provide the most accurate responses, can you please tell me where you are growing blueberries in the format state, country?",
      "BOT",
      "TEXT",
      "RECEIVED"
    ),
  ]);
  const [processing, setProcessing] = useState(false);
  const [location, setLocation] = useState("");
  const [inputValue, setInputValue] = useState("");

  const scrollRef = useRef(null);

  /* ────────────────────────────── auto-scroll ────────────────────────── */
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ─────────────────────────── helpers / UI ──────────────────────────── */
  const addMsg = (block) => setMessages((prev) => [...prev, block]);

  const replaceProcessing = (text) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.state === "PROCESSING"
          ? createMessageBlock(text, "BOT", "TEXT", "RECEIVED")
          : m
      )
    );

  const handleSend = (msgText) => {
    if (!msgText.trim()) return;

    /* 1) first message sets location */
    if (!location) {
      setLocation(msgText.trim());
      addMsg(createMessageBlock(msgText, "USER", "TEXT", "SENT"));
      addMsg(
        createMessageBlock(
          "Thank you for sharing that information! How can I help you today?",
          "BOT",
          "TEXT",
          "RECEIVED"
        )
      );
      return;
    }

    /* 2) normal question -> WebSocket */
    setProcessing(true);
    addMsg(createMessageBlock(msgText, "USER", "TEXT", "SENT"));
    addMsg(createMessageBlock("", "BOT", "TEXT", "PROCESSING"));
    askBot(msgText.trim());
  };

  /* ──────────────────────────── WebSocket call ───────────────────────── */
  const askBot = (question) => {
    const authToken = localStorage.getItem("authToken") || "";
    const socket = new WebSocket(`${WEBSOCKET_API}?token=${authToken}`);

    socket.onopen = () => {
      const payload = {
        action:     "sendMessage",
        querytext:  question,
        session_id: sessionId,
        location,
      };
      console.log("🔵 Sent:", payload);
      socket.send(JSON.stringify(payload));
    };

    socket.onmessage = (event) => {
      /* Ignore empty ping / heartbeat frames */
      if (!event.data || event.data.trim() === "") {
        console.log("📨 (ignored empty frame)");
        return;
      }

      try {
        console.log("📨 Raw:", event.data);
        const { responsetext } = JSON.parse(event.data);
        replaceProcessing(responsetext);
      } catch (err) {
        console.error("❌ JSON parse error:", err);
        replaceProcessing("Error parsing response. Please try again.");
      } finally {
        setProcessing(false);
        socket.close();
      }
    };

    socket.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      replaceProcessing("WebSocket error. Please try again.");
      setProcessing(false);
    };

    socket.onclose = (e) => {
      console.log(`🟠 Socket closed (${e.code})`);
    };
  };

  /* ─────────────────────────── render helpers ────────────────────────── */
  const UserBubble = ({ text }) => (
    <Grid container justifyContent="flex-end" alignItems="flex-end">
      <Grid
        item
        sx={{
          backgroundColor: (theme) => theme.palette.background.userMessage,
          px: 1.5,
          py: 1,
          borderRadius: 2,
          maxWidth: "75%",
          wordBreak: "break-word",
        }}
      >
        <Typography variant="body2">{text}</Typography>
      </Grid>
      <Grid item>
        <Avatar src={UserAvatar} sx={{ ml: 1 }} />
      </Grid>
    </Grid>
  );

  /* ───────────────────────────────── render ──────────────────────────── */
  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="space-between"
      height="100%"
      width="100%"
    >
      {/* chat history */}
      <Box flex={1} overflow="auto" px={2} py={1}>
        {messages.map((msg, idx) => (
          <Box key={idx} mb={2}>
            {msg.sentBy === "USER" ? (
              <UserBubble text={msg.message} />
            ) : msg.state === "PROCESSING" ? (
              <StreamingResponse
                initialMessage={msg.message}
                setProcessing={setProcessing}
                setMessageList={setMessages}
              />
            ) : (
              <BotFileCheckReply
                message={msg.message}
                fileName={msg.fileName}
                fileStatus={msg.fileStatus}
                messageType={msg.sentBy === "USER" ? "user_doc_upload" : "bot_response"}
              />
            )}
          </Box>
        ))}
        <div ref={scrollRef} />
      </Box>

      {/* input row */}
      <Box
        display="flex"
        alignItems="flex-end"
        p={1.5}
        sx={{ borderTop: (t) => `1px solid ${t.palette.divider}` }}
      >
        {/* optional file upload slot */}
        <Box sx={{ display: ALLOW_FILE_UPLOAD ? "flex" : "none" }}>
          {/*  <Attachment onFileUploadComplete={…} /> */}
        </Box>

        <Box flex={1} ml={ALLOW_FILE_UPLOAD ? 2 : 0}>
          <ChatInput
            onSendMessage={handleSend}
            processing={processing}
            message={inputValue}
            setMessage={setInputValue}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default ChatBody;
