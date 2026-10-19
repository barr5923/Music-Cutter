import queue
import threading
from collections.abc import Callable
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from music_cutter.cue_sheet import Cue, load_cues
from music_cutter.processor import cut_audio
from music_cutter.time_utils import parse_time_ms


class MusicCutterApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Music Cutter")
        self.root.minsize(620, 400)
        self.events: queue.Queue[tuple] = queue.Queue()
        self.busy = False

        self.source_var = tk.StringVar()
        self.start_var = tk.StringVar(value="0")
        self.end_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Choose an audio file to get started.")

        self._build_ui()
        self.root.after(100, self._poll_events)

    def _build_ui(self) -> None:
        container = ttk.Frame(self.root, padding=18)
        container.pack(fill="both", expand=True)
        container.columnconfigure(1, weight=1)

        ttk.Label(
            container, text="Music Cutter", font=("Segoe UI", 18, "bold")
        ).grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 14))

        single = ttk.LabelFrame(container, text="Cut one audio file", padding=12)
        single.grid(row=1, column=0, columnspan=3, sticky="ew")
        single.columnconfigure(1, weight=1)

        ttk.Label(single, text="Audio file").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=5)
        self.source_entry = ttk.Entry(single, textvariable=self.source_var)
        self.source_entry.grid(row=0, column=1, sticky="ew", pady=5)
        self.browse_source_button = ttk.Button(single, text="Browse…", command=self._browse_source)
        self.browse_source_button.grid(row=0, column=2, padx=(8, 0), pady=5)

        ttk.Label(single, text="Start time").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=5)
        self.start_entry = ttk.Entry(single, textvariable=self.start_var, width=20)
        self.start_entry.grid(row=1, column=1, sticky="w", pady=5)
        ttk.Label(single, text="Seconds, MM:SS, or HH:MM:SS").grid(
            row=1, column=2, sticky="w", padx=(8, 0), pady=5
        )

        ttk.Label(single, text="End time").grid(row=2, column=0, sticky="w", padx=(0, 8), pady=5)
        self.end_entry = ttk.Entry(single, textvariable=self.end_var, width=20)
        self.end_entry.grid(row=2, column=1, sticky="w", pady=5)
        self.cut_button = ttk.Button(single, text="Cut audio…", command=self._cut_single)
        self.cut_button.grid(row=2, column=2, sticky="e", padx=(8, 0), pady=5)

        batch = ttk.LabelFrame(container, text="Batch cut from a cue sheet", padding=12)
        batch.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        batch.columnconfigure(0, weight=1)
        ttk.Label(
            batch,
            text="Select a CSV or Excel file with input_file, start, end, and output_file columns.",
            wraplength=550,
        ).grid(row=0, column=0, sticky="w")
        self.batch_button = ttk.Button(
            batch, text="Choose cue sheet and output folder…", command=self._cut_batch
        )
        self.batch_button.grid(row=1, column=0, sticky="w", pady=(10, 0))

        self.progress = ttk.Progressbar(container, mode="indeterminate")
        self.progress.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(18, 6))
        ttk.Label(container, textvariable=self.status_var).grid(
            row=4, column=0, columnspan=3, sticky="w"
        )

        self.controls = [
            self.source_entry,
            self.browse_source_button,
            self.start_entry,
            self.end_entry,
            self.cut_button,
            self.batch_button,
        ]

    def _browse_source(self) -> None:
        selected = filedialog.askopenfilename(
            title="Choose an audio file",
            filetypes=[
                ("Audio files", "*.mp3 *.wav *.m4a *.aac *.flac *.ogg *.wma"),
                ("All files", "*.*"),
            ],
        )
        if selected:
            self.source_var.set(selected)

    def _cut_single(self) -> None:
        source_text = self.source_var.get().strip()
        if not source_text:
            messagebox.showerror("Choose an audio file", "Select an audio file first.")
            return
        source = Path(source_text)
        if not source.is_file():
            messagebox.showerror("Audio file not found", f"File not found:\n{source}")
            return
        try:
            start_ms = parse_time_ms(self.start_var.get())
            end_ms = parse_time_ms(self.end_var.get())
            if end_ms <= start_ms:
                raise ValueError("End time must be later than start time.")
        except ValueError as error:
            messagebox.showerror("Invalid time", str(error))
            return

        destination = filedialog.asksaveasfilename(
            title="Save cut audio as",
            initialdir=str(source.parent),
            initialfile=f"{source.stem}_clip{source.suffix}",
            defaultextension=source.suffix,
            filetypes=[("Audio files", "*.mp3 *.wav *.m4a *.aac *.flac *.ogg"), ("All files", "*.*")],
        )
        if destination:
            self._start_task(
                "Cutting audio…",
                lambda: cut_audio(source, Path(destination), start_ms, end_ms),
                "Audio clip saved.",
            )

    def _cut_batch(self) -> None:
        sheet_name = filedialog.askopenfilename(
            title="Choose a cue sheet",
            filetypes=[
                ("Cue sheets", "*.csv *.xlsx"),
                ("CSV files", "*.csv"),
                ("Excel workbooks", "*.xlsx"),
            ],
        )
        if not sheet_name:
            return
        try:
            cues = load_cues(Path(sheet_name))
        except (OSError, ValueError, ImportError) as error:
            messagebox.showerror("Could not load cue sheet", str(error))
            return

        output_folder = filedialog.askdirectory(title="Choose an output folder")
        if not output_folder:
            return

        def batch_action() -> None:
            self._process_cues(
                cues,
                Path(output_folder),
                lambda current, total, filename: self.events.put(
                    ("progress", current, total, filename)
                ),
            )

        self._start_task(
            f"Cutting {len(cues)} audio clip(s)…",
            batch_action,
            f"Finished cutting {len(cues)} audio clip(s).",
            total=len(cues),
        )

    @staticmethod
    def _process_cues(
        cues: list[Cue],
        output_root: Path,
        progress: Callable[[int, int, str], None] | None = None,
    ) -> None:
        output_root = output_root.resolve()
        for index, cue in enumerate(cues, start=1):
            destination = (output_root / cue.output_file).resolve()
            if destination == output_root or output_root not in destination.parents:
                raise ValueError(
                    f"Cue sheet row {cue.row_number}: output_file must stay inside "
                    "the selected output folder."
                )
            try:
                cut_audio(cue.input_file, destination, cue.start_ms, cue.end_ms)
            except Exception as error:
                raise RuntimeError(f"Cue sheet row {cue.row_number}: {error}") from error
            if progress:
                progress(index, len(cues), cue.output_file.name)

    def _start_task(
        self,
        label: str,
        action: Callable[[], None],
        success_message: str,
        total: int = 1,
    ) -> None:
        if self.busy:
            return
        self.busy = True
        self.status_var.set(label)
        self.progress.configure(mode="determinate" if total > 1 else "indeterminate")
        self.progress.configure(maximum=total, value=0)
        if total == 1:
            self.progress.start(10)
        for control in self.controls:
            control.configure(state="disabled")

        def worker() -> None:
            try:
                action()
                self.events.put(("done", success_message))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _poll_events(self) -> None:
        try:
            while True:
                event = self.events.get_nowait()
                if event[0] == "progress":
                    _, current, total, filename = event
                    self.progress.configure(value=current)
                    self.status_var.set(f"Cut {current} of {total}: {filename}")
                else:
                    self.busy = False
                    self.progress.stop()
                    self.progress.configure(value=0)
                    for control in self.controls:
                        control.configure(state="normal")
                    if event[0] == "done":
                        self.status_var.set(event[1])
                        messagebox.showinfo("Music Cutter", event[1])
                    else:
                        self.status_var.set("The operation failed.")
                        messagebox.showerror("Music Cutter", event[1])
        except queue.Empty:
            pass
        self.root.after(100, self._poll_events)


def main() -> None:
    root = tk.Tk()
    MusicCutterApp(root)
    root.mainloop()
