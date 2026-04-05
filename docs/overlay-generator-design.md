# 运动数据 Overlay 生成器

基础设计文档 v0.1

## 1. 文档目的

本文档定义第一阶段命令行工具的目标、边界、核心架构与主要模块职责，用于指导 MVP 实现。本文档优先解决“先做什么、模块如何分层、数据如何流动”这三个问题，不追求一次性覆盖所有未来能力。

## 2. 项目目标

开发一个命令行工具，输入一份运动轨迹文件和一份渲染配置，输出一个带透明通道的 overlay 视频，供用户在 Premiere、Resolve、Final Cut 等剪辑软件中手动与原视频合成。

第一阶段输入格式聚焦：

- `GPX`
- `TCX`

第一阶段输出格式聚焦：

- 主输出：透明 `.mov`，优先 `ProRes 4444`
- 可选输出：`PNG` 序列

## 3. 目标用户

目标用户是骑行、跑步、户外 Vlog 创作者，他们希望把以下运动数据叠加到视频中：

- 速度
- 心率
- 海拔
- 距离
- 时间
- 坡度
- 路线小地图
- 功率、踏频（后续）

## 4. 非目标

第一阶段明确不做以下内容：

- 不直接读取原始视频并自动输出最终成片
- 不做 GUI 编辑器
- 不做素材管理
- 不做音频处理
- 不做复杂时间同步 UI
- 不做实时预览播放器
- 不保证所有设备导出的 `GPX`、`TCX`、`FIT` 100% 兼容

## 5. 设计原则

### 5.1 单一职责

工具只负责把活动数据渲染为透明叠层素材，不负责整条视频生产链。

### 5.2 配置驱动

所有 overlay 的视觉与布局配置都收敛到配置文件中，CLI 本身只负责接收输入路径、配置路径和输出路径，不承载具体渲染参数。

### 5.3 领域模型隔离

Remotion 组件不直接依赖 `@sports-alliance/sports-lib` 返回的原始对象。解析完成后必须转换成内部统一领域模型，以降低对第三方库结构的耦合。

### 5.4 可调试优先

每个处理阶段都需要留下独立日志和可选调试产物，保证“某一步错了”时可以快速定位，而不是只能看到最终渲染失败。

### 5.5 有限扩展性

设计要为未来增加 `FIT`、地图组件、功率、踏频留出位置，但不做过度抽象，不引入复杂插件系统。

## 6. 总体方案

整体处理链如下：

```text
GPX / TCX 文件
    ↓
@sports-alliance/sports-lib 解析
    ↓
内部统一活动模型（Activity）
    ↓
预处理层
- 时间轴归一化
- 指标抽取
- 插值
- 平滑
- 逐帧数据生成
    ↓
Remotion Composition
- Speed
- HeartRate
- Elevation
- Distance
- Time
- MapMini（后续）
    ↓
透明 Overlay 视频输出
- 优先 MOV / ProRes 4444
- 可选 PNG 序列
- 可选 WebM alpha（后续）
    ↓
FFmpeg 后处理（可选）
- 转封装
- 序列转视频
- 兼容性兜底
```

分层职责如下：

- `sports-lib`：负责把不同格式的运动文件读成统一的活动对象
- 内部领域层：负责定义本项目真正使用的数据结构
- 预处理层：负责把离散轨迹点变成“可按帧查询”的连续时序数据
- Remotion 层：负责根据当前帧和配置完成画面渲染
- 渲染层：负责调用 Remotion 产出目标文件
- 可选后处理层：负责补齐编码、封装、兼容性处理

## 7. 技术选型

### 7.1 核心技术栈

- 语言：TypeScript
- 运行时：Node.js
- 活动文件解析：`@sports-alliance/sports-lib`
- 视频渲染：Remotion
- 配置格式：`JSON` 或 `YAML`
- 配置验证：Zod
- 测试：Vitest

### 7.2 选型说明

- `sports-lib` 适合作为输入解析层，因为它本身面向 `GPX`、`TCX`、`FIT`、`JSON` 等运动活动格式的统一处理。
- Remotion 适合作为 overlay 渲染层，因为它天然按帧驱动，适合“当前帧拿一份数据、输出一帧画面”的模型。
- `Zod` 用于确保配置在进入渲染前已经被结构化验证，尽量把错误提前暴露在加载阶段。
- `Vitest` 更轻量，适合当前以 TypeScript 工具链为主的项目。

### 7.3 输出格式策略

第一阶段支持：

1. 主输出：`.mov` + `ProRes 4444`
2. 可选输出：`PNG` 序列

设计上保留以下扩展点：

- `WebM alpha` 作为浏览器或网页场景的后续能力
- 使用系统 `FFmpeg` 进行必要的封装和兼容性处理

## 8. 建议目录结构

```text
project-root/
├─ docs/
│  ├─ overlay-generator-design.md
│  └─ widget-design.md
├─ src/
│  ├─ cli/
│  │  ├─ index.ts
│  │  └─ commands/
│  │     └─ render.ts
│  ├─ parsers/
│  │  └─ activity-loader.ts
│  ├─ domain/
│  │  ├─ activity.ts
│  │  ├─ metrics.ts
│  │  └─ frame-data.ts
│  ├─ preprocess/
│  │  ├─ normalize.ts
│  │  ├─ interpolate.ts
│  │  ├─ smooth.ts
│  │  ├─ derive-metrics.ts
│  │  └─ build-frame-data.ts
│  ├─ config/
│  │  ├─ schema.ts
│  │  └─ defaults.ts
│  ├─ remotion/
│  │  ├─ Root.tsx
│  │  ├─ compositions/
│  │  │  └─ OverlayComposition.tsx
│  │  ├─ widgets/
│  │  │  ├─ SpeedWidget.tsx
│  │  │  ├─ HeartRateWidget.tsx
│  │  │  ├─ ElevationWidget.tsx
│  │  │  ├─ DistanceWidget.tsx
│  │  │  └─ TimeWidget.tsx
│  │  └─ theme/
│  │     └─ default.ts
│  ├─ render/
│  │  ├─ render-overlay.ts
│  │  └─ codecs.ts
│  └─ utils/
│     ├─ time.ts
│     ├─ units.ts
│     └─ files.ts
├─ examples/
│  ├─ sample-config.json
│  └─ sample-data/
├─ output/
├─ package.json
└─ README.md
```

说明：

- 统一使用 `output/` 作为默认输出根目录。
- 每次运行在 `output/` 下创建一个时间戳子目录，避免多次渲染互相覆盖。

## 9. 核心数据流

### 9.1 输入

一次渲染任务的输入由三部分组成：

- 活动文件：`.gpx` 或 `.tcx`
- 渲染配置：`JSON` 或 `YAML`
- 可选同步参数：视频起始偏移、目标 fps、目标时长

### 9.2 处理阶段

建议拆成以下步骤：

1. `load-config`
2. `load-activity`
3. `normalize-activity`
4. `derive-metrics`
5. `interpolate-and-smooth`
6. `build-frame-data`
7. `render-overlay`
8. `postprocess`（可选）
9. `write-artifacts`

### 9.3 输出

每次运行默认输出到：

```text
output/<timestamp>/
```

至少包含：

- 原始源文件副本：`source/`
- `overlay.mov`
- `metadata.json`
- `debug/frame-data.json`
- `logs/*.log`

建议的输出结构：

```text
output/2026-04-05T13-30-00Z/
├─ source/
│  ├─ activity.gpx
│  └─ config.json
├─ overlay.mov
├─ metadata.json
├─ debug/
│  ├─ activity.normalized.json
│  └─ frame-data.json
└─ logs/
   ├─ 01-load-config.log
   ├─ 02-load-activity.log
   ├─ 03-normalize-activity.log
   ├─ 04-derive-metrics.log
   ├─ 05-build-frame-data.log
   ├─ 06-render-overlay.log
   └─ 07-postprocess.log
```

## 10. 统一领域模型设计

### 10.1 设计目标

统一领域模型用于隔离三件事：

- 输入解析库的对象结构
- 预处理时需要的时序数据结构
- Remotion 渲染真正需要的逐帧视图数据

### 10.2 Activity 建议结构

```ts
type Activity = {
  id: string;
  source: {
    filePath: string;
    format: "gpx" | "tcx";
  };
  sportType?: "ride" | "run" | "unknown";
  startedAt?: string;
  timezone?: string;
  summary: {
    durationMs?: number;
    distanceM?: number;
    ascentM?: number;
  };
  samples: ActivitySample[];
};

type ActivitySample = {
  timestampMs: number;
  elapsedMs: number;
  lat?: number;
  lon?: number;
  altitudeM?: number;
  distanceM?: number;
  speedMps?: number;
  heartRateBpm?: number;
  gradePct?: number;
  cadenceRpm?: number;
  powerW?: number;
};
```

设计约束：

- `elapsedMs` 必须存在，作为后续所有插值与逐帧采样的基准
- 所有单位在内部统一
- 缺失字段允许为 `undefined`，不要伪造不存在的数据

### 10.3 为什么不直接暴露 sports-lib 对象

原因如下：

- 第三方对象字段语义和结构不受本项目控制
- 同一个字段在不同输入格式下可能不稳定
- Remotion 组件不应该知道解析库的存在
- 后续如果更换解析库，影响面应当只局限在 `parsers/`

## 11. 预处理层设计

### 11.1 时间轴归一化

目标：

- 把原始采样点统一到以 `elapsedMs` 为基准的时间轴
- 处理缺失起始时间、时间不连续、重复点等问题
- 生成稳定、单调递增的样本序列

### 11.2 指标抽取

优先从源数据读取已有指标：

- 速度
- 心率
- 海拔
- 距离
- 时间

必要时可派生：

- 坡度
- 累计爬升

原则：

- 原始文件中没有的数据不强行生成
- 合理派生允许存在，但必须在 `metadata.json` 里记录来源和方法

### 11.3 插值

插值的目标不是“生成更真实的新数据”，而是让按帧渲染时有稳定值可读。

建议策略：

- 对连续数值型指标使用线性插值
- 对坐标也可线性插值，用于后续小地图轨迹动画
- 对明显离散或分类值不做插值

### 11.4 平滑

平滑主要用于降低 GPS 漂移、速度抖动、海拔噪声造成的视觉跳动。

建议：

- 速度、海拔、坡度允许启用轻度平滑
- 平滑窗口必须可配置
- 默认值保守，避免过度修饰原始数据

### 11.5 逐帧数据生成

`frameData` 是 Remotion 的直接输入。其目标是：给定任意帧号，都能在 O(1) 或近似 O(1) 的成本下拿到当前帧应显示的数据。

建议结构：

```ts
type FrameData = {
  fps: number;
  durationInFrames: number;
  frames: FrameSnapshot[];
};

type FrameSnapshot = {
  frame: number;
  elapsedMs: number;
  metrics: {
    speedMps?: number;
    heartRateBpm?: number;
    altitudeM?: number;
    ascentM?: number;
    distanceM?: number;
    gradePct?: number;
  };
  position?: {
    lat: number;
    lon: number;
  };
  clockTimeIso?: string;
};
```

## 12. 配置设计

### 12.1 总体原则

- 配置文件是 overlay 行为的唯一入口
- CLI 不接收具体样式参数
- 配置结构应当既支持全局默认值，也支持单个组件覆盖

### 12.2 建议配置结构

```ts
type OverlayConfig = {
  render: {
    width: number;
    height: number;
    fps: number;
    durationStrategy: "activity" | "fixed" | "trimmed";
    durationMs?: number;
    output: {
      format: "mov" | "png-sequence";
      codec?: "prores";
      proresProfile?: "4444" | "4444-xq";
    };
  };
  sync?: {
    activityOffsetMs?: number;
    trimStartMs?: number;
    trimEndMs?: number;
    timezone?: string;
  };
  theme?: {
    fontFamily?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      text?: string;
      muted?: string;
    };
  };
  widgets: WidgetConfig[];
  debug?: {
    dumpFrameData?: boolean;
    dumpNormalizedActivity?: boolean;
  };
};
```

### 12.3 Widget 配置原则

每个组件最少要支持：

- `type`
- `enabled`
- `x`
- `y`
- `scale`（画布宽度百分比，0.01–1）

通用样式建议：

- `fontFamily`
- `fontSize`
- `fontWeight`
- `textColor`
- `backgroundColor`
- `borderColor`
- `borderWidth`
- `borderRadius`
- `opacity`

说明：

- 组件位置由 `x`、`y` 绝对坐标指定
- 组件尺寸由 `scale`（百分比）+ 按组件类型固定的宽高比自动推导
- 推导公式：`width = canvasWidth × scale`，`height = width / aspectRatio`，`padding = width × 0.07`
- 用户不能自由设置 `width`、`height`、`padding`，由系统从 `scale` 统一计算

## 13. Remotion 层设计

### 13.1 Composition 职责

`OverlayComposition` 只做一件事：接收 `frameData` 和配置，基于当前帧渲染画面。

Composition 元信息包括：

- `width`
- `height`
- `fps`
- `durationInFrames`

### 13.2 Composition 输入

Composition 建议只接收以下内容：

- `frameData`
- `overlayConfig`
- 可选 `debug` 标志

不要在组件内部：

- 重新解析活动文件
- 重新计算复杂派生指标
- 执行 IO

### 13.3 透明背景要求

透明 overlay 是第一阶段的核心要求，因此 Composition 根节点不得设置不透明背景色。是否输出透明通道由渲染配置和编码参数共同决定，但 UI 渲染层本身必须允许背景完全透明。

### 13.4 组件原则

每个 widget 必须满足：

- 单一职责
- 纯函数
- 无副作用
- 只依赖当前帧数据和样式配置

### 13.5 MVP 组件清单

第一阶段提供：

- `SpeedWidget`
- `HeartRateWidget`
- `ElevationWidget`
- `DistanceWidget`
- `TimeWidget`

组件详细设计见单独文档：

- [widget-design.md](./widget-design.md)

## 14. 渲染与导出

### 14.1 主渲染流程

```text
CLI
  → load config
  → parse activity
  → preprocess activity
  → build frameData
  → invoke Remotion render
  → export overlay.mov
```

### 14.2 编码策略

第一阶段默认策略：

- 输出容器：`mov`
- 编码：`prores`
- profile：`4444`
- 图像格式：`png`
- pixel format：`yuva444p10le`

这是当前透明 ProRes overlay 的优先实现路径。

### 14.3 FFmpeg 的角色

FFmpeg 不承载业务逻辑，只负责媒体处理相关能力：

- 编码
- 封装
- 必要时把 PNG 序列转视频
- 调试和兼容性处理

如果 Remotion 的渲染管线已经满足目标输出，则后处理阶段可以为空操作。

## 15. CLI 设计

### 15.1 命令

```bash
overlay render --input ride.gpx --config config.json --output output/
```

### 15.2 设计原则

- CLI 只接收文件路径和任务入口参数
- overlay 的所有视觉配置都在 config 中定义
- 不在 CLI 上暴露颜色、位置、字体等渲染参数

### 15.3 退出码建议

- `0`：成功
- `1`：输入或配置错误
- `2`：解析失败
- `3`：渲染失败
- `4`：后处理失败

## 16. 日志与调试设计

### 16.1 日志原则

每一步都在输出目录中生成独立日志文件，一个步骤一个日志文件，便于定位问题。

### 16.2 建议记录内容

每一步日志建议至少包含：

- 开始时间
- 结束时间
- 输入摘要
- 输出摘要
- warning
- error

### 16.3 metadata.json 建议内容

```ts
type RenderMetadata = {
  runId: string;
  createdAt: string;
  input: {
    activityFile: string;
    configFile: string;
    format: "gpx" | "tcx";
  };
  render: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    outputFormat: string;
  };
  activity: {
    startedAt?: string;
    durationMs?: number;
    distanceM?: number;
    ascentM?: number;
  };
  warnings: string[];
};
```

## 17. MVP 范围定义

第一阶段交付物建议控制在以下范围：

- 支持 `GPX`、`TCX` 输入
- 支持 `JSON`、`YAML` 配置
- 支持 5 个基础 widget
- 支持透明 `MOV / ProRes 4444`
- 支持可选 `PNG` 序列
- 支持逐步骤日志与调试产物输出
- 支持基础时间偏移同步

明确延期到后续版本：

- `FIT` 完整接入
- `MapMini`
- 功率、踏频
- GUI 配置器
- 自动对齐原视频画面

## 18. 风险与待确认项

### 18.1 输入兼容性

不同设备导出的 `GPX`、`TCX` 质量差异很大，时间、海拔、距离、心率字段完整度不一致，需要在实现中准备容错逻辑。

### 18.2 时间同步

第一阶段只有偏移量同步，没有可视化对齐工具，因此用户体验会依赖配置是否准确。

### 18.3 数据平滑边界

平滑过强会损失真实性，平滑过弱会让 overlay 抖动明显，这部分需要通过样例数据进一步校准默认值。

### 18.4 时区语义

`TimeWidget` 既可能显示运动用时，也可能显示拍摄时刻或活动开始后的墙钟时间。时区规则需要在配置中明确。

## 19. 参考实现依据

以下信息已在 2026-04-05 查阅官方资料，并作为当前设计前提：

- Remotion 官方文档提供了透明 overlay 的输出方案，包含透明背景要求以及 `ProRes 4444` 所需编码参数。
- Remotion 官方文档说明透明视频可走 `ProRes` 或 `WebM alpha` 路径，其中 `ProRes` 更适合作为剪辑软件中的叠层素材。
- `@sports-alliance/sports-lib` 的官方包说明将其定位为 `GPX`、`TCX`、`FIT`、`JSON` 等运动文件的统一处理库。

本文档中的实现细节以“当前版本的官方能力”作为设计前提；真正编码时仍需再次按实际依赖版本校验。
