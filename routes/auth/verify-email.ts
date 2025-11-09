//@ts-ignore
import { Router } from "express";
import db from "../../lib/db.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { consumeTokenBucket } from "../../utils/rateLimit.js";
import { cacheClient } from "../../lib/redisClient.js";

const verifyEmailRouter = Router();

verifyEmailRouter.post("/", async (req: any, res: any) => {
  const valid = await consumeTokenBucket(req);

  if (!valid) {
    return res.status(429).json({
      errorMessage: "Too many requests",
    });
  }

  const { code } = req.body;

  const clientSideAccessToken = req.cookies?.clientSideAccessToken ?? null;
  const clientSideEmailVerificationRequestId =
    req.cookies?.clientSideEmailVerificationRequestId ?? null;

  if (clientSideAccessToken === null) {
    // expired
    // deleted manually by user
    // hitting this route before signing up
    return res.status(400).json({
      errorMessage: "no accessToken cookie, try hitting /auth/refresh route",
    });
  }

  if (clientSideEmailVerificationRequestId === null) {
    // expired
    // deleted manually by user
    // hitting this route before signing up
    return res.status(400).send({
      errorMessage:
        "no emailVerificationId cookie, try hitting /auth/resend-code route",
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
      session: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!accessToken) {
    // a new accessToken replaced and deleted the one i looked for in db
    // accessToken cookie manually forged
    return res.status(400).json({
      errorMessage: "no accessToken in db, try hitting /auth/refresh route",
    });
  }

  const currentUser = accessToken.session.user;

  if (currentUser.emailVerified) {
    return res.status(400).json({
      errorMessage: "your account is verified, get out of here.",
    });
  }

  const emailVerificationRequestId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideEmailVerificationRequestId))
  );

  let verificationRequest = await cacheClient.get(
    `cache:emailVerificationRequest:user:${currentUser.id}`
  );
  verificationRequest = verificationRequest
    ? (() => {
        const v = JSON.parse(verificationRequest);
        if (v.id !== emailVerificationRequestId) return null;
        return { ...v, expiresAt: new Date(v.expiresAt) };
      })()
    : null;

  if (verificationRequest === null) {
    verificationRequest = await db.emailVerificationRequest.findUnique({
      where: {
        id: emailVerificationRequestId,
      },
    });
  }

  if (verificationRequest === null) {
    // emailVerificationId cookie manually forged
    return res.status(400).send({
      errorMessage: "no verificationRequest in db",
    });
  }

  if (currentUser.id !== verificationRequest.userId) {
    return res.status(400).send({
      errorMessage:
        "verificationRequest and accessToken are not from the same user.",
    });
  }

  if (Date.now() > verificationRequest.expiresAt.getTime()) {
    return res.status(400).send({
      errorMessage:
        "verification code expired, try hitting /auth/resend-code route.",
    });
  }

  if (verificationRequest.code !== code) {
    return res.status(400).send({ errorMessage: "Incorrect code." });
  }

  await db.user.update({
    where: {
      id: currentUser.id,
    },
    data: {
      emailVerified: true,
    },
  });

  await db.emailVerificationRequest.delete({
    where: {
      id: emailVerificationRequestId,
    },
  });

  await cacheClient.del(
    `cache:emailVerificationRequest:user:${currentUser.id}`
  );

  res.clearCookie("clientSideEmailVerificationRequestId", {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({
    message: "email verified successfully.",
  });
});

export default verifyEmailRouter;
