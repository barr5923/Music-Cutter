from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from music_cutter.time_utils import parse_time_ms


@dataclass(frozen=True)
class Cue:
    input_file: Path
    start_ms: int
    end_ms: int
    output_file: Path
    row_number: int


REQUIRED_COLUMNS = {"input_file", "start", "end", "output_file"}


def load_cues(sheet_path: Path) -> list[Cue]:
    sheet_path = sheet_path.resolve()
    suffix = sheet_path.suffix.lower()
    if suffix == ".csv":
        frame = pd.read_csv(sheet_path)
    elif suffix == ".xlsx":
        frame = pd.read_excel(sheet_path)
    else:
        raise ValueError("Choose a .csv or .xlsx cue sheet.")

    frame.columns = [str(column).strip().lower() for column in frame.columns]
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(
            "Cue sheet is missing required columns: " + ", ".join(sorted(missing))
        )

    cues: list[Cue] = []
    errors: list[str] = []
    for index, row in frame.iterrows():
        row_number = int(index) + 2
        if row[list(REQUIRED_COLUMNS)].isna().all():
            continue
        try:
            input_text = str(row["input_file"]).strip()
            output_text = str(row["output_file"]).strip()
            if not input_text or input_text.lower() == "nan":
                raise ValueError("input_file is required.")
            if not output_text or output_text.lower() == "nan":
                raise ValueError("output_file is required.")

            output_file = Path(output_text)
            if output_file.is_absolute():
                raise ValueError("output_file must be relative to the selected output folder.")

            start_ms = parse_time_ms(row["start"])
            end_ms = parse_time_ms(row["end"])
            if end_ms <= start_ms:
                raise ValueError("end must be later than start.")

            input_file = Path(input_text)
            if not input_file.is_absolute():
                input_file = sheet_path.parent / input_file
            cues.append(
                Cue(
                    input_file=input_file.resolve(),
                    start_ms=start_ms,
                    end_ms=end_ms,
                    output_file=output_file,
                    row_number=row_number,
                )
            )
        except (TypeError, ValueError) as error:
            errors.append(f"Row {row_number}: {error}")

    if errors:
        preview = "\n".join(errors[:10])
        if len(errors) > 10:
            preview += f"\n…and {len(errors) - 10} more row error(s)."
        raise ValueError("Could not read cue sheet:\n" + preview)
    if not cues:
        raise ValueError("The cue sheet does not contain any cuts.")
    return cues
