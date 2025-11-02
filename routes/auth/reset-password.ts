//@ts-ignore
import { Router } from "express";
import db from "../../lib/db.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { hashPassword } from "../../utils/auth.js";
import { consumeTokenBucket } from "../../utils/rateLimit.js";

const resetPasswordRouter = Router();

resetPasswordRouter.post("/", async (req: any, res: any) => {
  const valid = await consumeTokenBucket(req);

  if (!valid) {
    return res.status(429).json({
      errorMessage: "Too many requests",
    });
  }

  const { code, newPassword } = req.body;

  const clientSidePasswordResetSessionId =
    req.cookies?.clientSidePasswordResetSessionId ?? null;

  if (clientSidePasswordResetSessionId === null) {
    // expired
    // deleted manually by user
    // hitting this route before hitting forget-password route
    return res.status(400).json({
      errorMessage:
        "no passwordResetSession cookie, try hitting /auth/forgot-password route",
    });
  }

  const passwordResetSessionId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSidePasswordResetSessionId))
  );

  const passwordResetSession = await db.passwordResetSession.findUnique({
    where: {
      id: passwordResetSessionId,
    },
  });

  if (!passwordResetSession) {
    // a new passwordResetSession replaced and deleted the one i looked for in db
    // passwordResetSession cookie manually forged
    return res.status(400).json({
      errorMessage:
        "no passwordResetSession in db, try hitting /auth/forgot-password route",
    });
  }

  if (Date.now() > passwordResetSession.expiresAt.getTime()) {
    return res.status(400).send({
      errorMessage:
        "password reset session expired, try hitting /auth/forgot-password route.",
    });
  }

  if (passwordResetSession.code !== code) {
    return res.status(400).send({ errorMessage: "Incorrect code." });
  }

  const newHahsedPassword = await hashPassword(newPassword);

  await db.user.update({
    where: {
      id: passwordResetSession.userId,
    },
    data: {
      hashedPassword: newHahsedPassword,
    },
  });

  await db.passwordResetSession.delete({
    where: {
      id: passwordResetSession.id,
    },
  });

  res.clearCookie("clientSidePasswordResetSessionId", {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({
    message: "password reset successfully.",
  });
});

export default resetPasswordRouter;
