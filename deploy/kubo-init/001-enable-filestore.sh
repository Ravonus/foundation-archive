#!/bin/sh
# Kubo's container-init.d hook — runs once per start, before the daemon.
# Enables the filestore experiment so `ipfs add --nocopy` is allowed and
# references files on disk (mounted from our cold/hot archive volumes)
# instead of duplicating bytes into kubo's blockstore.
set -eu

ipfs config --json Experimental.FilestoreEnabled true
