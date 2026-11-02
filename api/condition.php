<?php
/*
 * Balanced condition assignment for the Gridworld study.
 * Upload next to save.php (in the api/ folder).
 *
 * Each new participant gets the condition cell (0-11: demonstrator condition x value version)
 * with the fewest participants so far, ties broken at random. "So far" counts:
 *   - completed participants: this study's files in data/ (not test runs, not comprehension failures)
 *   - participants assigned in the last PENDING_MINUTES who have not saved data yet
 * Someone who reloads the page gets the same cell again. Assignments are kept in
 * data/assignments.json (protected by data/.htaccess like the data files).
 */
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(["ok" => false, "error" => "POST only"]);
  exit;
}

$PENDING_MINUTES = 60;   // how long an unfinished assignment holds its place
$DATA_DIR = __DIR__ . DIRECTORY_SEPARATOR . ".." . DIRECTORY_SEPARATOR . "data";

$in = json_decode(file_get_contents("php://input"), true);
if (!is_array($in) || !isset($in["study"])) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Expected JSON with study (and pid, n_cells)"]);
  exit;
}
$study  = (string)$in["study"];
$pid    = substr(preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($in["pid"] ?? "")), 0, 64);
$nCells = (int)($in["n_cells"] ?? 12);
if ($nCells < 1 || $nCells > 100) $nCells = 12;

if (!is_dir($DATA_DIR) || !is_writable($DATA_DIR)) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Data directory not writable by web server"]);
  exit;
}

// One request at a time, so simultaneous participants cannot be given the same "emptiest" cell.
$lock = fopen($DATA_DIR . DIRECTORY_SEPARATOR . "assignments.lock", "c");
flock($lock, LOCK_EX);

$statePath = $DATA_DIR . DIRECTORY_SEPARATOR . "assignments.json";
$state = file_exists($statePath) ? json_decode(file_get_contents($statePath), true) : [];
if (!is_array($state)) $state = [];
$assigned = is_array($state[$study] ?? null) ? $state[$study] : [];   // pid => ["cell" => n, "t" => unix time]

// Participants with saved data: read the first data row of each of this study's files.
$savedCell = [];   // pid => cell, for participants who count as completed
$savedAny  = [];   // pid => true, for everyone with a saved file (completed or failed)
foreach (glob($DATA_DIR . DIRECTORY_SEPARATOR . "*.csv") as $file) {
  if (basename($file) === "index.csv") continue;
  $fh = fopen($file, "r");
  if (!$fh) continue;
  $header = fgetcsv($fh);
  $first  = fgetcsv($fh);
  fclose($fh);
  if (!$header || !$first || count($header) !== count($first)) continue;
  $row = array_combine($header, $first);
  if (($row["meta_study"] ?? "") !== $study) continue;          // other studies in the same folder
  if (($row["assignment"] ?? "") === "url") continue;            // test runs with a forced condition
  $p = (string)($row["participant_id"] ?? "");
  $savedAny[$p] = true;
  if (($row["comprehension_failed"] ?? "") !== "") continue;     // asked to return: place is freed
  $cell = (int)($row["condition_index"] ?? -1);
  if ($cell >= 0 && $cell < $nCells) $savedCell[$p] = $cell;     // counted once per participant
}

$reused = false;
if ($pid !== "" && isset($assigned[$pid])) {
  // Same participant again (e.g. reloaded the page): keep their condition.
  $cell = (int)$assigned[$pid]["cell"];
  $reused = true;
} else {
  $counts = array_fill(0, $nCells, 0);
  foreach ($savedCell as $c) $counts[$c]++;
  $now = time();
  foreach ($assigned as $p => $a) {
    if (isset($savedAny[$p])) continue;                           // already counted (or failed)
    if ($now - (int)$a["t"] > $PENDING_MINUTES * 60) continue;   // gave up long ago: place is freed
    $c = (int)$a["cell"];
    if ($c >= 0 && $c < $nCells) $counts[$c]++;
  }
  $min = min($counts);
  $candidates = array_keys($counts, $min);
  $cell = $candidates[random_int(0, count($candidates) - 1)];
  if ($pid !== "") $assigned[$pid] = ["cell" => $cell, "t" => $now];
}

$state[$study] = $assigned;
file_put_contents($statePath . ".tmp", json_encode($state));
rename($statePath . ".tmp", $statePath);

flock($lock, LOCK_UN);
fclose($lock);

echo json_encode(["ok" => true, "condition_index" => $cell, "reused" => $reused]);
