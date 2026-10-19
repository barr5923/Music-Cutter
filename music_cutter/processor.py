from pathlib import Path

from pydub import AudioSegment


def cut_audio(source: Path, destination: Path, start_ms: int, end_ms: int) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Audio file not found: {source}")
    if source == destination:
        raise ValueError("Output file must be different from the source file.")
    if start_ms < 0 or end_ms <= start_ms:
        raise ValueError("End time must be later than the non-negative start time.")
    if not destination.suffix:
        raise ValueError("Output file must have an audio file extension.")

    audio = AudioSegment.from_file(str(source))
    if end_ms > len(audio):
        raise ValueError(
            f"End time ({end_ms / 1000:g}s) exceeds the audio duration "
            f"({len(audio) / 1000:g}s)."
        )
    clip = audio[start_ms:end_ms]
    destination.parent.mkdir(parents=True, exist_ok=True)
    clip.export(str(destination), format=destination.suffix.lstrip("."))
