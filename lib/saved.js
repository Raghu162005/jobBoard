// Saved jobs are stored as a JSON array of job ids, so they survive a restart.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultSavedPath = fileURLToPath(new URL("../saved.json", import.meta.url));

/** Read the saved ids. A missing file simply means nothing has been saved yet. */
export async function loadSavedIds(path = defaultSavedPath) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeSavedIds(path, ids) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ids, null, 2)}\n`, "utf8");
}

// Saves and removals for the same file run one at a time, so two requests
// cannot both read the old list and write over each other.
const writeQueues = new Map();

function serialize(path, task) {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tail = next.catch(() => {});
  writeQueues.set(path, tail);
  tail.finally(() => {
    if (writeQueues.get(path) === tail) writeQueues.delete(path);
  });
  return next;
}

/** Add an id if it is not already there. Returns true when a new id was added. */
export function saveJobId(path, jobId) {
  return serialize(path, async () => {
    const ids = await loadSavedIds(path);
    if (ids.includes(jobId)) return false;
    ids.push(jobId);
    await writeSavedIds(path, ids);
    return true;
  });
}

/** Remove an id. Returns true when it was actually saved before. */
export function removeJobId(path, jobId) {
  return serialize(path, async () => {
    const ids = await loadSavedIds(path);
    const next = ids.filter((id) => id !== jobId);
    if (next.length === ids.length) return false;
    await writeSavedIds(path, next);
    return true;
  });
}
