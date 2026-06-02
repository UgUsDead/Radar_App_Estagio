import express from "express";
import { randomUUID } from "node:crypto";
import { ReplayService } from "../services/replayService.js";
import { ReplayAnnotation, ReplayBookmark, replayAnnotationCreateSchema, replayBookmarkCreateSchema } from "../schemas/index.js";
import { asRecord, parseReplayAnnotations, parseReplayBookmarks, toFiniteNumber } from "../helpers/index.js";
import { requireFeature } from "../middleware/auth.js";

export interface ReplayRouterDeps {
  replayService: ReplayService;
}

export function createReplayRouter(deps: ReplayRouterDeps): express.Router {
  const { replayService } = deps;
  const router = express.Router();

  const resolveOwnerId = (req: express.Request) =>
    req.user?.role === "admin" ? undefined : req.user?.id;

  router.get("/events/:id/replay", requireFeature("replay_system"), async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) { res.status(400).json({ error: "Invalid event id" }); return; }
      const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
      if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
      const annotations = parseReplayAnnotations(replay.metadata);
      const bookmarks = parseReplayBookmarks(replay.metadata);
      res.json({ event: replay.event, telemetry: replay.telemetry, zones: replay.zones, annotations, bookmarks });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch replay" });
    }
  });

  router.get("/events/:id/annotations", requireFeature("replay_system"), async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId)) { res.status(400).json({ error: "Invalid event id" }); return; }
    const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
    if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
    res.json({
      annotations: parseReplayAnnotations(replay.metadata),
      bookmarks: parseReplayBookmarks(replay.metadata),
    });
  });

  router.post("/events/:id/annotations", requireFeature("replay_system"), async (req, res) => {
    const eventId = Number(req.params.id);
    const parsed = replayAnnotationCreateSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(eventId) || !parsed.success) { res.status(400).json({ error: "Invalid annotation payload" }); return; }
    const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
    if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
    const annotations = parseReplayAnnotations(replay.metadata);
    const created: ReplayAnnotation = {
      id: randomUUID(), frameIndex: parsed.data.frameIndex,
      timestampMs: parsed.data.timestampMs, comment: parsed.data.comment,
      createdAt: new Date().toISOString(),
    };
    const nextMetadata: Record<string, unknown> = { ...replay.metadata, replay_annotations: [...annotations, created] };
    await replayService.persistEventMetadata(eventId, nextMetadata, resolveOwnerId(req));
    res.status(201).json({
      annotation: created, annotations: [...annotations, created],
      bookmarks: parseReplayBookmarks(nextMetadata),
    });
  });

  router.delete("/events/:id/annotations/:annotationId", requireFeature("replay_system"), async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId)) { res.status(400).json({ error: "Invalid event id" }); return; }
    const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
    if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
    const annotationId = String(req.params.annotationId);
    const annotations = parseReplayAnnotations(replay.metadata);
    const nextAnnotations = annotations.filter((item) => item.id !== annotationId);
    const nextMetadata: Record<string, unknown> = { ...replay.metadata, replay_annotations: nextAnnotations };
    await replayService.persistEventMetadata(eventId, nextMetadata, resolveOwnerId(req));
    res.json({ annotations: nextAnnotations, bookmarks: parseReplayBookmarks(nextMetadata) });
  });

  router.post("/events/:id/bookmarks", requireFeature("replay_system"), async (req, res) => {
    const eventId = Number(req.params.id);
    const parsed = replayBookmarkCreateSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(eventId) || !parsed.success) { res.status(400).json({ error: "Invalid bookmark payload" }); return; }
    const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
    if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
    const bookmarks = parseReplayBookmarks(replay.metadata);
    const created: ReplayBookmark = {
      id: randomUUID(), frameIndex: parsed.data.frameIndex,
      timestampMs: parsed.data.timestampMs, label: parsed.data.label ?? "Bookmarked frame",
      createdAt: new Date().toISOString(),
    };
    const nextMetadata: Record<string, unknown> = { ...replay.metadata, replay_bookmarks: [...bookmarks, created] };
    await replayService.persistEventMetadata(eventId, nextMetadata, resolveOwnerId(req));
    res.status(201).json({
      bookmark: created, bookmarks: [...bookmarks, created],
      annotations: parseReplayAnnotations(nextMetadata),
    });
  });

  router.delete("/events/:id/bookmarks/:bookmarkId", requireFeature("replay_system"), async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId)) { res.status(400).json({ error: "Invalid event id" }); return; }
    const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
    if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
    const bookmarkId = String(req.params.bookmarkId);
    const bookmarks = parseReplayBookmarks(replay.metadata);
    const nextBookmarks = bookmarks.filter((item) => item.id !== bookmarkId);
    const nextMetadata: Record<string, unknown> = { ...replay.metadata, replay_bookmarks: nextBookmarks };
    await replayService.persistEventMetadata(eventId, nextMetadata, resolveOwnerId(req));
    res.json({ bookmarks: nextBookmarks, annotations: parseReplayAnnotations(nextMetadata) });
  });

  router.get("/events/:id/incident-summary-export", requireFeature("replay_system"), async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId)) { res.status(400).json({ error: "Invalid event id" }); return; }
    const replay = await replayService.getReplayEvent(eventId, resolveOwnerId(req));
    if (!replay) { res.status(404).json({ error: "Event not found" }); return; }
    const annotations = parseReplayAnnotations(replay.metadata);
    const bookmarks = parseReplayBookmarks(replay.metadata);
    let frameCount = 0, maxTargets = 0, totalTargets = 0, maxSpeed = 0;
    for (const frame of replay.telemetry) {
      const frameRecord = asRecord(frame);
      const targetsRaw = frameRecord.targets;
      if (!Array.isArray(targetsRaw)) continue;
      frameCount += 1;
      maxTargets = Math.max(maxTargets, targetsRaw.length);
      totalTargets += targetsRaw.length;
      for (const target of targetsRaw) {
        const targetRecord = asRecord(target);
        const speed = toFiniteNumber(targetRecord.speed, Math.hypot(
          toFiniteNumber(targetRecord.vx), toFiniteNumber(targetRecord.vy), toFiniteNumber(targetRecord.vz)
        ));
        maxSpeed = Math.max(maxSpeed, speed);
      }
    }
    const zoneContext = asRecord(replay.metadata.zone_context);
    const generatedAt = new Date().toISOString();
    const averageTargetsPerFrame = frameCount > 0 ? Number((totalTargets / frameCount).toFixed(2)) : 0;
    const zoneSummary = Object.keys(zoneContext).length > 0
      ? `- Tipo: ${String(zoneContext.type ?? "desconhecido")}\n- Nome: ${String(zoneContext.name ?? "desconhecido")}\n- Prioridade: ${String(zoneContext.priority ?? "média")}`
      : "- Nenhum contexto de zona registado";
    const bookmarkLines = bookmarks.length > 0
      ? bookmarks.slice().sort((a, b) => a.frameIndex - b.frameIndex)
          .map((bookmark) => `- Quadro ${bookmark.frameIndex + 1} (+${bookmark.timestampMs} ms): ${bookmark.label}`).join("\n")
      : "- Nenhum";
    const annotationLines = annotations.length > 0
      ? annotations.slice().sort((a, b) => a.frameIndex - b.frameIndex)
          .map((annotation) => {
            const normalizedComment = annotation.comment.replace(/\s+/g, " ").trim();
            return `- Quadro ${annotation.frameIndex + 1} (+${annotation.timestampMs} ms): ${normalizedComment}`;
          }).join("\n")
      : "- Nenhum";
    const textReport = [
      "RELATÓRIO DE RESUMO DE INCIDENTE", "===============================", "",
      `Gerado em: ${generatedAt}`, `ID do Incidente: ${String(replay.event.id)}`, "",
      "DETALHES DO EVENTO", "------------------",
      `Tipo: ${String(replay.event.type ?? "desconhecido")}`,
      `Marca de Tempo: ${String(replay.event.timestamp ?? "desconhecido")}`,
      `ID do Radar: ${String(replay.event.radar_id ?? "desconhecido")}`,
      `Duração (s): ${String(replay.event.duration ?? "desconhecido")}`, "",
      "MÉTRICAS DE TELEMETRIA", "----------------------",
      `Quadros Capturados: ${frameCount}`, `Alvos Máximos em Quadro: ${maxTargets}`,
      `Média de Alvos por Quadro: ${averageTargetsPerFrame}`,
      `Velocidade Máxima Registada (m/s): ${Number(maxSpeed.toFixed(3))}`, "",
      "CONTEXTO DO INCIDENTE", "---------------------",
      `Nível de Risco: ${String(replay.metadata.risk_level_applied ?? "desconhecido")}`,
      `Prioridade do Alerta: ${String(replay.metadata.alert_priority ?? "média")}`, "",
      "CONTEXTO DA ZONA", "----------------", zoneSummary, "",
      "MARCADORES FORENSES", "-------------------", bookmarkLines, "",
      "ANOTAÇÕES FORENSES", "------------------", annotationLines, "",
      "VERIFICAÇÕES DE AUDITORIA RECOMENDADAS", "--------------------------------------",
      "- Verificar configuração de segurança à cabeceira e dispositivos de assistência",
      "- Rever cronologia de resposta da equipa face à política de SLA",
      "- Confirmar documentação de reavaliação do paciente pós-incidente", "",
    ].join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=incident-${eventId}-summary.txt`);
    res.status(200).send(textReport);
  });

  return router;
}
