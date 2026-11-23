# Running Tuma Ride Locally with Docker

This project ships with a multi-stage `apps/backend/Dockerfile` and root `docker-compose.yml` running the NestJS API alongside PostgreSQL 16.

## Quick Start

```bash
docker compose up --build
```

- **API Base URL:** `http://localhost:4000/api`
- **Swagger UI:** `http://localhost:4000/docs`
- **Health Check:** `http://localhost:4000/health`

## Stop & Clean Up

```bash
docker compose down -v
```
