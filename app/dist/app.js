// provcheck GUI — vanilla JS + Tauri v2 IPC.
//
// Tauri v2 exposes `window.__TAURI__.core` when `withGlobalTauri`
// is true. Plugins like `dialog` are NOT auto-globalised in v2, so
// we keep the UI surface small: drag-drop is primary, "Choose file"
// uses a `<input type=file>` fallback.
//
// State machine:
//   empty  → drop/choose → loading → result
//   result → "Verify another" → empty

const TAURI = window.__TAURI__;
if (!TAURI || !TAURI.core || typeof TAURI.core.invoke !== "function") {
  // Running outside Tauri (plain browser) — fail loud in a visible
  // way rather than silently no-op on drops.
  document.body.innerHTML =
    '<pre style="padding:24px;color:#EF4444;font-family:monospace">' +
    "provcheck must be launched via provcheck-gui.exe\n" +
    "(The Tauri runtime was not detected.)" +
    "</pre>";
  throw new Error("no Tauri runtime");
}
const { invoke } = TAURI.core;

// ---- DOM handles ---------------------------------------------------------

const $dropzone      = document.getElementById("dropzone");
const $loading       = document.getElementById("loading");
const $loadingFile   = document.getElementById("loading-file");
const $result        = document.getElementById("result");
const $verdict       = document.getElementById("verdict");
const $verdictIcon   = document.getElementById("verdict-icon");
const $verdictTitle  = document.getElementById("verdict-title");
const $verdictFile   = document.getElementById("verdict-file");
const $reason        = document.getElementById("reason");
const $reasonText    = document.getElementById("reason-text");
const $kvMain        = document.getElementById("kv-main");
const $kvClaims      = document.getElementById("kv-claims");
const $claimsHeading = document.getElementById("claims-heading");
const $chooseBtn      = document.getElementById("choose-btn");
const $verifyAgain    = document.getElementById("verify-another");
const $copyJson       = document.getElementById("copy-json");
const $sampleRaidio     = document.getElementById("sample-raidio");
const $sampleDoomscroll = document.getElementById("sample-doomscroll");
const $footerHint     = document.getElementById("footer-hint");
const $footerActions  = document.getElementById("footer-actions");

let lastReport = null;
let lastFilePath = null;

// ---- State transitions ---------------------------------------------------

function showEmpty() {
  $dropzone.hidden = false;
  $loading.hidden = true;
  $result.hidden = true;
  $dropzone.classList.remove("drag-over");
  // Footer shows the sample-hint text in empty + loading states —
  // the action buttons only make sense once there's a result.
  $footerHint.hidden = false;
  $footerActions.hidden = true;
}

function showLoading(displayName) {
  $dropzone.hidden = true;
  $loading.hidden = false;
  $result.hidden = true;
  $loadingFile.textContent = displayName;
  $footerHint.hidden = false;
  $footerActions.hidden = true;
}

function showResult(report, path) {
  $dropzone.hidden = true;
  $loading.hidden = true;
  $result.hidden = false;
  renderReport(report, path);
  // Swap footer content — buttons replace the sample-hint line so
  // they're always visible (not buried at the bottom of a scroll).
  $footerHint.hidden = true;
  $footerActions.hidden = false;
}

// ---- Rendering -----------------------------------------------------------

function renderReport(report, path) {
  lastReport = report;
  lastFilePath = path;

  let cls, icon, title;
  if (report.verified) {
    cls = "is-verified";
    icon = "\u2713";
    title = "Verified";
  } else if (report.unsigned) {
    cls = "is-unsigned";
    icon = "\u2014";
    title = "Unsigned";
  } else {
    cls = "is-invalid";
    icon = "\u2715";
    title = "Not verified";
  }
  $verdict.className = "verdict " + cls;
  $verdictIcon.textContent = icon;
  $verdictTitle.textContent = title;
  $verdictFile.textContent = path || "";

  if (report.failure_reason) {
    $reason.hidden = false;
    $reasonText.textContent = report.failure_reason;
  } else {
    $reason.hidden = true;
  }

  $kvMain.innerHTML = "";
  const rows = [
    ["Signer", report.signer, false],
    ["Signed at", report.signed_at, false],
    ["Tool", report.claim_generator, false],
    ["Format", report.format, false],
    ["Manifest", report.active_manifest, true],
    [
      "Ingredients",
      report.ingredient_count > 0
        ? report.ingredient_count +
          " (derived content \u2014 this file was made by editing earlier signed files)"
        : null,
      false,
    ],
    [
      "Validation errors",
      report.validation_errors > 0 ? String(report.validation_errors) : null,
      false,
    ],
  ];
  for (const [label, value, mono] of rows) {
    if (value == null || value === "") continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (mono) dd.classList.add("mono");
    dd.textContent = value;
    $kvMain.appendChild(dt);
    $kvMain.appendChild(dd);
  }

  $kvClaims.innerHTML = "";
  const hasClaims =
    report.assertions &&
    typeof report.assertions === "object" &&
    !Array.isArray(report.assertions) &&
    Object.keys(report.assertions).length > 0;
  $claimsHeading.hidden = !hasClaims;
  if (hasClaims) {
    for (const [label, value] of Object.entries(report.assertions)) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = JSON.stringify(value, null, 2);
      $kvClaims.appendChild(dt);
      $kvClaims.appendChild(dd);
    }
  }
}

// ---- Actions -------------------------------------------------------------

async function verifyPath(path) {
  showLoading(prettyPath(path));
  try {
    const resp = await invoke("verify_file", { path });
    if (!resp.ok) {
      showResult(errorReport(resp.error || "Could not read file."), path);
      return;
    }
    showResult(resp.report, path);
  } catch (e) {
    showResult(errorReport("Internal error: " + (e && e.toString ? e.toString() : "unknown")), path);
  }
}

function errorReport(msg) {
  return {
    verified: false,
    unsigned: false,
    failure_reason: msg,
    active_manifest: null,
    signer: null,
    signed_at: null,
    claim_generator: null,
    assertions: {},
    ingredient_count: 0,
    format: null,
    validation_errors: 0,
  };
}

function prettyPath(path) {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/");
  return parts[parts.length - 1] || path;
}

// ---- File picker (hidden input, no plugin dep) ---------------------------

function openFilePicker() {
  // The webview sandbox hides full paths from File objects, so an
  // <input type=file> alone can't give us an absolute path to hand
  // to the Rust side. Fall back to inviting the user to drag:
  showReminderToDrag();
}

function showReminderToDrag() {
  // Briefly swap the dropzone copy to nudge toward drag-drop.
  const inner = $dropzone.querySelector(".dropzone-inner h2");
  if (!inner) return;
  const original = inner.textContent;
  inner.textContent = "Drag the file onto the window";
  $dropzone.classList.add("drag-over");
  setTimeout(() => {
    inner.textContent = original;
    $dropzone.classList.remove("drag-over");
  }, 1600);
}

// ---- Wire-up -------------------------------------------------------------

$chooseBtn.addEventListener("click", openFilePicker);

$verifyAgain.addEventListener("click", showEmpty);

$copyJson.addEventListener("click", async () => {
  if (!lastReport) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
    $copyJson.textContent = "Copied";
    setTimeout(() => ($copyJson.textContent = "Copy as JSON"), 1200);
  } catch {
    /* clipboard blocked — silent no-op */
  }
});

// Tauri 2 drag-drop: listen for the global event rather than the
// webview-bound helper (the helper requires an ESM import that our
// no-build-step setup can't provide). The payload shape is
//   { type: "enter"|"over"|"drop"|"leave", paths: [...], position }
TAURI.event.listen("tauri://drag-drop", (event) => {
  const p = event.payload;
  $dropzone.classList.remove("drag-over");
  if (p && Array.isArray(p.paths) && p.paths.length > 0) {
    verifyPath(p.paths[0]);
  }
});
TAURI.event.listen("tauri://drag-enter", () => $dropzone.classList.add("drag-over"));
TAURI.event.listen("tauri://drag-over", () => $dropzone.classList.add("drag-over"));
TAURI.event.listen("tauri://drag-leave", () => $dropzone.classList.remove("drag-over"));

// Footer example links — low-cost stub that explains where to grab
// the sample files. Proper bundled-resource wiring can land later.
function explainSample(productName, fileName) {
  showResult(
    {
      verified: false,
      unsigned: true,
      failure_reason:
        "The " +
        productName +
        " sample isn't installed alongside this build yet. Grab " +
        fileName +
        " from provcheck.ai (examples/ folder in the source tree) and drag it into the window.",
      active_manifest: null,
      signer: null,
      signed_at: null,
      claim_generator: null,
      assertions: {},
      ingredient_count: 0,
      format: null,
      validation_errors: 0,
    },
    fileName,
  );
}
$sampleRaidio.addEventListener("click", () => explainSample("rAIdio.bot", "rAIdio.bot-sample.mp3"));
$sampleDoomscroll.addEventListener("click", () => explainSample("Doomscroll.fm", "doomscroll.fm-sample.mp4"));
$sampleRaidio.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") explainSample("rAIdio.bot", "rAIdio.bot-sample.mp3");
});
$sampleDoomscroll.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") explainSample("Doomscroll.fm", "doomscroll.fm-sample.mp4");
});

// Initial state.
showEmpty();
