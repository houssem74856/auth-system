//@ts-ignore
import { Router } from "express";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import db from "../../lib/db.js";
import { consumeTokenBucket } from "../../utils/rateLimit.js";

const logoutRouter = Router();

logoutRouter.post("/", async (req: any, res: any) => {
  const valid = await consumeTokenBucket(req);

  if (!valid) {
    return res.status(429).json({
      errorMessage: "Too many requests",
    });
  }

  const clientSideAccessToken = req.cookies?.clientSideAccessToken ?? null;

  if (clientSideAccessToken === null) {
    // expired
    // deleted manually by user
    // hitting this route before signing up
    return res.status(400).json({
      errorMessage: "no accessToken cookie, try hitting /auth/refresh route",
    });
  }

  const accessTokenId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideAccessToken))
  );

  const accessToken = await db.accessToken.findUnique({
    where: {
      id: accessTokenId,
    },
    include: {
      session: true,
    },
  });

  if (!accessToken) {
    // a new accessToken replaced and deleted the one i looked for in db
    // accessToken cookie manually forged
    return res.status(400).json({
      errorMessage: "no accessToken in db, try hitting /auth/refresh route",
    });
  }

  const currentSession = accessToken.session;

  await db.session.delete({
    where: {
      id: currentSession.id,
    },
  });

  res.clearCookie("clientSideAccessToken", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  res.status(200).json({
    message: "logged out successfully.",
  });
});

export default logoutRouter;
