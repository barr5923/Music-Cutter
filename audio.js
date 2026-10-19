export const MAX_FILE_SIZE = 250 * 1024 * 1024;
export const FORMATS = {
  mp3: { mime: "audio/mpeg", args: ["-c:a", "libmp3lame", "-b:a", "192k"] },
  wav: { mime: "audio/wav", args: ["-c:a", "pcm_s16le"] },
  m4a: { mime: "audio/mp4", args: ["-c:a", "aac", "-b:a", "192k"] },
  flac: { mime: "audio/flac", args: ["-c:a", "flac"] },
  ogg: { mime: "audio/ogg", args: ["-c:a", "libvorbis", "-q:a", "5"] },
};

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function parseTime(value) {
  if (value instanceof Date) {
    value = value.getUTCHours() * 3600 + value.getUTCMinutes() * 60
      + value.getUTCSeconds() + value.getUTCMilliseconds() / 1000;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error("Time must be finite and non-negative.");
    return value;
  }
  if (typeof value !== "string" || !value.trim()) throw new Error("Time cannot be blank.");
  const parts = value.trim().split(":");
  if (parts.length > 3 || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) {
    throw new Error(`Invalid time "${value}". Use seconds, MM:SS or HH:MM:SS.`);
  }
  if (parts.slice(0, -1).some(part => !/^\d+$/.test(part))) {
    throw new Error("Only the seconds component can have decimals.");
  }
  const numbers = parts.map(Number);
  if (numbers.some(part => !Number.isFinite(part))) throw new Error("Time must be finite.");
  if (numbers.length > 1 && numbers.at(-1) >= 60
      || numbers.length === 3 && numbers[1] >= 60) {
    throw new Error("Timestamp seconds and HH:MM:SS minutes must be less than 60.");
  }
  const seconds = numbers.reduce((sum, part) => sum * 60 + part, 0);
  if (!Number.isFinite(seconds)) throw new Error("Time is too large.");
  return seconds;
}

export function validateRange(start, end, duration) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
    throw new Error("End time must be later than the non-negative start time.");
  }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine the audio duration.");
  if (end > duration + 0.001) {
    throw new Error(`End time (${end.toFixed(3)}s) exceeds audio duration (${duration.toFixed(3)}s).`);
  }
}

export function validateFile(file) {
  if (!file || !file.size) throw new Error("Choose a non-empty audio file.");
  if (file.size > MAX_FILE_SIZE) throw new Error(`"${file.name}" exceeds the 250 MB source file limit.`);
}

export function outputPath(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("output_file is required.");
  const path = value.trim().replaceAll("\\", "/");
  if (path.startsWith("/") || path.split("/").some(part =>
    !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part)
    || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error("Output must be a safe relative filename or folder path (no absolute paths or '..').");
  }
  const extension = path.match(/\.([^./]+)$/)?.[1].toLowerCase();
  if (!extension || !Object.hasOwn(FORMATS, extension)) {
    throw new Error("Output extension must be .mp3, .wav, .m4a, .flac or .ogg.");
  }
  return { path, extension };
}

export class AudioEngine {
  constructor() {
    this.ffmpeg = null;
    this.logs = [];
  }

  async load() {
    if (this.ffmpeg?.loaded) return;
    const ffmpeg = new FFmpegWASM.FFmpeg();
    this.ffmpeg = ffmpeg;
    ffmpeg.on("log", ({ message }) => {
      this.logs.push(message);
      if (this.logs.length > 12) this.logs.shift();
    });
    let timeout;
    try {
      await Promise.race([
        ffmpeg.load({
          coreURL: new URL("vendor/core/ffmpeg-core.js", import.meta.url).href,
          wasmURL: new URL("vendor/core/ffmpeg-core.wasm", import.meta.url).href,
        }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Audio engine loading timed out after 90 seconds.")), 90000);
        }),
      ]);
    } catch (error) {
      this.reset();
      throw new Error(`Could not load the local audio engine. Use HTTPS or localhost and reload. ${errorMessage(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  reset() {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
  }

  async open(file) {
    validateFile(file);
    this.logs = [];
    await this.ffmpeg.writeFile("source", new Uint8Array(await file.arrayBuffer()));
    await this.ffmpeg.writeFile("probe.json", new Uint8Array());
    const code = await this.ffmpeg.ffprobe([
      "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json",
      "-o", "probe.json", "source",
    ]);
    const text = await this.ffmpeg.readFile("probe.json", "utf8");
    await this.ffmpeg.deleteFile("probe.json");
    // Core 0.12.10 leaves ret at -1 on a normal ffprobe return. Require fresh,
    // valid JSON with an audio stream instead of treating that sentinel as failure.
    if ((code !== 0 && code !== -1) || !text.trim()) {
      throw new Error(`Cannot read "${file.name}": ${this.logs.join("\n")}`);
    }
    const info = JSON.parse(text);
    const duration = Number(info.format?.duration);
    if (!info.streams?.some(stream => stream.codec_type === "audio")
        || !Number.isFinite(duration) || duration <= 0) {
      throw new Error(`"${file.name}" does not contain audio with a readable duration.`);
    }
    return duration;
  }

  async cut(start, end, duration, extension) {
    validateRange(start, end, duration);
    if (!Object.hasOwn(FORMATS, extension)) throw new Error(`Unsupported output format: ${extension}`);
    const format = FORMATS[extension];
    this.logs = [];
    const name = `clip.${extension}`;
    // Seek after input: decode for accurate cuts rather than copying whole compressed frames.
    const code = await this.ffmpeg.exec([
      "-i", "source", "-ss", String(start), "-t", String(end - start),
      "-map", "0:a:0", "-vn", ...format.args, name,
    ]);
    if (code !== 0) throw new Error(`Audio conversion failed: ${this.logs.join("\n")}`);
    const bytes = await this.ffmpeg.readFile(name);
    await this.ffmpeg.deleteFile(name);
    return new Blob([bytes], { type: format.mime });
  }
}
