import { redisQueuesConnection } from "../lib/redisClient.js";
import { Queue } from "bullmq";

const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
};

export const emailQueue = new Queue("emailQueue", {
  connection: redisQueuesConnection,
  defaultJobOptions,
});
