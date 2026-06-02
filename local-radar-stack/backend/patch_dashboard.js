const fs = require('fs');
let code = fs.readFileSync('/home/hugo/Desktop/BLE2/local-radar-stack/dashboard/app/page.tsx', 'utf8');

// Update EventRow type
code = code.replace(
  `  alert_status?: "new" | "acknowledged" | "resolved";\n  escalation_level?: "new" | "level_1" | "level_2" | "level_3";`,
  `  alert_status?: "new" | "acknowledged" | "resolved" | "closed";\n  escalation_level?: "new" | "level_1" | "level_2" | "level_3";\n  closure_notes?: string;\n  outcome?: string;\n  action_taken?: string;`
);

// We need a modal or separate drawer for incident closure. 
// For now, let's just make the "resolve" button prompt for simple notes if it's currently a new/ack event
code = code.replace(
  `  const updateAlertStatus = async (eventId: number, action: "ack" | "resolve") => {\n    await fetch(\`\${apiBase}/events/\${eventId}/\${action}\`, {`,
  `  const updateAlertStatus = async (eventId: number, action: "ack" | "resolve" | "closed") => {
    let payload: Record<string, string> = { actor: "dashboard" };
    if (action === "resolve" || action === "closed") {
      const notes = prompt("Enter closure notes or action taken for this alert:");
      if (notes) {
        payload.notes = notes;
        payload.action_taken = "Staff intervention";
        payload.outcome = "Patient safe";
      }
    }
    await fetch(\`\${apiBase}/events/\${eventId}/\${action}\`, {`
);

code = code.replace(
  `method: "POST",\n      headers: { "Content-Type": "application/json" },\n      body: JSON.stringify({ actor: "dashboard" })\n    });`,
  `method: "POST",\n      headers: { "Content-Type": "application/json" },\n      body: JSON.stringify(payload)\n    });`
);

code = code.replace(
  `  const bulkUpdateAlerts = async (action: "ack" | "resolve") => {`,
  `  const bulkUpdateAlerts = async (action: "ack" | "resolve" | "closed") => {`
);

// We also add a visual indicator for high severity or escalation levels on the alert rows.
code = code.replace(
  `                <div className="text-sm font-semibold">{event.type.toUpperCase()}</div>`,
  `                <div className="text-sm font-semibold">
                  {event.type.toUpperCase()} 
                  {event.is_critical && <span className="ml-2 text-red-600 font-bold">(CRITICAL)</span>}
                  {event.escalation_level && event.escalation_level !== "new" && <span className="ml-2 text-orange-500">[{event.escalation_level.replace('_', ' ').toUpperCase()}]</span>}
                </div>`
);

fs.writeFileSync('/home/hugo/Desktop/BLE2/local-radar-stack/dashboard/app/page.tsx', code);
