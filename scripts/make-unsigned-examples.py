#!/usr/bin/env python3
"""Generate the deliberately-unsigned example files for provcheck.

Produces:
    examples/unsigned-sample.mp3  — 2-second 440 Hz sine tone, fade in/out
    examples/unsigned-sample.mp4  — 2-second dark-blue video + same tone + caption

Neither file carries a C2PA manifest — that's the point. They exist
so users of provcheck can see the UNSIGNED verdict on curated content
instead of hunting for a random file.

Requirements:
    * Python 3.8+
    * ffmpeg on PATH, OR set $FFMPEG to its path.

Run from the repo root:
    python scripts/make-unsigned-examples.py
"""

from __future__ import annotations

import math
import os
import pathlib
import shutil
import struct
import subprocess
import sys
import wave

REPO = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = REPO / "examples"

SR = 44_100
DURATION_S = 2.0
FREQ_HZ = 440.0
AMPLITUDE = 0.18        # gentle
FADE_S = 0.050          # 50 ms raised-cosine fade — no clicks


def find_ffmpeg() -> str:
    env = os.environ.get("FFMPEG")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    # rAIdio.bot / vAIdeo.bot Windows install path as a last-resort hint.
    raise SystemExit(
        "ffmpeg not found. Install it, or set $FFMPEG to its full path."
    )


def write_wav(dest: pathlib.Path) -> None:
    frames = int(SR * DURATION_S)
    fade = int(SR * FADE_S)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dest), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        for i in range(frames):
            if i < fade:
                env = 0.5 * (1.0 - math.cos(math.pi * i / fade))
            elif i > frames - fade:
                env = 0.5 * (1.0 - math.cos(math.pi * (frames - i) / fade))
            else:
                env = 1.0
            v = AMPLITUDE * env * math.sin(2.0 * math.pi * FREQ_HZ * i / SR)
            w.writeframes(struct.pack("<h", int(v * 32767)))


def ffmpeg_encode_mp3(ffmpeg: str, wav: pathlib.Path, dest: pathlib.Path) -> None:
    subprocess.run(
        [
            ffmpeg, "-y", "-i", str(wav),
            "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1",
            str(dest),
        ],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def ffmpeg_make_mp4(ffmpeg: str, wav: pathlib.Path, dest: pathlib.Path) -> None:
    subprocess.run(
        [
            ffmpeg, "-y",
            "-f", "lavfi",
            "-i", f"color=c=0x1e3a5f:size=640x360:rate=30:duration={DURATION_S}",
            "-i", str(wav),
            "-vf",
            "hue=h=20*sin(2*PI*t/2):s=1,"
            "drawtext=text='unsigned example':fontcolor=white@0.55:"
            "fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            str(dest),
        ],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def main() -> int:
    ffmpeg = find_ffmpeg()
    wav_tmp = EXAMPLES / "unsigned-sample.wav"
    mp3_out = EXAMPLES / "unsigned-sample.mp3"
    mp4_out = EXAMPLES / "unsigned-sample.mp4"

    print(f"Writing {wav_tmp.relative_to(REPO)} ...")
    write_wav(wav_tmp)

    print(f"Encoding {mp3_out.relative_to(REPO)} ...")
    ffmpeg_encode_mp3(ffmpeg, wav_tmp, mp3_out)

    print(f"Encoding {mp4_out.relative_to(REPO)} ...")
    ffmpeg_make_mp4(ffmpeg, wav_tmp, mp4_out)

    # WAV was a scratch source; keep examples/ tidy.
    wav_tmp.unlink(missing_ok=True)

    print()
    for f in (mp3_out, mp4_out):
        size = f.stat().st_size
        print(f"  {f.relative_to(REPO)}  ({size:,} bytes)")

    print("\nDone. These files carry no C2PA manifest — that's the point.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
