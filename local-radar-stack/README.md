# Local Radar Stack

Fully local mmWave radar platform using Docker Compose:

- Backend: Node.js + TypeScript
- Database: PostgreSQL
- Broker: Eclipse Mosquitto
- Dashboard: Next.js
- Optional admin: pgAdmin

## Run

1. Create env file:

```bash
cp .env.example .env
```

2. Build and start all services:

```bash
docker-compose up --build
```

3. Access services:

- Dashboard: http://localhost:3000
- Backend API: http://localhost:4000
- pgAdmin: http://localhost:5050
- MQTT broker: localhost:1883

## Office Server Deployment

Use this when you want the full stack (DB + MQTT + backend + dashboard) to run on a server.

1. Copy this folder to the office server.

2. Create the server env file:

```bash
cp .env.server.example .env
```

3. Edit `.env` and set strong secrets:

- `POSTGRES_PASSWORD`
- `PGADMIN_PASSWORD`
- `NEXT_PUBLIC_API_BASE` (must point to server IP/DNS reachable by users)

4. Deploy using the hardened compose overlay:

```bash
./scripts/deploy-office.sh
```

Equivalent manual command:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build --remove-orphans
```

5. Validate health:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml ps
curl http://localhost:${BACKEND_PORT:-4000}/health
curl http://localhost:${BACKEND_PORT:-4000}/monitor/health
```

6. Optional: run pgAdmin only when needed:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml --profile admin up -d pgadmin
```

### Update On Server

After pulling new code:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build --remove-orphans
```

### Rollback (quick)

If you need to stop quickly:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml down
```

## MQTT

- Topic pattern from `.env`: `MQTT_TOPIC`
- Default in this stack: `linovt/+/telemetry`
- Backend extracts `radar_id` from topic as the middle segment.

## API examples

```bash
curl http://localhost:4000/radars?unassigned=true
curl http://localhost:4000/rooms
curl http://localhost:4000/patients
curl http://localhost:4000/events?limit=50
curl http://localhost:4000/daily_stats?days=7
```

```bash
curl -X POST http://localhost:4000/rooms \
  -H "Content-Type: application/json" \
  -d '{"name":"Room 204","floor":2,"notes":"Near station"}'

curl -X POST http://localhost:4000/patients \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","roomId":1,"metadata":{"risk":"high"}}'

curl -X POST http://localhost:4000/assign-radar \
  -H "Content-Type: application/json" \
  -d '{"radarId":"radar-001","roomId":1}'
```
