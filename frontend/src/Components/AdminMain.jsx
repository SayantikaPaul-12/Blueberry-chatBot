import React, { useState } from "react";
import Grid from "@mui/material/Grid";
import AppHeader from "./AppHeader";
import LeftNav from "./LeftNav";
import ChatHeader from "./ChatHeader";
import ChatBody from "./ChatBody";

function AdminApp() {
  const [showLeftNav, setLeftNav] = useState(true);

  return (
    <Grid container direction="column" justifyContent="center" alignItems="stretch" className="appHeight100 appHideScroll">
      <Grid item>
        <AppHeader showSwitch={false} />
      </Grid>
      <Grid item container direction="row" justifyContent="flex-start" alignItems="stretch" className="appFixedHeight100">
        <Grid item xs={showLeftNav ? 3 : 0.5} sx={{ backgroundColor: (theme) => theme.palette.background.chatLeftPanel }}>
          <LeftNav showLeftNav={showLeftNav} setLeftNav={setLeftNav} />
        </Grid>
        <Grid
          container
          item
          xs={showLeftNav ? 9 : 11.5}
          direction="column"
          justifyContent="flex-start"
          alignItems="stretch"
          className="appHeight100"
          sx={{
            padding: { xs: "1.5rem", md: "1.5rem 5%", lg: "1.5rem 10%", xl: "1.5rem 10%" },
            backgroundColor: (theme) => theme.palette.background.chatBody,
          }}
        >
          <Grid item>
            <ChatHeader />
          </Grid>
          <Grid
            container
            item
            direction="row"
            justifyContent={"center"}
            alignItems="flex-end"
            sx={{
              height: { xs: "calc(100% - 2.625rem)", md: "calc(100% - 2.625rem)", lg: "calc(100% - 2.625rem)", xl: "calc(100% - 2.625rem)" },
            }}
          >
            <ChatBody />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}


export default AdminApp;
