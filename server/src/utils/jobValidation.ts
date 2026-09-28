export const VALID_JOB_TYPES = ["email", "pdf"] as const;

export type JobType = (typeof VALID_JOB_TYPES)[number];

export type ValidatedJobInput = {
  ok: true;
  type: JobType;
  payload: Record<string, unknown>;
};

export type InvalidJobInput = {
  ok: false;
  message: string;
};

export const validateJobInput = (
  type: unknown,
  payload: unknown,
): ValidatedJobInput | InvalidJobInput => {
  if (typeof type !== "string" || !VALID_JOB_TYPES.includes(type as JobType)) {
    return {
      ok: false,
      message: "Invalid job type. Supported types: email, pdf.",
    };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      message: "Job payload must be a non-array object.",
    };
  }

  const jobPayload = payload as Record<string, unknown>;

  switch (type) {
    case "email": {
      if (
        typeof jobPayload.to !== "string" ||
        typeof jobPayload.subject !== "string" ||
        typeof jobPayload.message !== "string"
      ) {
        return {
          ok: false,
          message: "Email jobs require to, subject, and message fields.",
        };
      }
      break;
    }

    case "pdf": {
      if (typeof jobPayload.content !== "string" || !jobPayload.content.trim()) {
        return {
          ok: false,
          message: "PDF jobs require a non-empty content field.",
        };
      }
      break;
    }

    default:
      return {
        ok: false,
        message: "Unsupported job type.",
      };
  }

  return {
    ok: true,
    type: type as JobType,
    payload: jobPayload,
  };
};
