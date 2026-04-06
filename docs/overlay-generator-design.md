# 运动数据 Overlay 生成器

设计文档 v0.3

## 1. 文档目的

本文档定义第一阶段命令行工具的目标、边界、核心架构与主要模块职责，用于指导 MVP 实现。本文档优先解决"先做什么、模块如何分层、数据如何流动"这三个问题，不追求一次性覆盖所有未来能力。

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

每个处理阶段都需要留下独立日志和可选调试产物，保证"某一步错了"时可以快速定位，而不是只能看到最终渲染失败。

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
- 空窗检测与分段
- 指标抽取与派生
- 插值（空窗边界不插值）
- 平滑（窗口不跨越空窗）
- 短空窗填充
- 逐帧数据生成（1Hz snapshot）
    ↓
Remotion Composition
- Speed
- HeartRate（含可选柱状图）
- Elevation
- Distance
- Time
- MapMini（后续）
    ↓
透明 Overlay 视频输出
- 优先 MOV / ProRes 4444（via 低频 PNG snapshot + FFmpeg 编码）
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
- 预处理层：负责把离散轨迹点变成"可按帧查询"的连续时序数据
- Remotion 层：负责根据当前帧和配置完成画面渲染
- 渲染层：负责低频快照渲染、FFmpeg 编码、分段并行拼接
- 可选后处理层：负责补齐编码、封装、兼容性处理

## 7. 技术选型

### 7.1 核心技术栈

- 语言：TypeScript（strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`）
- 运行时：Node.js >= 20，ESM
- 活动文件解析：`@sports-alliance/sports-lib`
- 视频渲染：Remotion 4.x
- 配置格式：`JSON` 或 `YAML`
- 配置验证：Zod 4.x（含 `.transform()` 做维度推导）
- 测试：Vitest
- CLI：Commander

### 7.2 选型说明

- `sports-lib` 适合作为输入解析层，因为它本身面向 `GPX`、`TCX`、`FIT`、`JSON` 等运动活动格式的统一处理。
- Remotion 适合作为 overlay 渲染层，因为它天然按帧驱动，适合"当前帧拿一份数据、输出一帧画面"的模型。
- `Zod` 用于确保配置在进入渲染前已经被结构化验证，尽量把错误提前暴露在加载阶段。`transform` 用于在验证时自动推导 widget 尺寸。
- `Vitest` 更轻量，适合当前以 TypeScript 工具链为主的项目。

### 7.3 输出格式策略

第一阶段支持：

1. 主输出：`.mov` + `ProRes 4444`
2. 可选输出：`PNG` 序列

设计上保留以下扩展点：

- `WebM alpha` 作为浏览器或网页场景的后续能力
- 使用系统 `FFmpeg` 或 Remotion 内置 compositor FFmpeg 进行编码和兼容性处理

## 8. 目录结构

```text
project-root/
├─ docs/
│  ├─ overlay-generator-design.md
│  └─ widget-design.md
├─ src/
│  ├─ cli/
│  │  ├─ index.ts                    # Commander 入口，含 heap 扩容逻辑
│  │  └─ commands/
│  │     └─ render.ts                # render 命令实现
│  ├─ parsers/
│  │  └─ activity-loader.ts          # sports-lib 解析 → Activity
│  ├─ domain/
│  │  ├─ activity.ts                 # Activity、ActivitySample、ActivityZone
│  │  ├─ metrics.ts                  # ActivityMetrics
│  │  └─ frame-data.ts              # FrameData、FrameSnapshot、索引查询
│  ├─ preprocess/
│  │  ├─ normalize.ts               # 时间轴归一化（保留真实时间间隔）
│  │  ├─ detect-gaps.ts             # 空窗检测与分类（20s/120s 阈值）
│  │  ├─ split-activity.ts          # 长空窗分段
│  │  ├─ fill-gaps.ts               # 短空窗填充
│  │  ├─ derive-metrics.ts          # 派生指标（坡度、累计爬升，空窗边界跳过）
│  │  ├─ interpolate.ts             # 缺失样本插值（空窗区域不插值）
│  │  ├─ smooth.ts                  # 平滑（窗口不跨越空窗边界）
│  │  └─ build-frame-data.ts        # 逐帧 snapshot 生成（传播 isDataGap）
│  ├─ config/
│  │  ├─ schema.ts                  # Zod schema + widget 维度推导
│  │  ├─ load-config.ts             # 配置加载（JSON/YAML）
│  │  └─ defaults.ts                # 默认配置
│  ├─ remotion/
│  │  ├─ index.ts                   # Remotion 入口注册点
│  │  ├─ Root.tsx                    # Composition 定义
│  │  ├─ compositions/
│  │  │  └─ OverlayComposition.tsx   # 主 Composition，文件加载帧数据
│  │  ├─ widgets/
│  │  │  ├─ WidgetShell.tsx          # 通用 widget 外壳（布局、样式）
│  │  │  ├─ SpeedWidget.tsx
│  │  │  ├─ HeartRateWidget.tsx
│  │  │  ├─ HeartRateChart.tsx       # 心率柱状图组件
│  │  │  ├─ ElevationWidget.tsx
│  │  │  ├─ DistanceWidget.tsx
│  │  │  └─ TimeWidget.tsx
│  │  └─ theme/
│  │     └─ default.ts              # 默认主题 + mergeThemeWithConfig
│  ├─ render/
│  │  ├─ render-overlay.ts          # 完整渲染管线编排
│  │  └─ codecs.ts                  # 编码常量
│  └─ utils/
│     ├─ time.ts                    # 时间格式化
│     ├─ units.ts                   # 单位转换
│     └─ files.ts                   # 文件操作
├─ examples/
│  └─ sample-config.json
├─ output/                          # 默认输出根目录
├─ package.json
└─ README.md
```

说明：

- 统一使用 `output/` 作为默认输出根目录
- 每次运行在 `output/` 下创建一个时间戳子目录，避免多次渲染互相覆盖
- `defaults.ts` 提供完整默认配置，用于 Remotion preview 和 fallback

## 9. 核心数据流

### 9.1 输入

一次渲染任务的输入由三部分组成：

- 活动文件：`.gpx` 或 `.tcx`
- 渲染配置：`JSON` 或 `YAML`
- 可选 CLI 参数：`--sample`（限制 30 秒）、`--concurrency`（并行度）、`--segments`（分段并行）

### 9.2 处理阶段

实际管线步骤如下（每步一个独立日志文件）：

1. `01-load-config` — 加载并校验配置
2. `02-load-activity` — 解析活动文件（含真实时间戳提取）
3. `03-normalize-activity` — 时间轴归一化（保留真实时间间隔）
4. `04-detect-gaps` — 空窗检测与分类（短空窗 20-120s / 长空窗 >120s）
5. 长空窗分段（拆分为独立 Activity）— 无日志步骤
6. **对每段循环** 步骤 7-14：
7. `05-derive-metrics` — 派生指标（空窗边界跳过 delta 计算）
8. `06-interpolate-and-smooth` — 插值（空窗区域不插值）+ 平滑（窗口不跨越空窗）
9. 短空窗填充 + 重索引 — 无日志步骤
10. `07-build-frame-data` — 构建 1Hz snapshot 序列（传播 `isDataGap`）
11. `08-build-project` — TypeScript 编译（仅一次）
12. `09-bundle-remotion` — Remotion bundle（仅一次）
13. `09b-write-frame-data` — 将帧数据写入 serve 目录
14. `10-render-overlay` — 渲染输出（PNG snapshot → FFmpeg 编码）
15. `11-postprocess` — 后处理（当前为空操作）

说明：

- 步骤 4-5 在第一个段和后续段之间执行一次空窗检测和分段
- 步骤 8-9（build project / bundle Remotion）仅在首次执行，后续段共享
- 每段输出到独立目录，使用活动起始时间的本地时区格式命名

### 9.3 输出

每次运行默认输出到以活动起始时间（本地时区）命名的目录：

```text
output/<YYYY-MM-DD_HH-mm-ss>/
```

若存在长空窗（>120s），活动被拆分为多段，每段输出到独立目录，均以各自起始时间命名。

单段输出结构：

```text
output/2026-04-06_14-30-00/
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
   ├─ 04-detect-gaps.log
   ├─ 05-derive-metrics.log
   ├─ 06-interpolate-and-smooth.log
   ├─ 07-build-frame-data.log
   ├─ 08-build-project.log
   ├─ 08b-bundle-remotion.log
   ├─ 08c-write-frame-data.log
   ├─ 09-select-composition.log
   ├─ 10-render-overlay.log
   └─ 11-postprocess.log
```

多段输出（长空窗分段时）：

```text
output/2026-04-06_14-30-00/          ← 第一段（14:30 出发）
├─ overlay.mov
├─ metadata.json
└─ logs/...
output/2026-04-06_15-00-00/          ← 第二段（15:00 恢复）
├─ overlay.mov
├─ metadata.json
└─ logs/...
```

- 无长空窗时行为与单段一致
- 目录名使用系统本地时区（非 UTC）
- 若活动无 `startedAt`，退化为当前渲染时间命名

## 10. 统一领域模型设计

### 10.1 设计目标

统一领域模型用于隔离三件事：

- 输入解析库的对象结构
- 预处理时需要的时序数据结构
- Remotion 渲染真正需要的逐帧视图数据

### 10.2 Activity 结构

```ts
type ActivitySourceFormat = "gpx" | "tcx";

type DataGap = {
  afterIndex: number;    // 空窗前最后一个样本的索引
  beforeIndex: number;   // 空窗后第一个样本的索引
  startMs: number;       // 空窗起始 elapsedMs
  endMs: number;         // 空窗结束 elapsedMs
  durationMs: number;    // 空窗持续时间
};

type ActivityZone = {
  min: number | undefined;
  max: number | undefined;
  color: string | undefined;
  label: string | undefined;
};

type ActivitySample = {
  timestampMs: number;
  elapsedMs: number;
  lat: number | undefined;
  lon: number | undefined;
  altitudeM: number | undefined;
  distanceM: number | undefined;
  speedMps: number | undefined;
  heartRateBpm: number | undefined;
  ascentM: number | undefined;
  gradePct: number | undefined;
  cadenceRpm: number | undefined;
  powerW: number | undefined;
  isDataGap?: boolean;          // 短空窗填充的空样本标记
};

type Activity = {
  id: string;
  source: {
    filePath: string;
    format: ActivitySourceFormat;
  };
  sportType: "ride" | "run" | "unknown" | undefined;
  startedAt: string | undefined;
  timezone: string | undefined;
  warnings: string[];
  zones: {
    heartRate: ActivityZone[];
  };
  summary: {
    durationMs: number | undefined;
    distanceM: number | undefined;
    ascentM: number | undefined;
  };
  samples: ActivitySample[];
  gaps: DataGap[];
};
```

设计约束：

- `elapsedMs` 基于源文件真实时间戳计算，反映实际时间间隔（含空窗跳跃）
- 归一化步骤不再将 `elapsedMs` 重索引为 `index * 1000`，保留真实时间间隔信息
- 空窗（≥20s）在 `gaps` 数组中记录，按时长分为短空窗（20-120s）和长空窗（>120s）
- `isDataGap` 标记短空窗填充时插入的空样本（所有指标为 undefined）
- 所有单位在内部统一
- 缺失字段为 `undefined`，不伪造不存在的数据
- `warnings` 收集解析和预处理过程中的告警信息
- `zones` 存储心率区间等分区信息，供 HeartRateWidget 使用

### 10.3 ActivityMetrics

```ts
type ActivityMetrics = {
  speedMps: number | undefined;
  heartRateBpm: number | undefined;
  altitudeM: number | undefined;
  ascentM: number | undefined;
  distanceM: number | undefined;
  gradePct: number | undefined;
  cadenceRpm: number | undefined;
  powerW: number | undefined;
};
```

独立定义 `ActivityMetrics` 类型，被 `FrameSnapshot` 引用，保证 metrics 字段结构的一致性。

### 10.4 为什么不直接暴露 sports-lib 对象

原因如下：

- 第三方对象字段语义和结构不受本项目控制
- 同一个字段在不同输入格式下可能不稳定
- Remotion 组件不应该知道解析库的存在
- 后续如果更换解析库，影响面应当只局限在 `parsers/`

## 11. 预处理层设计

### 11.1 时间轴归一化

目标：

- 把原始采样点按 `elapsedMs` 排序，去重，保留真实时间间隔
- 不再重索引为 `index * 1000`，保留空窗跳跃信息
- `elapsedMs` 基于源文件真实时间戳计算（`realTimestampMs - startedAtMs`），反映实际时间流逝
- 当源文件无真实时间戳时退化为 `index * 1000`

### 11.2 空窗检测

活动数据中的"空窗"指设备暂停（自动暂停或手动暂停）导致的时间跳跃。GPS 信号丢失不会造成空窗（打点仍然存在）。

检测阈值：

- **空窗判定**：相邻样本 `elapsedMs` 差值 - 1000ms > 20,000ms（20 秒）
- **短空窗**：20s < 空窗时长 ≤ 120s → 填充空帧，Widget 显示空态
- **长空窗**：空窗时长 > 120s → 视频分段截断

检测算法扫描归一化后的 samples 数组，找出所有 `elapsedMs` 跳跃 > 20s 的位置，记录到 `Activity.gaps` 数组。

### 11.3 长空窗分段

对于超过 120 秒的长空窗，将 Activity 在空窗处拆分为独立子活动：

- 每个子活动的 `samples` 是原始数组的一个连续切片
- 每个子活动的 `elapsedMs` 从 0 重新索引
- 每个子活动的 `startedAt` 基于其第一个样本的真实 `timestampMs` 重新计算
- 每个子活动保留自己范围内的短空窗信息
- 每个子活动独立走后续预处理和渲染管线，输出独立视频文件

### 11.4 短空窗填充

对于 20-120 秒的短空窗，在空窗区域插入空样本：

- 空样本所有指标为 `undefined`，标记 `isDataGap: true`
- 插入后重索引 `elapsedMs` 为连续 1 秒间隔
- 填充后的 sample 序列可直接用于逐帧映射（`elapsedMs / 1000` = sample index）

### 11.5 指标抽取与派生

目标：

- 把原始采样点统一到以 `elapsedMs` 为基准的时间轴
- 处理缺失起始时间、时间不连续、重复点等问题
- 生成稳定、单调递增的样本序列

### 11.2 指标抽取与派生

优先从源数据读取已有指标：

- 速度
- 心率
- 海拔
- 距离
- 时间

`derive-metrics` 步骤负责派生：

- 累计爬升（`ascentM`）
- 坡度（`gradePct`）

原则：

- 原始文件中没有的数据不强行生成
- 合理派生允许存在，但必须在 `metadata.json` 里记录来源和方法

### 11.6 插值

插值的目标不是"生成更真实的新数据"，而是让按帧渲染时有稳定值可读。

策略：

- 由配置 `preprocess.interpolateMissingSamples` 控制（默认开启）
- 对连续数值型指标使用线性插值
- 对坐标也可线性插值，用于后续小地图轨迹动画
- 对明显离散或分类值不做插值
- **空窗区域不插值**：标记为 `isDataGap` 的样本跳过插值，且插值搜索边界不跨越空窗

### 11.7 平滑

平滑主要用于降低 GPS 漂移、速度抖动、海拔噪声造成的视觉跳动。

配置项：

- `preprocess.speedSmoothingSeconds`（默认 3）
- `preprocess.heartRateSmoothingSeconds`（默认 3）
- `preprocess.altitudeSmoothingSeconds`（默认 5）
- `preprocess.gradeSmoothingSeconds`（默认 5）

所有窗口均可配置，范围 1–15 秒。默认值保守，避免过度修饰原始数据。

空窗约束：

- **平滑窗口不跨越空窗边界**：移动平均窗口内的空窗样本（`isDataGap: true`）被排除，防止空窗两侧的数据互相污染

### 11.8 逐帧数据生成

`frameData` 是 Remotion 的直接输入。生成策略为固定 1Hz snapshot（`SNAPSHOT_INTERVAL_MS = 1000`），每个 snapshot 对应 1 秒的活动数据。

```ts
type FrameData = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  snapshotIntervalMs: number;
  frames: FrameSnapshot[];
  heartRateZones: ActivityZone[];
  activityDurationMs: number;
};

type FrameSnapshot = {
  frame: number;
  elapsedMs: number;
  renderTimeMs: number;
  isActive: boolean;
  isDataGap: boolean;
  metrics: ActivityMetrics;
  position:
    | {
        lat: number;
        lon: number;
      }
    | undefined;
  clockTimeIso: string | undefined;
};
```

关键字段说明：

- `renderTimeMs`：渲染时间轴上的时间，受 `activityOffsetMs` 偏移影响
- `isActive`：当前帧是否处于活动有效时段内
- `isDataGap`：当前帧是否处于短空窗区域（空窗填充产生的空帧），Widget 据此渲染空态
- `snapshotIntervalMs`：固定 1000ms，snapshot 与 render frame 之间的映射由 `getSnapshotForRenderFrame` 计算
- `heartRateZones`：心率区间数据，从 Activity 传递到 HeartRateWidget
- `activityDurationMs`：活动原始时长

查询函数：

- `getSnapshotForRenderFrame(frameData, frame)` — 给定渲染帧号，返回对应 snapshot
- `getSnapshotForElapsedMs(frameData, elapsedMs)` — 给定活动经过时间，返回对应 snapshot

## 12. 配置设计

### 12.1 总体原则

- 配置文件是 overlay 行为的唯一入口
- CLI 不接收具体样式参数
- 配置结构应当既支持全局默认值，也支持单个组件覆盖
- Zod schema 使用 `.transform()` 在验证后自动推导 widget 尺寸

### 12.2 配置结构

```ts
type OverlayConfig = {
  render: {
    width: number;                    // 默认 1920
    height: number;                   // 默认 1080
    fps: number;                      // 默认 30
    durationStrategy: "activity" | "fixed" | "trimmed";  // 默认 "activity"
    durationMs?: number;
    output: {
      format: "mov" | "png-sequence"; // 默认 "mov"
      codec: "prores";                // 默认 "prores"
      proresProfile: "4444" | "4444-xq";  // 默认 "4444"
    };
  };
  sync: {
    activityOffsetMs: number;         // 默认 0
    trimStartMs: number;              // 默认 0
    trimEndMs: number;                // 默认 0
    timezone?: string;
  };
  preprocess: {
    interpolateMissingSamples: boolean;  // 默认 true
    speedSmoothingSeconds: number;       // 默认 3, 范围 1–15
    heartRateSmoothingSeconds: number;   // 默认 3, 范围 1–15
    altitudeSmoothingSeconds: number;    // 默认 5, 范围 1–15
    gradeSmoothingSeconds: number;       // 默认 5, 范围 1–15
  };
  theme: {
    fontFamily: string;               // 默认 "SF Pro Display, Helvetica, Arial, sans-serif"
    colors: {
      primary: string;                // 默认 "#ffffff"
      secondary: string;              // 默认 "#cbd5e1"
      accent: string;                 // 默认 "#34d399"
      text: string;                   // 默认 "#ffffff"
      muted: string;                  // 默认 "#94a3b8"
    };
  };
  widgets: WidgetConfig[];            // 经 resolveWidgetDimensions 推导后含 width/height/padding
  debug: {
    dumpFrameData: boolean;           // 默认 true
    dumpNormalizedActivity: boolean;  // 默认 true
  };
};
```

### 12.3 Widget 配置与维度推导

每个组件共享 `BaseWidgetConfig`：

- `id`、`type`（discriminated union）
- `enabled`（默认 true）
- `x`、`y`（绝对坐标）
- `scale`（画布宽度百分比 0.01–1，默认 0.15）
- 样式覆盖：`opacity`、`backgroundColor`、`borderColor`、`borderWidth`、`borderRadius`、`fontFamily`、字号、颜色等

维度推导在 Zod `.transform()` 中自动完成：

- `width = round(canvasWidth × scale)`
- `height = round(width / aspectRatio)`（按 widget 类型固定宽高比）
- `padding = max(8, round(width × 0.07))`

推导后的 `width`、`height`、`padding` 字段附加到 widget 配置上，用户不可直接设置。

## 13. Remotion 层设计

### 13.1 Composition 职责

`OverlayComposition` 接收 `frameDataMeta`（轻量元信息）和 `overlayConfig`，基于当前帧渲染画面。完整的帧数据（`FrameSnapshot[]`）通过 HTTP 从 serve 目录的 `frame-data.json` 文件加载，避免大量数据通过 `inputProps` 序列化导致 OOM。

Composition 元信息包括：

- `width`、`height`、`fps`、`durationInFrames`

### 13.2 Composition 输入

Composition 只接收以下内容：

- `frameDataMeta`：不含 frames 数组的轻量元信息（`FrameDataMeta`）
- `overlayConfig`：完整配置

帧数据加载流程：

1. 组件挂载时调用 `delayRender()` 暂停渲染
2. `fetch("/frame-data.json")` 加载帧数据
3. 加载完成后 `continueRender()` 恢复渲染

不要在组件内部：

- 重新解析活动文件
- 重新计算复杂派生指标
- 执行 IO（文件加载除外）

### 13.3 透明背景要求

透明 overlay 是第一阶段的核心要求，因此 Composition 根节点 `AbsoluteFill` 设置 `backgroundColor: "transparent"`。透明通道由 ProRes 4444 编码保证。

### 13.4 组件原则

每个 widget 必须满足：

- 单一职责
- 纯函数，无副作用
- 只依赖当前帧数据和样式配置
- 通过 `WidgetShell` 共享布局和样式骨架

### 13.5 MVP 组件清单

第一阶段提供：

- `SpeedWidget`
- `HeartRateWidget`（含 `HeartRateChart` 柱状图组件）
- `ElevationWidget`
- `DistanceWidget`
- `TimeWidget`
- `WidgetShell`（通用外壳，非独立 widget）

组件详细设计见单独文档：

- [widget-design.md](./widget-design.md)

## 14. 渲染与导出

### 14.1 主渲染流程

```text
CLI
  → load config
  → parse activity（含真实时间戳提取）
  → normalize activity（保留真实时间间隔）
  → detect gaps（空窗检测与分类）
  → split at long gaps（长空窗分段，无长空窗时返回单个 Activity）
  → [for each segment]:
      → derive metrics（空窗边界跳过 delta）
      → interpolate & smooth（空窗区域不处理）
      → fill short gaps（插入空样本，重索引为连续 1s）
      → build frameData
      → write frame-data.json to serve dir
      → render low-fps PNG snapshots via Remotion (everyNthFrame)
      → encode to MOV via FFmpeg (ProRes 4444)
      → write metadata.json
  → [shared once]:
      → build project (tsc)
      → bundle Remotion
```

多段渲染约束：

- build project 和 bundle Remotion 仅执行一次，所有段共享
- 每段的 frame-data.json 写入同一 serve 目录，渲染完成后下一段覆盖
- 每段输出到独立目录，以活动起始时间（本地时区）命名
- 已有的 `--segments` 分段并行渲染功能在各段内部仍然可用

### 14.2 低频快照渲染策略

实际渲染不使用 Remotion 内置的 `renderMedia` 直接输出 MOV，而是采用低频快照策略：

1. 使用 Remotion `renderFrames` 以 `everyNthFrame` 步长渲染 PNG snapshot（1fps）
2. 使用 FFmpeg 将 PNG 序列编码为目标 fps 的 ProRes 4444 MOV
3. 编码参数：`prores_ks` 编码器、`yuva444p10le` 像素格式、`-alpha_bits 16`

这样做的优势：

- 大幅减少需要渲染的帧数（30fps → 1fps）
- PNG + FFmpeg 编码路径对 ProRes alpha 通道更可靠
- 支持分段并行渲染

### 14.3 分段并行渲染

通过 `--segments N` 选项启用分段并行渲染：

1. 将总帧数按 snapshot 边界拆分为 N 个段（每段至少 10 秒）
2. 并行渲染每个段的 PNG 序列
3. 并行编码每个段的 MOV（最多 2 个并行编码器）
4. 使用 FFmpeg `concat` 协议拼接所有段

并行度控制：

- 每段并发数 = `--concurrency / N`（向下取整，最小 1）
- 编码并发数 = `min(2, N)`
- 总进程 heap 按每段约 2GB 预留，不足时自动 re-spawn 扩容

### 14.4 编码参数

第一阶段默认策略：

- 输出容器：`mov`
- 编码器：`prores_ks`（FFmpeg）
- profile：`4`（对应 ProRes 4444）或 `5`（对应 4444 XQ）
- 像素格式：`yuva444p10le`
- alpha bits：`16`

### 14.5 FFmpeg 的角色

FFmpeg 在渲染管线中承担核心编码职责：

- 将低频 PNG 序列编码为目标 fps 的 ProRes 4444 MOV
- 分段拼接（`concat` 协议）
- 兼容性处理和封装转换

FFmpeg 可执行文件查找优先级：

1. 系统 `ffmpeg`
2. Remotion 内置 `compositor-*` 包中的 `ffmpeg`
3. 回退到系统 `ffmpeg`

如果输出格式为 PNG 序列，则不涉及 FFmpeg 编码。

## 15. CLI 设计

### 15.1 命令

```bash
overlay render -i ride.gpx -c config.json -o output/
overlay render -i ride.gpx -c config.json -o output/ --sample
overlay render -i ride.gpx -c config.json -o output/ --concurrency 8
overlay render -i ride.gpx -c config.json -o output/ --segments 4
```

### 15.2 CLI 选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--input <path>` | `-i` | 活动文件路径（必选） |
| `--config <path>` | `-c` | 配置文件路径（必选） |
| `--output <path>` | `-o` | 输出目录（默认 `output/<timestamp>`） |
| `--sample` | | 限制渲染最多 30 秒，用于快速预览 |
| `--concurrency <value>` | | 并行渲染线程数。支持数字（如 `8`）或百分比（如 `75%`） |
| `--segments <number>` | | 分段并行数。每段至少 10 秒，需要 FFmpeg |

### 15.3 设计原则

- CLI 只接收文件路径和任务调度参数
- overlay 的所有视觉配置都在 config 中定义
- 不在 CLI 上暴露颜色、位置、字体等渲染参数

### 15.4 退出码

- `0`：成功
- `1`：输入或配置错误
- `2`：解析失败
- `3`：渲染失败
- `4`：后处理失败

### 15.5 Heap 扩容

当 `--segments > 1` 时，CLI 入口会检测当前 Node.js heap 上限。若不足（按每段约 2GB 预留），自动以扩容后的 `--max-old-space-size` re-spawn 子进程。

## 16. 日志与调试设计

### 16.1 日志原则

每一步都在输出目录中生成独立日志文件，一个步骤一个日志文件，便于定位问题。日志同时输出到 CLI 控制台（带步骤前缀）。

### 16.2 日志格式

每条日志格式：`[ISO时间戳] [LEVEL] 消息内容`

渲染进度日志包含：

- 已渲染帧数 / 总帧数
- 已渲染时长 / 总时长
- 预估剩余时间（ETA）

### 16.3 metadata.json 结构

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
    snapshotIntervalMs: number;
    outputFormat: string;
    sampleMaxDurationMs: number | undefined;
  };
  activity: {
    startedAt: string | undefined;
    durationMs: number | undefined;
    distanceM: number | undefined;
    ascentM: number | undefined;
  };
  warnings: string[];
};
```

## 17. MVP 范围定义

第一阶段交付物：

- 支持 `GPX`、`TCX` 输入
- 支持 `JSON`、`YAML` 配置
- 支持 5 个基础 widget（含心率柱状图）
- 支持透明 `MOV / ProRes 4444`
- 支持可选 `PNG` 序列
- 支持逐步骤日志与调试产物输出
- 支持基础时间偏移同步
- 支持 `--sample` 快速预览
- 支持 `--concurrency` 并行度控制
- 支持 `--segments` 分段并行渲染

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
