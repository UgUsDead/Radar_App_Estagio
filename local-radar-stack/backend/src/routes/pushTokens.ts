import express from "express";
import { PushNotificationService } from "../services/pushNotificationService.js";
import { z } from "zod";

const registerTokenSchema = z.object({
  token: z.string().min(1),
  deviceId: z.string().optional(),
  label: z.string().optional(),
});

export interface PushTokenRouterDeps {
  pushNotificationService: PushNotificationService;
}

export function createPushTokenRouter(deps: PushTokenRouterDeps): express.Router {
  const { pushNotificationService } = deps;
  const router = express.Router();

  router.post("/push/register", async (req, res) => {
    const parsed = registerTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (!req.user?.id) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }

    try {
      await pushNotificationService.registerToken(
        parsed.data.token,
        req.user.id,
        parsed.data.deviceId,
        parsed.data.label
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to register push token" });
    }
  });

  router.delete("/push/register", async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!token) {
      res.status(400).json({ error: "Token required" });
      return;
    }

    if (!req.user?.id) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }

    try {
      await pushNotificationService.removeToken(token, req.user.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to remove push token" });
    }
  });

  return router;
}
