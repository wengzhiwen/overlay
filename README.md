# Overlay

运动数据 Overlay 生成器。

本项目输入 `GPX` 或 `TCX` 活动文件和一份 `JSON` / `YAML` 配置，输出一个带透明通道的 overlay 素材，供 Premiere、Resolve、Final Cut 等剪辑软件与原视频手动合成。当前 MVP 已实现基础的活动解析、预处理、五个基础 widget 渲染，以及透明 `MOV / ProRes 4444` 导出。

## Requirements

- Node.js >= 20
- npm >= 10
- macOS / Linux with `ffmpeg`

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

构建后运行：

```bash
npm run build
npm run start -- --help
```

渲染示例：

```bash
npm run dev -- render \
  --input ref_input/activity_22292952339.tcx \
  --config examples/sample-config.json \
  --output output/demo-run
```

当前示例配置会输出一个 12 秒、1920x1080、30fps 的透明 `overlay.mov`，方便快速验证整条链路。

如果只是快速预览布局而不想渲染整段活动，可以加上 `--sample`：

```bash
npm run dev -- render \
  --input ref_input/activity_22292952339.tcx \
  --config examples/sample-config-vertical-1080p.json \
  --output output/preview-run \
  --sample
```

`--sample` 会把最终输出时长限制到最多 30 秒，但不会修改你的配置文件。

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
└─ overlay.mov
```

## Config Notes

配置文件目前支持：

- 输出分辨率、帧率、时长策略
- 输出格式：`mov` 或 `png-sequence`
- 时间同步参数：offset / trim
- 五个基础 widget：
  - `speed`
  - `heart-rate`
  - `elevation`
  - `distance`
  - `time`
- 全局 theme 和每个 widget 的位置、尺寸、基础样式

可直接参考 [examples/sample-config.json](/Users/wengzhiwen/dev/overlay/examples/sample-config.json)。

## Development And Debugging

建议的日常开发流程：

1. 修改代码后先运行 `npm run typecheck`
2. 再运行 `npm run lint`
3. 需要做功能回归时运行 `npm run test`
4. 需要检查端到端渲染时运行 `npm run dev -- render ...`

常见调试入口：

- `ref_input/`
  仅用于开发期调试和本地验证
- `output/<run>/logs/`
  每个处理阶段一个独立日志文件
- `output/<run>/debug/activity.normalized.json`
  标准化和预处理后的活动数据
- `output/<run>/debug/frame-data.json`
  Remotion 使用的逐帧数据

## Project Structure

```text
.
├─ docs/
├─ examples/
├─ ref_input/
├─ src/
│  ├─ cli/
│  ├─ config/
│  ├─ domain/
│  ├─ parsers/
│  ├─ preprocess/
│  ├─ remotion/
│  ├─ render/
│  └─ utils/
├─ tests/
├─ agent.md
├─ eslint.config.mjs
├─ package.json
├─ tsconfig.json
└─ README.md
```

## Current Scope

已实现：

- `GPX` / `TCX` 输入
- 配置加载与 Zod 校验
- 活动归一化、插值、平滑、逐帧数据生成
- Remotion 渲染五个基础 widget
- 透明 `MOV / ProRes 4444` 导出
- `PNG` 序列导出
- 日志、调试产物、元数据输出

暂未实现：

- 地图小窗
- 功率与踏频 widget
- GUI 编辑器
- 自动与原视频做最终合成
