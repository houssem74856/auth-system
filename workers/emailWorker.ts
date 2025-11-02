import "dotenv/config";
import { redisWorkersConnection } from "../lib/redisClient.js";
import { Worker } from "bullmq";
import transporter from "../lib/emailTransporter.js";

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

emailWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
