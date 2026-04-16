import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, "functions/.env");

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (key && !(key in process.env)) {
    process.env[key] = value;
  }
}

const functionModule = await import(
  pathToFileURL(resolve(projectRoot, "netlify/functions/send-transactional-mail.mjs")).href
);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1:3001");

  if (url.pathname !== "/.netlify/functions/send-transactional-mail") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found." }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });

  try {
    const response = await functionModule.default(request);
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error?.message || "Local mail server error." }));
  }
});

server.listen(3001, "127.0.0.1", () => {
  console.log("Local mail server ready on http://127.0.0.1:3001");
});
