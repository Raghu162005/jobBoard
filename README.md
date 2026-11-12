# Job board starter

A small job board for an insiderOne work sample. It is made up: the jobs and
companies are not real.

## What was built

Saved jobs are implemented across the server, the page and the tests:

- Every job card has a **Save** button.
- The same page has a **Saved jobs** list with a **Remove** button on each job.
- Saving a job twice keeps only one copy. Saving an unknown job id returns a
  clear `404` error instead of crashing the server.
- Saved jobs are written to `saved.json` on the server, so they survive page
  reloads and server restarts. No database is needed.

The API is:

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/saved` | Returns the saved jobs, in the order they were saved. |
| `POST` | `/api/saved` | Saves a job from `{ "jobId": "j2" }`. A duplicate returns `200` with `alreadySaved: true`. |
| `DELETE` | `/api/saved/:jobId` | Removes a saved job. |

Unknown job ids, a missing `jobId`, and invalid JSON all return clear `4xx`
errors.

## Run the application

You need Node 20 or newer. There are no packages to install.

```
npm start
```

Then open <http://localhost:3000>. The `saved.json` file is created on the first
save.

## Run the tests

```
npm test
```

This runs the tests in `test/` with Node's built-in test runner. The tests cover
the original job search plus saving, duplicate prevention, simultaneous saves,
listing, removing, unknown ids, invalid requests, and persistence across a real
server restart.

## What is here

- `server.js`: the web server and the jobs/saved APIs.
- `lib/jobs.js`: reading and searching the jobs. Pure functions.
- `lib/saved.js`: reading, adding and removing saved job ids.
- `jobs.json`: the jobs.
- `saved.json`: the saved job ids. It is created on the first save.
- `public/`: the page and its script.
- `test/`: tests, using Node's built-in test runner.

## Implementation decision

`saved.json` stores only job ids, and `GET /api/saved` joins those ids against
`jobs.json`. I chose this over storing full copies of the jobs so the saved list
never shows stale job details, the saved file stays small, and an unknown id can
be rejected at save time with a clear `404`.

Saves and removals for the same file are queued inside the server process, so
two simultaneous requests cannot both read the old list and overwrite each
other's change. This keeps the code simple while avoiding duplicate or lost ids
in normal use.

## What could be improved next

- Add users and per-user saved lists, since the current file is shared by every
  visitor.
- Replace the JSON file with a database, or add cross-process file locking when
  running more than one server instance.
- Add browser-level tests for the Save/Remove UI and an optimistic UI that does
  not wait for a full refresh.
- Add an undo action after removing a saved job.
