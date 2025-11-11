import { redisQueuesConnection } from "../lib/redisClient.js";
import { Queue } from "bullmq";

export const emailDLQ = new Queue("emailDLQ", {
  connection: redisQueuesConnection,
});
