import {
  encodeBase32LowerCaseNoPadding,
  encodeBase32UpperCaseNoPadding,
  encodeHexLowerCase,
} from "@oslojs/encoding";
import db from "../lib/db.js";
import { sha256 } from "@oslojs/crypto/sha2";
// @ts-ignore
import bcrypt from "bcrypt";

export async function checkEmailAvailability(email: any) {
  const row = await db.user.count({
    where: {
      email,
    },
  });

  if (row === null) {
    throw new Error("something went wrong checking email availability");
  }

  return row === 0;
}

export async function hashPassword(password: any) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

export function generateRandomOTP(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const code = encodeBase32UpperCaseNoPadding(bytes);
  return code.slice(0, 6);
}

export function generateClientSideToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const token = encodeBase32LowerCaseNoPadding(bytes);
  return token;
}

export async function createSession(
  clientSideRefreshToken: string,
  clientSideAccessToken: string,
  userId: string
) {
  const refreshTokenId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideRefreshToken))
  );
  const accessTokenId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(clientSideAccessToken))
  );
  const session = await db.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  const refreshToken = await db.refreshToken.create({
    data: {
      id: refreshTokenId,
      sessionId: session.id,
    },
  });
  const accessToken = await db.accessToken.create({
    data: {
      id: accessTokenId,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 15),
    },
  });

  return { refreshToken, accessToken, session };
}

export function setRefreshTokenCookie(
  res: any,
  clientSideRefreshToken: string,
  expiresAt: Date
): void {
  res.cookie("clientSideRefreshToken", clientSideRefreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/api/auth/refresh",
  });
}

export function setAccessTokenCookie(
  res: any,
  clientSideAccessToken: string,
  expiresAt: Date
): void {
  res.cookie("clientSideAccessToken", clientSideAccessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function verifyPasswordHash(
  hash: string,
  password: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function normalizeIP(ip: string) {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}
