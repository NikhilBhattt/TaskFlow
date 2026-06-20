#!/usr/bin/env node
/**
 * TaskFlow Load Test Script
 * ---------------------------------------------------------
 * Submits N jobs at a given concurrency level against a running
 * TaskFlow API, polls until they all finish, and reports real
 * throughput + latency numbers.
 *
 * Usage:
 *   node load-test.mjs --type pdf --count 50 --concurrency 10
 *
 * Flags (all optional):
 *   --type         "pdf" or "email"             (default: pdf)
 *   --count        total jobs to submit          (default: 50)
 *   --concurrency  jobs submitted in parallel     (default: 10)
 *   --base-url     API base URL                  (default: http://localhost:8000)
 *   --to           recipient for email jobs       (default: loadtest@example.com)
 *   --poll-ms      status poll interval in ms     (default: 1000)
 *   --timeout-ms   max wait time for completion   (default: 120000)
 *
 * Requires Node 18+ (uses the built-in fetch). No npm install needed.
 */

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx === -1 ? fallback : args[idx + 1];
}

const TYPE = getArg("type", "pdf");
const COUNT = parseInt(getArg("count", "50"), 10);
const CONCURRENCY = parseInt(getArg("concurrency", "10"), 10);
const BASE_URL = getArg("base-url", "http://localhost:8000");
const EMAIL_TO = getArg("to", "loadtest@example.com");
const POLL_MS = parseInt(getArg("poll-ms", "1000"), 10);
const TIMEOUT_MS = parseInt(getArg("timeout-ms", "120000"), 10);

function buildPayload(type, i) {
  if (type === "email") {
    return {
      to: EMAIL_TO,
      subject: `Load test email #${i}`,
      message: `Load test job #${i}, fired at ${new Date().toISOString()}`,
    };
  }
  return {
    content: `Load test report #${i} generated at ${new Date().toISOString()}`,
  };
}

async function submitJob(i) {
  const submittedAt = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: TYPE, payload: buildPayload(TYPE, i) }),
    });
    if (!res.ok) return { id: null, submittedAt, error: `HTTP ${res.status}` };

    const data = await res.json();
    const id = data?.mongoJob?._id;
    if (!id) return { id: null, submittedAt, error: "No job id returned" };
    return { id, submittedAt, error: null };
  } catch (err) {
    return { id: null, submittedAt, error: err.message };
  }
}

// Simple fixed-size worker pool for concurrency-limited submission
async function runPool(total, concurrency, worker) {
  const results = new Array(total);
  let next = 0;
  async function runner() {
    while (next < total) {
      const i = next++;
      results[i] = await worker(i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, runner),
  );
  return results;
}

async function pollUntilDone(submissions) {
  const pending = new Map(
    submissions.filter((s) => s.id).map((s) => [s.id, s]),
  );
  const finished = new Map();
  const start = Date.now();

  while (pending.size > 0 && Date.now() - start < TIMEOUT_MS) {
    const res = await fetch(`${BASE_URL}/api/jobs`);
    if (res.ok) {
      const { allJobs } = await res.json();
      const statusById = new Map(allJobs.map((j) => [j._id, j.status]));

      for (const [id, record] of pending) {
        const status = statusById.get(id);
        if (status === "completed" || status === "failed") {
          finished.set(id, { ...record, status, finishedAt: Date.now() });
          pending.delete(id);
        }
      }
    }
    if (pending.size > 0) await new Promise((r) => setTimeout(r, POLL_MS));
  }

  for (const [id, record] of pending) {
    finished.set(id, { ...record, status: "timeout", finishedAt: null });
  }
  return finished;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function main() {
  console.log(`\nTaskFlow Load Test`);
  console.log(`-------------------`);
  console.log(`Target:       ${BASE_URL}`);
  console.log(`Job type:     ${TYPE}`);
  console.log(`Total jobs:   ${COUNT}`);
  console.log(`Concurrency:  ${CONCURRENCY}\n`);

  const testStart = Date.now();

  console.log("Submitting jobs...");
  const submissions = await runPool(COUNT, CONCURRENCY, submitJob);
  const submitEnd = Date.now();

  const submitOk = submissions.filter((s) => s.id);
  const submitErrors = submissions.filter((s) => s.error);
  console.log(
    `Submitted ${submitOk.length}/${COUNT} jobs in ${((submitEnd - testStart) / 1000).toFixed(2)}s ` +
      `(${submitErrors.length} submission errors)\n`,
  );

  console.log("Waiting for jobs to finish processing...");
  const results = await pollUntilDone(submitOk);
  const testEnd = Date.now();

  const completed = [...results.values()].filter(
    (r) => r.status === "completed",
  );
  const failed = [...results.values()].filter((r) => r.status === "failed");
  const timedOut = [...results.values()].filter((r) => r.status === "timeout");

  const latencies = completed
    .map((r) => r.finishedAt - r.submittedAt)
    .sort((a, b) => a - b);

  const totalWallSeconds = (testEnd - testStart) / 1000;
  const throughputPerSec = completed.length / totalWallSeconds;
  const avgLatency =
    latencies.reduce((sum, v) => sum + v, 0) / (latencies.length || 1);

  console.log(`\nResults`);
  console.log(`-------`);
  console.log(`Completed:            ${completed.length}/${COUNT}`);
  console.log(`Failed:               ${failed.length}`);
  console.log(`Timed out:            ${timedOut.length}`);
  console.log(`Submission errors:    ${submitErrors.length}`);
  console.log(`Total wall time:      ${totalWallSeconds.toFixed(2)}s`);
  console.log(
    `Throughput:           ${throughputPerSec.toFixed(2)} jobs/sec  (${(throughputPerSec * 60).toFixed(1)} jobs/min)`,
  );
  console.log(`Avg completion time:  ${(avgLatency / 1000).toFixed(2)}s`);
  console.log(
    `p50 completion time:  ${(percentile(latencies, 50) / 1000).toFixed(2)}s`,
  );
  console.log(
    `p95 completion time:  ${(percentile(latencies, 95) / 1000).toFixed(2)}s`,
  );
  console.log(
    `Max completion time:  ${((latencies[latencies.length - 1] || 0) / 1000).toFixed(2)}s\n`,
  );
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
