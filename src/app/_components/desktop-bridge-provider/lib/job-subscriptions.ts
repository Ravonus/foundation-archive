export type JobUpdateEvent = {
  jobId: string;
  status: string;
  errorMessage: string | null;
  finishedAt: string | null;
};

type Handler = (event: JobUpdateEvent) => void;

const handlers = new Map<string, Set<Handler>>();

export function subscribeToJobUpdates(jobId: string, handler: Handler) {
  let set = handlers.get(jobId);
  if (!set) {
    set = new Set();
    handlers.set(jobId, set);
  }
  set.add(handler);
  return () => {
    const current = handlers.get(jobId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) handlers.delete(jobId);
  };
}

export function publishJobUpdate(event: JobUpdateEvent) {
  handlers.get(event.jobId)?.forEach((handle) => handle(event));
}

export function isTerminalJobStatus(status: string) {
  return status === "COMPLETED" || status === "FAILED";
}
