const list = document.getElementById("jobs");
const savedList = document.getElementById("saved");
const search = document.getElementById("search");

let latestRequest = 0;
let searchTimer;

function jobCard(job) {
  const li = document.createElement("li");
  li.className = "job-card";

  const info = document.createElement("div");
  info.className = "job-info";

  const title = document.createElement("h3");
  title.textContent = job.title;

  const meta = document.createElement("p");
  meta.className = "job-meta";
  meta.textContent = `${job.company} · ${job.location}`;

  const salary = document.createElement("p");
  salary.className = "job-salary";
  salary.textContent = `Rs ${job.stipend.toLocaleString("en-IN")} a month`;

  info.append(title, meta, salary);
  li.append(info);
  return li;
}

function addButton(parent, label, onClick) {
  const button = document.createElement("button");
  button.textContent = label;
  button.addEventListener("click", onClick);
  parent.append(button);
  return button;
}

function renderSaved(saved) {
  savedList.innerHTML = "";
  if (saved.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No saved jobs yet.";
    savedList.append(li);
    return;
  }
  for (const job of saved) {
    const li = jobCard(job);
    const button = addButton(li, "Remove", () => removeJob(job.id));
    button.classList.add("remove");
    savedList.append(li);
  }
}

function renderJobs(jobs, saved) {
  const savedIds = new Set(saved.map((job) => job.id));
  list.innerHTML = "";
  for (const job of jobs) {
    const li = jobCard(job);
    if (savedIds.has(job.id)) {
      const button = addButton(li, "Saved", () => {});
      button.disabled = true;
    } else {
      addButton(li, "Save", () => saveJob(job.id));
    }
    list.append(li);
  }
}

async function show(query = "") {
  clearTimeout(searchTimer);
  const request = ++latestRequest;
  const [jobsRes, savedRes] = await Promise.all([
    fetch(`/api/jobs?q=${encodeURIComponent(query)}`),
    fetch("/api/saved"),
  ]);
  const [jobs, saved] = await Promise.all([jobsRes.json(), savedRes.json()]);
  if (request !== latestRequest) return;
  renderJobs(jobs, saved);
  renderSaved(saved);
}

async function saveJob(jobId) {
  const res = await fetch("/api/saved", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error ?? "Could not save this job.");
    return;
  }
  await show(search.value);
}

async function removeJob(jobId) {
  const res = await fetch(`/api/saved/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error ?? "Could not remove this job.");
    return;
  }
  await show(search.value);
}

search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => show(search.value), 200);
});
show();
