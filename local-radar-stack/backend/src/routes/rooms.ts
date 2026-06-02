import express from "express";
import type { Pool } from "pg";
import { RadarRepository } from "../db/repository.js";
import { roomSchema } from "../schemas/index.js";
import { asRecord } from "../helpers/index.js";
import { logger } from "../logger.js";
import { requireFeature } from "../middleware/auth.js";

export interface RoomRouterDeps {
  repository: RadarRepository;
  pool: Pool;
}

export function createRoomRouter(deps: RoomRouterDeps): express.Router {
  const { repository, pool } = deps;
  const router = express.Router();

  const resolveOwnerId = (req: express.Request) => {
    if (req.user?.role === "admin") return undefined;
    return req.user?.id;
  };

  router.get("/rooms", async (_req, res) => {
    res.json(await repository.getRooms(resolveOwnerId(_req)));
  });

  router.post("/rooms", requireFeature("radar_management"), async (req, res) => {
    const parsed = roomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const created = await repository.createRoom(
      parsed.data.name,
      parsed.data.floor,
      parsed.data.notes ?? null,
      parsed.data.metadata,
      resolveOwnerId(req)
    );
    res.status(201).json(created);
  });

  router.patch("/rooms/:id/metadata", requireFeature("radar_management"), async (req, res) => {
    const roomId = Number(req.params.id);
    const updates = req.body;
    const ownerId = resolveOwnerId(req);
  
    try {
      const values: unknown[] = [roomId];
      let ownerClause = "";
      if (Number.isInteger(ownerId)) {
        values.push(ownerId);
        ownerClause = ` AND owner_id = $${values.length}`;
      }
      const { rows } = await pool.query(`SELECT metadata FROM rooms WHERE id = $1${ownerClause}`, values);
      if (rows.length === 0) return res.status(404).json({ error: "Room not found" });
  
      const currentMetadata = asRecord(rows[0].metadata);
      const updatedMetadata = { ...currentMetadata, ...updates };
  
      const updateValues: unknown[] = [JSON.stringify(updatedMetadata), roomId];
      let updateOwnerClause = "";
      if (Number.isInteger(ownerId)) {
        updateValues.push(ownerId);
        updateOwnerClause = ` AND owner_id = $${updateValues.length}`;
      }
      await pool.query(
        `UPDATE rooms SET metadata = $1, updated_at = NOW() WHERE id = $2${updateOwnerClause}`,
        updateValues
      );
  
      res.json({ ok: true, metadata: updatedMetadata });
    } catch (err) {
      logger.error({ err }, "Failed to update room metadata");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.put("/rooms/:id", requireFeature("radar_management"), async (req, res) => {
    const parsed = roomSchema.safeParse(req.body);
    const id = Number(req.params.id);
    if (!parsed.success || !Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid room payload" });
      return;
    }
    await repository.updateRoom(
      id,
      parsed.data.name,
      parsed.data.floor,
      parsed.data.notes ?? null,
      parsed.data.metadata,
      resolveOwnerId(req)
    );
    res.json({ ok: true });
  });

  router.delete("/rooms/:id", requireFeature("radar_management"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid room id" });
      return;
    }
    await repository.deleteRoom(id, resolveOwnerId(req));
    res.json({ ok: true });
  });

  return router;
}
