//@ts-ignore
import { Router } from "express";
import { emailDLQ } from "../../queues/emailDLQ.js";
import { emailQueue } from "../../queues/emailQueue.js";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import db from "../../lib/db.js";

const retryFailedEmailRouter = Router();

retryFailedEmailRouter.post("/:jobId", async (req: any, res: any) => {
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

  const job = await emailDLQ.getJob(req.params.jobId);

  if (!job)
    return res.status(400).json({
      errorMessage: "job not found",
    });

  await emailQueue.add("sendEmail", job.data.data);

  await job.remove();

  res.status(200).json({
    message: "retry queued successfully",
  });
});

export default retryFailedEmailRouter;
