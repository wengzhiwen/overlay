# Sports Data Overlay Video Generator

**English** | **[日本語](docs/README_ja.md)** | **[简体中文](docs/README_zh-CN.md)**

If you use a Garmin watch or bike computer, or upload your activity data to Strava, you can download your workout data as GPX or TCX files.

This project converts GPX or TCX files containing GPS, heart rate, elevation, and other data into a transparent overlay video with a data dashboard. You can then composite this overlay onto your sports video in any video editor (Premiere, DaVinci Resolve, Final Cut Pro — virtually any NLE).

In your video editor, simply layer the overlay video on top of your sports footage:

![Video editor screenshot](docs/video_editor.png)

Output example:

![Output video example](docs/sample1_10s.gif)

It's a lightweight solution — no paid subscriptions, no clunky software you'll only use once.

## Requirements

- Node.js >= 20
- npm >= 10
- ffmpeg

## Setup

```bash
npm install
```

## Available Scripts

```bash
npm run build
npm run typecheck
npm run lint
npm run test
npm run dev -- --help
```

## Usage

Run in development mode:

```bash
npm run dev -- --help
```

Quick preview render:

```bash
npm run dev -- render \
  --input path/to/activity/file.tcx \
  --config examples/sample-config.json \
  --sample
```

The sample config produces a transparent MOV capped at 30 seconds, 1920x1080, 30fps. The final filename uses the segment's first second in the system local timezone, for example `2026-03-25_17-16-45.mov`.


### CLI Options

| Option | Shorthand | Description |
|--------|-----------|-------------|
| `--input <path>` | `-i` | Path to activity file (required) |
| `--config <path>` | `-c` | Path to config file (required) |
| `--output <path>` | `-o` | Output directory (default: `output/<timestamp>`) |
| `--sample` | | Cap render to 30 seconds for quick preview |
| `--concurrency <value>` | | Parallel render threads. Accepts a number (e.g. `8`) or CPU thread percentage (e.g. `75%`) |
| `--segments <number>` | | Split render into N segments for parallel processing. Each segment must be at least 10 seconds. Requires ffmpeg for concatenation. |

Use `--segments` to significantly speed up rendering for long activities. For example, splitting into 4 parallel segments:

```bash
npm run dev -- render \
  -i path/to/activity.tcx \
  -c examples/sample-config.json \
  --segments 4 \
  --concurrency 75%
```

## Output Structure

A typical render output directory looks like this:

```text
output/demo-run/
├─ source/
│  ├─ activity_22292952339.tcx
│  └─ sample-config.json
├─ debug/
│  ├─ activity.normalized.json
│  └─ frame-data.json
├─ logs/
│  ├─ 01-load-config.log
│  ├─ 02-load-activity.log
│  ├─ ...
│  └─ 11-postprocess.log
├─ metadata.json
└─ 2026-03-25_17-16-45.mov
```

If you just want the result, grab the timestamp-named `.mov` file.

## Config Notes

The config file currently supports:

- Output resolution, frame rate, and duration strategy
- Output format: `mov` or `png-sequence`
- Time sync parameters: offset / trim
- Six widgets:
  - `speed`
  - `heart-rate`
  - `elevation`
  - `distance`
  - `time`
  - `noodlemap`
- Global theme and per-widget position, size, and styling

See [examples/sample-config.json](examples/sample-config.json) for a working example.

I'm not great at visual design — widget PRs are very welcome!

## Current Scope

Implemented:

- `GPX` / `TCX` input
- Config loading with Zod validation
- Activity normalization, interpolation, smoothing, and per-frame data generation
- Remotion rendering for six widgets, including a GPS noodle map
- Transparent `MOV / ProRes 4444` export
- `--sample` quick preview, `--concurrency` parallelism control, `--segments` parallel segmented rendering
- Logging, debug artifacts, and metadata output

Roadmap:

- Better-looking widgets (definitely not my strong suit)
- Power and cadence widgets
- An online demo so people can quickly understand what this project does
