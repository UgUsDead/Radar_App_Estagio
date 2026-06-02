Plan: Room-Scoped Alert Cleanup
Implement a room-scoped alert store in the mobile app so each room keeps only its latest alert, replacing prior alerts for the same room. This prevents unbounded growth and keeps the UI focused on the most recent room status.

Steps

Review the current alert pipeline in the app (alerts state, addAlert, and notification handlers) and identify where room metadata enters the flow. depends on discovery context
Extend the alert model to include roomId (and optionally roomName for display) so alerts can be keyed by room. depends on step 1
Replace the current list append+slice logic with a room-keyed structure that overwrites existing alerts by roomId, and derive a display array sorted by most recent time. depends on step 2
Update the push notification handler to reliably extract roomId from the payload and pass it into addAlert, with safe fallbacks if missing. depends on step 2
Adjust UI rendering to consume the derived “latest per room” list and confirm any list size assumptions (currently only the top 2 are rendered). parallel with step 4
Add lightweight logging to verify overwrite behavior during development (e.g., log when a room alert is replaced). parallel with step 5
Relevant files

App.tsx — alerts state, addAlert, and foreground notification handler
types.ts — AlertInfo definition to include roomId
pushNotifications.ts — payload extraction and alert dispatch
RadarView.tsx — alert rendering behavior and ordering
Verification

Simulate 60+ notifications across 2 rooms and confirm the in-app list remains at 2 entries (latest per room).
Send repeated notifications for the same room and confirm the prior alert is replaced (timestamp updates, no duplicates).
Send notifications from many distinct rooms and confirm list size equals number of rooms, with most recent rooms shown first.
Confirm UI still shows only the newest two alerts if that behavior is still desired.
Decisions

Scope: in-app alert list only (no OS notification cleanup)
Deduping key: roomId (preferred if available in payload)
Retention policy: keep one alert per room (most recent), no global cap
Further Considerations

If payloads ever lack roomId, decide whether to fall back to roomName or radarId to preserve deduping consistency.
If this plan looks good, I’m ready to proceed
