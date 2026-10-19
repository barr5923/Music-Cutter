import { AudioEngine, errorMessage, outputPath, parseTime, validateFile } from "./audio.js";
import { buildCues, readSheet } from "./cues.js";

const $ = id => document.getElementById(id);
const engine = new AudioEngine();
let busy = false, cancelled = false, sourceURL, resultURL;

function status(text, error = false) {
  $("status").textContent = text;
  $("job").classList.toggle("error", error);
}

function clearResult() {
  $("result-player").pause();
  $("result-player").removeAttribute("src");
  $("result-player").load();
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = null;
  $("result").hidden = true;
}

function publish(blob, filename, description, preview) {
  resultURL = URL.createObjectURL(blob);
  $("download").href = resultURL;
  $("download").download = filename;
  $("download").textContent = preview ? "Download clip" : "Download ZIP";
  $("result-info").textContent = `${description} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;
  $("result-player").hidden = !preview;
  if (preview) $("result-player").src = resultURL;
  $("result").hidden = false;
}

async function run(action) {
  if (busy) return;
  busy = true;
  cancelled = false;
  clearResult();
  $("player").pause();
  for (const id of ["single-fields", "batch-fields", "single-tab", "batch-tab"]) $(id).disabled = true;
  $("cancel").hidden = false;
  $("progress").hidden = false;
  $("progress").removeAttribute("value");
  try {
    await action();
    if (!cancelled) status("Finished. Your download is ready below.");
  } catch (error) {
    clearResult();
    status(cancelled ? "Cancelled. No files were changed." : errorMessage(error), !cancelled);
    if (!cancelled) console.error("Music Cutter:", error);
  } finally {
    engine.reset();
    busy = false;
    for (const id of ["single-fields", "batch-fields", "single-tab", "batch-tab"]) $(id).disabled = false;
    $("cancel").hidden = true;
    $("progress").hidden = true;
  }
}

$("cancel").addEventListener("click", () => {
  cancelled = true;
  engine.reset();
  status("Cancelling...");
});

function checkCancelled() {
  if (cancelled) throw new Error("Cancelled.");
}

$("source").addEventListener("change", () => {
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  $("player").removeAttribute("src");
  $("player").hidden = true;
  $("player").load();
  const file = $("source").files[0];
  if (!file) {
    $("source-name").textContent = "Nothing selected yet.";
    return;
  }
  $("source-name").textContent = `${file.name} / ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  $("output-name").value = `${file.name.replace(/\.[^.]+$/, "")}_clip`;
  $("end").value = "";
  sourceURL = URL.createObjectURL(file);
  $("player").src = sourceURL;
  $("player").hidden = false;
});

$("player").addEventListener("loadedmetadata", () => {
  if (Number.isFinite($("player").duration) && !$("end").value) {
    $("end").value = (Math.floor($("player").duration * 1000) / 1000).toString();
  }
});
$("player").addEventListener("error", () => {
  status("Your browser cannot preview this source. You can still try cutting it with the bundled audio engine.");
});
for (const marker of ["start", "end"]) {
  $(`mark-${marker}`).addEventListener("click", () => {
    if (!$("source").files.length) {
      status("Choose an audio file before setting a playhead marker.", true);
      return;
    }
    $(marker).value = $("player").currentTime.toFixed(3);
  });
}

$("single-form").addEventListener("submit", event => {
  event.preventDefault();
  run(async () => {
    const file = $("source").files[0];
    validateFile(file);
    const start = parseTime($("start").value), end = parseTime($("end").value);
    if (end <= start) throw new Error("End time must be later than start time.");
    const extension = $("format").value;
    const name = $("output-name").value.trim();
    if (!name) throw new Error("Enter a name for your output clip.");
    if (/[\\/]/.test(name)) throw new Error("Use a filename without folders for a single clip.");
    const { path } = outputPath(`${name}.${extension}`);
    status("Loading the local audio engine...");
    await engine.load();
    checkCancelled();
    status(`Reading ${file.name}...`);
    const duration = await engine.open(file);
    checkCancelled();
    status("Cutting and encoding your clip...");
    const blob = await engine.cut(start, end, duration, extension);
    checkCancelled();
    publish(blob, path, `${path} / ${(end - start).toFixed(3)} seconds`, true);
  });
});

for (const id of ["batch-files", "batch-folder"]) {
  $(id).addEventListener("change", () => {
    // Each picker replaces the other so stale selections cannot silently conflict.
    $(id === "batch-files" ? "batch-folder" : "batch-files").value = "";
    $("batch-count").textContent = `${$(id).files.length} source file(s) selected.`;
  });
}

$("batch-form").addEventListener("submit", event => {
  event.preventDefault();
  run(async () => {
    status("Reading cue sheet...");
    const rows = await readSheet($("sheet").files[0]);
    checkCancelled();
    const files = [...$("batch-files").files, ...$("batch-folder").files];
    const cues = buildCues(rows, files);
    status("Loading the local audio engine...");
    await engine.load();
    checkCancelled();
    const zip = new JSZip();
    let currentFile, duration;
    for (let index = 0; index < cues.length; index++) {
      const cue = cues[index];
      checkCancelled();
      status(`Cutting ${index + 1} of ${cues.length}: ${cue.path}`);
      $("progress").value = index / cues.length * 90;
      try {
        if (currentFile !== cue.file) {
          duration = await engine.open(cue.file);
          currentFile = cue.file;
        }
        checkCancelled();
        const blob = await engine.cut(cue.start, cue.end, duration, cue.extension);
        checkCancelled();
        zip.file(cue.path, await blob.arrayBuffer());
      } catch (error) {
        throw new Error(`Row ${cue.row}: ${errorMessage(error)}`);
      }
    }
    engine.reset();
    status("Packaging your clips...");
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, metadata => {
      checkCancelled();
      $("progress").value = 90 + metadata.percent / 10;
    });
    checkCancelled();
    publish(blob, "music-cutter-clips.zip", `${cues.length} clip(s) in music-cutter-clips.zip`, false);
  });
});

const tabs = [$("single-tab"), $("batch-tab")];
function selectTab(index) {
  tabs.forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = i !== index;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(index));
  tab.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
      selectTab(next);
      tabs[next].focus();
    }
  });
});

async function setupOffline() {
  if (!("serviceWorker" in navigator) || !isSecureContext) {
    $("offline-status").textContent = "Offline access needs HTTPS or localhost. Opening index.html directly is not supported.";
    return;
  }
  let timeout;
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    const updateNotice = () => {
      $("offline-status").textContent = "An update is ready. Close all Music Cutter tabs and reopen to apply it.";
    };
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) updateNotice();
      });
    });
    const readyRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Offline installation timed out.")), 120000);
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "redundant") {
            reject(new Error("Could not cache the app. Check available browser storage and your connection."));
          }
        });
      }),
    ]);
    clearTimeout(timeout);
    const channel = new MessageChannel();
    try {
      await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Offline caching timed out.")), 120000);
        channel.port1.onmessage = ({ data }) => {
          if (data.ready) resolve();
          else reject(new Error(data.error || "Could not cache the full application."));
        };
        readyRegistration.active.postMessage("PREPARE_OFFLINE", [channel.port2]);
      });
    } finally {
      channel.port1.close();
    }
    $("offline-status").textContent = "Offline ready. This page and its audio engine are saved on your device. Bookmark this address and return anytime.";
    if (registration.waiting) updateNotice();
  } catch (error) {
    $("offline-status").textContent = `Offline setup failed: ${errorMessage(error)} Keep this tab online and reload to retry.`;
    console.error("Offline setup:", error);
  } finally {
    clearTimeout(timeout);
  }
}
if (location.protocol === "file:") status("Open this app from an HTTPS website or a localhost static server, not directly as a file.", true);
setupOffline();
