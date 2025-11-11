//@ts-ignore
import { Router } from "express";
import db from "../../lib/db.js";
import {
  generateClientSideToken,
  generateRandomOTP,
} from "../../utils/auth.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { emailQueue } from "../../queues/emailQueue.js";
import { consumeTokenBucket } from "../../utils/rateLimit.js";

const forgotPasswordRouter = Router();

forgotPasswordRouter.post("/", async (req: any, res: any) => {
  const valid = await consumeTokenBucket(req);

  if (!valid) {
    return res.status(429).json({
      errorMessage: "Too many requests",
    });
  }

  let { email } = req.body;
  email = email.toLowerCase();

  const user = await db.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    // not letting the client know if the email is valid
    return res.status(200).json({
      message:
        "If an account with this email exists, a password reset code has been sent.",
    });
  }

  const code = generateRandomOTP();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

  const clientSidePasswordResetSessionId = generateClientSideToken();
  const passwordResetSessionId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSidePasswordResetSessionId))
  );

  await db.passwordResetSession.upsert({
    where: {
      userId: user.id,
    },
    update: {
      id: passwordResetSessionId,
      code,
      email: user.email,
      expiresAt,
    },
    create: {
      id: passwordResetSessionId,
      code,
      email: user.email,
      expiresAt,
      userId: user.id,
    },
  });

  res.cookie(
    "clientSidePasswordResetSessionId",
    clientSidePasswordResetSessionId,
    {
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
    }
  );

  await emailQueue.add("sendEmail", {
    to: user.email,
    subject: "Password Reset Verification",
    text: `Hello! You requested to reset your password. Your verification code is: ${code}. If you did not request a password reset, please ignore this email.`,
  });

  res.status(200).json({
    message:
      "If an account with this email exists, a password reset code has been queued.",
  });
});

export default forgotPasswordRouter;
