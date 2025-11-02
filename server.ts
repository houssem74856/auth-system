// @ts-ignore
import express from "express";
// @ts-ignore
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";

const server = express();

server.set("trust proxy", true);

server.use(express.json());
server.use(cookieParser());
server.use("/api", routes);

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
