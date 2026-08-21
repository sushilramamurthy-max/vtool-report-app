# Direction to Zero — Proof Central Output XML Validation Report

A single-page error-elimination tracker, built around one number: **how many errors can only be caused by how the document was built** — not by anything a reader or author did — vs. content-related errors that are tracked separately.

Upload a CSV (`error`, `jid`, `aid`, `start_time` columns) and it shows:

1. **North Star** — how many errors must be eliminated, front and center. Target: zero.
2. **Fix these, in order** — every Well-formedness or Validity error, ranked by impact, with a plain-English explanation, a fix recommendation, and what actually happens (in error % and article %) if it's fixed. This is the only list that counts toward the goal.
3. **Trend** — is that number actually moving, across every upload your team has made.
4. **Ask anything** — a question box that answers anything about the current report on the spot (see below).
5. **Deep dive** — everything else (every distinct error message, stuck articles, worst journals) tucked into collapsed sections, not separate tabs, so the page opens clean.

## How errors are classified

Every error is classified by which stage of XML processing produced it — this is factual, not a judgment call, so it needs no manual tagging:

- **Well-formedness** — fails before any template or schema is even checked. Can only be caused by how the document was built.
- **Validity (DTD/Schema)** — valid XML, but doesn't match the required structure. Also can only be caused by how the document was built.
- **Business rule** — passes basic XML checks but breaks a content rule (formatting, completeness, a pattern). Often traces back to the source content itself.

**Well-formedness and Validity always count toward the North Star. Business rule never does.** There's no per-category override — the classification follows directly from the error message itself, so there's nothing to get wrong or need to correct later. If you want a different category-to-stage mapping, edit `XML_STAGES` in `public/index.html`; it applies to every category and every future upload immediately.

Uploads are saved on the server and visible to **anyone who opens the URL** — no login required. That's the point (easy team/customer access), but it also means there's no access control out of the box. See "Adding basic protection" below if that matters for you.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy to Render

1. **Push this repo to GitHub** (see commands below).
2. In Render: **New → Blueprint**, point it at this GitHub repo. Render will read `render.yaml` and set everything up on the free plan.
3. Click **Apply**. First deploy takes a couple of minutes.
4. Once live, Render gives you a URL like `https://errata-report.onrender.com` — that's what you share with your team/customers.

If you'd rather click through the UI instead of using the blueprint:
- **New → Web Service** → connect this repo
- Build command: `npm install`
- Start command: `npm start`

### About the free plan (read this)

`render.yaml` is set up for the **free plan**, which does not support persistent disks. That means uploaded runs are stored in the container's local filesystem and will be **wiped whenever the service redeploys or restarts** — free-plan services also spin down after inactivity, and spinning back up counts as a restart. Fine for trying it out; not fine for keeping a real upload history.

**When you're ready for persistence** (a low-cost paid plan, e.g. Starter):
1. In the Render dashboard, change the service's plan from Free to Starter (or above).
2. Go to the service → **Disks** → **Add Disk**: mount path `/data`, size 1GB.
3. Go to **Environment** → add a variable: `DB_PATH` = `/data/data.json`.
4. Redeploy. From then on, uploads persist across restarts/redeploys.

(There's also a `render-with-disk.yaml` in this repo you can rename to `render.yaml` once you've upgraded the plan, to get the disk set up automatically via blueprint instead of doing it by hand.)

## Push to GitHub

From this folder:

```bash
git init
git add .
git commit -m "Errata Report: error-insights dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Adding basic protection (optional)

Since there's no login, anyone with the URL can view and upload data. Two easy options if that's a concern:
- **Render's built-in basic auth**: available on paid plans under service settings.
- **A shared secret header**: add a check in `server.js` that rejects requests without a specific `x-api-key` header, and have the frontend send it — ask me if you want this wired in.

## Ask-anything (optional)

The North Star card includes a free-form question box — for when a stakeholder asks something the report doesn't already show ("which journal improved the most last week?", "how many DOI errors are from journals outside the top 10?"). It sends the currently-loaded report data to Claude via the Anthropic API and returns a direct answer, right there, instead of you having to say "I'll get back to you."

**This needs your own Anthropic API key** — the app runs standalone on Render now, not inside claude.ai, so it can't use claude.ai's built-in access. Without a key, the box still works but shows a clear "not configured" message instead of failing silently.

To set it up:
1. Get a key from [console.anthropic.com](https://console.anthropic.com) (Settings → API Keys).
2. In Render, go to your service → **Environment** → add a variable: `ANTHROPIC_API_KEY` = your key.
3. Redeploy. The box starts working immediately, no code changes needed.

**Cost:** each question sends roughly 13,000 tokens of report data (varies with how much history you've uploaded) plus the answer. At current Claude Sonnet pricing that's a small fraction of a cent per question — this won't show up as a meaningful cost unless your team is asking hundreds of questions a day. You can swap the model by setting `ANTHROPIC_ASK_MODEL` (defaults to `claude-sonnet-5`) — e.g. to `claude-haiku-4-5-20251001` for lower cost per question.

**What data leaves the server:** every question sends the full current report — category breakdowns, journal names, article IDs, and daily trends — to Anthropic's API. No raw manuscript content or full CSV rows are sent, only the aggregated summary already computed for the dashboard. Worth knowing if this deployment is ever shown to external customers.

## How data is stored

Each upload is aggregated in the browser (nothing raw leaves the client except the computed summary — category counts, daily trends, top journals/articles). That summary — typically 50–150KB even for 50,000+ row CSVs — is POSTed to `/api/runs` and saved to `data.json` on the server. The last 30 uploads are kept; older ones are dropped automatically.

## Files

- `server.js` — Express backend (list runs, get one run, save a run, ask-anything)
- `public/index.html` — the dashboard (single file: HTML/CSS/JS, Chart.js + PapaParse from CDN)
- `render.yaml` — free-tier Render Blueprint config
- `render-with-disk.yaml` — paid-tier variant with a persistent disk (rename to `render.yaml` once upgraded)
