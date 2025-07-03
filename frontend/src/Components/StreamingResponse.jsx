import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography } from "@mui/material";
import BotAvatar from "../Assets/BotAvatar.svg";
import BlueberryGif from "../Assets/blueberry.gif"; // Loading state avatar
import { WEBSOCKET_API, ALLOW_MARKDOWN_BOT } from "../utilities/constants";
import ReactMarkdown from "react-markdown";

const StreamingMessage = ({ initialMessage, setProcessing }) => {
  const [response, setResponse] = useState(""); // Store full response as a single string
  const [waitingForResponse, setWaitingForResponse] = useState(true);
  const ws = useRef(null);
  const messageBuffer = useRef("");

  useEffect(() => {
    ws.current = new WebSocket(WEBSOCKET_API);

    ws.current.onopen = () => {
      console.log("WebSocket Connected");
      ws.current.send(JSON.stringify({ action: "sendMessage", prompt: initialMessage }));
    };

    ws.current.onmessage = (event) => {
      try {
        messageBuffer.current += event.data;
        const parsedData = JSON.parse(messageBuffer.current);

        if (parsedData.type === "end") {
          setProcessing(false);
          setWaitingForResponse(false);
          console.log("End of conversation");
        }

        if (parsedData.type === "delta") {
          setResponse((prev) => prev + parsedData.text); // Append text instead of using an array
        }

        messageBuffer.current = ""; // Clear buffer on successful parse
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.log("Received incomplete JSON, waiting for more data...");
        } else {
          console.error("Error processing message: ", e);
          messageBuffer.current = "";
        }
      }
    };

    ws.current.onerror = (error) => console.log("WebSocket Error: ", error);
    ws.current.onclose = (event) => {
      if (event.wasClean) {
        console.log(`WebSocket closed cleanly, code=${event.code}, reason=${event.reason}`);
      } else {
        console.log("WebSocket Disconnected unexpectedly");
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [initialMessage, setProcessing]);

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-end">
      <Grid item>
        <Avatar alt="Bot Avatar" src={waitingForResponse ? BlueberryGif : BotAvatar} />
      </Grid>
      {ALLOW_MARKDOWN_BOT ? (
        <Grid item className="botMessage" sx={{ backgroundColor: (theme) => theme.palette.background.botMessage }}>
          <ReactMarkdown>{response}</ReactMarkdown> {/* Using single string response */}
        </Grid>
      ) : (
        <Grid item className="botMessage" sx={{ backgroundColor: (theme) => theme.palette.background.botMessage }}>
          <Typography variant="body2">{response}</Typography>
        </Grid>
      )}
    </Grid>
  );
};

export default StreamingMessage;
