import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.js";
import { loadSavedIds, removeJobId, saveJobId } from "../lib/saved.js";

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), "job-board-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function startServer(t, savedPath) {
  const server = createApp({ savedPath });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  let closed = false;
  const close = () =>
    new Promise((resolve) => {
      if (closed) return resolve();
      closed = true;
      server.close(resolve);
      server.closeAllConnections?.();
    });
  t.after(close);
  return { base: `http://127.0.0.1:${server.address().port}`, close };
}

async function request(base, path, options) {
  const res = await fetch(`${base}${path}`, options);
  const body = await res.json();
  return { status: res.status, body };
}

function postJob(base, jobId) {
  return request(base, "/api/saved", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
}

test("saved ids are kept across reads and saving twice keeps one copy", async (t) => {
  const path = join(await tempDir(t), "saved.json");

  assert.deepEqual(await loadSavedIds(path), []);
  assert.equal(await saveJobId(path, "j2"), true);
  assert.equal(await saveJobId(path, "j2"), false);
  assert.deepEqual(await loadSavedIds(path), ["j2"]);

  assert.equal(await removeJobId(path, "j2"), true);
  assert.equal(await removeJobId(path, "j2"), false);
  assert.deepEqual(await loadSavedIds(path), []);
});

test("saves a job, lists it once, and rejects unknown jobs clearly", async (t) => {
  const { base } = await startServer(t, join(await tempDir(t), "saved.json"));

  assert.deepEqual(await request(base, "/api/saved"), { status: 200, body: [] });

  const first = await postJob(base, "j2");
  assert.equal(first.status, 200);
  assert.equal(first.body.job.id, "j2");
  assert.equal(first.body.alreadySaved, false);

  const second = await postJob(base, "j2");
  assert.equal(second.status, 200);
  assert.equal(second.body.alreadySaved, true);

  const list = await request(base, "/api/saved");
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((job) => job.id), ["j2"]);

  const unknown = await postJob(base, "nope");
  assert.equal(unknown.status, 404);
  assert.match(unknown.body.error, /nope/);

  const missing = await request(base, "/api/saved", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /jobId/);

  const badJson = await request(base, "/api/saved", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(badJson.status, 400);

  // The errors above must not have broken the server.
  assert.equal((await request(base, "/api/saved")).body.length, 1);
});

test("removes a saved job and reports jobs that are not saved", async (t) => {
  const { base } = await startServer(t, join(await tempDir(t), "saved.json"));

  await postJob(base, "j2");
  await postJob(base, "j4");

  const removed = await request(base, "/api/saved/j2", { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.deepEqual((await request(base, "/api/saved")).body.map((job) => job.id), ["j4"]);

  const again = await request(base, "/api/saved/j2", { method: "DELETE" });
  assert.equal(again.status, 404);
  assert.match(again.body.error, /not saved/);

  const unknown = await request(base, "/api/saved/nope", { method: "DELETE" });
  assert.equal(unknown.status, 404);
  assert.match(unknown.body.error, /Unknown job id/);
});

test("saved jobs survive a real server restart", async (t) => {
  const savedPath = join(await tempDir(t), "saved.json");

  const first = await startServer(t, savedPath);
  await postJob(first.base, "j3");
  await first.close();

  const second = await startServer(t, savedPath);
  const list = await request(second.base, "/api/saved");
  assert.deepEqual(list.body.map((job) => job.id), ["j3"]);
});

test("simultaneous saves of the same and different jobs stay consistent", async (t) => {
  const path = join(await tempDir(t), "saved.json");
  const ids = ["j1", "j2", "j3", "j4", "j5", "j6", "j7", "j8"];

  const results = await Promise.all([
    ...ids.map((id) => saveJobId(path, id)),
    ...ids.map((id) => saveJobId(path, id)),
  ]);

  assert.equal(results.filter(Boolean).length, ids.length);
  assert.deepEqual([...(await loadSavedIds(path))].sort(), ids);
});
