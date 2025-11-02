//@ts-ignore
import { Router } from "express";
import {
  generateClientSideToken,
  generateRandomOTP,
} from "../../utils/auth.js";
import db from "../../lib/db.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { emailQueue } from "../../queues/emailQueue.js";
import { consumeTokenBucket } from "../../utils/rateLimit.js";

const resendCodeRouter = Router();

resendCodeRouter.post("/", async (req: any, res: any) => {
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

  const code = generateRandomOTP();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

  const clientSideEmailVerificationRequestId = generateClientSideToken();
  const emailVerificationRequestId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideEmailVerificationRequestId))
  );

  await db.emailVerificationRequest.upsert({
    where: { userId: currentUser.id },
    update: {
      id: emailVerificationRequestId,
      email: currentUser.email,
      code,
      expiresAt,
    },
    create: {
      id: emailVerificationRequestId,
      userId: currentUser.id,
      email: currentUser.email,
      code,
      expiresAt,
    },
  });

  res.cookie(
    "clientSideEmailVerificationRequestId",
    clientSideEmailVerificationRequestId,
    {
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
    }
  );

  await emailQueue.add(
    "sendEmail",
    {
      to: currentUser.email,
      subject: "Email Verification",
      text: `Hello! Your verification code is: ${code}`,
    },
    {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    }
  );

  res.status(200).json({
    message: "code resent queued successfully.",
  });
});

export default resendCodeRouter;
