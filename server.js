const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// DB_PATH points at a JSON file. On Render, set this to a path on a mounted
// persistent disk (e.g. /data/data.json) so uploads survive redeploys.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');
const MAX_RUNS = 30;

function loadDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!db.originTags) db.originTags = {};
    return db;
  } catch (e) {
    return { runs: {}, originTags: {} };
  }
}

function saveDB(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db));
}

// List of runs (small summaries only, most recent first)
app.get('/api/runs', (req, res) => {
  const db = loadDB();
  const index = Object.entries(db.runs)
    .map(([id, r]) => ({
      id,
      filename: r.meta.filename,
      uploadedAt: r.meta.uploadedAt,
      totalInstances: r.totals.totalInstances,
      totalRuns: r.totals.totalRuns,
      uniqueArticles: r.totals.uniqueArticles,
      uniqueJournals: r.totals.uniqueJournals,
      dateStart: r.totals.dateStart,
      dateEnd: r.totals.dateEnd,
      // Full category breakdown (not just top 5) so per-category trend works for every row, not only the biggest.
      // There are only ~10 fixed categories, so this stays tiny even with many runs stored.
      categoryBreakdown: r.buckets.map(b => ({
        category: b.category, count: b.count, shareOfTotal: b.shareOfTotal,
        articleCount: b.articleCount, journalCount: b.journalCount
      }))
    }))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, MAX_RUNS);
  res.json(index);
});

// Full summary for one run
app.get('/api/runs/:id', (req, res) => {
  const db = loadDB();
  const run = db.runs[req.params.id];
  if (!run) return res.status(404).json({ error: 'not found' });
  res.json(run);
});

// Save a newly uploaded run's summary
app.post('/api/runs', (req, res) => {
  const summary = req.body;
  if (!summary || !summary.meta || !summary.totals || !summary.buckets) {
    return res.status(400).json({ error: 'invalid summary payload' });
  }
  const id = Date.now() + '-' + String(summary.meta.filename || 'run')
    .replace(/[^a-z0-9.-]/gi, '_')
    .slice(0, 60);

  const db = loadDB();
  db.runs[id] = summary;

  // Keep only the most recent MAX_RUNS runs
  const ids = Object.entries(db.runs)
    .sort((a, b) => new Date(b[1].meta.uploadedAt) - new Date(a[1].meta.uploadedAt))
    .map(([rid]) => rid);
  ids.slice(MAX_RUNS).forEach(oldId => delete db.runs[oldId]);

  saveDB(db);
  res.json({ id });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Origin tags: category label -> 'product' | 'parser' | 'user'.
// This persists across every future upload — tag a category once, it stays tagged.
app.get('/api/origin-tags', (req, res) => {
  const db = loadDB();
  res.json(db.originTags || {});
});

app.post('/api/origin-tags', (req, res) => {
  const { category, origin } = req.body || {};
  if (!category || !['product', 'parser', 'user'].includes(origin)) {
    return res.status(400).json({ error: 'expected { category, origin: product|parser|user }' });
  }
  const db = loadDB();
  db.originTags[category] = origin;
  saveDB(db);
  res.json({ ok: true, originTags: db.originTags });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Errata Report listening on port ' + PORT));
