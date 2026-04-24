#!/bin/sh
# Keep blocks on the NAS (flatfs, CIFS-safe) but move kubo's LevelDB
# pin-metadata onto a small local docker volume. LevelDB is NOT
# reliable over CIFS — we've seen "checksum mismatch / corruption on
# data-block" from it, which takes down every pin operation and the
# web /ipfs proxy with it.
#
# Approach: rewrite Datastore.Spec.mounts so the levelds child has an
# ABSOLUTE `path` that points outside $IPFS_PATH. Can't use a symlink
# because CIFS doesn't support POSIX symlinks at this mount's options.
#
# Idempotent by design — runs on every kubo start, short-circuits if
# config already points at the local path.
set -eu

LOCAL_DATASTORE="/data/kubo-metadata/datastore"
REPO="${IPFS_PATH:-/data/ipfs}"

mkdir -p "${LOCAL_DATASTORE}"

# Skip if already pointing at the local path.
if ipfs config Datastore.Spec.mounts 2>/dev/null | grep -q "\"path\": \"${LOCAL_DATASTORE}\""; then
  echo "[kubo-init] datastore already at ${LOCAL_DATASTORE}; skipping"
  exit 0
fi

# If an old datastore dir is sitting on the NAS, copy its contents to
# the local path (best-effort — tar may partially succeed on a CIFS
# mount with open file handles, and that's fine because leveldb will
# re-initialize on first use).
if [ -d "${REPO}/datastore" ] && [ ! -L "${REPO}/datastore" ]; then
  if [ -n "$(ls -A "${REPO}/datastore" 2>/dev/null || true)" ]; then
    echo "[kubo-init] copying existing datastore -> ${LOCAL_DATASTORE}"
    (cd "${REPO}/datastore" && tar -cf - . 2>/dev/null) \
      | (cd "${LOCAL_DATASTORE}" && tar -xf - 2>/dev/null) || true
  fi
  # Attempt to clear the NAS-resident dir — it's fine if this fails,
  # kubo won't read it once the config below redirects the path.
  rm -rf "${REPO}/datastore" 2>/dev/null || true
fi

# Rewrite the mounts spec: blocks stay as a relative flatfs path
# (resolves under $IPFS_PATH/blocks on the NAS), datastore becomes
# absolute pointing at the local volume.
ipfs config --json Datastore.Spec.mounts "[
  {
    \"mountpoint\": \"/blocks\",
    \"prefix\": \"flatfs.datastore\",
    \"type\": \"measure\",
    \"child\": {
      \"type\": \"flatfs\",
      \"path\": \"blocks\",
      \"sync\": true,
      \"shardFunc\": \"/repo/flatfs/shard/v1/next-to-last/2\"
    }
  },
  {
    \"mountpoint\": \"/\",
    \"prefix\": \"leveldb.datastore\",
    \"type\": \"measure\",
    \"child\": {
      \"type\": \"levelds\",
      \"path\": \"${LOCAL_DATASTORE}\",
      \"compression\": \"none\"
    }
  }
]"

echo "[kubo-init] datastore now points at ${LOCAL_DATASTORE} (absolute path, CIFS-free)"
