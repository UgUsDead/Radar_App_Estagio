import express from "express";
import { RadarRepository } from "../db/repository.js";
import { eventActionSchema } from "../schemas/index.js";
import { escalationService } from "../services/alertEscalationService.js";
import { PushNotificationService } from "../services/pushNotificationService.js";
import { requireFeature, requireAdmin } from "../middleware/auth.js";

export interface EventRouterDeps {
  repository: RadarRepository;
  pushNotificationService?: PushNotificationService;
}

export function createEventRouter(deps: EventRouterDeps): express.Router {
  const { repository, pushNotificationService } = deps;
  const router = express.Router();

  const resolveOwnerId = (req: express.Request) => {
    if (req.user?.role === "admin") return undefined;
    return req.user?.id;
  };

  const clearNotificationForEvent = async (eventId: number, ownerId?: number) => {
    if (!pushNotificationService) return;
    const event = await repository.getEventById(eventId, ownerId);
    if (!event) return;
    void pushNotificationService.sendClearNotification({
      roomId: event.room_id,
      radarId: event.radar_id,
      ownerId: event.owner_id,
    });
  };

  router.get("/events", async (req, res) => {
    const ownerId = resolveOwnerId(req);
    const limitRaw = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;

    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const status =
      req.query.status === "new" ||
      req.query.status === "acknowledged" ||
      req.query.status === "resolved" ||
      req.query.status === "closed"
        ? req.query.status
        : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;

    const urgencyRaw = typeof req.query.urgency === "string" ? req.query.urgency : undefined;
    const priorityRaw = typeof req.query.priority === "string" ? req.query.priority : urgencyRaw;
    const priority =
      priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high"
        ? priorityRaw
        : undefined;

    const hourStartRaw = Number(req.query.hourStart);
    const hourEndRaw = Number(req.query.hourEnd);
    const hourStart = Number.isFinite(hourStartRaw) ? hourStartRaw : undefined;
    const hourEnd = Number.isFinite(hourEndRaw) ? hourEndRaw : undefined;

    const events = await repository.getEvents({
      limit,
      type,
      status,
      from,
      to,
      priority,
      hourStart,
      hourEnd,
      ownerId,
    });
    
    // Calculate escalation levels for each event
    const eventsWithEscalation = events.map((event: any) => {
      const alertStatus = event.alert_status ?? "new";
      // Pause escalation if acknowledged
      const acknowledgedAt = event.metadata?.acknowledged_at;
      const escalationLevel = escalationService.determineEscalationLevel(
        event.timestamp,
        new Date(),
        alertStatus === "acknowledged" ? acknowledgedAt : undefined
      );
      
      return {
        ...event,
        escalation_level: escalationLevel,
        is_critical: escalationService.isCritical(escalationLevel)
      };
    });
    
    res.json(eventsWithEscalation);
  });

  router.delete("/events", requireAdmin, async (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const deleted = await repository.clearEvents(type);
    res.json({ ok: true, deleted });
  });

  router.post("/events/:id/ack", requireFeature("live_telemetry"), async (req, res) => {
    const ownerId = resolveOwnerId(req);
    const id = Number(req.params.id);
    const parsed = eventActionSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid event ack request" });
      return;
    }
    const ok = await repository.updateEventAlertStatus(id, "acknowledged", parsed.data.actor, parsed.data, ownerId);
    if (!ok) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    await clearNotificationForEvent(id, ownerId);
    res.json({ ok: true });
  });

  router.post("/events/:id/resolve", requireFeature("live_telemetry"), async (req, res) => {
    const ownerId = resolveOwnerId(req);
    const id = Number(req.params.id);
    const parsed = eventActionSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid event resolve request" });
      return;
    }
    const ok = await repository.updateEventAlertStatus(id, "resolved", parsed.data.actor, parsed.data, ownerId);
    if (!ok) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    await clearNotificationForEvent(id, ownerId);
    res.json({ ok: true });
  });

  router.post("/events/:id/close", requireFeature("live_telemetry"), async (req, res) => {
    const ownerId = resolveOwnerId(req);
    const id = Number(req.params.id);
    const parsed = eventActionSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid event close request" });
      return;
    }
    const ok = await repository.updateEventAlertStatus(id, "closed", parsed.data.actor, parsed.data, ownerId);
    if (!ok) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    await clearNotificationForEvent(id, ownerId);
    res.json({ ok: true });
  });

  router.get("/daily_stats", async (req, res) => {
    const days = Number(req.query.days ?? 7);
    res.json(await repository.getDailyStats(Number.isFinite(days) ? days : 7, resolveOwnerId(req)));
  });

  return router;
}
