//@ts-ignore
import { Router } from "express";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import db from "../../lib/db.js";
import {
  generateClientSideToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
} from "../../utils/auth.js";
import { consumeTokenBucket } from "../../utils/rateLimit.js";

const refreshRouter = Router();

refreshRouter.post("/", async (req: any, res: any) => {
  const valid = await consumeTokenBucket(req);

  if (!valid) {
    return res.status(429).json({
      errorMessage: "Too many requests",
    });
  }

  const clientSideRefreshToken = req.cookies?.clientSideRefreshToken ?? null;

  if (!clientSideRefreshToken) {
    return res
      .status(400)
      .json({ errorMessage: "no refreshToken cookie, you need to login" });
  }

  const refreshTokenId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideRefreshToken))
  );

  const refreshToken = await db.refreshToken.findUnique({
    where: {
      id: refreshTokenId,
    },
    include: {
      session: {
        include: {
          accessToken: true,
        },
      },
    },
  });

  if (refreshToken === null) {
    // user forged his own refreshToken cookie
    // used logged out, and he keeps an old deleted refreshToken
    return res.status(400).json({
      errorMessage: "no refreshToken in db",
    });
  }

  if (
    Date.now() >= refreshToken.session.expiresAt.getTime() ||
    !refreshToken.isValid
  ) {
    await db.session.delete({ where: { id: refreshToken.sessionId } });
    res.clearCookie("clientSideRefreshToken", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });
    res.clearCookie("clientSideAccessToken", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return res.status(400).json({
      errorMessage: "you need to login with your credentials",
    });
  }

  await db.refreshToken.update({
    where: {
      id: refreshTokenId,
    },
    data: {
      isValid: false,
      usedAt: new Date(),
    },
  });

  if (refreshToken.session.accessToken) {
    await db.accessToken.delete({
      where: { id: refreshToken.session.accessToken.id },
    });
  }

  const newClientSideRefreshToken = generateClientSideToken();
  const newClientSideAccessToken = generateClientSideToken();

  const newRefreshTokenId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(newClientSideRefreshToken))
  );
  const newAccessTokenId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(newClientSideAccessToken))
  );

  await db.refreshToken.create({
    data: {
      id: newRefreshTokenId,
      sessionId: refreshToken.sessionId,
    },
  });

  const newAccessTokenExpiry = new Date(Date.now() + 1000 * 60 * 15);

  await db.accessToken.create({
    data: {
      id: newAccessTokenId,
      sessionId: refreshToken.sessionId,
      expiresAt: newAccessTokenExpiry,
    },
  });

  setRefreshTokenCookie(
    res,
    newClientSideRefreshToken,
    refreshToken.session.expiresAt
  );
  setAccessTokenCookie(res, newClientSideAccessToken, newAccessTokenExpiry);

  res.status(200).json({
    message: "new access token created successfully and ready for use.",
  });
});

export default refreshRouter;
