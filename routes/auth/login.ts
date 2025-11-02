//@ts-ignore
import { Router } from "express";
import {
  createSession,
  generateClientSideToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  verifyPasswordHash,
} from "../../utils/auth.js";
import db from "../../lib/db.js";
import {
  consumeRetryBackoff,
  resetRetryBackoff,
} from "../../utils/rateLimit.js";

const loginRouter = Router();

loginRouter.post("/", async (req: any, res: any) => {
  let { email, password } = req.body;
  email = email.toLowerCase();
  const user = await db.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    return res.status(400).json({ errorMessage: "Invalid credentials" });
  }

  const { valid, secondsLeft } = await consumeRetryBackoff(user.id);

  if (!valid) {
    return res.status(429).json({
      errorMessage: `Too many requests, try again after ${secondsLeft} seconds`,
    });
  }

  const hashedPassword = user.hashedPassword;

  const validPassword = await verifyPasswordHash(hashedPassword, password);
  if (!validPassword) {
    return res.status(400).json({ errorMessage: "Invalid credentials" });
  }

  await resetRetryBackoff(user.id);

  const clientSideRefreshToken = generateClientSideToken();
  const clientSideAccessToken = generateClientSideToken();
  const data = await createSession(
    clientSideRefreshToken,
    clientSideAccessToken,
    user.id
  );
  setRefreshTokenCookie(res, clientSideRefreshToken, data.session.expiresAt);
  setAccessTokenCookie(res, clientSideAccessToken, data.accessToken.expiresAt);

  if (!user.emailVerified) {
    return res.status(200).json({
      message: "email not verified yet, try hitting /auth/verify-email",
    });
  }

  res.status(200).json({
    message: "successfully logged in",
  });
});

export default loginRouter;
