import "dotenv/config";
import { redisWorkersConnection } from "../lib/redisClient.js";
import { Worker } from "bullmq";
import transporter from "../lib/emailTransporter.js";
import { emailDLQ } from "../queues/emailDLQ.js";

const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    const { to, subject, text } = job.data;
    await transporter.sendMail({
      from: "mitichehoussem@gmail.com",
      to,
      subject,
      text,
    });
    console.log(`Email sent to ${to}`);
  },
  { connection: redisWorkersConnection }
);

emailWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on("failed", async (job, err) => {
  if (job?.attemptsMade === job?.opts.attempts) {
    await emailDLQ.add("failedEmail", {
      originalJobId: job?.id,
      data: job?.data,
      failedAt: Date.now(),
      error: err.message,
    });

    console.error(`Job ${job?.id} failed for the final time:`, err.message);
  } else {
    console.error(`Job ${job?.id} failed:`, err.message);
  }
});
