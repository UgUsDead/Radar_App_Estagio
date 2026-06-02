import express from "express";
import { RadarRepository } from "../db/repository.js";
import { requireAdmin } from "../middleware/auth.js";

export interface TestingRouterDeps {
  repository: RadarRepository;
  pipeline: any;
}

export function createTestingRouter(deps: TestingRouterDeps): express.Router {
  const { repository, pipeline } = deps;
  const router = express.Router();

  router.post("/testing/clear-database", requireAdmin, async (_req, res) => {
    if (process.env.ALLOW_TESTING_ROUTES !== "true") {
      res.status(403).json({ error: "Testing routes disabled. Set ALLOW_TESTING_ROUTES=true to enable." });
      return;
    }
    
    await repository.clearDatabase();
    if (pipeline && typeof pipeline.reset === "function") {
      pipeline.reset();
    }
    res.json({ ok: true });
  });

  return router;
}
