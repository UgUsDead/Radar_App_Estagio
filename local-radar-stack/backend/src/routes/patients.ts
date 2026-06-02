import express from "express";
import type { Pool } from "pg";
import { RadarRepository } from "../db/repository.js";
import { patientSchema, updatePatientSchema, assignPatientSchema } from "../schemas/index.js";
import { riskProfileService } from "../services/riskProfileService.js";
import { asRecord } from "../helpers/index.js";
import { logger } from "../logger.js";
import { requireFeature } from "../middleware/auth.js";

export interface PatientRouterDeps {
  repository: RadarRepository;
  pool: Pool;
}

export function createPatientRouter(deps: PatientRouterDeps): express.Router {
  const { repository, pool } = deps;
  const router = express.Router();

  const resolveOwnerId = (req: express.Request) => {
    if (req.user?.role === "admin") return undefined;
    return req.user?.id;
  };

  router.get("/patients", async (_req, res) => {
    res.json(await repository.getPatients(resolveOwnerId(_req)));
  });

  router.post("/patients", requireFeature("patient_detail"), async (req, res) => {
    const parsed = patientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const created = await repository.createPatient(
      parsed.data.name,
      parsed.data.roomId,
      parsed.data.metadata,
      resolveOwnerId(req)
    );
    res.status(201).json(created);
  });

  router.put("/patients/:id", requireFeature("patient_detail"), async (req, res) => {
    const id = Number(req.params.id);
    const parsed = updatePatientSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid patient payload" });
      return;
    }
    await repository.updatePatient(id, parsed.data, resolveOwnerId(req));
    res.json({ ok: true });
  });

  router.delete("/patients/:id", requireFeature("patient_detail"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid patient id" });
      return;
    }

    const deleted = await repository.deletePatient(id, resolveOwnerId(req));
    if (!deleted) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    res.json({ ok: true });
  });

  router.put("/patients/:id/room", requireFeature("patient_detail"), async (req, res) => {
    const patientId = Number(req.params.id);
    const parsed = assignPatientSchema.safeParse({ patientId, roomId: req.body.roomId });
    if (!parsed.success || !Number.isInteger(patientId)) {
      res.status(400).json({ error: "Invalid payload or ID" });
      return;
    }
    await repository.assignPatientRoom(patientId, parsed.data.roomId, resolveOwnerId(req));
    res.json({ ok: true });
  });

  // Patient Risk Profile Management
  router.get("/patients/:id/risk-profile", async (req, res) => {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId)) {
      res.status(400).json({ error: "Invalid patient id" });
      return;
    }
    
    const patients = await repository.getPatients(resolveOwnerId(req));
    const patient = patients.find((p: any) => p.id === patientId);
    
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }
    
    const profile = riskProfileService.getRiskProfile((patient as any).metadata);
    res.json(profile);
  });

  router.put("/patients/:id/risk-profile", requireFeature("patient_detail"), async (req, res) => {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId)) {
      res.status(400).json({ error: "Invalid patient id" });
      return;
    }
    
    try {
      const payload =
        req.body && typeof req.body === "object" && !Array.isArray(req.body) && "riskProfile" in req.body
          ? (req.body as Record<string, unknown>).riskProfile
          : req.body;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        res.status(400).json({ error: "Invalid risk profile payload" });
        return;
      }

      const patients = await repository.getPatients(resolveOwnerId(req));
      const patient = patients.find((p: any) => p.id === patientId);
      
      if (!patient) {
        res.status(404).json({ error: "Patient not found" });
        return;
      }
      
      const updatedMetadata = riskProfileService.updateRiskProfile((patient as any).metadata, payload as Record<string, unknown>);
      await repository.updatePatient(patientId, { metadata: updatedMetadata }, resolveOwnerId(req));
      
      const newProfile = riskProfileService.getRiskProfile(updatedMetadata);
      res.json(newProfile);
    } catch (error: any) {
      logger.error({ error, patientId }, "Failed to update risk profile");
      res.status(500).json({ error: "Failed to update risk profile" });
    }
  });

  // Patient Communications
  router.get("/patients/:id/communications", async (req, res) => {
    try {
      const ownerId = resolveOwnerId(req);
      const values: unknown[] = [req.params.id];
      let ownerClause = "";
      if (Number.isInteger(ownerId)) {
        values.push(ownerId);
        ownerClause = ` AND owner_id = $${values.length}`;
      }
      const { rows } = await pool.query(`SELECT metadata FROM patients WHERE id = $1${ownerClause}`, values);
      if (!rows.length) return res.status(404).json({ error: "Patient not found" });
      const contacts = rows[0].metadata?.family_contacts || []; 
      const policy = rows[0].metadata?.notification_policy || {};
      res.json({ contacts, policy });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch comms config" });
    }
  });

  return router;
}
