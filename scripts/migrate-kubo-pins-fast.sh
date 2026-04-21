#!/usr/bin/env bash
# Host-side drain of the cold-storage file-tree into kubo's blockstore.
# Designed to run in its own screen session on the production node, NOT
# as a container — that was the old approach and it was pathologically
# slow because every file had to stream NAS -> migrator -> kubo -> NAS
# over the docker network. Here `ipfs add` runs inside the kubo
# container via `docker exec`, so bytes never leave kubo's own NAS mount.
#
# Per-CID work collapses into a single docker exec that:
#   1. Skips if the file-tree dir is missing.
#   2. Fast-paths if the CID is already pinned (just rm the dir).
#   3. Otherwise runs `ipfs add --pin=true -r -Q` and compares the
#      produced CID to the stored one.
#      - Match: rm the file-tree copy.
#      - Mismatch: pin rm the bogus CID, leave the file-tree alone (it's
#        a partial directory that hydration hasn't filled in yet).
#
# Run on the node (under screen so it survives ssh disconnect):
#   screen -dmS migrateKuboPins /home/ravonus/foundation-archive/scripts/migrate-kubo-pins-fast.sh
# Monitor:
#   tail -f /home/ravonus/migrate-kubo-pins.log
#
# Env knobs:
#   PARALLELISM  default 2  — keep modest; each worker runs `ipfs add`
#                             inside kubo which is CPU+NAS-heavy.
#   BATCH_SIZE   default 2000
#   COLD_ROOT    default /mnt/backups/foundation/ipfs
#   KUBO_NAME    default foundation-archive-kubo-1
#   PG_NAME      default foundation-archive-postgres-1
#   PG_USER      default foundation_archive
#   PG_DB        default foundation_archive
#   LOG_FILE     default /home/ravonus/migrate-kubo-pins.log
#   IDLE_SLEEP   default 120  — seconds to sleep when there's nothing to do.

set -u

PARALLELISM="${PARALLELISM:-2}"
BATCH_SIZE="${BATCH_SIZE:-2000}"
COLD_ROOT="${COLD_ROOT:-/mnt/backups/foundation/ipfs}"
KUBO_NAME="${KUBO_NAME:-foundation-archive-kubo-1}"
PG_NAME="${PG_NAME:-foundation-archive-postgres-1}"
PG_USER="${PG_USER:-foundation_archive}"
PG_DB="${PG_DB:-foundation_archive}"
LOG_FILE="${LOG_FILE:-/home/ravonus/migrate-kubo-pins.log}"
IDLE_SLEEP="${IDLE_SLEEP:-120}"

exec >>"${LOG_FILE}" 2>&1
echo "[$(date -Is)] starting: parallelism=${PARALLELISM} batch=${BATCH_SIZE}"

# Single-docker-exec-per-CID worker. Prints one result tag to stdout.
process_cid() {
  local cid="$1"
  local dir_path="${COLD_ROOT}/${cid}"

  # sh script runs INSIDE kubo so bytes never cross the docker bridge.
  local result
  result=$(docker exec "${KUBO_NAME}" sh -c "
    set -u
    dir=\"${dir_path}\"
    cid=\"${cid}\"

    if [ ! -d \"\${dir}\" ]; then
      echo MISSING
      exit 0
    fi

    # Already in kubo's pinset? just reclaim the file-tree copy.
    if ipfs pin ls --type=recursive -q \"\${cid}\" >/dev/null 2>&1; then
      rm -rf \"\${dir}\"
      echo ALREADY-PINNED
      exit 0
    fi

    got=\$(ipfs add --pin=true -r -Q \"\${dir}\" 2>/dev/null)
    if [ -z \"\${got}\" ]; then
      echo FAIL-ADD
      exit 0
    fi

    if [ \"\${got}\" = \"\${cid}\" ]; then
      rm -rf \"\${dir}\"
      echo PINNED
      exit 0
    fi

    # Local dir didn't reproduce the stored CID (partial directory).
    # Clean the stray pin kubo just created.
    ipfs pin rm \"\${got}\" >/dev/null 2>&1 || true
    echo \"SKIP-PARTIAL got=\${got}\"
  " 2>/dev/null | tail -1)

  printf '%s %s\n' "${result}" "${cid}"
}
export -f process_cid
export COLD_ROOT KUBO_NAME

iteration=0
while true; do
  iteration=$((iteration + 1))

  cids_tmp="$(mktemp)"
  # GROUP BY cid + ORDER BY MAX(lastDownloadedAt) avoids SELECT DISTINCT's
  # ORDER-BY-must-be-in-select-list rule. Newest-first so rows likely to
  # have intact cold-storage dirs (the recent downloads) get processed
  # before ancient legacy rows where the dir is long gone.
  docker exec "${PG_NAME}" psql -U "${PG_USER}" -t -A -d "${PG_DB}" -c \
    "SELECT cid FROM \"IpfsRoot\" WHERE \"backupStatus\"='DOWNLOADED' GROUP BY cid ORDER BY MAX(\"lastDownloadedAt\") DESC NULLS LAST LIMIT ${BATCH_SIZE};" \
    2>/dev/null | sed '/^$/d' > "${cids_tmp}"
  count=$(wc -l < "${cids_tmp}")

  if [ "${count}" -eq 0 ]; then
    echo "[$(date -Is)] nothing left — sleeping ${IDLE_SLEEP}s"
    rm -f "${cids_tmp}"
    sleep "${IDLE_SLEEP}"
    continue
  fi

  echo "[$(date -Is)] pass #${iteration}: ${count} CID(s) parallel=${PARALLELISM}"

  tmp_out="$(mktemp)"
  # xargs gives us N concurrent process_cid calls without pulling in
  # GNU parallel. -n 1 ensures one CID per invocation.
  <"${cids_tmp}" xargs -n 1 -P "${PARALLELISM}" -I {} bash -c 'process_cid "$@"' _ {} >"${tmp_out}"

  pinned=$(grep -c '^PINNED ' "${tmp_out}")
  already=$(grep -c '^ALREADY-PINNED ' "${tmp_out}")
  partial=$(grep -c '^SKIP-PARTIAL ' "${tmp_out}")
  missing=$(grep -c '^MISSING ' "${tmp_out}")
  failed=$(grep -c '^FAIL-ADD ' "${tmp_out}")

  echo "[$(date -Is)] pass #${iteration} done: pinned=${pinned} already-pinned=${already} partial=${partial} missing=${missing} failed=${failed}"

  # Surface a handful of the non-happy-path outcomes for context.
  grep -E '^(SKIP-PARTIAL|FAIL-)' "${tmp_out}" 2>/dev/null | head -3 || true

  rm -f "${cids_tmp}" "${tmp_out}"

  # If this pass did nothing actionable (no pins, no deletes), the DB
  # is either caught up to disk or stuck on partial dirs that need
  # hydration. Either way, back off before the next DB query.
  if [ "${pinned}" -eq 0 ] && [ "${already}" -eq 0 ]; then
    echo "[$(date -Is)] idle pass — sleeping ${IDLE_SLEEP}s"
    sleep "${IDLE_SLEEP}"
  fi
done
