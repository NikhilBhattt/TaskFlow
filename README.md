# TaskFlow

TaskFlow is a background job processing platform built with Node.js, BullMQ, Redis and MongoDB, with a React dashboard for creating and monitoring jobs.
The API accepts a job and returns immediately; a worker executes it asynchronously, retries it on failure, and parks it in a dead-letter queue when retries run out.

## Overview

Sending an email or rendering a PDF inside an HTTP request handler ties up the request for as long as the work takes, and loses the work if anything fails halfway. TaskFlow separates *accepting* a job from *executing* it:

1. The API validates the request, stores a job record in MongoDB and enqueues it in a Redis-backed BullMQ queue.
2. A BullMQ worker picks the job up, runs the matching processor, and writes the outcome back to MongoDB.
3. Failed attempts are retried with exponential backoff. Jobs that exhaust their retries move to a dead-letter queue (DLQ) from which they can be inspected and retried.

## Architecture

```
React Dashboard (Vite, polls every 3s)
        |
        v
Express REST API  (/api/jobs, /api/failed-jobs)
        |  1. create job record (status: queued) ------> MongoDB
        |  2. enqueue
        v
BullMQ queue "jobs"  (stored in Redis)
        |
        v
BullMQ Worker  (concurrency 5, runs inside the API process)
        |  3. status: processing ----------------------> MongoDB
        v
Job processor  (email -> Nodemailer / Gmail SMTP)
               (pdf   -> PDFKit -> Cloudinary upload)
        |
        +-- success ---> MongoDB: status = completed
        |
        +-- failure ---> retry (3 attempts total, exponential backoff, 2s base)
                              |
                              +-- attempts exhausted --> MongoDB: status = failed
                                                            |
                                                            v
                                                   BullMQ queue "failed-jobs" (DLQ, in Redis)
                                                            |
                                                            v
                                          POST /api/failed-jobs/:id/retry
                                          (re-enqueues to "jobs", status = queued)
```

Notes on how it is actually wired:

- **The worker runs inside the API process.** `server.ts` connects to MongoDB, then starts the BullMQ worker in the same Node process as Express. It is not a separate process or container today; running it on its own would need a small code change (a second entry point).
- **Redis is used only by BullMQ**, for two queues: `jobs` and `failed-jobs`.
- **MongoDB is the record the dashboard reads.** It holds each job's type, payload, status, attempts, error, and (for PDFs) the result URL. Redis holds the work in flight.
- **The DLQ is a second BullMQ queue with no consumer.** Entries just sit there, with the original payload and error, until they are retried or deleted.

## Why TaskFlow Exists

- **Async processing:** slow or unreliable work (SMTP, file generation, third-party uploads) should not hold an HTTP request open. The client gets a job id back right away and checks status later.
- **Worker separation:** job execution is decoupled from request handling by the queue, so throughput is controlled by worker concurrency instead of by how many requests are open. (Today the worker shares the API's process; see Known Limitations.)
- **Resilience:** jobs live in Redis, not in a request's memory, and transient failures (a flaky SMTP server, a network blip) are retried automatically.
- **Retries and DLQ:** a job that keeps failing is not lost or retried forever. It is recorded as failed, preserved with its payload and error, and can be replayed once the cause is fixed.
- **Job tracking:** every job has a durable status and error message in MongoDB that the dashboard and API can query independently of Redis.

## Features

- Asynchronous jobs through a Redis-backed BullMQ queue
- Background worker with concurrency of 5
- Automatic retries: 3 attempts per job with exponential backoff (2s base delay)
- Dead-letter queue with retry-from-DLQ (API and dashboard button)
- Job status tracking in MongoDB (`queued`, `processing`, `completed`, `failed`) with attempt count and error message
- Two job types: `email` and `pdf`
- PDF generation with PDFKit and upload to Cloudinary; the resulting URL is saved on the job
- Request validation for job type and payload, with JSON error responses
- Job creation and DLQ retry return `503` right away when Redis is unreachable, instead of hanging
- React dashboard: create jobs, live counters, job list, job inspector, dead-letter queue, delete one job, clear all
- Helmet, CORS and Morgan on the API
- Docker Compose setup for the API, MongoDB and Redis

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js 22, Express 5, TypeScript |
| Queue | BullMQ on Redis |
| Database | MongoDB with Mongoose |
| Email | Nodemailer (Gmail SMTP) |
| PDF / storage | PDFKit, Cloudinary |
| Tooling | Docker, Docker Compose, ESLint, `node:test` via tsx |

## Project Structure

```
TaskFlow/
├── client/                     React + Vite dashboard
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── App.tsx             dashboard (single component)
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .env.example
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts          dev proxy: /api -> http://localhost:8000
│   └── README.md               pointer to this file
├── server/                     Express API + BullMQ worker
│   ├── src/
│   │   ├── __tests__/
│   │   │   └── jobValidation.test.ts
│   │   ├── config/
│   │   │   ├── cloudinary.ts
│   │   │   ├── config.ts       environment variables and defaults
│   │   │   └── redis.ts        shared Redis connection options
│   │   ├── controllers/
│   │   │   ├── dlq.controller.ts
│   │   │   └── jobs.controller.ts
│   │   ├── db/
│   │   │   └── connectDB.ts
│   │   ├── models/
│   │   │   └── jobs.model.ts
│   │   ├── queues/
│   │   │   ├── deadLetterQueue.ts   "failed-jobs" queue
│   │   │   └── jobQueue.ts          "jobs" queue
│   │   ├── routes/
│   │   │   ├── dlq.routes.ts
│   │   │   └── jobs.routes.ts
│   │   ├── services/
│   │   │   ├── cloudinary.service.ts
│   │   │   ├── email.service.ts
│   │   │   └── pdf.service.ts
│   │   ├── utils/
│   │   │   ├── asyncHandler.ts
│   │   │   └── jobValidation.ts
│   │   ├── workers/
│   │   │   ├── jobWorker.ts
│   │   │   ├── processEmail.ts
│   │   │   └── processPdf.ts
│   │   ├── index.ts            Express app
│   │   └── server.ts           entry point (HTTP server + worker)
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile
│   ├── load-test.mjs           manual throughput script
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md               pointer to this file
├── .gitattributes
├── .gitignore
├── docker-compose.yml          API + MongoDB + Redis
├── package.json                convenience scripts (no workspaces)
└── README.md
```

Lockfiles (`package-lock.json`) exist in the root of `client/` and `server/` and are omitted above.

## Job Lifecycle

Success:

```
queued -> processing -> completed
```

Failure:

```
queued -> processing -> (attempt fails, backoff, retry) x3 -> failed -> in DLQ
                                                                  |
                                                    retry from DLQ -> queued -> ...
```

- A job is `queued` from creation until a worker starts it, and `processing` while running. It stays `processing` between retry attempts.
- The `attempts` value shown in the UI (`retryCount` in MongoDB) is the number of attempts made so far, so a job that failed for good shows `3`.
- Retrying from the DLQ resets the record to `queued` with the error cleared and enqueues a fresh BullMQ job. The DLQ entry is removed.
- Deleting a job also removes its queue entry and any DLQ entry.

## Supported Job Types

**`email`** sends a **real email** through Gmail SMTP using Nodemailer. It is not simulated.

- Payload: `{ "to": "...", "subject": "...", "message": "..." }` (all strings)
- Requires `EMAIL_USER` and `EMAIL_PASSWORD` (a Gmail app password). If they are not set, the processor throws, the job is retried 3 times, and it ends up in the DLQ. That makes email jobs a convenient way to see the failure path without any credentials.

**`pdf`** generates a PDF and uploads it to Cloudinary.

- Payload: `{ "content": "..." }` (non-empty string). Other fields are ignored.
- PDFKit writes a one-page report (title, job id, your content) to a temporary file in `reports/`, which is uploaded to Cloudinary (`taskflow/reports`, resource type `raw`) and then deleted.
- The Cloudinary URL and public id are saved on the job as `pdfUrl` and `pdfPublicId`; the dashboard shows an "Open generated PDF" link.
- Requires the three `CLOUDINARY_*` variables. Without them the upload fails and the job goes to the DLQ.

## API Overview

Base path `/api` (except the health check).

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/api/jobs` | Validate, store and enqueue a job. Body: `{ "type": "email" \| "pdf", "payload": { ... } }` |
| GET | `/api/jobs` | List all jobs, newest first |
| GET | `/api/jobs/:id` | Get one job (status, attempts, error, PDF URL) |
| DELETE | `/api/jobs/:id` | Remove a job from the queue, the DLQ and the database. Returns `409` if a worker is processing it at that moment |
| DELETE | `/api/jobs` | Clear both queues and the jobs collection |
| GET | `/api/failed-jobs` | List dead-letter queue entries |
| POST | `/api/failed-jobs/:id/retry` | Re-enqueue a DLQ entry. `:id` is the entry's `dlqId` from the list response |

Example:

```bash
curl -X POST http://localhost:8000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"pdf","payload":{"content":"Quarterly report"}}'
```

## Frontend Dashboard

- **Create job:** choose Email or PDF, edit the JSON payload, and press *Queue job*. Malformed JSON and server-side validation errors are shown inline.
- **Counters:** total, active (`queued` + `processing`), completed and failed, computed from the job list.
- **Job history:** every job with type, status and attempts, plus *View* and *Delete*.
- **Job inspector:** paste a job id and press *Inspect* (or press *View* on a row) to see status, attempts, error and the PDF link. It refreshes with the job while you look at it.
- **Dead letter queue:** failed jobs with their error and a *Retry* button.
- **Refresh / Clear all:** *Refresh* reloads everything immediately. *Clear all* asks for confirmation, then empties both queues and the database.
- The dashboard **polls the API every 3 seconds**, so statuses update on their own. If the API is unreachable it shows a banner and keeps retrying.

<!--
Screenshots: add image files under docs/screenshots/ and link them here, for example:
![Dashboard](docs/screenshots/dashboard.png)
![Dead letter queue](docs/screenshots/dlq.png)
-->

## Local Setup

Prerequisites: Node.js 22+, and MongoDB and Redis running locally (or use [Docker](#docker) for those).

```bash
# 1. Configure the server
cp server/.env.example server/.env      # then edit values

# 2. Install dependencies
npm run install:all                      # or: (cd server && npm install) && (cd client && npm install)

# 3. Start the API + worker (http://localhost:8000)
cd server
npm run dev

# 4. In a second terminal, start the dashboard (http://localhost:5173)
cd client
npm run dev
```

From the repository root you can also run `npm run dev:server` and `npm run dev:client`.

Production build of each part: `npm run build` at the root (runs `tsc` for the server and `tsc -b && vite build` for the client). Start the built server with `cd server && npm start`.

## Environment Variables

**`server/.env`** (copy from `server/.env.example`; never commit the real file):

| Variable | Purpose | Default if unset |
|---|---|---|
| `PORT` | API port | `8000` |
| `CORS_ORIGIN` | Allowed CORS origin | `*` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/TaskFlow` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `EMAIL_USER` | Gmail address used to send email jobs | none |
| `EMAIL_PASSWORD` | Gmail app password | none |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | none |
| `CLOUDINARY_API_KEY` | Cloudinary API key | none |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | none |

**`client/.env`** (optional, from `client/.env.example`):

| Variable | Purpose | Default if unset |
|---|---|---|
| `VITE_API_URL` | API base URL for builds not served behind the dev proxy | empty (uses `/api`) |
| `API_PROXY_TARGET` | Where the Vite dev server proxies `/api` | `http://localhost:8000` |

## Docker

`docker-compose.yml` at the repository root starts three services: the API with its worker (built from `server/Dockerfile`), MongoDB and Redis.

```bash
docker compose up --build
```

- The API is published on `http://localhost:8000`. MongoDB and Redis are only reachable inside the Compose network, so they cannot clash with instances already running on your machine.
- Inside the network the API reaches the databases by service name (`mongodb://mongo:27017/TaskFlow`, `redis:6379`). Compose sets these itself and they override anything in `server/.env`.
- `server/.env` is optional. If present, it supplies `EMAIL_*` and `CLOUDINARY_*`; without it the stack still starts, and email/PDF jobs simply end up in the DLQ.
- The `app` service waits for MongoDB and Redis health checks before starting.
- The `env_file` entry uses `required: false`, which needs Docker Compose v2.24 or newer.
- The React client is **not** containerised. With the stack running, start it with `cd client && npm run dev`; the Vite proxy forwards `/api` to `localhost:8000`.
- `docker compose down` stops the stack; add `-v` to also delete the MongoDB and Redis volumes.

## Testing

```bash
cd server
npm test        # or `npm test` from the repository root
```

This runs the `node:test` suite in `server/src/__tests__` (7 tests) covering job payload validation. There are no automated tests for the queue, worker, or frontend, and none for the Docker setup.

`server/load-test.mjs` is a manual script that submits jobs to a running API and reports throughput and completion times (average, p95): `node load-test.mjs --type pdf --count 50 --concurrency 10`. It also accepts `--base-url` (default `http://localhost:8000`). Note that `pdf` jobs need working Cloudinary credentials to complete.

Client checks: `cd client && npm run lint && npm run build`.

## Known Limitations

- No authentication or authorization; anyone who can reach the API can create, retry or delete jobs. CORS defaults to `*`.
- Email jobs need a real Gmail account with an app password; the `to` address is not validated beyond being a string.
- PDF and email success paths depend on external services (Cloudinary, Gmail), so they cannot run fully without credentials.
- The worker runs in the same process as the API, so it scales with API instances rather than independently.
- Delivery is at-least-once: if a worker dies mid-job, BullMQ re-runs it, so a job (such as an email) can execute twice. There is no idempotency key.
- Job state lives in two places (Redis and MongoDB) and is synchronised by worker event handlers without a transaction, so a crash at the wrong moment can leave them briefly out of step.
- The dashboard polls instead of using WebSockets or server-sent events.
- `GET /api/jobs` returns every job with no pagination.
- No graceful shutdown handling for the worker on SIGTERM.
- The HTTP server starts listening before the MongoDB connection is established, so requests in the first moments after startup can fail.
- Single Redis and MongoDB instance, and monitoring is limited to console logs and Morgan request logs.

## Future Improvements

- Authentication and per-user job ownership
- Metrics and a queue dashboard (for example Prometheus and Bull Board)
- Structured logging and distributed tracing
- Run the worker as its own process/container so it scales independently
- Idempotency keys and graceful shutdown for safer retries
- WebSockets or SSE instead of polling
- Pagination and filtering on the jobs list
- Job priorities, delayed and scheduled jobs, rate limiting
- Webhooks on job completion or failure
- Integration tests for the queue → worker → DLQ flow
