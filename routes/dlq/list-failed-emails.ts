//@ts-ignore
import { Router } from "express";
import { emailDLQ } from "../../queues/emailDLQ.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import db from "../../lib/db.js";

const listFailedEmailsRouter = Router();

listFailedEmailsRouter.get("/", async (req: any, res: any) => {
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

  if (!currentUser.emailVerified || currentUser.role !== "ADMIN") {
    return res.status(400).json({
      errorMessage: "not authorized",
    });
  }

  const jobs = await emailDLQ.getJobs(["waiting"]);

  res.setHeader("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify(
      {
        data: jobs.map((j) => ({
          id: j.id,
          failedAt: new Date(j.data.failedAt).toISOString(),
          error: j.data.error,
          emailPayload: j.data.data,
        })),
      },
      null,
      2
    )
  );
});

export default listFailedEmailsRouter;
