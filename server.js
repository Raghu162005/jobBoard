// A small job board: a JSON API and one page. Run with `npm start`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { findJob, loadJobs, searchJobs } from "./lib/jobs.js";
import { defaultSavedPath, loadSavedIds, removeJobId, saveJobId } from "./lib/saved.js";

const PORT = Number(process.env.PORT ?? 3000);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function createApp({ savedPath = defaultSavedPath } = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/jobs") {
        const jobs = await loadJobs();
        return sendJson(res, 200, searchJobs(jobs, url.searchParams.get("q")));
      }
      if (req.method === "GET" && url.pathname === "/api/saved") {
        const [jobs, ids] = await Promise.all([loadJobs(), loadSavedIds(savedPath)]);
        return sendJson(res, 200, ids.map((id) => findJob(jobs, id)).filter(Boolean));
      }
      if (req.method === "POST" && url.pathname === "/api/saved") {
        let body;
        try {
          body = await readJson(req);
        } catch {
          return sendJson(res, 400, { error: "Request body must be valid JSON" });
        }
        const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
        if (!jobId) return sendJson(res, 400, { error: "jobId is required" });
        const job = findJob(await loadJobs(), jobId);
        if (!job) return sendJson(res, 404, { error: `Unknown job id: ${jobId}` });
        const added = await saveJobId(savedPath, jobId);
        return sendJson(res, 200, { job, alreadySaved: !added });
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/api/saved/")) {
        let jobId;
        try {
          jobId = decodeURIComponent(url.pathname.slice("/api/saved/".length));
        } catch {
          return sendJson(res, 400, { error: "Invalid job id" });
        }
        const job = findJob(await loadJobs(), jobId);
        if (!job) return sendJson(res, 404, { error: `Unknown job id: ${jobId}` });
        if (!(await removeJobId(savedPath, jobId))) {
          return sendJson(res, 404, { error: `Job ${jobId} is not saved` });
        }
        return sendJson(res, 200, { jobId, removed: true });
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
        const file = url.pathname === "/" ? "index.html" : "app.js";
        const type = file.endsWith(".html") ? "text/html" : "text/javascript";
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
        return res.end(body);
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Something went wrong" });
    }
  });
}

// Started directly (npm start), not imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(PORT, () => console.log(`Job board on http://localhost:${PORT}`));
}
