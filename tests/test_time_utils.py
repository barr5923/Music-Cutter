import unittest
from datetime import time, timedelta

from music_cutter.time_utils import parse_time_ms


class ParseTimeTests(unittest.TestCase):
    def test_parses_seconds_and_colon_formats(self):
        self.assertEqual(parse_time_ms(83.5), 83500)
        self.assertEqual(parse_time_ms("1:23.5"), 83500)
        self.assertEqual(parse_time_ms("0:01:23.500"), 83500)

    def test_parses_excel_time_values(self):
        self.assertEqual(parse_time_ms(time(0, 1, 23, 500000)), 83500)
        self.assertEqual(parse_time_ms(timedelta(seconds=83.5)), 83500)

    def test_rejects_invalid_values(self):
        for value in ("", "1:60", "-2", float("nan"), True):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    parse_time_ms(value)


if __name__ == "__main__":
    unittest.main()
