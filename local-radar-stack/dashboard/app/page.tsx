"use client";

import { apiFetch } from "./utils/api";

import { useRef, useEffect, useState } from "react";
import { useInteractionManager } from "./hooks/useInteractionManager";
import { useDashboardData } from "./hooks/useDashboardData";
import { useAlertActions } from "./hooks/useAlertActions";
import { useRoomActions } from "./hooks/useRoomActions";
import { useRadarActions } from "./hooks/useRadarActions";
import { usePatientActions } from "./hooks/usePatientActions";
import { useZoneEditor } from "./hooks/useZoneEditor";
import { useDeviceControl } from "./hooks/useDeviceControl";

import { HeroSection } from "./components/dashboard/HeroSection";
import { SummaryCardsSection } from "./components/dashboard/SummaryCardsSection";
import { MonitorHealthSection } from "./components/dashboard/MonitorHealthSection";
import { WatchlistSection } from "./components/dashboard/WatchlistSection";
import { AlertsSection } from "./components/alerts/AlertsSection";
import { RecentFallsSection } from "./components/alerts/RecentFallsSection";
import { ResolutionModal } from "./components/alerts/ResolutionModal";
import { RoomsBoardSection } from "./components/rooms/RoomsBoardSection";
import { RoomManagementSection } from "./components/rooms/RoomManagementSection";
import { PatientManagementSection } from "./components/patients/PatientManagementSection";
import { PatientDirectorySection } from "./components/patients/PatientDirectorySection";
import { RadarInventorySection } from "./components/radars/RadarInventorySection";
import { ZoneEditorSection } from "./components/zones/ZoneEditorSection";
import { ZoneGraphCanvas } from "./components/zones/ZoneGraphCanvas";
import { ZoneDraftForm } from "./components/zones/ZoneDraftForm";
import { ZoneList } from "./components/zones/ZoneList";
import { DeviceOverviewSection } from "./components/radars/DeviceOverviewSection";
import { RadarConfigSection } from "./components/radars/RadarConfigSection";
import { DeviceLogSection } from "./components/radars/DeviceLogSection";
import { apiBase } from "./constants/api";
import { RequireFeature } from "./components/auth/RequireFeature";
import { UserManagement } from "./components/auth/UserManagement";
import { useAuth } from "./contexts/AuthContext";

export default function HomePage() {
  const { user, logout, hasPermission } = useAuth();
  const canManageRadars = hasPermission("radar_management");
  const canEditZones = hasPermission("geo_fencing");
  const { interactingRef, markInteracting, markDoneInteracting } = useInteractionManager();
  const jumpToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  
  const {
    allRadars, rooms, patients, events, daily, monitorHealth, watchlist, lastUpdated, error, load, updateRiskProfile
  } = useDashboardData(interactingRef);

  const {
    fallAlerts, activeFallAlerts, criticalAlerts, roomAlerts,
    bulkActionBusy, resolvingEvent, resolutionData,
    setResolvingEvent, setResolutionData, updateAlertStatus, confirmResolution,
    bulkUpdateAlerts, roomShortcut
  } = useAlertActions(events, load);

  const {
    needsAttentionOnly, setNeedsAttentionOnly, newRoomName, setNewRoomName,
    newRoomFloor, setNewRoomFloor, newRoomNotes, setNewRoomNotes,
    newRoomWidth, setNewRoomWidth, newRoomDepth, setNewRoomDepth,
    newRadarHeight, setNewRadarHeight,
    creatingRoom, deletingRoomId, message: roomMessage,
    createRoom, deleteRoom, roomStatus, sortedRooms, roomOptions, visibleRooms, uniqueRooms
  } = useRoomActions(rooms, activeFallAlerts, load);

  const {
    selectedRoomByRadar, setSelectedRoomByRadar, assigningRadarId,
    unassigningRadarId, deletingRadarId, claimingRadarId, message: radarMessage,
    unassignedRadars, unassignedOnlineRadars, knownRadarIds,
    assignRadarToRoom, unassignRadar, deleteRadar, claimRadar,
    users, loadUsers
  } = useRadarActions(allRadars, rooms, load, markInteracting, markDoneInteracting);

  useEffect(() => {
    console.log("[DEBUG] allRadars:", allRadars);
    console.log("[DEBUG] unassignedRadars:", unassignedRadars);
    console.log("[DEBUG] role:", user?.role, "userId:", user?.id);
  }, [allRadars, unassignedRadars, user]);

  useEffect(() => {
    if (user?.role === 'admin') {
      void loadUsers();
    }
  }, [user, loadUsers]);

  const {
    newPatientName, setNewPatientName, newPatientRoomId, setNewPatientRoomId,
    creatingPatient, selectedRoomByPatient, setSelectedRoomByPatient,
    assigningPatientId, deletingPatientId, message: patientMessage,
    createPatient, assignPatientRoom, deletePatient
  } = usePatientActions(load);

  const {
    selectedZoneRadarId, setSelectedZoneRadarId, zones,
    zoneDraftName, setZoneDraftName,
    zoneDraftBehavior, setZoneDraftBehavior, zoneDraftPriority, setZoneDraftPriority,
    zoneDraftPoints, setZoneDraftPoints, editingZoneId, zoneMessage,
    zonesBusy, zoneDraftTriggersAlert, setZoneDraftTriggersAlert,
    zoneDraftSchedule, setZoneDraftSchedule, copySourceRadarId, setCopySourceRadarId,
    zoneDraftColor, setZoneDraftColor, showColorPalette, setShowColorPalette,
    zoneDraftDwellMinutes, setZoneDraftDwellMinutes,
    roomWidthMeters, roomDepthMeters, originX, originY, radarHeightMeters,
    loadZonesForRadar, resetZoneDraft, upsertZoneDraft, editZone, deleteZone,
    handleZoneGraphClick, saveZonesForRadar, handleMouseDownPoint,
    handleMouseMoveGraph, handleMouseUpGraph, copyLayoutFromRadar,
    zoneGridLines, zoneDraftGraphPoints, existingZoneGraphPolygons, liveTargetPoints
  } = useZoneEditor(rooms, load, markInteracting, markDoneInteracting);

  const [selectedControlRadarId, setSelectedControlRadarId] = useState("");
  const {
    deviceState, logs, radarConfig, setRadarConfig, configApplyState,
    loading: deviceLoading, message: deviceMessage,
    sendCommand, sendRadarCommand, applyRadarConfig,
    requestConfigState, resetApplyState,
  } = useDeviceControl(selectedControlRadarId);

  useEffect(() => {
    if (!selectedControlRadarId && knownRadarIds.length > 0) {
      setSelectedControlRadarId(knownRadarIds[0]);
    }
  }, [knownRadarIds, selectedControlRadarId]);

  const [clearingDatabase, setClearingDatabase] = useState(false);
  const [managementMessage, setManagementMessage] = useState("");
  const zoneEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const manageRadarId = params.get("manageZones");
    if (manageRadarId) {
      setSelectedZoneRadarId(manageRadarId);
      void loadZonesForRadar(manageRadarId);
      setTimeout(() => {
        zoneEditorRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [loadZonesForRadar, setSelectedZoneRadarId]);

  const clearEntireDatabase = async () => {
    const confirmed = window.confirm(
      "Isto irá eliminar TODOS os quartos, pacientes, radares, eventos, resumos e estatísticas. Continuar?"
    );
    if (!confirmed) return;

    const typed = window.prompt('Escreva LIMPAR para confirmar a limpeza total da base de dados');
    if (typed !== "LIMPAR") {
      setManagementMessage("Limpeza da base de dados cancelada.");
      return;
    }

    setClearingDatabase(true);
    setManagementMessage("");
    try {
      const response = await apiFetch(`/testing/clear-database`, {
        method: "POST"
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to clear database");
      }

      setSelectedRoomByRadar({});
      setSelectedRoomByPatient({});
      setManagementMessage("Database cleared.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear database";
      setManagementMessage(message);
    } finally {
      setClearingDatabase(false);
    }
  };

  const combinedManagementMessage = roomMessage || radarMessage || patientMessage || managementMessage;

  return (
    <main className="container dashboard-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <span>Bem-vindo, <strong>{user?.username}</strong> ({user?.role})</span>
        </div>
        <button onClick={logout} className="secondary" style={{ padding: "0.5rem 1rem" }}>Encerrar Sessão</button>
      </div>

      <UserManagement />

      <HeroSection lastUpdated={lastUpdated} load={load} />

      {error ? <section className="panel error-banner">{error}</section> : null}

      <RequireFeature feature="sla_metrics">
        <SummaryCardsSection
          uniqueRooms={uniqueRooms}
          roomStatus={roomStatus}
          patients={patients}
          unassignedOnlineRadars={unassignedOnlineRadars}
          fallAlerts={fallAlerts}
          watchlist={watchlist}
        />
      </RequireFeature>

      <RequireFeature feature="gait_instability">
        <WatchlistSection 
          watchlist={watchlist} 
          updateRiskProfile={updateRiskProfile}
        />
      </RequireFeature>

      <section className="panel">
        <h2>Menu de Quartos e Pacientes</h2>
        <p className="muted">
          Acede rapidamente à lista completa de quartos e ao diretório de pacientes.
        </p>
        <div className="management-grid">
          <button className="secondary" onClick={() => jumpToSection("rooms-browser") }>
            Ver Quartos ({uniqueRooms.length})
          </button>
          <button className="secondary" onClick={() => jumpToSection("patients-browser") }>
            Ver Pacientes ({patients.length})
          </button>
        </div>
      </section>

      {(canManageRadars || canEditZones) && (
        <section className="panel" ref={zoneEditorRef} onMouseEnter={markInteracting} onMouseLeave={markDoneInteracting}>
          <h2>Gestão de Quartos e Pacientes</h2>
        <div className="management-grid">
          {canManageRadars && (
            <>
              <RoomManagementSection
                newRoomName={newRoomName}
                setNewRoomName={setNewRoomName}
                newRoomFloor={newRoomFloor}
                setNewRoomFloor={setNewRoomFloor}
                newRoomNotes={newRoomNotes}
                setNewRoomNotes={setNewRoomNotes}
                creatingRoom={creatingRoom}
                createRoom={createRoom}
              />

              <PatientManagementSection
                newPatientName={newPatientName}
                setNewPatientName={setNewPatientName}
                newPatientRoomId={newPatientRoomId}
                setNewPatientRoomId={setNewPatientRoomId}
                creatingPatient={creatingPatient}
                createPatient={createPatient}
                roomOptions={roomOptions}
              />
            </>
          )}

            {canEditZones && (
              <ZoneEditorSection
                selectedZoneRadarId={selectedZoneRadarId}
                setSelectedZoneRadarId={setSelectedZoneRadarId}
                loadZonesForRadar={loadZonesForRadar}
                knownRadarIds={knownRadarIds}
                copySourceRadarId={copySourceRadarId}
                setCopySourceRadarId={setCopySourceRadarId}
                copyLayoutFromRadar={copyLayoutFromRadar}
              >
                <ZoneGraphCanvas
                  zoneGridLines={zoneGridLines}
                  existingZoneGraphPolygons={existingZoneGraphPolygons}
                  editingZoneId={editingZoneId}
                  zoneDraftGraphPoints={zoneDraftGraphPoints}
                  zoneDraftColor={zoneDraftColor}
                  liveTargetPoints={liveTargetPoints}
                  handleZoneGraphClick={handleZoneGraphClick}
                  handleMouseMoveGraph={handleMouseMoveGraph}
                  handleMouseUpGraph={handleMouseUpGraph}
                  handleMouseDownPoint={handleMouseDownPoint}
                  setZoneDraftPoints={setZoneDraftPoints}
                />
                
                <ZoneDraftForm
                  zoneDraftName={zoneDraftName}
                  setZoneDraftName={setZoneDraftName}
                  zoneDraftBehavior={zoneDraftBehavior}
                  setZoneDraftBehavior={setZoneDraftBehavior}
                  zoneDraftColor={zoneDraftColor}
                  setZoneDraftColor={setZoneDraftColor}
                  showColorPalette={showColorPalette}
                  setShowColorPalette={setShowColorPalette}
                  zoneDraftPriority={zoneDraftPriority}
                  setZoneDraftPriority={setZoneDraftPriority}
                  zoneDraftTriggersAlert={zoneDraftTriggersAlert}
                  setZoneDraftTriggersAlert={setZoneDraftTriggersAlert}
                  zoneDraftSchedule={zoneDraftSchedule}
                  setZoneDraftSchedule={setZoneDraftSchedule}
                  zoneDraftDwellMinutes={zoneDraftDwellMinutes}
                  setZoneDraftDwellMinutes={setZoneDraftDwellMinutes}
                  upsertZoneDraft={upsertZoneDraft}
                  resetZoneDraft={resetZoneDraft}
                  editingZoneId={editingZoneId}
                  saveZonesForRadar={saveZonesForRadar}
                  zonesBusy={zonesBusy}
                  selectedZoneRadarId={selectedZoneRadarId}
                  zoneMessage={zoneMessage}
                />

                <div className="zone-list-wrapper">
                  <ZoneList
                    zones={zones}
                    editZone={editZone}
                    deleteZone={deleteZone}
                    selectedZoneRadarId={selectedZoneRadarId}
                  />
                </div>
              </ZoneEditorSection>
            )}
        </div>
        {canManageRadars && (
          <div className="danger-zone">
            <button
              className="danger-button"
              onClick={() => void clearEntireDatabase()}
              disabled={clearingDatabase}
            >
              {clearingDatabase ? "A limpar base de dados..." : "Limpar base de dados completa (testes)"}
            </button>
          </div>
        )}
          {combinedManagementMessage ? <p className="muted management-message">{combinedManagementMessage}</p> : null}
        </section>
      )}

      <RequireFeature feature="live_telemetry">
        <AlertsSection
          criticalAlerts={criticalAlerts}
          activeFallAlerts={activeFallAlerts}
          bulkActionBusy={bulkActionBusy}
          bulkUpdateAlerts={bulkUpdateAlerts}
          updateAlertStatus={updateAlertStatus}
        />
      </RequireFeature>

      <RequireFeature feature="fall_history">
        <RecentFallsSection recentFalls={fallAlerts.slice(0, 14)} />
      </RequireFeature>

      <section id="rooms-browser">
        <RoomsBoardSection
          needsAttentionOnly={needsAttentionOnly}
          setNeedsAttentionOnly={setNeedsAttentionOnly}
          visibleRooms={visibleRooms}
          sortedRooms={sortedRooms}
          roomStatus={roomStatus}
          daily={daily}
          roomAlerts={roomAlerts}
          unassigningRadarId={unassigningRadarId}
          deletingRadarId={deletingRadarId}
          deletingRoomId={deletingRoomId}
          roomShortcut={roomShortcut}
          unassignRadar={unassignRadar}
          deleteRadar={deleteRadar}
          deleteRoom={deleteRoom}
        />
      </section>

      <MonitorHealthSection monitorHealth={monitorHealth} />

      <RequireFeature feature="radar_management">
        <RadarInventorySection
          unassignedRadars={unassignedRadars}
          roomOptions={roomOptions}
          selectedRoomByRadar={selectedRoomByRadar}
          setSelectedRoomByRadar={setSelectedRoomByRadar}
          assignRadarToRoom={assignRadarToRoom}
          claimRadar={claimRadar}
          deleteRadar={deleteRadar}
          assigningRadarId={assigningRadarId}
          claimingRadarId={claimingRadarId}
          deletingRadarId={deletingRadarId}
          markInteracting={markInteracting}
          isAdmin={user?.role === "admin"}
          users={users}
        />
      </RequireFeature>

      <RequireFeature feature="radar_management">
        <section className="panel" id="device-control">
          <h2>Controlo de Dispositivo e Configuração do Radar</h2>
          <p className="muted">Monitorize o estado do dispositivo, envie comandos e configure parâmetros do radar via MQTT.</p>

          <div className="device-control-radar-select">
            <label>Radar:</label>
            <select
              value={selectedControlRadarId}
              onChange={(e) => setSelectedControlRadarId(e.target.value)}
            >
              <option value="">— Selecionar radar —</option>
              {knownRadarIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          {selectedControlRadarId && (
            <div className="device-control-panel">
              <DeviceOverviewSection
                deviceState={deviceState}
                loading={deviceLoading}
                message={deviceMessage}
                onSendCommand={sendCommand}
                onSendRadarCommand={sendRadarCommand}
              />

              <div className="device-control-divider" />

              <RadarConfigSection
                radarConfig={radarConfig}
                setRadarConfig={setRadarConfig}
                configApplyState={configApplyState}
                loading={deviceLoading}
                message={deviceMessage}
                onApply={applyRadarConfig}
                onRequestConfig={requestConfigState}
                onSendRadarCommand={sendRadarCommand}
                onResetApplyState={resetApplyState}
              />

              <div className="device-control-divider" />

              <DeviceLogSection logs={logs} />
            </div>
          )}
        </section>
      </RequireFeature>

      <section id="patients-browser">
        <PatientDirectorySection
          patients={patients}
          roomOptions={roomOptions}
          selectedRoomByPatient={selectedRoomByPatient}
          setSelectedRoomByPatient={setSelectedRoomByPatient}
          assignPatientRoom={assignPatientRoom}
          deletePatient={deletePatient}
          assigningPatientId={assigningPatientId}
          deletingPatientId={deletingPatientId}
          markInteracting={markInteracting}
        />
      </section>

      <RequireFeature feature="replay_system" fallback={null}>
        <ResolutionModal
          resolvingEvent={resolvingEvent}
          resolutionData={resolutionData}
          setResolvingEvent={setResolvingEvent}
          setResolutionData={setResolutionData}
          confirmResolution={confirmResolution}
        />
      </RequireFeature>
    </main>
  );
}
