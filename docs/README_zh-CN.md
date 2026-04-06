# 运动数据 Overlay 视频生成器

**[English](../README.md)** | **[日本語](README_ja.md)** | **简体中文**

如果使用 Garmin 的手表、码表或是将运动数据上传到 Strava 之后，就可以下载到 GPX 或是 TCX 这样的运动数据文件。

本项目可以将带有GPS、心率、海拔等信息的 GPX 或 TCX 数据文件转化成一个带有这些数据仪表的透明的视频（overlay视频）。有了这个视频，你就可以在视频编辑软件（Premiere、Resolve、Final Cut…几乎任何编辑软件）中将数据仪表和你的运动视频整合到一起。

在视频编辑软件中，将 overlay 视频叠到运动视频上方：

![视频编辑器示意图](video_editor.png)

输出示例：

![输出视频示例](sample1_10s.gif)

这是一个超轻量级的解决方案，不再需要付费购买甚至订阅任何软件，也不用再去下载一个只为了做这件事但超级不好用的软件。

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

开发态运行：

```bash
npm run dev -- --help
```

渲染示例：

```bash
npm run dev -- render \
  --input path/to/a/tcx gpx/file.tcx \
  --config examples/sample-config.json \
  --sample
```

当前示例配置会输出一个不超过 30 秒、1920x1080、30fps 的透明 MOV。最终文件名会使用该段视频第一秒在系统本地时区下的时间戳，例如 `2026-03-25_17-16-45.mov`。


### CLI 选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--input <path>` | `-i` | 活动文件路径（必选） |
| `--config <path>` | `-c` | 配置文件路径（必选） |
| `--output <path>` | `-o` | 输出目录（默认 `output/<timestamp>`） |
| `--sample` | | 限制渲染最多 30 秒，用于快速预览 |
| `--concurrency <value>` | | 并行渲染线程数。支持数字（如 `8`）或 CPU 线程数百分比（如 `75%`） |
| `--segments <number>` | | 分段并行渲染数。每段至少 10 秒，需要 ffmpeg 用于拼接 |

使用 `--segments` 可以显著加速长视频的渲染。例如将渲染分为 4 段并行处理：

```bash
npm run dev -- render \
  -i path/to/activity.tcx \
  -c examples/sample-config.json \
  --segments 4 \
  --concurrency 75%
```

## Output Structure

一次渲染的输出目录大致如下：

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
如果你只是使用的话，只要找到那个按时间戳命名的 `.mov` 文件就好了。

## Config Notes

配置文件目前支持：

- 输出分辨率、帧率、时长策略
- 输出格式：`mov` 或 `png-sequence`
- 时间同步参数：offset / trim
- 六个 widget：
  - `speed`
  - `heart-rate`
  - `elevation`
  - `distance`
  - `time`
  - `noodlemap`
- 全局 theme 和每个 widget 的位置、尺寸、基础样式

可直接参考 [examples/sample-config.json](../examples/sample-config.json)。

我是一个没有审美能力的人，欢迎大家提供你们的widget的PR给我。

## Current Scope

已实现：

- `GPX` / `TCX` 输入
- 配置加载与 Zod 校验
- 活动归一化、插值、平滑、逐帧数据生成
- Remotion 渲染六个 widget，其中包含 GPS 轨迹 noodlemap
- 透明 `MOV / ProRes 4444` 导出
- `--sample` 快速预览、`--concurrency` 并行度控制、`--segments` 分段并行渲染
- 日志、调试产物、元数据输出

未来目标：

- 更好看的 widgt，虽然这可能是我最不擅长的事情
- 功率与踏频 widget
- 一个线上的 demo，让大家可以更容易的get到这个项目到底在做什么
