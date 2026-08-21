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
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return { runs: {} };
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

// Ask-anything: answers a free-form question about the currently loaded report using
// the Anthropic API. Requires ANTHROPIC_API_KEY to be set as an environment variable —
// this app runs standalone (not inside claude.ai), so it needs its own key and pays for
// its own usage. Without a key set, this returns a clear "not configured" message instead
// of failing silently.
const ASK_SYSTEM_PROMPT = [
  'You are answering questions about an XML-validation error report for a scholarly-publishing',
  'production pipeline, embedded inside an internal dashboard. You will be given a JSON snapshot',
  'of the current report (error categories, per-category stats, journals, problem articles, daily',
  'trend, origin tags, and upload history) and a question from a product manager or a stakeholder',
  'they are talking to live.',
  '',
  'Answer using ONLY the data provided — never invent numbers, journal names, or article IDs that',
  'are not in the data. If the data does not contain what is needed to answer, say so plainly and',
  'name what data would be needed, rather than guessing or padding the answer.',
  '',
  'Be concise: a few sentences or a short list, using exact figures from the data with commas',
  '(e.g. "12,345", not "about 12k"). This is for someone who needs a fast, precise answer in a',
  'live conversation, not a report.'
].join('\n');

app.post('/api/ask', async (req, res) => {
  const { question, context } = req.body || {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'missing question' });
  }
  if (!context) {
    return res.status(400).json({ error: 'missing context' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Ask-anything needs an ANTHROPIC_API_KEY environment variable set on this server. See README.md.'
    });
  }

  try {
    const contextJson = JSON.stringify(context).slice(0, 400000); // keep well under context limits
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_ASK_MODEL || 'claude-sonnet-5',
        max_tokens: 700,
        system: ASK_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: 'REPORT DATA:\n```json\n' + contextJson + '\n```\n\nQUESTION: ' + question.trim()
        }]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(502).json({ error: 'upstream_error', message: errText.slice(0, 400) });
    }
    const data = await upstream.json();
    const answer = (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();
    res.json({ answer: answer || '(No answer text returned.)' });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String((e && e.message) || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Errata Report listening on port ' + PORT));
