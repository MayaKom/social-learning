<?php
header('Content-Type: application/json; charset=utf-8');

// Only POST
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(["ok" => false, "error" => "POST only"]);
  exit;
}



// Data dir
$DATA_DIR = __DIR__ . DIRECTORY_SEPARATOR . ".." . DIRECTORY_SEPARATOR . "data";


// Ensure exists
if (!is_dir($DATA_DIR)) {
  @mkdir($DATA_DIR, 0777, true);
}

// Ensure writable
if (!is_writable($DATA_DIR)) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Data directory not writable by web server", "dataDir" => $DATA_DIR]);
  exit;
}

// Read incoming payload (JSON preferred, fallback to form POST)
$raw = file_get_contents("php://input");
$decoded = json_decode($raw, true);

if (!is_array($decoded)) {
  // Try form POST fallback
  if (isset($_POST["data"])) {
    $decoded = json_decode($_POST["data"], true);
  }
}

if (!is_array($decoded) || !isset($decoded["payload"])) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "Invalid payload (expected JSON with payload)"]);
  exit;
}

$prolificInfo = is_array($decoded["prolificInfo"] ?? null) ? $decoded["prolificInfo"] : [];
$meta         = is_array($decoded["meta"] ?? null) ? $decoded["meta"] : [];
$payload      = $decoded["payload"];


$prolificPid = (string)($prolificInfo["prolific_pid"] ?? "");
$studyId     = (string)($prolificInfo["study_id"] ?? "");
$sessionId   = (string)($prolificInfo["session_id"] ?? "");

$pidHash = $prolificPid !== "" ? hash("sha256", $prolificPid) : "no-pid";

// Safe filename parts
$iso    = gmdate("Y-m-d\TH-i-s\Z");
$suffix = bin2hex(random_bytes(4));

$studySafe   = $studyId   !== "" ? preg_replace('/[^A-Za-z0-9_\-]/', '_', $studyId)   : "no-study";
$sessionSafe = $sessionId !== "" ? preg_replace('/[^A-Za-z0-9_\-]/', '_', $sessionId) : "no-session";

$filename = "{$iso}_{$studySafe}_{$sessionSafe}_{$pidHash}_{$suffix}.csv";
$filepath = $DATA_DIR . DIRECTORY_SEPARATOR . $filename;

// Build rows for CSV (one row per trial; participant/meta fields repeated)
$receivedAt = gmdate("c");

// Ensure payload is an array of rows; if it's a single object, wrap it
$payloadRows = $payload;
if (!is_array($payloadRows)) {
  $payloadRows = [];
}
$looksLikeList = array_keys($payloadRows) === range(0, count($payloadRows) - 1);
if (!$looksLikeList) {
  // associative array (single trial/object)
  $payloadRows = [$payloadRows];
}

$rows = [];

// Participant-level fields (flatten turkInfo + meta at top-level)
$base = [
  "receivedAt" => $receivedAt,
  "pidHash"    => $pidHash,
  "studyId"    => $studyId,
  "sessionId"  => $sessionId,
];

$header = array_keys($base);

// Include all prolificInfo + meta fields as columns
foreach ($prolificInfo as $k => $v) {
  $key = "prolific_" . $k;
  $base[$key] = (is_scalar($v) || $v === null) ? $v : json_encode($v, JSON_UNESCAPED_SLASHES);

if (!in_array($key, $header, true)) {
    $header[] = $key;
}
}
foreach ($meta as $k => $v) {
  $key = "meta_" . $k;
  $base[$key] = (is_scalar($v) || $v === null) ? $v : json_encode($v, JSON_UNESCAPED_SLASHES);

if (!in_array($key, $header, true)) {
    $header[] = $key;
}
}



// Build per-trial rows
foreach ($payloadRows as $i => $trial) {
  if (!is_array($trial)) continue;

  $row = $base;
  $row["trialIndex"] = $i;

  foreach ($trial as $k => $v) {
    $row[$k] = (is_scalar($v) || $v === null) ? $v : json_encode($v, JSON_UNESCAPED_SLASHES);
  }

  $rows[] = $row;


  // Track union of keys for a stable header
  foreach ($row as $k => $_) {
  if (!in_array($k, $header, true)) {
    $header[] = $k;
  }
}
}

if (count($rows) === 0) {
  http_response_code(400);
  echo json_encode(["ok" => false, "error" => "No rows to save (payload empty or invalid)"]);
  exit;
}

// Write CSV atomically
$tmp = $filepath . ".tmp";
$fp = fopen($tmp, "w");
if ($fp === false) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Failed to open temp CSV file"]);
  exit;
}

fputcsv($fp, $header);

// Rows: ensure missing keys become empty cells
foreach ($rows as $row) {
  $line = [];
  foreach ($header as $col) {
    $line[] = $row[$col] ?? "";
  }
  fputcsv($fp, $line);
}

fclose($fp);

if (!rename($tmp, $filepath)) {
  @unlink($tmp);
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Failed to finalize save"]);
  exit;
}

// Append to a lightweight index log (CSV)
$indexPath = $DATA_DIR . DIRECTORY_SEPARATOR . "index.csv";
$line = [
  gmdate("c"),
  $filename,
  $studyId,
  $sessionId,
  $pidHash,
  $_SERVER["REMOTE_ADDR"] ?? ""
];
$fp = fopen($indexPath, "a");
if ($fp) {
  fputcsv($fp, $line);
  fclose($fp);
}

// Respond
$out = ["ok" => true, "savedAs" => $filename];

// Debug info only when requested
if (isset($_GET["debug"]) && $_GET["debug"] === "1") {
  $out["dataDir"]   = realpath($DATA_DIR);
  $out["scriptDir"] = __DIR__;
  $out["filePath"]  = $filepath;
}

echo json_encode($out);
