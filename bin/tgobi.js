#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(packageRoot, "dist");

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

if (!existsSync(join(distDir, "index.html"))) {
  console.error("tgobi: built app not found. Run `npm run build:app` before using the CLI from source.");
  process.exit(1);
}

listen(args.port, args.host, args.portExplicit)
  .then(({ server, url }) => {
    console.log(`tgobi running at ${url}`);
    if (!args.noOpen) openBrowser(url);
    process.on("SIGINT", () => {
      server.close(() => process.exit(0));
    });
  })
  .catch((err) => {
    console.error(`tgobi: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: 8787,
    portExplicit: false,
    noOpen: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--no-open") out.noOpen = true;
    else if (arg === "--host") out.host = argv[++i] ?? out.host;
    else if (arg.startsWith("--host=")) out.host = arg.slice("--host=".length);
    else if (arg === "--port" || arg === "-p") {
      out.port = parsePort(argv[++i]);
      out.portExplicit = true;
    } else if (arg.startsWith("--port=")) {
      out.port = parsePort(arg.slice("--port=".length));
      out.portExplicit = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return out;
}

function parsePort(value) {
  const port = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${value}`);
  }
  return port;
}

async function listen(startPort, host, explicit) {
  let port = startPort;
  const lastPort = explicit ? startPort : startPort + 20;

  while (port <= lastPort) {
    const server = createServer(handleRequest);
    try {
      await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(port, host, () => {
          server.off("error", rejectListen);
          resolveListen();
        });
      });
      const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      return { server, url: `http://${displayHost}:${port}/` };
    } catch (err) {
      server.close();
      if (!explicit && err?.code === "EADDRINUSE") {
        port++;
        continue;
      }
      throw err;
    }
  }

  throw new Error(`no available port found from ${startPort} to ${lastPort}`);
}

function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", "http://tgobi.local");
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const fullPath = normalize(join(distDir, relative));

  if (!isWithinDist(fullPath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    serveFile(join(distDir, "index.html"), res);
    return;
  }

  serveFile(fullPath, res);
}

function isWithinDist(filePath) {
  const root = distDir.endsWith(sep) ? distDir : distDir + sep;
  return filePath === distDir || filePath.startsWith(root);
}

function serveFile(filePath, res) {
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(res);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".csv": return "text/csv; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}

function openBrowser(url) {
  const opener =
    process.platform === "darwin"
      ? { cmd: "open", args: [url] }
      : process.platform === "win32"
        ? { cmd: "cmd", args: ["/c", "start", "", url] }
        : { cmd: "xdg-open", args: [url] };
  const child = spawn(opener.cmd, opener.args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function printHelp() {
  console.log(`Usage: tgobi [options]

Options:
  -p, --port <port>   Port to listen on (default: 8787)
      --host <host>   Host to bind (default: 127.0.0.1)
      --no-open       Do not open a browser automatically
  -h, --help          Show this help message
`);
}
