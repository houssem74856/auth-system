//@ts-ignore
import { Router } from "express";
import {
  checkEmailAvailability,
  createSession,
  generateClientSideToken,
  generateRandomOTP,
  hashPassword,
  setAccessTokenCookie,
  setRefreshTokenCookie,
} from "../../utils/auth.js";
import db from "../../lib/db.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { emailQueue } from "../../queues/emailQueue.js";
import { consumeTokenBucket } from "../../utils/rateLimit.js";
import { cacheClient } from "../../lib/redisClient.js";

const signupRouter = Router();

signupRouter.post("/", async (req: any, res: any) => {
  const valid = await consumeTokenBucket(req);

  if (!valid) {
    return res.status(429).json({
      errorMessage: "Too many requests",
    });
  }

  let { username, email, password } = req.body;

  email = email.toLowerCase();
  const emailAvailable = await checkEmailAvailability(email);

  if (!emailAvailable) {
    return res.status(400).send({ errorMessage: "Email is already used" });
  }

  const hashedPassword = await hashPassword(password);

  const newUser = await db.user.create({
    data: {
      username,
      email,
      hashedPassword,
      emailVerified: false,
    },
  });

  const code = generateRandomOTP();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

  const clientSideRefreshToken = generateClientSideToken();
  const clientSideAccessToken = generateClientSideToken();
  const data = await createSession(
    clientSideRefreshToken,
    clientSideAccessToken,
    newUser.id
  );
  setRefreshTokenCookie(res, clientSideRefreshToken, data.session.expiresAt);
  setAccessTokenCookie(res, clientSideAccessToken, data.accessToken.expiresAt);

  const clientSideEmailVerificationRequestId = generateClientSideToken();
  const emailVerificationRequestId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideEmailVerificationRequestId))
  );

  const verificationRequest = {
    id: emailVerificationRequestId,
    userId: newUser.id,
    email: newUser.email,
    code,
    expiresAt,
  };

  await db.emailVerificationRequest.create({
    data: verificationRequest,
  });

  await cacheClient.set(
    `cache:emailVerificationRequest:user:${newUser.id}`,
    JSON.stringify(verificationRequest),
    "EX",
    60 * 15
  );

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

  await emailQueue.add("sendEmail", {
    to: newUser.email,
    subject: "Email Verification",
    text: `Hello! Your verification code is: ${code}`,
  });

  res.status(200).json({
    message: "User created, verification email queued.",
  });
});

export default signupRouter;
