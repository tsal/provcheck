# Example signed media

Three files here to kick the tires with. Both carry real C2PA
Content Credentials and verify cleanly under `provcheck`.

## `rAIdio.bot-sample.mp3` (+ `rAIdio.bot-sample.c2pa` sidecar)

~2 MB AI-generated music (808 trap tune) produced by
[**rAIdio.bot**](https://store.steampowered.com/app/4600000), a
local-first AI music generation studio from
[Creative Mayhem UG](https://creativemayhem.app).

Signed with a C2PA manifest that includes:

- `c2pa.actions.v2` — marks the file as AI-generated
  (`digitalSourceType = trainedAlgorithmicMedia`, per IPTC).
- `com.raidio.model` — the model used (ACE-Step 1.5 XL, Apache-2.0,
  "No copyrighted music in training set").
- `com.raidio.product` — product name, vendor, URL.

MP3 format carries its manifest as an **external `.c2pa` sidecar** —
`rAIdio.bot-sample.c2pa`. Keep it next to the MP3; `provcheck` picks
it up automatically.

```
provcheck examples/rAIdio.bot-sample.mp3
```

## `vAIdeo.bot-sample.mp4`

~660 KB short AI-generated video bumper from
[**DoomscrollFM**](https://doomscroll.fm) — an autonomous AI satirical
news broadcast produced by [**vAIdeo.bot**](https://vaideo.bot),
rAIdio.bot's sibling product (video + audio).

Signed with a C2PA manifest that includes:

- `c2pa.actions.v2` — AI-generated marker.
- `c2pa.hash.bmff.v3` — data-hash binding for the MP4 payload,
  so tampering with the video bytes invalidates verification.
- `com.vaideo.product` — product attribution.
- `com.doomscroll.episode` — broadcast context.

MP4 format carries its manifest **embedded in the file** — no
sidecar.

```
provcheck examples/vAIdeo.bot-sample.mp4
```

## Regenerating

Both samples are produced deterministically from the upstream source
files by the in-tree `provcheck-examples` binary:

```
cargo run --release -p provcheck-examples -- \
  --audio-in <path-to-rAIdio-mp3> \
  --video-in <path-to-DoomscrollFM-bumper-mp4> \
  --out-dir examples
```

Each run synthesises a fresh ES256 cert chain (the common-name on
the signing cert is the product brand, which is what `provcheck`
surfaces as `signer`). No private keys ship with this repo.

## Licensing

The audio + video content in these samples is AI-generated output
from Creative Mayhem UG products (rAIdio.bot and vAIdeo.bot). These
specific sample files are licensed under Apache-2.0 along with the
rest of this repository.

Training data for the underlying AI models is disclosed in the
embedded manifest's `com.raidio.model.trainingDataSource` and
`com.raidio.model.trainingDataLicense` fields — read them via
`provcheck`.
