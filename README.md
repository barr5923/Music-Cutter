# Music Cutter

A self-contained, browser-only audio cutter. Trim one file or create a ZIP of clips from a CSV/Excel cue sheet. Audio and spreadsheets stay on your device: there is no backend, upload endpoint, account, analytics, or runtime CDN dependency.

[Open Music Cutter](https://barr5923.github.io/Music-Cutter/)

## Run

Publish this folder on any HTTPS static host (for example, GitHub Pages). No Python, Node, installed FFmpeg, or build step is required for users. Open the site in a current desktop Chrome, Edge, Firefox, or Safari browser.

For local development, use any static server. If Python is already installed:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. Do not double-click the HTML file: web workers and offline caching require HTTP on localhost or HTTPS. FFmpeg runs inside a web worker using the bundled single-threaded WebAssembly core; cross-origin isolation headers are not required.

## Single clip

1. Select an audio file.
2. Set start/end times as seconds (`83.5`), `MM:SS` (`1:23.500`), or `HH:MM:SS` (`0:01:23.500`). The player lets you preview the original and set markers from the playhead.
3. Choose a filename and output format: MP3, WAV, M4A, FLAC, or OGG.
4. Cut, preview, and download. The original is never changed.

The browser's built-in player may not preview every source format FFmpeg can decode. Files without a supported audio stream, unreadable durations, and out-of-range cuts produce an error rather than a truncated successful export.

## Batch clips

1. Select a UTF-8 CSV or `.xlsx` workbook (first worksheet; legacy `.xls` is not supported).
2. Select the source files, or choose a folder including its subfolders. Selecting one replaces the other selection.
3. Cut and download one ZIP. Each output extension selects its encoder.

Required columns (case-insensitive, with leading/trailing header spaces ignored):

| input_file | start | end | output_file |
| --- | --- | --- | --- |
| song.mp3 | 0:15 | 0:42.5 | song_intro.mp3 |
| Audio/track.wav | 1:02 | 1:35 | clips/track_chorus.wav |

See [example-cues.csv](example-cues.csv). Input names must match selected files by filename or exact folder-relative path shown by the folder picker (including the selected root folder, such as `Audio/track.wav`). The browser cannot read absolute Windows paths from a spreadsheet. Names are matched case-insensitively; ambiguous filenames need folder-relative paths.

Output paths must be relative, with a supported audio extension. Duplicate outputs, path traversal, unsafe Windows filenames, missing sources, invalid times, and duplicate/missing columns are rejected. Excel time-formatted cells are accepted as timestamps; plain numeric cells are seconds. Use literal values, not spreadsheet formula cells.

Cuts are processed sequentially. A failed batch shows the row number and does not offer a partial ZIP. Cancel stops processing and discards results, without changing source files.

## Offline use

The service worker caches the complete application, local libraries, and the approximately 32 MB audio engine on the first visit. Wait for **Offline ready** before disconnecting. Reopen the same bookmarked address to work offline. No selected files or generated clips are persisted by the app.

Offline access depends on browser storage availability; clearing site data or browser storage eviction removes it. Missing cache entries are restored on the next online visit. Private browsing may restrict caching. Keep the site open during processing. When deploying changes, bump the cache version in `service-worker.js`. An update takes effect after all existing app tabs are closed.

## Limits

- Source files: maximum 250 MB each. Cue sheets: maximum 10 MB.
- Processing and ZIP creation use browser memory. Large sources, many clips, or low-memory devices can still exhaust memory. Use smaller batches when needed.
- This version re-encodes audio for accurate cuts; it does not offer lossless compressed stream-copy or a waveform editor.
- Exported audio does not preserve artwork or other original metadata.
- Preview support depends on the browser; MP3/WAV are the most portable.

## Browser tests

Serve the project and open `http://127.0.0.1:8000/tests/browser.html`. The test runner checks timestamp/CSV parsing, spreadsheet/file matching and validation, Excel round trips, real FFmpeg encoding in all five formats, audio duration/content, and ZIP contents. It needs no test package installation.

## Bundled libraries

The checked-in `vendor` folder is what ships; `package.json` records exact upstream versions. No `npm install` is needed to run or test this application. The UI and audio worker always use the local copies, not a CDN. Preserve the included notices and license files when distributing; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) for versions, source links, and license obligations.

The previous Python/Tkinter desktop implementation has been replaced by this static web app.
