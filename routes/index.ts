// @ts-ignore
import { Router } from "express";
import signupRouter from "./auth/signup.js";
import verifyEmailRouter from "./auth/verify-email.js";
import logoutRouter from "./auth/logout.js";
import loginRouter from "./auth/login.js";
import resendCodeRouter from "./auth/resend-code.js";
import refreshRouter from "./auth/refresh.js";
import forgotPasswordRouter from "./auth/forgot-password.js";
import resetPasswordRouter from "./auth/reset-password.js";

const router = Router();

router.use("/auth/signup", signupRouter);
router.use("/auth/verify-email", verifyEmailRouter);
router.use("/auth/logout", logoutRouter);
router.use("/auth/login", loginRouter);
router.use("/auth/resend-code", resendCodeRouter);
router.use("/auth/refresh", refreshRouter);
router.use("/auth/forgot-password", forgotPasswordRouter);
router.use("/auth/reset-password", resetPasswordRouter);

export default router;
