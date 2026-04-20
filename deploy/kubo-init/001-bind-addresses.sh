#!/bin/sh
# Runs on every kubo container start via the image's /container-init.d
# hook, before the daemon launches. Kubo's default init binds API and
# Gateway to 127.0.0.1 — fine for a laptop, useless inside docker where
# other services reach us by the container's own hostname. Rebind to
# 0.0.0.0 so worker/web can POST /api/v0/add at http://kubo:5001 and
# the Next /ipfs fallback can proxy to http://kubo:8080.
set -eu

ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
