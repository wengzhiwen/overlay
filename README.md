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

The sample config produces a transparent `overlay.mov` capped at 30 seconds, 1920x1080, 30fps.

Remove `--sample` for a full render.

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
└─ overlay.mov
```

If you just want the result, grab `overlay.mov`.

## Config Notes

The config file currently supports:

- Output resolution, frame rate, and duration strategy
- Output format: `mov` or `png-sequence`
- Time sync parameters: offset / trim
- Five basic widgets:
  - `speed`
  - `heart-rate`
  - `elevation`
  - `distance`
  - `time`
- Global theme and per-widget position, size, and styling

See [examples/sample-config.json](examples/sample-config.json) for a working example.

I'm not great at visual design — widget PRs are very welcome!

## Current Scope

Implemented:

- `GPX` / `TCX` input
- Config loading with Zod validation
- Activity normalization, interpolation, smoothing, and per-frame data generation
- Remotion rendering for five basic widgets
- Transparent `MOV / ProRes 4444` export
- Logging, debug artifacts, and metadata output

Roadmap:

- Better-looking widgets (definitely not my strong suit)
- Map overlay
- Power and cadence widgets
- An online demo so people can quickly understand what this project does
