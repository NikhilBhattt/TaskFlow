import { useCallback, useEffect, useMemo, useState } from "react";

type JobType = "email" | "pdf";

type JobRecord = {
  _id?: string;
  type?: string;
  status?: string;
  payload?: Record<string, unknown>;
  pdfUrl?: string;
  pdfPublicId?: string;
  retryCount?: number;
  error?: string;
  createdAt?: string;
};

type FailedJob = {
  dlqId?: string;
  failedAt?: string;
  originalId?: string;
  mongoJobId?: string;
  originalType?: string;
  error?: string;
};

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;
const POLL_INTERVAL_MS = 3000;

const defaultPayloads: Record<JobType, string> = {
  email: JSON.stringify(
    {
      to: "ops@company.com",
      subject: "Welcome to TaskFlow",
      message: "Your background job has been queued successfully.",
    },
    null,
    2,
  ),
  pdf: JSON.stringify(
    {
      content:
        "Customer activity trends, operational health, and key business milestones.",
    },
    null,
    2,
  ),
};

const payloadHints: Record<JobType, string> = {
  email:
    "Required fields: to, subject, message. Sent through Gmail SMTP; without credentials the job fails and ends up in the dead letter queue.",
  pdf: "Required field: content. The PDF is uploaded to Cloudinary; without credentials the job fails and ends up in the dead letter queue.",
};

const formatTime = (value?: string | Date) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatClock = (date: Date) =>
  date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const typeLabel = (type?: string) =>
  type === "pdf" ? "PDF" : type === "email" ? "Email" : (type ?? "Job");

// Full ID on wide screens, short tail on phones (the full ID stays in the tooltip).
function JobId({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <div className="id-text" title={id}>
      <span className="hidden sm:inline">{id}</span>
      <span className="whitespace-nowrap sm:hidden">...{id.slice(-8)}</span>
    </div>
  );
}

const KNOWN_STATUSES = ["queued", "processing", "completed", "failed", "cancelled"];

function StatusBadge({ status }: { status?: string }) {
  const value = status && KNOWN_STATUSES.includes(status) ? status : "queued";
  return <span className={`status status-${value}`}>{status ?? "queued"}</span>;
}

class ApiUnreachableError extends Error {
  constructor() {
    super("Cannot reach the TaskFlow API. Is the server running?");
  }
}

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

async function fetchJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new ApiUnreachableError();
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || `Request failed (HTTP ${response.status})`);
  }

  return data as T;
}

function App() {
  const [jobType, setJobType] = useState<JobType>("email");
  const [payloadText, setPayloadText] = useState(defaultPayloads.email);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Live hint under the payload box; the submit handler still validates on its own.
  const payloadError = useMemo(() => {
    try {
      JSON.parse(payloadText);
      return "";
    } catch (err) {
      return errorText(err, "Invalid JSON");
    }
  }, [payloadText]);

  const jobSummary = useMemo(() => {
    const queued = jobs.filter((job) => job.status === "queued").length;
    const processing = jobs.filter((job) => job.status === "processing").length;
    const completed = jobs.filter((job) => job.status === "completed").length;
    const failed = jobs.filter((job) => job.status === "failed").length;

    return {
      total: jobs.length,
      queued,
      processing,
      active: queued + processing,
      completed,
      failed,
    };
  }, [jobs]);

  // Loads jobs + dead-letter queue together. Used for polling and after every action.
  const refreshAll = useCallback(async () => {
    try {
      const [jobsData, failedData] = await Promise.all([
        fetchJson<{ success: boolean; allJobs?: JobRecord[] }>("/jobs"),
        fetchJson<{ success: boolean; jobs?: FailedJob[] }>("/failed-jobs"),
      ]);
      const nextJobs = jobsData?.allJobs ?? [];

      setJobs(nextJobs);
      setFailedJobs(failedData?.jobs ?? []);
      // Keep the inspector in sync with the latest status of the job being viewed.
      setSelectedJob((prev) =>
        prev ? (nextJobs.find((job) => job._id === prev._id) ?? prev) : prev,
      );
      setConnectionError("");
      setLastUpdated(new Date());
    } catch (err) {
      setConnectionError(errorText(err, "Unable to load jobs"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load + polling. Statuses change in the background (worker), so the
    // dashboard refreshes itself instead of waiting for a manual refresh.
    const initial = setTimeout(() => void refreshAll(), 0);
    const interval = setInterval(() => void refreshAll(), POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refreshAll]);

  const beginAction = () => {
    setErrorMessage("");
    setStatusMessage("");
  };

  const handleTypeChange = (nextType: JobType) => {
    setJobType(nextType);
    setPayloadText(defaultPayloads[nextType]);
  };

  const handleCreateJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    beginAction();

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err) {
      setErrorMessage(`Payload is not valid JSON: ${errorText(err, "parse error")}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await fetchJson<{ success: boolean; mongoJob?: JobRecord }>(
        "/jobs",
        {
          method: "POST",
          body: JSON.stringify({ type: jobType, payload: parsedPayload }),
        },
      );

      setStatusMessage(`Created ${jobType} job successfully.`);
      setSelectedJobId(data.mongoJob?._id ?? "");
      setSelectedJob(data.mongoJob ?? null);
      setPayloadText(defaultPayloads[jobType]);
      await refreshAll();
    } catch (err) {
      setErrorMessage(errorText(err, "Unable to create job"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckJob = async () => {
    beginAction();
    const id = selectedJobId.trim();

    if (!id) {
      setErrorMessage("Enter a job ID to inspect.");
      return;
    }

    try {
      const data = await fetchJson<{ success: boolean; job?: JobRecord }>(
        `/jobs/${encodeURIComponent(id)}`,
      );
      setSelectedJob(data.job ?? null);
      setStatusMessage("Job details loaded.");
    } catch (err) {
      setErrorMessage(errorText(err, "Unable to fetch job"));
    }
  };

  const handleViewJob = (job: JobRecord) => {
    setSelectedJob(job);
    setSelectedJobId(job._id ?? "");
  };

  const handleDeleteJob = async (id: string) => {
    beginAction();
    try {
      await fetchJson(`/jobs/${id}`, { method: "DELETE" });
      setStatusMessage("Job deleted.");
      if (selectedJob?._id === id) {
        setSelectedJob(null);
      }
      await refreshAll();
    } catch (err) {
      setErrorMessage(errorText(err, "Unable to delete job"));
    }
  };

  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        "Delete ALL jobs from the queue, the dead-letter queue, and the database?",
      )
    ) {
      return;
    }

    beginAction();
    try {
      await fetchJson("/jobs", { method: "DELETE" });
      setStatusMessage("All jobs cleared from the queue and database.");
      setSelectedJob(null);
      await refreshAll();
    } catch (err) {
      setErrorMessage(errorText(err, "Unable to clear jobs"));
    }
  };

  const handleRetryFailed = async (dlqId: string) => {
    beginAction();
    try {
      await fetchJson(`/failed-jobs/${encodeURIComponent(dlqId)}/retry`, {
        method: "POST",
      });
      setStatusMessage("Failed job sent back to the queue.");
      await refreshAll();
    } catch (err) {
      setErrorMessage(errorText(err, "Unable to retry job"));
    }
  };

  const percent = (count: number) =>
    jobSummary.total ? (count / jobSummary.total) * 100 : 0;

  const stats = [
    {
      label: "Total jobs",
      value: jobSummary.total,
      dot: "var(--color-ink)",
      note: "",
    },
    {
      label: "Active",
      value: jobSummary.active,
      dot: "var(--color-queued)",
      note: `${jobSummary.queued} queued, ${jobSummary.processing} processing`,
    },
    {
      label: "Completed",
      value: jobSummary.completed,
      dot: "var(--color-completed)",
      note: "",
    },
    {
      label: "Failed",
      value: jobSummary.failed,
      dot: "var(--color-failed)",
      note: `${failedJobs.length} in the dead letter queue`,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg
            width="36"
            height="36"
            viewBox="0 0 32 32"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect width="32" height="32" rx="7" className="fill-accent" />
            <path
              d="M8 10h16M8 16h10M8 22h13"
              className="stroke-on-accent"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          <div>
            <h1 className="text-xl leading-tight font-semibold">TaskFlow</h1>
            <p className="text-sm text-muted">Background job control center</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p
            className={`status w-full sm:w-auto ${connectionError ? "status-failed" : lastUpdated ? "status-completed" : "status-cancelled"}`}
            aria-live="polite"
          >
            {connectionError
              ? "API unreachable"
              : lastUpdated
                ? `Live, updated ${formatClock(lastUpdated)}`
                : "Connecting"}
          </p>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="btn btn-secondary"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteAll()}
            className="btn btn-danger"
          >
            Clear all
          </button>
        </div>
      </header>

      {(statusMessage || errorMessage || connectionError) && (
        <div className="space-y-2">
          {connectionError ? (
            <div role="alert" className="notice border-l-processing">
              {connectionError} Retrying every {POLL_INTERVAL_MS / 1000}s.
            </div>
          ) : null}
          {statusMessage ? (
            <div role="status" className="notice border-l-completed">
              {statusMessage}
            </div>
          ) : null}
          {errorMessage ? (
            <div role="alert" className="notice border-l-failed">
              {errorMessage}
            </div>
          ) : null}
        </div>
      )}

      <section aria-label="Job summary" className="panel overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.label}
              className="bg-surface p-5"
              style={{ "--dot": item.dot } as React.CSSProperties}
            >
              <p className="stat-label">{item.label}</p>
              <span className="stat-value mt-2 block">{item.value}</span>
              {item.note ? (
                <p className="mt-1 text-xs text-muted">{item.note}</p>
              ) : null}
            </div>
          ))}
        </div>
        <div
          role="img"
          aria-label={`Job distribution: ${jobSummary.active} active, ${jobSummary.completed} completed, ${jobSummary.failed} failed`}
          className="flex h-2 bg-sunken"
        >
          <div
            className="bg-queued transition-[width] duration-500"
            style={{ width: `${percent(jobSummary.active)}%` }}
          />
          <div
            className="bg-completed transition-[width] duration-500"
            style={{ width: `${percent(jobSummary.completed)}%` }}
          />
          <div
            className="bg-failed transition-[width] duration-500"
            style={{ width: `${percent(jobSummary.failed)}%` }}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="panel p-5 sm:p-6">
          <h2 className="panel-title">Create new job</h2>

          <form className="mt-5 space-y-5" onSubmit={handleCreateJob}>
            <div>
              <span id="job-type-label" className="mb-2 block text-sm font-medium">
                Job type
              </span>
              <div
                role="group"
                aria-labelledby="job-type-label"
                className="segment-group"
              >
                {(["email", "pdf"] as JobType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="segment"
                    aria-pressed={jobType === type}
                    onClick={() => handleTypeChange(type)}
                  >
                    {type === "email" ? "Email" : "PDF"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="payload" className="mb-2 block text-sm font-medium">
                Payload JSON
              </label>
              <textarea
                id="payload"
                rows={10}
                spellCheck={false}
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                className="field font-mono leading-relaxed"
              />
              <p
                className={`mt-2 text-xs ${payloadError ? "text-failed" : "text-muted"}`}
              >
                {payloadError
                  ? `Not valid JSON yet: ${payloadError}`
                  : payloadHints[jobType]}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full"
            >
              {isSubmitting ? "Queueing..." : "Queue job"}
            </button>
          </form>
        </section>

        <section className="panel p-5 sm:p-6">
          <h2 className="panel-title">Job inspector</h2>

          <div className="mt-5 flex gap-2">
            <input
              type="text"
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              placeholder="Paste job id"
              aria-label="Job ID"
              spellCheck={false}
              className="field font-mono"
            />
            <button
              type="button"
              onClick={() => void handleCheckJob()}
              className="btn btn-secondary"
            >
              Inspect
            </button>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            {selectedJob ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted">ID</dt>
                  <dd className="id-text mt-0.5">{selectedJob._id}</dd>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <dt className="text-muted">Type</dt>
                    <dd className="mt-0.5 font-medium">
                      {typeLabel(selectedJob.type)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Status</dt>
                    <dd className="mt-0.5">
                      <StatusBadge status={selectedJob.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Attempts</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {selectedJob.retryCount ?? 0}
                    </dd>
                  </div>
                </div>
                <div>
                  <dt className="text-muted">Created</dt>
                  <dd className="mt-0.5">{formatTime(selectedJob.createdAt)}</dd>
                </div>

                {selectedJob.error ? (
                  <div className="rounded-md border border-failed/40 bg-failed/10 p-3 text-failed">
                    {selectedJob.error}
                  </div>
                ) : null}

                {selectedJob.pdfUrl ? (
                  <div>
                    <a
                      href={selectedJob.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      Open generated PDF
                    </a>
                  </div>
                ) : null}

                {selectedJob.payload ? (
                  <details>
                    <summary className="cursor-pointer text-muted">
                      Payload
                    </summary>
                    <pre className="id-text mt-2 max-h-48 overflow-auto rounded-md bg-sunken p-3 whitespace-pre-wrap">
                      {JSON.stringify(selectedJob.payload, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted">
                Choose View on a job below, or paste an ID above.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-6">
          <h2 className="panel-title">Job history</h2>
          <span className="text-sm text-muted">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"}, newest first
          </span>
        </div>

        {isLoading ? (
          <p className="px-5 py-8 text-sm text-muted sm:px-6">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted sm:px-6">
            No jobs yet. Queue one above and it will show up here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th className="hidden sm:table-cell">Attempts</th>
                  <th className="hidden sm:table-cell">Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={String(job._id ?? job.type)}>
                    <td>
                      <div className="font-medium">{typeLabel(job.type)}</div>
                      <JobId id={job._id} />
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="hidden tabular-nums sm:table-cell">
                      {job.retryCount ?? 0}
                    </td>
                    <td className="hidden whitespace-nowrap text-muted sm:table-cell">
                      {formatTime(job.createdAt)}
                    </td>
                    <td>
                      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <button
                          type="button"
                          onClick={() => handleViewJob(job)}
                          className="btn btn-secondary btn-sm"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteJob(String(job._id))}
                          className="btn btn-danger btn-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-6">
          <h2 className="panel-title">Dead letter queue</h2>
          <span className="text-sm text-muted">
            {failedJobs.length} {failedJobs.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {isLoading ? (
          <p className="px-5 py-8 text-sm text-muted sm:px-6">
            Loading failed jobs...
          </p>
        ) : failedJobs.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted sm:px-6">
            No failed jobs. Jobs land here after all 3 attempts fail.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Error</th>
                  <th className="hidden sm:table-cell">Failed at</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {failedJobs.map((job) => (
                  <tr key={String(job.dlqId ?? job.mongoJobId)}>
                    <td>
                      <div className="font-medium">
                        {typeLabel(job.originalType)}
                      </div>
                      <JobId id={job.mongoJobId} />
                    </td>
                    <td className="max-w-md text-failed">
                      {job.error ?? "Unknown error"}
                    </td>
                    <td className="hidden whitespace-nowrap text-muted sm:table-cell">
                      {formatTime(job.failedAt)}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleRetryFailed(String(job.dlqId))}
                          className="btn btn-secondary btn-sm"
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
