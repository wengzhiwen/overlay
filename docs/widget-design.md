# 运动数据 Overlay 生成器

组件设计文档 v0.2

本文档覆盖 MVP 组件设计，包括组件边界、输入输出、配置结构和通用骨架。

## 1. 设计目标

MVP 组件层需要满足以下目标：

- 每个组件只负责一种核心信息表达
- 组件不关心解析过程和预处理细节
- 组件只消费"当前帧数据 + 组件配置 + 全局主题"
- 对缺失数据有明确降级行为
- 配置项允许后续扩展，但当前实现不过度复杂

## 2. 通用组件约定

### 2.1 组件输入

每个 widget 统一接收以下 props：

```ts
type BaseWidgetProps<TConfig extends WidgetConfig> = {
  frame: FrameSnapshot;
  frameData: FrameData;
  config: TConfig;
  theme: OverlayTheme;
};
```

说明：

- `frame`：当前帧对应的数据快照
- `frameData`：完整帧数据（含心率区间、活动时长等上下文）
- `config`：当前组件自己的配置（含推导后的 `width`/`height`/`padding`）
- `theme`：全局默认样式（经 `mergeThemeWithConfig` 合并后）

### 2.2 组件输出

组件输出为一个绝对定位的 React 视觉节点，不返回业务对象，不写日志，不做 IO。

### 2.3 通用行为规则

- 纯函数，无副作用
- 不在组件内部做重型计算
- 不直接依赖第三方解析库类型
- 数据缺失时优先显示占位状态（`--`），而不是抛异常
- 尺寸和位置完全由配置控制
- 通过 `WidgetShell` 共享布局骨架

## 3. WidgetShell 通用骨架

`WidgetShell` 是所有 widget 共享的外壳组件，负责统一的布局和样式渲染。

### 3.1 WidgetShell 职责

- 绝对定位容器（`position: absolute`, `left/top` 来自配置）
- 容器尺寸和内边距（`width`/`height`/`padding` 由配置推导）
- 半透明背景 + 毛玻璃效果（`backdrop-filter: blur(10px)`）
- 边框和圆角
- 三段式布局：标签行 → 主值行 → 次要信息行

### 3.2 WidgetShell 布局结构

```text
+--------------------------------------+
| Label (可隐藏)                        |
| Value                         Unit   |
| Secondary info                       |
+--------------------------------------+
```

- 标签行：条件渲染，由 `showLabel` 控制
- 主值行：`flex` 布局，值和单位分别在左右两端
- 次要行：用于心率图表、累计爬升等附加信息

### 3.3 WidgetShell Props

```ts
type WidgetShellProps = {
  config: WidgetConfig;
  theme: OverlayTheme;
  label: string | undefined;
  value: string;
  unit: string | undefined;
  secondary: ReactNode | undefined;
  valueColor: string | undefined;
};
```

样式优先级：`valueColor` (调用方覆盖) > `config.valueColor` > `theme.colors.text`

## 4. 通用配置结构

每个组件共享 `BaseWidgetConfig`，通过 Zod discriminated union 按类型扩展：

```ts
type BaseWidgetConfig = {
  id: string;
  type: "speed" | "heart-rate" | "elevation" | "distance" | "time";
  enabled: boolean;                  // 默认 true
  x: number;                         // 默认 0
  y: number;                         // 默认 0
  scale: number;                     // 0.01–1, 默认 0.15
  opacity: number;                   // 0–1, 默认 1
  backgroundColor: string;          // 默认 "rgba(10, 18, 24, 0.55)"
  borderColor: string;              // 默认 "rgba(255, 255, 255, 0.2)"
  borderWidth: number;              // 默认 1
  borderRadius: number;             // 默认 18
  fontFamily?: string;              // 覆盖全局 theme
  labelFontSize: number;            // 默认 18
  valueFontSize: number;            // 默认 42
  unitFontSize: number;             // 默认 18
  labelColor: string;               // 默认 "#cbd5e1"
  valueColor: string;               // 默认 "#ffffff"
  unitColor: string;                // 默认 "#cbd5e1"
  showLabel: boolean;               // 默认 true
};
```

说明：

- 所有组件使用绝对定位
- `scale` 表示组件宽度占画布宽度的百分比（0.01–1），默认 0.15
- 宽高比按组件类型固定：

| Widget     | 宽高比 (w:h) |
|------------|-------------|
| speed      | 5:3         |
| heart-rate | 7:6         |
| elevation  | 5:3         |
| distance   | 5:3         |
| time       | 2:1         |

- 推导公式（在 Zod `.transform()` 中自动执行）：
  - `width = round(canvasWidth × scale)`
  - `height = round(width / aspectRatio)`
  - `padding = max(8, round(width × 0.07))`

## 5. 主题系统

### 5.1 默认主题

```ts
type OverlayTheme = {
  fontFamily: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    muted: string;
  };
};
```

### 5.2 主题合并

通过 `mergeThemeWithConfig(theme, config.theme)` 将配置中的主题值与默认主题合并：

- `config.theme.fontFamily` 覆盖 `theme.fontFamily`
- `config.theme.colors` 的字段覆盖 `theme.colors` 对应字段
- 未指定的字段保持默认值

### 5.3 样式覆盖优先级

对单个 widget：

- widget 自身配置中的样式字段 > 全局 theme
- `WidgetShell` 中 `valueColor` 参数 > `config.valueColor` > `theme.colors.text`

## 6. 缺失数据策略

统一策略：

- 当前字段缺失时显示 `--`
- 缺失不影响其他组件继续渲染
- `metadata.json` 中记录出现过的关键字段缺失告警（通过 `activity.warnings`）
- 不因为单个 widget 数据为空而整次渲染失败

## 7. SpeedWidget

### 7.1 目标

显示当前时速，是最核心的运动状态组件之一。

### 7.2 输入数据

依赖字段：

- `frame.metrics.speedMps`

### 7.3 默认显示内容

- 主值：当前速度
- 单位：`km/h`
- 标签：`Speed`

### 7.4 格式化规则

- 内部统一使用 `m/s`
- 渲染时默认转换为 `km/h`
- 默认保留 `1` 位小数
- 当值为空时显示 `--`

### 7.5 配置

```ts
type SpeedWidgetConfig = BaseWidgetConfig & {
  type: "speed";
  precision?: number;               // 0–3, 默认 1
  unit?: "km/h" | "mph";           // 默认 "km/h"
  showUnit?: boolean;               // 默认 true
};
```

- 不加入趋势箭头
- 不加入均速或圈速信息

## 8. HeartRateWidget

### 8.1 目标

显示当前心率，适合骑行、跑步等有心率记录的活动。

### 8.2 输入数据

依赖字段：

- `frame.metrics.heartRateBpm`
- `frameData.heartRateZones`（区间配色）
- `frameData.frames`（柱状图数据源）

### 8.3 默认显示内容

- 主值：当前心率数值
- 单位：`bpm`
- 标签：`Heart Rate`
- 次要行：心率柱状图（自动显示）

### 8.4 格式化规则

- 默认显示整数
- 空值显示 `--`

### 8.5 配置

```ts
type HeartRateWidgetConfig = BaseWidgetConfig & {
  type: "heart-rate";
  showUnit?: boolean;               // 默认 true
  colorByZone?: boolean;            // 默认 false
  zones?: Array<{                   // 默认 []
    min?: number;
    max?: number;
    color: string;
  }>;
  showChart?: "auto" | boolean;     // 默认 "auto"
  chartRange?: "short" | "medium" | "long";  // 默认 "medium"
};
```

### 8.6 心率图表（HeartRateChart）

独立的 `HeartRateChart` 组件，作为 `HeartRateWidget` 的次要行内容：

- `showChart`：`"auto"` 表示活动时长 > 60s 时自动显示；`true` 始终显示；`false` 始终隐藏
- `chartRange`：图表 X 轴时间范围，`"short"` = 60s，`"medium"` = 300s，`"long"` = 1200s
- 图表模式为 BPM 数值下方的柱状图，每秒一根柱子，按 zone 着色
- 柱状图 Y 轴默认 60–140 BPM，随数据动态扩展
- 图表组件内所有尺寸按 widget 实际尺寸同比缩放

## 9. ElevationWidget

### 9.1 目标

显示当前海拔，并可选显示累计爬升。

### 9.2 输入数据

依赖字段：

- `frame.metrics.altitudeM`
- `frame.metrics.ascentM`

### 9.3 默认显示内容

建议支持两种模式：

1. 只显示当前海拔
2. 当前海拔 + 累计爬升副标题

默认内容：

- 主值：当前海拔
- 单位：`m`
- 标签：`Elevation`
- 次要行：`Gain +123m`（可选）

### 9.4 格式化规则

- 主值默认显示整数
- 累计爬升默认显示整数
- 空值显示 `--`

### 9.5 配置

```ts
type ElevationWidgetConfig = BaseWidgetConfig & {
  type: "elevation";
  showAscent?: boolean;              // 默认 false
  altitudeUnit?: "m" | "ft";       // 默认 "m"
  ascentUnit?: "m" | "ft";         // 默认 "m"
};
```

### 9.6 备注

- 海拔抖动比较明显，预处理层应当先处理平滑
- 组件自身不做平滑算法

## 10. DistanceWidget

### 10.1 目标

显示累计距离，是最稳定也最常用的进度型信息。

### 10.2 输入数据

依赖字段：

- `frame.metrics.distanceM`

### 10.3 默认显示内容

- 主值：累计距离
- 单位：`km`
- 标签：`Distance`

### 10.4 格式化规则

- 内部单位统一为 `m`
- 默认转换为 `km`
- 默认保留 `2` 位小数
- 小于 `1km` 时可显示 `0.35 km`，不切换成 `m`

### 10.5 配置

```ts
type DistanceWidgetConfig = BaseWidgetConfig & {
  type: "distance";
  precision?: number;               // 0–3, 默认 2
  unit?: "km" | "mi";              // 默认 "km"
  showUnit?: boolean;               // 默认 true
};
```

### 10.6 备注

- 不在 MVP 中加入剩余距离或目标距离逻辑
- 不在 MVP 中加入分段距离

## 11. TimeWidget

### 11.1 目标

显示时间相关信息。这个组件有两类语义：

- 运动用时
- 当前时间或活动时间点

### 11.2 输入数据

依赖字段：

- `frame.elapsedMs`
- `frame.clockTimeIso`

### 11.3 默认显示内容

支持三种模式：

1. `elapsed`（默认）
2. `clock`
3. `both`

### 11.4 格式化规则

`elapsed`：

- 格式为 `HH:MM:SS`
- 小于 1 小时时仍可统一显示为 `00:12:34`

`clock`：

- 格式为 `HH:mm:ss` 或 `HH:mm`
- 时区由配置指定

`both`：

- 主值显示 `elapsed`
- 次要行显示 `clock`

### 11.5 配置

```ts
type TimeWidgetConfig = BaseWidgetConfig & {
  type: "time";
  mode?: "elapsed" | "clock" | "both";       // 默认 "elapsed"
  timezone?: string;
  elapsedFormat?: "hh:mm:ss" | "mm:ss";     // 默认 "hh:mm:ss"
  clockFormat?: "HH:mm:ss" | "HH:mm";       // 默认 "HH:mm:ss"
};
```

### 11.6 备注

- 时区处理应统一在预处理或格式化工具层完成
- 组件只负责消费已经准备好的时间值

## 12. MVP 视觉风格

采用统一而克制的视觉风格：

- 深色半透明底 + 毛玻璃效果（`backdrop-filter: blur(10px)`）
- 高对比主值（白色加粗）
- 次级标签和单位弱化（灰色）
- 标签使用大写 + 字间距（`textTransform: uppercase`, `letterSpacing: 0.04em`）
- 所有组件共享同一套字体和圆角策略

先把差异放在"信息结构"上，而不是追求复杂皮肤系统。

## 13. 后续扩展点

当前设计已经为下列方向留出位置：

- `GradeWidget`
- `MapMiniWidget`
- `PowerWidget`
- `CadenceWidget`
- 单组件动画配置
- 按阈值变色
- 图标、趋势线、迷你图表

第一阶段不要提前实现这些能力，但配置模型和命名不要阻碍后续接入。
