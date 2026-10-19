import math
from datetime import datetime, time, timedelta


def parse_time_ms(value: object) -> int:
    """Convert seconds, MM:SS, HH:MM:SS, or an Excel time value to milliseconds."""
    if isinstance(value, bool):
        raise ValueError("Time must be a number of seconds or a timestamp.")

    if isinstance(value, timedelta):
        seconds = value.total_seconds()
    elif isinstance(value, datetime):
        seconds = (
            value.hour * 3600
            + value.minute * 60
            + value.second
            + value.microsecond / 1_000_000
        )
    elif isinstance(value, time):
        seconds = (
            value.hour * 3600
            + value.minute * 60
            + value.second
            + value.microsecond / 1_000_000
        )
    elif isinstance(value, (int, float)):
        seconds = float(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            raise ValueError("Time cannot be blank.")
        try:
            seconds = float(text)
        except ValueError:
            parts = text.split(":")
            if len(parts) not in (2, 3):
                raise ValueError(
                    f"Invalid time '{value}'. Use seconds, MM:SS, or HH:MM:SS."
                ) from None
            try:
                numbers = [float(part) for part in parts]
            except ValueError:
                raise ValueError(
                    f"Invalid time '{value}'. Use seconds, MM:SS, or HH:MM:SS."
                ) from None
            if any(not math.isfinite(part) or part < 0 for part in numbers):
                raise ValueError("Time components must be finite and non-negative.")
            if len(numbers) == 2:
                minutes, remainder = numbers
                if remainder >= 60:
                    raise ValueError("Seconds in MM:SS must be less than 60.")
                seconds = minutes * 60 + remainder
            else:
                hours, minutes, remainder = numbers
                if minutes >= 60 or remainder >= 60:
                    raise ValueError("Minutes and seconds in HH:MM:SS must be less than 60.")
                seconds = hours * 3600 + minutes * 60 + remainder
    else:
        raise ValueError(f"Unsupported time value: {value!r}")

    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError("Time must be finite and non-negative.")
    return round(seconds * 1000)
