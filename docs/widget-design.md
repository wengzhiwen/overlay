# 运动数据 Overlay 生成器

组件设计文档 v0.1

本文档只覆盖第一阶段 MVP 组件设计，用于先把组件边界、输入输出和基础配置钉住，后续视觉风格、动画细节和高级配置可以在此基础上继续迭代。

## 1. 设计目标

MVP 组件层需要满足以下目标：

- 每个组件只负责一种核心信息表达
- 组件不关心解析过程和预处理细节
- 组件只消费“当前帧数据 + 组件配置 + 全局主题”
- 对缺失数据有明确降级行为
- 配置项允许后续扩展，但当前实现不过度复杂

## 2. 通用组件约定

### 2.1 组件输入

每个 widget 建议统一接收以下 props：

```ts
type BaseWidgetProps<TConfig> = {
  frame: FrameSnapshot;
  config: TConfig;
  theme: OverlayTheme;
};
```

说明：

- `frame`：当前帧对应的数据快照
- `config`：当前组件自己的配置
- `theme`：全局默认样式

### 2.2 组件输出

组件输出为一个绝对定位的 React 视觉节点，不返回业务对象，不写日志，不做 IO。

### 2.3 通用行为规则

- 纯函数，无副作用
- 不在组件内部做重型计算
- 不直接依赖第三方解析库类型
- 数据缺失时优先显示占位状态，而不是抛异常
- 尺寸和位置完全由配置控制

## 3. 通用配置结构

第一阶段建议每个组件共享一套基础配置：

```ts
type BaseWidgetConfig = {
  id: string;
  type:
    | "speed"
    | "heart-rate"
    | "elevation"
    | "distance"
    | "time";
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  padding?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontFamily?: string;
  labelFontSize?: number;
  valueFontSize?: number;
  unitFontSize?: number;
  labelColor?: string;
  valueColor?: string;
  unitColor?: string;
  showLabel?: boolean;
};
```

说明：

- 所有组件都使用绝对定位
- `width` 和 `height` 由配置显式给定
- 样式字段允许覆盖全局 `theme`

## 4. 通用视觉结构

不强制所有组件长得一样，但建议沿用统一骨架：

```text
+--------------------------------------+
| Label                                |
| Value                         Unit   |
| Optional secondary line              |
+--------------------------------------+
```

建议遵循：

- 主值优先，单位次之
- 标签可开关
- 次要信息只允许一行，避免组件膨胀

## 5. 缺失数据策略

第一阶段统一策略：

- 当前字段缺失时显示 `--`
- 缺失不影响其他组件继续渲染
- `metadata.json` 中记录出现过的关键字段缺失告警
- 不因为单个 widget 数据为空而整次渲染失败

## 6. SpeedWidget

### 6.1 目标

显示当前时速，是最核心的运动状态组件之一。

### 6.2 输入数据

依赖字段：

- `frame.metrics.speedMps`

### 6.3 默认显示内容

- 主值：当前速度
- 单位：`km/h`
- 标签：`Speed`

### 6.4 格式化规则

- 内部统一使用 `m/s`
- 渲染时默认转换为 `km/h`
- 默认保留 `1` 位小数
- 当值为空时显示 `--`

### 6.5 特殊配置建议

```ts
type SpeedWidgetConfig = BaseWidgetConfig & {
  precision?: number;
  unit?: "km/h" | "mph";
  showUnit?: boolean;
};
```
- 不加入趋势箭头
- 不加入均速或圈速信息

## 7. HeartRateWidget

### 7.1 目标

显示当前心率，适合骑行、跑步等有心率记录的活动。

### 7.2 输入数据

依赖字段：

- `frame.metrics.heartRateBpm`

### 7.3 默认显示内容

- 主值：当前心率数值
- 单位：`bpm`
- 标签：`Heart Rate`

### 7.4 格式化规则

- 默认显示整数
- 空值显示 `--`
- 默认显示3秒平均心率（平滑窗口avg）

### 7.5 特殊配置建议

```ts
type HeartRateWidgetConfig = BaseWidgetConfig & {
  showUnit?: boolean;
  colorByZone?: boolean;
  zones?: Array<{
    min?: number;
    max?: number;
    color: string;
  }>;
};
```

- 如果源文件中有zone信息，`colorByZone`配置有效
- zone color有默认也可以单独配置 

## 8. ElevationWidget

### 8.1 目标

显示当前海拔，并可选显示累计爬升。

### 8.2 输入数据

依赖字段：

- `frame.metrics.altitudeM`
- `frame.metrics.ascentM`

### 8.3 默认显示内容

建议支持两种模式：

1. 只显示当前海拔
2. 当前海拔 + 累计爬升副标题

默认内容：

- 主值：当前海拔
- 单位：`m`
- 标签：`Elevation`
- 次要行：`Gain +123m`（可选）

### 8.4 格式化规则

- 主值默认显示整数
- 累计爬升默认显示整数
- 空值显示 `--`

### 8.5 特殊配置建议

```ts
type ElevationWidgetConfig = BaseWidgetConfig & {
  showAscent?: boolean;
  altitudeUnit?: "m" | "ft";
  ascentUnit?: "m" | "ft";
};
```

### 8.6 备注

- 海拔抖动比较明显，预处理层应当先处理平滑
- 组件自身不做平滑算法

## 9. DistanceWidget

### 9.1 目标

显示累计距离，是最稳定也最常用的进度型信息。

### 9.2 输入数据

依赖字段：

- `frame.metrics.distanceM`

### 9.3 默认显示内容

- 主值：累计距离
- 单位：`km`
- 标签：`Distance`

### 9.4 格式化规则

- 内部单位统一为 `m`
- 默认转换为 `km`
- 默认保留 `2` 位小数
- 小于 `1km` 时可显示 `0.35 km`，不切换成 `m`

### 9.5 特殊配置建议

```ts
type DistanceWidgetConfig = BaseWidgetConfig & {
  precision?: number;
  unit?: "km" | "mi";
  showUnit?: boolean;
};
```

### 9.6 备注

- 不在 MVP 中加入剩余距离或目标距离逻辑
- 不在 MVP 中加入分段距离

## 10. TimeWidget

### 10.1 目标

显示时间相关信息。这个组件有两类语义，第一阶段必须明确区分：

- 运动用时
- 当前时间或活动时间点

### 10.2 输入数据

依赖字段：

- `frame.elapsedMs`
- `frame.clockTimeIso`

### 10.3 默认显示内容

建议支持三种模式：

1. `elapsed`
2. `clock`
3. `both`

默认模式为 `elapsed`。

### 10.4 格式化规则

`elapsed`：

- 格式建议为 `HH:MM:SS`
- 小于 1 小时时仍可统一显示为 `00:12:34`

`clock`：

- 默认格式建议为 `HH:mm:ss`
- 时区由配置指定

`both`：

- 主值显示 `elapsed`
- 次要行显示 `clock`

### 10.5 特殊配置建议

```ts
type TimeWidgetConfig = BaseWidgetConfig & {
  mode?: "elapsed" | "clock" | "both";
  timezone?: string;
  elapsedFormat?: "hh:mm:ss" | "mm:ss";
  clockFormat?: string;
};
```

### 10.6 备注

- 时区处理应统一在预处理或格式化工具层完成
- 组件只负责消费已经准备好的时间值

## 11. 推荐的基础 props 设计

为了让组件层足够稳定，建议 Remotion 层只把当前帧切片后的最小数据传给组件。一个更贴近组件使用的输入可以是：

```ts
type WidgetFrameView = {
  elapsedMs: number;
  speedMps?: number;
  heartRateBpm?: number;
  altitudeM?: number;
  ascentM?: number;
  distanceM?: number;
  clockTimeIso?: string;
};
```

这样可以让 widget 不必知道完整 `FrameSnapshot` 的所有结构细节。

## 12. MVP 视觉建议

为便于尽快落地，第一阶段建议采用统一而克制的视觉风格：

- 深色半透明底
- 高对比主值
- 次级标签和单位弱化
- 所有组件共享同一套字体和圆角策略

建议先把差异放在“信息结构”上，而不是一开始就追求复杂皮肤系统。

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

## 14. 待你后续完善的部分

这份文档先把组件的“基础内容”定下来，后续可以继续细化：

- 各组件的视觉稿
- 字体与字号系统
- 颜色语义
- 动画节奏
- 横屏与竖屏的推荐布局模板
- 不同运动类型下的默认组件组合
