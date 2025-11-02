import { redisQueuesConnection } from "../lib/redisClient.js";
import { Queue } from "bullmq";

export const emailQueue = new Queue("emailQueue", {
  connection: redisQueuesConnection,
});
