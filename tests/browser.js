import { AudioEngine, FORMATS, outputPath, parseTime, validateFile, validateRange } from "../audio.js";
import { buildCues, parseCSV, readSheet } from "../cues.js";
import { toneFile } from "./fixtures.js";

const tests = [];
const test = (name, action) => tests.push({ name, action });
function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function rejects(action, expected) {
  try { action(); } catch (error) {
    assert(error.message.includes(expected), `Expected "${expected}", got "${error.message}"`);
    return;
  }
  throw new Error(`Expected error containing "${expected}"`);
}

test("timestamps and invalid input", () => {
  assert(parseTime("1:23.5") === 83.5);
  assert(parseTime("0:01:23.500") === 83.5);
  assert(parseTime(83.5) === 83.5);
  assert(parseTime(new Date("1899-12-30T00:01:23.500Z")) === 83.5);
  for (const value of ["", "-1", "1:60", "0:60:00", "1.5:02", "NaN", Infinity]) {
    let failed = false;
    try { parseTime(value); } catch { failed = true; }
    assert(failed, `Accepted invalid time: ${value}`);
  }
  rejects(() => validateRange(1, 1, 2), "End time");
  rejects(() => validateRange(0, 3, 2), "exceeds");
});
test("CSV BOM, quoted commas/newlines/escaped quotes and malformed input", () => {
  const rows = parseCSV('\uFEFFinput_file,start,end,output_file\r\n"song, ""live"".wav",0,1,"clips/a.wav"\r\n');
  assert(rows.length === 2);
  assert(rows[1][0] === 'song, "live".wav');
  assert(parseCSV('"a\nb",c')[0][0] === "a\nb");
  rejects(() => parseCSV('"unfinished'), "unclosed");
  rejects(() => parseCSV('"a"x,b'), "Malformed");
});
test("safe paths and size validation", () => {
  assert(outputPath("clips\\chorus.MP3").extension === "mp3");
  for (const path of ["../a.mp3", "/a.wav", "C:\\a.wav", "con.mp3", "a//b.mp3", "a.txt", "a./b.wav", "wav", "a.constructor"]) {
    let failed = false;
    try { outputPath(path); } catch { failed = true; }
    assert(failed, `Accepted unsafe path ${path}`);
  }
  rejects(() => validateFile({ name: "huge", size: 251 * 1024 * 1024 }), "250 MB");
});
const headers = ["input_file", "start", "end", "output_file"];
test("file matching, row errors, duplicates and folder paths", () => {
  const file = toneFile();
  const rows = [headers, ["tone.wav", "0:00.5", "1.5", "clips/tone.wav"]];
  assert(buildCues(rows, [file])[0].file === file);
  rejects(() => buildCues(rows, []), "Select");
  rejects(() => buildCues(rows, [toneFile("other.wav")]), "Row 2");
  rejects(() => buildCues([...rows, rows[1]], [file]), "Duplicate output");
  rejects(() => buildCues([["input_file"], ["tone.wav"]], [file]), "column");
  const first = toneFile(), second = toneFile();
  Object.defineProperty(first, "webkitRelativePath", { value: "A/tone.wav" });
  Object.defineProperty(second, "webkitRelativePath", { value: "B/tone.wav" });
  rejects(() => buildCues(rows, [first, second]), "ambiguous");
  assert(buildCues([headers, ["A/tone.wav", 0, 1, "a.mp3"]], [first, second])[0].file === first);
});
test("Excel first worksheet, real time-formatted cells and blank rows", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cues");
  sheet.addRow(headers);
  sheet.addRow(["tone.wav", new Date("1899-12-30T00:00:00.500Z"), 1.5, "tone.wav"]);
  sheet.getCell("B2").numFmt = "hh:mm:ss.000";
  const file = new File([await workbook.xlsx.writeBuffer()], "cues.xlsx");
  const cues = buildCues(await readSheet(file), [toneFile()]);
  assert(cues.length === 1 && cues[0].start === 0.5 && cues[0].end === 1.5);
});
test("real FFmpeg cuts: all five formats, duration, audio content and ZIP", async () => {
  const engine = new AudioEngine();
  const context = new AudioContext();
  try {
    await engine.load();
    const duration = await engine.open(toneFile());
    assert(Math.abs(duration - 2) < 0.002, `Source duration ${duration}`);
    const zip = new JSZip();
    for (const extension of Object.keys(FORMATS)) {
      const blob = await engine.cut(0.5, 1.5, duration, extension);
      assert(blob.size > 100);
      zip.file(`clips/tone.${extension}`, await blob.arrayBuffer());
      // The same core probes formats the browser itself cannot decode.
      const encodedDuration = await engine.open(new File([blob], `cut.${extension}`));
      assert(Math.abs(encodedDuration - 1) < 0.16, `${extension} duration was ${encodedDuration}`);
      await engine.open(toneFile());
      if (extension === "wav") {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        assert(Math.abs(decoded.duration - 1) < 0.002);
        const samples = decoded.getChannelData(0);
        const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
        assert(rms > 0.2, `Expected tone, RMS was ${rms}`);
      }
    }
    const reopened = await JSZip.loadAsync(await zip.generateAsync({ type: "arraybuffer" }));
    assert(Object.values(reopened.files).filter(file => !file.dir).length === 5);
    const wav = await reopened.file("clips/tone.wav").async("uint8array");
    assert(new TextDecoder().decode(wav.slice(0, 4)) === "RIFF");
    let invalidRejected = false;
    try {
      await engine.open(new File(["not audio"], "invalid.wav"));
    } catch {
      invalidRejected = true;
    }
    assert(invalidRejected, "Invalid audio must not reuse a previous successful probe result.");
    assert(Math.abs(await engine.open(toneFile()) - 2) < 0.002, "Engine should recover after invalid input.");
  } finally {
    engine.reset();
    await context.close();
  }
});

let failures = 0;
for (const { name, action } of tests) {
  try {
    await action();
    document.getElementById("results").textContent += `PASS ${name}\n`;
  } catch (error) {
    failures++;
    document.getElementById("results").textContent += `FAIL ${name}\n${error.stack}\n`;
  }
}
document.getElementById("summary").textContent = `${tests.length - failures}/${tests.length} passed`;
document.documentElement.dataset.testResult = failures ? "failed" : "passed";
