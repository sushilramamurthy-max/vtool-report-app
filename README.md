# The Errata Report

Error-insights dashboard for validation runs. Upload a CSV (`error`, `jid`, `aid`, `start_time` columns), and it shows:

1. What kinds of errors are happening (Error Types tab)
2. What to fix first for max impact (Fix Priority tab)
3. Whether error volume is actually going down over time (Trends tab)
4. Other signals for the product team — stuck articles, messiest articles, worst journals (Article Intelligence tab)

Uploads are saved on the server and visible to **anyone who opens the URL** — no login required, no per-user data. That's the point (easy team/customer access), but it also means there's no access control out of the box. See "Adding basic protection" below if that matters for you.

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

## How data is stored

Each upload is aggregated in the browser (nothing raw leaves the client except the computed summary — category counts, daily trends, top journals/articles). That summary — typically 50–150KB even for 50,000+ row CSVs — is POSTed to `/api/runs` and saved to `data.json` on the server. The last 30 uploads are kept; older ones are dropped automatically.

## Files

- `server.js` — Express backend (2 endpoints: list runs, get one run, save a run)
- `public/index.html` — the dashboard (single file: HTML/CSS/JS, Chart.js + PapaParse from CDN)
- `render.yaml` — one-click Render Blueprint config
