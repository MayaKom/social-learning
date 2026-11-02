/*
 * Saving to the university server (used when CONFIG.saveMethod is 'server').
 * Sends the data to api/save.php, which writes one CSV per participant into the data folder.
 * The study must be served from the same server as save.php (same domain), otherwise the
 * browser blocks the request.
 */

// ---------- Prolific helpers ----------
function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const prolificInfo = {
  prolific_pid: getUrlParam('PROLIFIC_PID'),
  study_id: getUrlParam('STUDY_ID'),
  session_id: getUrlParam('SESSION_ID')
};

async function saveDataToServer(payload, prolificInfo = {}, meta = {}) {
  const SAVE_URL = CONFIG.saveUrl;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 s timeout

  try {
    const res = await fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prolificInfo, meta, payload }),
      signal: controller.signal
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}. Body: ${text}`);
    if (!json || json.ok !== true) throw new Error(`Save failed: unexpected response: ${text}`);

    return json;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Tries several times before giving up (brief network problems are common on participants' connections).
async function saveDataWithRetry(payload, prolificInfo, meta, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await saveDataToServer(payload, prolificInfo, meta);
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

// Balanced condition assignment (api/condition.php): returns the condition cell with the fewest
// participants so far. Gives up after a few seconds so the study never hangs.
async function getBalancedCondition(pid, nCells) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(CONFIG.assignUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid, study: CONFIG.studyName, n_cells: nCells }),
      signal: controller.signal
    });
    const json = await res.json();
    if (!res.ok || !json || json.ok !== true || !Number.isInteger(json.condition_index)) throw new Error('assignment failed');
    return json.condition_index;
  } finally {
    clearTimeout(timeoutId);
  }
}
