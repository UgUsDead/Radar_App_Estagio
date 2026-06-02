import express from "express";
import { RadarRepository } from "../db/repository.js";
import { ZoneCacheService } from "../services/zoneCacheService.js";
import { assignRadarSchema, zoneConfigArraySchema, zoneRoomModelSchema } from "../schemas/index.js";
import { requireFeature } from "../middleware/auth.js";

export interface RadarRouterDeps {
  repository: RadarRepository;
  zoneCacheService: ZoneCacheService;
}

export function createRadarRouter(deps: RadarRouterDeps): express.Router {
  const { repository, zoneCacheService } = deps;
  const router = express.Router();

  const resolveOwnerId = (req: express.Request) => {
    if (req.user?.role === "admin") return undefined;
    return req.user?.id;
  };

  router.get("/radars", async (req, res) => {
    const unassigned = req.query.unassigned === "true";
    const radars = await repository.getRadars({ 
      onlyUnassigned: unassigned, 
      ownerId: resolveOwnerId(req) 
    });
    res.json(radars);
  });

  // Mobile-friendly aliases
  router.get("/radars/unassigned", async (_req, res) => {
    const radars = await repository.getRadars({ onlyUnassigned: true, ownerId: resolveOwnerId(_req) });
    res.json(radars);
  });

  router.get("/radars/:id/zones", async (req, res) => {
    const radarId = req.params.id;
    const ownerId = resolveOwnerId(req);
    if (Number.isInteger(ownerId)) {
      const { rowCount } = await repository.pool.query(
        "SELECT 1 FROM radar_devices WHERE id = $1 AND owner_id = $2",
        [radarId, ownerId]
      );
      if (!rowCount) {
        res.status(404).json({ error: "Radar not found" });
        return;
      }
    }
    const { zones, roomModel } = await zoneCacheService.loadRadarZoneConfig(radarId);
    res.json({ radarId, zones, roomModel });
  });

  router.put("/radars/:id/zones", requireFeature("geo_fencing"), async (req, res) => {
    const radarId = req.params.id;
    const ownerId = resolveOwnerId(req);
    if (Number.isInteger(ownerId)) {
      const { rowCount } = await repository.pool.query(
        "SELECT 1 FROM radar_devices WHERE id = $1 AND owner_id = $2",
        [radarId, ownerId]
      );
      if (!rowCount) {
        res.status(404).json({ error: "Radar not found" });
        return;
      }
    }
    const parsedZones = zoneConfigArraySchema.safeParse(req.body?.zones ?? req.body);
    if (!parsedZones.success) {
      res.status(400).json({ error: parsedZones.error.flatten() });
      return;
    }

    const parsedRoomModel = zoneRoomModelSchema.safeParse(
      req.body?.roomModel ?? req.body?.room_model ?? undefined
    );
    if (!parsedRoomModel.success && (req.body?.roomModel !== undefined || req.body?.room_model !== undefined)) {
      res.status(400).json({ error: parsedRoomModel.error.flatten() });
      return;
    }

    const ok = await zoneCacheService.upsertRadarZones(radarId, parsedZones.data, parsedRoomModel.success ? parsedRoomModel.data : undefined);
    if (!ok) {
      res.status(404).json({ error: "Radar not found" });
      return;
    }

    res.json({
      ok: true,
      radarId,
      zones: parsedZones.data,
      roomModel: parsedRoomModel.success ? parsedRoomModel.data : undefined,
    });
  });

  router.post("/radars/claim", requireFeature("radar_management"), async (req, res) => {
    const radarId = String(req.body?.radarId ?? "").trim();
    if (!radarId) {
      res.status(400).json({ error: "Invalid radar id" });
      return;
    }

    let targetOwnerId: number | null | undefined = resolveOwnerId(req);
    // If admin, they can specify a target ownerId (including null to unclaim)
    if (req.user?.role === "admin" && Object.prototype.hasOwnProperty.call(req.body, "ownerId")) {
      targetOwnerId = req.body.ownerId === null || req.body.ownerId === undefined ? null : Number(req.body.ownerId);
    }

    if (targetOwnerId !== null && !Number.isInteger(targetOwnerId)) {
      res.status(403).json({ error: "Tenant context required or invalid target owner" });
      return;
    }

    const { rows } = await repository.pool.query(
      "SELECT owner_id FROM radar_devices WHERE id = $1",
      [radarId]
    );

    if (rows.length > 0) {
      const currentOwner = rows[0].owner_id as number | null;
      // Admins can always overwrite/transfer. Regular users can only claim unowned.
      if (req.user?.role !== "admin" && currentOwner && currentOwner !== targetOwnerId) {
        res.status(409).json({ error: "Radar already claimed" });
        return;
      }
      await repository.pool.query(
        "UPDATE radar_devices SET owner_id = $2, updated_at = NOW() WHERE id = $1",
        [radarId, targetOwnerId]
      );
      res.json({ ok: true, radarId, owner_id: targetOwnerId });
      return;
    }

    await repository.pool.query(
      `INSERT INTO radar_devices (id, owner_id, status, last_seen)
       VALUES ($1, $2, 'offline', NOW())
       ON CONFLICT (id)
       DO UPDATE SET owner_id = COALESCE(radar_devices.owner_id, EXCLUDED.owner_id), updated_at = NOW()`,
      [radarId, targetOwnerId]
    );
    res.json({ ok: true, radarId, owner_id: targetOwnerId });
  });

  router.post("/radars/assign", requireFeature("radar_management"), async (req, res) => {
    const parsed = assignRadarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const ok = await repository.assignRadarToRoom(parsed.data.radarId, parsed.data.roomId, resolveOwnerId(req));
    if (!ok) {
      res.status(404).json({ error: "Radar not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/radars/:id/unassign", requireFeature("radar_management"), async (req, res) => {
    const radarId = String(req.params.id ?? "").trim();
    if (!radarId) {
      res.status(400).json({ error: "Invalid radar id" });
      return;
    }

    const ok = await repository.assignRadarToRoom(radarId, null, resolveOwnerId(req));
    if (!ok) {
      res.status(404).json({ error: "Radar not found" });
      return;
    }

    res.json({ ok: true });
  });

  router.delete("/radars/:id", requireFeature("radar_management"), async (req, res) => {
    const radarId = String(req.params.id ?? "").trim();
    if (!radarId) {
      res.status(400).json({ error: "Invalid radar id" });
      return;
    }

    const deleted = await repository.deleteRadar(radarId, resolveOwnerId(req));
    if (!deleted) {
      res.status(404).json({ error: "Radar not found" });
      return;
    }

    zoneCacheService.invalidate(radarId);
    res.json({ ok: true });
  });

  return router;
}
