import { useEffect, useMemo, useState } from "react";

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
  originalId?: string;
  mongoJobId?: string;
  error?: string;
};

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
      title: "Monthly Executive Summary",
      content:
        "Customer activity trends, operational health, and key business milestones.",
    },
    null,
    2,
  ),
};

const statusClasses: Record<string, string> = {
  queued: "bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30",
  processing: "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30",
  completed: "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30",
  failed: "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30",
  cancelled: "bg-slate-500/10 text-slate-300 ring-1 ring-slate-500/30",
};

const toneClasses: Record<string, string> = {
  violet: "bg-violet-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
};

async function fetchJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
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
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);

  const jobSummary = useMemo(() => {
    const active = jobs.filter((job) =>
      ["queued", "processing"].includes(job.status ?? ""),
    ).length;
    const completed = jobs.filter((job) => job.status === "completed").length;
    const failed = jobs.filter((job) => job.status === "failed").length;

    return { total: jobs.length, active, completed, failed };
  }, [jobs]);

  const loadJobs = async () => {
    try {
      const data = await fetchJson<{ success: boolean; allJobs?: JobRecord[] }>(
        "/jobs",
      );
      setJobs(data?.allJobs ?? []);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to load jobs",
      );
    }
  };

  const loadFailedJobs = async () => {
    try {
      const data = await fetchJson<{ success: boolean; jobs?: FailedJob[] }>(
        "/failed-jobs",
      );
      setFailedJobs(data?.jobs ?? []);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to load failed jobs",
      );
    }
  };

  useEffect(() => {
    void loadJobs();
    void loadFailedJobs();
  }, []);

  const handleTypeChange = (nextType: JobType) => {
    setJobType(nextType);
    setPayloadText(defaultPayloads[nextType]);
  };

  const handleCreateJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    try {
      const parsedPayload = JSON.parse(payloadText);
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
      await loadJobs();
      await loadFailedJobs();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Invalid JSON payload",
      );
    }
  };

  const handleCheckJob = async () => {
    if (!selectedJobId.trim()) {
      setErrorMessage("Enter a job ID to inspect.");
      return;
    }

    try {
      const data = await fetchJson<{ success: boolean; job?: JobRecord }>(
        `/jobs/${selectedJobId}`,
      );
      setSelectedJob(data.job ?? null);
      setStatusMessage("Job details loaded.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to fetch job",
      );
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await fetchJson(`/jobs/${id}`, { method: "DELETE" });
      setStatusMessage("Job deleted.");
      await loadJobs();
      if (selectedJob?._id === id) {
        setSelectedJob(null);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to delete job",
      );
    }
  };

  const handleDeleteAll = async () => {
    try {
      await fetchJson("/jobs", { method: "DELETE" });
      setStatusMessage("All jobs cleared from the queue and database.");
      await loadJobs();
      await loadFailedJobs();
      setSelectedJob(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to clear jobs",
      );
    }
  };

  const handleRetryFailed = async (id: string) => {
    try {
      await fetchJson(`/failed-jobs/${id}/retry`, { method: "POST" });
      setStatusMessage("Failed job sent back to the queue.");
      await loadJobs();
      await loadFailedJobs();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to retry job",
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              TaskFlow
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Background job control center
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadJobs()}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-violet-400/60 hover:bg-violet-500/10"
            >
              Refresh jobs
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400"
            >
              Clear all
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total jobs", value: jobSummary.total, tone: "violet" },
            { label: "Active", value: jobSummary.active, tone: "sky" },
            {
              label: "Completed",
              value: jobSummary.completed,
              tone: "emerald",
            },
            { label: "Failed", value: failedJobs.length, tone: "rose" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-linear-to from-slate-900 to-slate-800 p-5 shadow-lg shadow-slate-950/30"
            >
              <p className="text-sm text-slate-300">{item.label}</p>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-3xl font-bold text-white">
                  {item.value}
                </span>
                <span
                  className={`inline-flex h-3 w-3 rounded-full ring-2 ring-white/10 ${toneClasses[item.tone as keyof typeof toneClasses] ?? "bg-slate-500"}`}
                  aria-label={`${item.label} tone`}
                  title={item.tone}
                />
              </div>
            </div>
          ))}
        </section>

        <section className="mb-8 grid gap-6 xl:grid-cols-[1.5fr_0.95fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/30">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Create new job
              </h2>
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                Async queue
              </span>
            </div>

            <form className="space-y-5" onSubmit={handleCreateJob}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Job type
                </label>
                <select
                  value={jobType}
                  onChange={(event) =>
                    handleTypeChange(event.target.value as JobType)
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-slate-50 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
                >
                  <option value="email">Email</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Payload JSON
                </label>
                <textarea
                  rows={14}
                  value={payloadText}
                  onChange={(event) => setPayloadText(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-linear-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110"
              >
                Queue job
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/30">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Job inspector
              </h2>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Lookup
              </span>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                placeholder="Paste job id"
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-50 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
              />
              <button
                type="button"
                onClick={() => void handleCheckJob()}
                className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20"
              >
                Inspect
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              {selectedJob ? (
                <div className="space-y-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">ID</span>
                    <span className="truncate font-medium text-slate-50">
                      {selectedJob._id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Type</span>
                    <span className="font-medium text-slate-50">
                      {selectedJob.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Status</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[selectedJob.status ?? "queued"] ?? statusClasses.queued}`}
                    >
                      {selectedJob.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Retries</span>
                    <span className="font-medium text-slate-50">
                      {selectedJob.retryCount ?? 0}
                    </span>
                  </div>

                  {selectedJob.pdfUrl ? (
                    <a
                      href={selectedJob.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      Open generated PDF
                    </a>
                  ) : null}

                  {selectedJob.error ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
                      {selectedJob.error}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No job selected yet.</p>
              )}
            </div>
          </div>
        </section>

        {(statusMessage || errorMessage) && (
          <div className="mb-8 space-y-3">
            {statusMessage ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {statusMessage}
              </div>
            ) : null}
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}
          </div>
        )}

        <section className="mb-8 rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/30">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-white">
              Job history
            </h2>
            <span className="text-sm text-slate-400">
              {jobs.length} total records
            </span>
          </div>

          {jobs.length === 0 ? (
            <p className="text-slate-400">No jobs available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-3 pr-4 font-medium">ID</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Retry</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {jobs.map((job) => (
                    <tr
                      key={String(job._id ?? job.type)}
                      className="align-middle"
                    >
                      <td className="py-3 pr-4 font-mono text-xs text-slate-300">
                        {job._id}
                      </td>
                      <td className="py-3 pr-4 capitalize text-slate-100">
                        {job.type}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[job.status ?? "queued"] ?? statusClasses.queued}`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-100">
                        {job.retryCount ?? 0}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedJob(job)}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-violet-400/60 hover:bg-violet-500/10"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDeleteJob(String(job._id))
                            }
                            className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-400"
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

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/30">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-white">
              Dead letter queue
            </h2>
            <span className="text-sm text-slate-400">
              {failedJobs.length} failed records
            </span>
          </div>

          {failedJobs.length === 0 ? (
            <p className="text-slate-400">No failed jobs right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-3 pr-4 font-medium">Original ID</th>
                    <th className="pb-3 pr-4 font-medium">Mongo ID</th>
                    <th className="pb-3 pr-4 font-medium">Error</th>
                    <th className="pb-3 font-medium">Retry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {failedJobs.map((job) => (
                    <tr key={String(job.originalId ?? job.mongoJobId)}>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-300">
                        {job.originalId}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-300">
                        {job.mongoJobId}
                      </td>
                      <td className="py-3 pr-4 text-rose-200">
                        {job.error ?? "Unknown error"}
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() =>
                            void handleRetryFailed(String(job.originalId))
                          }
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
