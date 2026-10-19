# Music Cutter

A Windows desktop application for trimming audio files and batch-cutting them from a CSV or Excel cue sheet.

## Features

- Cut a single audio file using start and end times.
- Batch-cut multiple files from `.csv`, `.xlsx`, or `.xls` cue sheets.
- Accept times as seconds (`83.5`), `MM:SS` (`1:23.500`), or `HH:MM:SS` (`0:01:23.500`).
- Preserve the source audio by exporting each clip to a separate output file.

## Requirements

- Windows and Python 3.10 or newer
- FFmpeg installed and available on `PATH`

Check that FFmpeg is available in PowerShell:

```powershell
ffmpeg -version
```

Install FFmpeg using your preferred Windows package manager or from the official FFmpeg download links. The application uses pydub to call FFmpeg for decoding and encoding.

## Run

From this folder, create and activate a virtual environment, install the Python dependencies, and start the app:

```powershell
python -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python main.py
```

## Batch cue sheet format

The first row must contain these column names:

| input_file | start | end | output_file |
| --- | --- | --- | --- |
| audio\song.mp3 | 0:15 | 0:42.5 | song_intro.mp3 |
| C:\Music\track.wav | 1:02 | 1:35 | clips\track_chorus.wav |

- `input_file`: audio file path. Relative paths are resolved from the cue sheet's folder.
- `start` and `end`: seconds, `MM:SS`, or `HH:MM:SS`; the end time is exclusive.
- `output_file`: output file name/path. Relative paths are resolved from the output folder selected in the app. Absolute paths and paths that escape that folder are rejected.
- CSV files should be UTF-8 encoded. `.xlsx` workbooks use the first worksheet.

Supported audio formats depend on the installed FFmpeg build.

## Tests

Run the standard-library unit tests with:

```powershell
py -3 -m unittest discover -s tests -v
```
