#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${1:-$ROOT/docs/erd}"
PORT="${2:-8090}"

[ -f "$DIR/index.html" ] || {
  echo "SchemaSpy output not found: $DIR/index.html" >&2
  exit 1
}
case "$PORT" in
  *[!0-9]*|'') echo "Port must be a number: $PORT" >&2; exit 2 ;;
esac

exec node - "$DIR" "$PORT" <<'NODE'
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3]);
const types = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(file, (statError, stats) => {
    const target = !statError && stats.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(target, (readError, content) => {
      if (readError) {
        response.writeHead(readError.code === "ENOENT" ? 404 : 500);
        response.end(readError.code === "ENOENT" ? "Not found" : "Internal server error");
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      });
      response.end(content);
    });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
NODE
