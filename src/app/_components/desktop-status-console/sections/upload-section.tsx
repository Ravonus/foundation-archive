"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  FileUp,
  FolderUp,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type {
  RelayOwnerDevice,
  UploadFilesInput,
  UploadFilesResult,
} from "~/app/_components/desktop-bridge-provider";
import { formatBytes } from "~/lib/utils";

type UploadSectionProps = {
  reachable: boolean;
  selectedDevice: RelayOwnerDevice | null;
  uploadFiles: (input: UploadFilesInput) => Promise<UploadFilesResult>;
  onUploaded: (result: UploadFilesResult) => void;
  setFeedback: (message: string | null) => void;
};

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; loaded: number; total: number }
  | { kind: "success"; result: UploadFilesResult }
  | { kind: "error"; message: string };

function resolveRelativePath(file: File) {
  return file.webkitRelativePath.length > 0
    ? file.webkitRelativePath
    : file.name;
}

function totalSize(files: File[]) {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function describeFiles(files: File[]) {
  if (files.length === 0) return "";
  const first = files[0];
  if (!first) return "";
  if (files.length === 1) return resolveRelativePath(first);

  const firstRelative = first.webkitRelativePath;
  const folderRoot = firstRelative.length > 0 ? firstRelative.split("/")[0] : null;
  const prefix = folderRoot ? `${folderRoot}/` : null;
  const allInsideFolder =
    prefix !== null &&
    files.every((file) => file.webkitRelativePath.startsWith(prefix));

  if (allInsideFolder) {
    return `${prefix} · ${files.length} files`;
  }
  return `${files.length} files`;
}

function LockedNotice({
  selectedDevice,
}: {
  selectedDevice: RelayOwnerDevice | null;
}) {
  const deviceLabel = selectedDevice?.deviceLabel ?? "the linked desktop app";
  return (
    <div className="rounded-[1.6rem] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-alt)] px-5 py-6 text-sm text-[var(--color-muted)]">
      <p className="text-[var(--color-ink)]">
        Uploads only work from the computer running the desktop app.
      </p>
      <p className="mt-2">
        {selectedDevice
          ? `Open this page on ${deviceLabel} to upload files directly — nothing travels through the archive server.`
          : "Connect the desktop app on this computer to upload files from here."}
      </p>
    </div>
  );
}

function FileListRow({
  file,
  index,
  disabled,
  onRemove,
}: {
  file: File;
  index: number;
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="truncate font-mono">{resolveRelativePath(file)}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-[var(--color-muted)]">
          {formatBytes(file.size)}
        </span>
        <button
          type="button"
          aria-label={`Remove ${file.name}`}
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-55"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </span>
    </li>
  );
}

function FileList({
  files,
  disabled,
  onRemove,
  onClear,
}: {
  files: File[];
  disabled: boolean;
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-ink)]">
          {describeFiles(files)}{" "}
          <span className="text-[var(--color-muted)]">
            · {formatBytes(totalSize(files))}
          </span>
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-55"
        >
          Clear
        </button>
      </div>
      <ul className="mt-3 max-h-40 overflow-y-auto text-xs text-[var(--color-body)]">
        {files.slice(0, 24).map((file, index) => (
          <FileListRow
            key={`${resolveRelativePath(file)}-${index}`}
            file={file}
            index={index}
            disabled={disabled}
            onRemove={onRemove}
          />
        ))}
        {files.length > 24 ? (
          <li className="pt-1 text-[var(--color-muted)]">
            …and {files.length - 24} more
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ProgressBar({ loaded, total }: { loaded: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  return (
    <div className="rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3">
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>Uploading…</span>
        <span>
          {formatBytes(loaded)} / {formatBytes(total)} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
        <motion.div
          className="h-full bg-[var(--color-ink)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function SuccessCard({ result }: { result: UploadFilesResult }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.4rem] border border-[var(--color-line)] bg-[var(--tint-ok)] px-4 py-3 text-sm text-[var(--color-ok)]">
      <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">
          Pinned {result.file_count} file{result.file_count === 1 ? "" : "s"} ·{" "}
          {formatBytes(result.total_bytes)}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-[var(--color-body)]">
          {result.root_cid}
        </p>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[var(--color-err)]/40 bg-[var(--tint-err)] px-4 py-3 text-sm text-[var(--color-err)]">
      {message}
    </div>
  );
}

function UploadHeader() {
  return (
    <p className="font-mono text-[0.68rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
      Upload
    </p>
  );
}

function DropZone({
  dragActive,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onPickFiles,
  onPickFolder,
  disabled,
  fileInputRef,
  dirInputRef,
  addFiles,
}: {
  dragActive: boolean;
  onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onPickFiles: () => void;
  onPickFolder: () => void;
  disabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  dirInputRef: React.RefObject<HTMLInputElement | null>;
  addFiles: (files: File[]) => void;
}) {
  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center rounded-[1.6rem] border border-dashed px-6 py-10 text-center transition ${
        dragActive
          ? "border-[var(--color-ink)] bg-[var(--color-surface-alt)]"
          : "border-[var(--color-line)] bg-[var(--color-surface-alt)]/60"
      }`}
    >
      <Upload aria-hidden className="h-6 w-6 text-[var(--color-muted)]" />
      <p className="mt-3 text-sm text-[var(--color-ink)]">
        Drop files or a folder here
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Or pick them with the buttons below
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onPickFiles}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
        >
          <FileUp aria-hidden className="h-4 w-4" />
          Choose files
        </button>
        <button
          type="button"
          onClick={onPickFolder}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-body)] disabled:opacity-55"
        >
          <FolderUp aria-hidden className="h-4 w-4" />
          Choose folder
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          addFiles(picked);
          event.target.value = "";
        }}
      />
      <input
        ref={dirInputRef}
        type="file"
        hidden
        multiple
        // @ts-expect-error — webkitdirectory isn't in the standard DOM types
        webkitdirectory=""
        directory=""
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          addFiles(picked);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function UploadStatus({ uploadState }: { uploadState: UploadState }) {
  const reduceMotion = useReducedMotion();
  const anim = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: reduceMotion ? 0 : 0.18 },
  } as const;

  return (
    <AnimatePresence mode="popLayout">
      {uploadState.kind === "uploading" ? (
        <motion.div key="uploading" {...anim}>
          <ProgressBar
            loaded={uploadState.loaded}
            total={uploadState.total}
          />
        </motion.div>
      ) : null}
      {uploadState.kind === "success" ? (
        <motion.div key="success" {...anim}>
          <SuccessCard result={uploadState.result} />
        </motion.div>
      ) : null}
      {uploadState.kind === "error" ? (
        <motion.div key="error" {...anim}>
          <ErrorCard message={uploadState.message} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function LabelInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm text-[var(--color-body)]">
        Label (optional)
      </span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. My rescue archive"
        disabled={disabled}
        className="w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-ink)] outline-none disabled:opacity-55"
      />
    </label>
  );
}

function UploadButton({
  count,
  isUploading,
  onClick,
}: {
  count: number;
  isUploading: boolean;
  onClick: () => void;
}) {
  const label = isUploading
    ? "Uploading…"
    : count === 0
      ? "Upload"
      : `Upload ${count} file${count === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0 || isUploading}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-bg)] disabled:opacity-55"
    >
      {isUploading ? (
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        <Upload aria-hidden className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

function useUploadController({
  uploadFiles,
  onUploaded,
  setFeedback,
}: Pick<UploadSectionProps, "uploadFiles" | "onUploaded" | "setFeedback">) {
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((current) => [...current, ...incoming]);
    setUploadState({ kind: "idle" });
  }, []);

  const submit = useCallback(async () => {
    if (files.length === 0 || uploadState.kind === "uploading") return;

    const total = totalSize(files);
    setUploadState({ kind: "uploading", loaded: 0, total });
    setFeedback(null);

    try {
      const result = await uploadFiles({
        files,
        label: label.trim().length > 0 ? label.trim() : null,
        onProgress: (loaded, progressTotal) => {
          setUploadState({
            kind: "uploading",
            loaded,
            total: progressTotal || total,
          });
        },
      });
      setUploadState({ kind: "success", result });
      setFiles([]);
      setLabel("");
      onUploaded(result);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Upload failed. Please try again.";
      setUploadState({ kind: "error", message });
    }
  }, [files, label, onUploaded, setFeedback, uploadFiles, uploadState.kind]);

  return {
    files,
    setFiles,
    label,
    setLabel,
    uploadState,
    addFiles,
    submit,
  };
}

function UploadSectionLocked({
  selectedDevice,
}: {
  selectedDevice: RelayOwnerDevice | null;
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <UploadHeader />
      <div className="mt-3">
        <LockedNotice selectedDevice={selectedDevice} />
      </div>
    </section>
  );
}

export function UploadSection({
  reachable,
  selectedDevice,
  uploadFiles,
  onUploaded,
  setFeedback,
}: UploadSectionProps) {
  const controller = useUploadController({
    uploadFiles,
    onUploaded,
    setFeedback,
  });
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const labelInputId = useId();

  const isUploading = controller.uploadState.kind === "uploading";

  if (!reachable) {
    return <UploadSectionLocked selectedDevice={selectedDevice} />;
  }

  return (
    <section className="rounded-[2rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
      <UploadHeader />

      <div className="mt-3 space-y-4">
        <DropZone
          dragActive={dragActive}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            controller.addFiles(Array.from(event.dataTransfer.files));
          }}
          onPickFiles={() => fileInputRef.current?.click()}
          onPickFolder={() => dirInputRef.current?.click()}
          disabled={isUploading}
          fileInputRef={fileInputRef}
          dirInputRef={dirInputRef}
          addFiles={controller.addFiles}
        />

        <FileList
          files={controller.files}
          disabled={isUploading}
          onRemove={(index) =>
            controller.setFiles((current) =>
              current.filter((_, idx) => idx !== index),
            )
          }
          onClear={() => controller.setFiles([])}
        />

        {controller.files.length > 0 ? (
          <LabelInput
            id={labelInputId}
            value={controller.label}
            disabled={isUploading}
            onChange={controller.setLabel}
          />
        ) : null}

        <UploadStatus uploadState={controller.uploadState} />

        <div className="flex flex-wrap gap-2">
          <UploadButton
            count={controller.files.length}
            isUploading={isUploading}
            onClick={() => void controller.submit()}
          />
        </div>
      </div>
    </section>
  );
}
