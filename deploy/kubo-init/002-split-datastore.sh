#!/bin/sh
# Keeps blocks on the NAS (bulk) but moves kubo's LevelDB pin-metadata
# to a small local Docker volume. LevelDB is not reliable over CIFS —
# we've now seen at least one "checksum mismatch" corruption that took
# down every pin operation. Blocks (flatfs, one file per block) are
# fine on CIFS because each write is atomic.
#
# Runs via the /container-init.d hook, so it fires on every start —
# idempotent by design.
set -eu

REPO="${IPFS_PATH:-/data/ipfs}"
LOCAL_DATASTORE="/data/kubo-metadata/datastore"

mkdir -p "${LOCAL_DATASTORE}"
chown -R "$(id -u)":"$(id -g)" /data/kubo-metadata 2>/dev/null || true

if [ -L "${REPO}/datastore" ]; then
  echo "[kubo-init] datastore already symlinked to $(readlink "${REPO}/datastore")"
  exit 0
fi

if [ -d "${REPO}/datastore" ]; then
  # First run with the split layout. Move any existing contents over,
  # then replace the in-repo dir with the symlink. We don't care about
  # preserving leveldb content when it's clearly empty/corrupt, but
  # rsync is the safe default.
  if [ -n "$(ls -A "${REPO}/datastore" 2>/dev/null || true)" ]; then
    echo "[kubo-init] migrating existing datastore contents to ${LOCAL_DATASTORE}"
    # busybox-compatible copy
    (cd "${REPO}/datastore" && tar -cf - . 2>/dev/null) | (cd "${LOCAL_DATASTORE}" && tar -xf - 2>/dev/null) || true
  fi
  rm -rf "${REPO}/datastore"
fi

ln -s "${LOCAL_DATASTORE}" "${REPO}/datastore"
echo "[kubo-init] datastore now -> ${LOCAL_DATASTORE} (local disk, off CIFS)"
