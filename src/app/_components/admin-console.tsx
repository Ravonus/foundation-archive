"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Play, Radar, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";

function numberOrUndefined(value: string) {
  return value.trim() ? Number(value.trim()) : undefined;
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-subtle)] focus:border-[var(--color-ink)]";

const labelClass =
  "block font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[var(--color-muted)]";

const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50";

const secondaryBtn =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-bg)] disabled:opacity-50";

const DEFAULT_STATUS =
  "Let the scrape run in the live board above, or use these fallback tools for a manual rescue.";

export function AdminConsole() {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [foundationUrl, setFoundationUrl] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [label, setLabel] = useState("");
  const [foundationContractType, setFoundationContractType] = useState("");
  const [startTokenId, setStartTokenId] = useState("");
  const [endTokenId, setEndTokenId] = useState("");
  const [fromBlock, setFromBlock] = useState("");
  const [toBlock, setToBlock] = useState("");

  const refresh = () =>
    startRefresh(() => {
      router.refresh();
    });

  const foundationMutation = api.archive.enqueueFoundationUrl.useMutation({
    onSuccess: () => {
      setFeedback("Foundation mint queued.");
      setFoundationUrl("");
      refresh();
    },
    onError: (error) => setFeedback(error.message),
  });

  const contractMutation = api.archive.enqueueContractScan.useMutation({
    onSuccess: () => {
      setFeedback("Contract scan queued.");
      setContractAddress("");
      setLabel("");
      setFoundationContractType("");
      setStartTokenId("");
      setEndTokenId("");
      setFromBlock("");
      setToBlock("");
      refresh();
    },
    onError: (error) => setFeedback(error.message),
  });

  const processQueueMutation = api.archive.processQueue.useMutation({
    onSuccess: (result) => {
      setFeedback(`Processed ${result.processed} queued job(s).`);
      refresh();
    },
    onError: (error) => setFeedback(error.message),
  });

  const submitFoundation = (event: React.FormEvent) => {
    event.preventDefault();
    foundationMutation.mutate({ url: foundationUrl });
  };

  const submitContract = (event: React.FormEvent) => {
    event.preventDefault();
    contractMutation.mutate({
      contractAddress,
      label: label.trim() || undefined,
      foundationContractType: foundationContractType.trim() || undefined,
      startTokenId: numberOrUndefined(startTokenId),
      endTokenId: numberOrUndefined(endTokenId),
      fromBlock: numberOrUndefined(fromBlock),
      toBlock: numberOrUndefined(toBlock),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-4">
        <FoundationForm
          url={foundationUrl}
          setUrl={setFoundationUrl}
          onSubmit={submitFoundation}
          pending={foundationMutation.isPending}
        />
        <ContractForm
          contractAddress={contractAddress}
          setContractAddress={setContractAddress}
          label={label}
          setLabel={setLabel}
          foundationContractType={foundationContractType}
          setFoundationContractType={setFoundationContractType}
          startTokenId={startTokenId}
          setStartTokenId={setStartTokenId}
          endTokenId={endTokenId}
          setEndTokenId={setEndTokenId}
          fromBlock={fromBlock}
          setFromBlock={setFromBlock}
          toBlock={toBlock}
          setToBlock={setToBlock}
          onSubmit={submitContract}
          pending={contractMutation.isPending}
        />
      </div>

      <aside className="space-y-4">
        <WorkerPanel
          onRun={() => processQueueMutation.mutate({ limit: 10 })}
          pending={processQueueMutation.isPending}
        />
        <StatusPanel feedback={feedback} isRefreshing={isRefreshing} />
      </aside>
    </div>
  );
}

function FoundationForm(props: {
  url: string;
  setUrl: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  pending: boolean;
}) {
  const { url, setUrl, onSubmit, pending } = props;
  return (
    <form
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
      onSubmit={onSubmit}
    >
      <SectionHeader
        title="Single-work rescue"
        description="Force a one-off Foundation work into the archive immediately."
      />
      <div className="mt-3 space-y-2">
        <label className="block">
          <span className={labelClass}>Mint URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://foundation.app/mint/eth/0x.../123"
            className={`${inputClass} mt-1.5`}
          />
        </label>
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Queue ingest
        </button>
      </div>
    </form>
  );
}

interface ContractFormProps {
  contractAddress: string;
  setContractAddress: (value: string) => void;
  label: string;
  setLabel: (value: string) => void;
  foundationContractType: string;
  setFoundationContractType: (value: string) => void;
  startTokenId: string;
  setStartTokenId: (value: string) => void;
  endTokenId: string;
  setEndTokenId: (value: string) => void;
  fromBlock: string;
  setFromBlock: (value: string) => void;
  toBlock: string;
  setToBlock: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  pending: boolean;
}

function ContractForm(props: ContractFormProps) {
  return (
    <form
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
      onSubmit={props.onSubmit}
    >
      <SectionHeader
        title="Contract import"
        description="Fallback for imported or edge-case contracts the auto-scraper hasn't picked up."
      />
      <ContractFields {...props} />
      <button
        type="submit"
        disabled={props.pending}
        className={`${secondaryBtn} mt-4`}
      >
        {props.pending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Radar className="h-3.5 w-3.5" />
        )}
        Queue contract scan
      </button>
    </form>
  );
}

function ContractFields(props: ContractFormProps) {
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={labelClass}>Contract address</span>
        <input
          value={props.contractAddress}
          onChange={(event) => props.setContractAddress(event.target.value)}
          placeholder="0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405"
          className={`${inputClass} mt-1.5 font-mono`}
        />
      </label>
      <TextField
        label="Label"
        value={props.label}
        onChange={props.setLabel}
        placeholder="Foundation legacy"
      />
      <TextField
        label="Contract type"
        value={props.foundationContractType}
        onChange={props.setFoundationContractType}
        placeholder="FND or FND_COLLECTION"
      />
      <TextField
        label="Start token"
        value={props.startTokenId}
        onChange={props.setStartTokenId}
        placeholder="0"
        numeric
      />
      <TextField
        label="End token"
        value={props.endTokenId}
        onChange={props.setEndTokenId}
        placeholder="500"
        numeric
      />
      <TextField
        label="From block"
        value={props.fromBlock}
        onChange={props.setFromBlock}
        placeholder="17000000"
        numeric
      />
      <TextField
        label="To block"
        value={props.toBlock}
        onChange={props.setToBlock}
        placeholder="latest (optional)"
        numeric
      />
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  const extra = props.numeric ? "tabular-nums" : "";
  return (
    <label>
      <span className={labelClass}>{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className={`${inputClass} mt-1.5 ${extra}`}
      />
    </label>
  );
}

function SectionHeader(props: { title: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-serif text-lg text-[var(--color-ink)]">
          {props.title}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {props.description}
        </p>
      </div>
      <span className="rounded-full bg-[var(--tint-muted)] px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Manual
      </span>
    </div>
  );
}

function WorkerPanel(props: { onRun: () => void; pending: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5">
      <h3 className="font-serif text-lg text-[var(--color-ink)]">Worker</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Start the worker and socket daemon on your server:
      </p>
      <div className="mt-3 space-y-1.5">
        <code className="block rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink)]">
          pnpm worker
        </code>
        <code className="block rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-ink)]">
          pnpm socket
        </code>
      </div>
      <button
        type="button"
        onClick={props.onRun}
        disabled={props.pending}
        className={`${secondaryBtn} mt-4 w-full justify-center`}
      >
        {props.pending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        Run one pass now
      </button>
    </div>
  );
}

function StatusPanel(props: { feedback: string | null; isRefreshing: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-4">
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Status
      </p>
      <p className="mt-1.5 text-sm text-[var(--color-body)]">
        {props.feedback ?? DEFAULT_STATUS}
      </p>
      {props.isRefreshing ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          Refreshing…
        </p>
      ) : null}
    </div>
  );
}
