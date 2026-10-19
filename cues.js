import { outputPath, parseTime, validateFile } from "./audio.js";

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && field === "" && !closed) {
      quoted = true;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed || char === '"') throw new Error("Malformed CSV quoting.");
      field += char;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (field || closed || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function readSheet(file) {
  if (!file) throw new Error("Choose a CSV or .xlsx cue sheet.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Cue sheets must be 10 MB or smaller.");
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose a .csv or .xlsx cue sheet (not legacy .xls).");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheets.");
  const rows = [];
  sheet.eachRow({ includeEmpty: true }, row => {
    rows.push(Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).value));
  });
  return rows;
}

const normalize = value => value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();

export function buildCues(rows, files) {
  if (!rows.length) throw new Error("The cue sheet is empty.");
  const headers = rows[0].map(value => String(value ?? "").trim().toLowerCase());
  const required = ["input_file", "start", "end", "output_file"];
  for (const header of required) {
    if (headers.filter(value => value === header).length !== 1) {
      throw new Error(`Cue sheet must have exactly one "${header}" column.`);
    }
  }
  if (!files.length) throw new Error("Select the source audio files referenced in your cue sheet.");
  const paths = new Map(), names = new Map();
  for (const file of files) {
    const path = normalize(file.webkitRelativePath || file.name);
    const name = normalize(file.name);
    if (paths.has(path)) throw new Error(`Duplicate source path: "${path}". Select each file only once.`);
    paths.set(path, file);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(file);
  }
  const outputs = new Set();
  const cues = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.every(value => value == null || value === "")) continue;
    try {
      const get = name => row[headers.indexOf(name)];
      const input = get("input_file");
      if (typeof input !== "string" || !input.trim()) throw new Error("input_file is required.");
      const key = normalize(input.trim());
      let file = paths.get(key);
      if (!file && !key.includes("/")) {
        const matches = names.get(key) || [];
        if (matches.length > 1) throw new Error(`"${input}" is ambiguous. Use the full folder-relative path.`);
        [file] = matches;
      }
      if (!file) throw new Error(`Source "${input}" is not selected. Use its filename or folder-relative path, not a Windows absolute path.`);
      validateFile(file);
      const start = parseTime(get("start"));
      const end = parseTime(get("end"));
      if (end <= start) throw new Error("End time must be later than start time.");
      const { path, extension } = outputPath(get("output_file"));
      if (outputs.has(path.toLowerCase())) throw new Error(`Duplicate output path "${path}".`);
      outputs.add(path.toLowerCase());
      cues.push({ file, start, end, path, extension, row: index + 1 });
    } catch (error) {
      throw new Error(`Row ${index + 1}: ${error.message}`);
    }
  }
  if (!cues.length) throw new Error("The cue sheet contains no cuts.");
  return cues;
}
