# Widget Configuration Guide

**English** | **[日本語](widget-guide_ja.md)** | **[简体中文](widget-guide_zh-CN.md)**

This document covers all Widget types supported by the Overlay generator and their configuration options.

## Table of Contents

- [Widget List](#widget-list)
- [Common Configuration](#common-configuration)
- [Widget Details](#widget-details)
  - [Speed](#speed)
  - [Heart Rate](#heart-rate)
  - [Elevation](#elevation)
  - [Distance](#distance)
  - [Time](#time)
  - [Noodle Map](#noodle-map)
  - [City Map](#city-map)
- [Style Presets](#style-presets)

---

## Widget List

| Widget | type | Description |
|--------|------|-------------|
| Speed | `speed` | Current speed with optional zone coloring and history chart |
| Heart Rate | `heart-rate` | Current heart rate with optional zone coloring and history chart |
| Power | `power` | Current power output with optional zone coloring and history chart |
| Cadence | `cadence` | Current cadence with optional zone coloring and history chart |
| Elevation | `elevation` | Current altitude with optional cumulative ascent and grade coloring |
| Distance | `distance` | Cumulative distance traveled |
| Time | `time` | Elapsed time, clock time, or both |
| Noodle Map | `noodlemap` | Abstract 2D GPS track projection (no map tiles) |
| City Map | `citymap` | GPS track on a real street map |

---

## Common Configuration

All widgets share these base fields (`BaseWidgetSchema`):

### Layout & Position

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | `string` | _(required)_ | Unique widget identifier |
| `enabled` | `boolean` | `true` | Whether the widget is visible |
| `x` | `number (≥0)` | `0` | Horizontal offset from canvas left edge (px) |
| `y` | `number (≥0)` | `0` | Vertical offset from canvas top edge (px) |
| `scale` | `number (0.01–1)` | `0.15` | Widget width as a fraction of canvas width |
| `opacity` | `number (0–1)` | `1` | Widget opacity |

### Appearance

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `style` | `"with-bgc" \| "without-bgc"` | `"with-bgc"` | Style preset, see [Style Presets](#style-presets) |
| `backgroundColor` | `string` | `"rgba(10, 18, 24, 0.55)"` | Background color |
| `borderColor` | `string` | `"rgba(255, 255, 255, 0.2)"` | Border color |
| `borderWidth` | `number (≥0)` | `1` | Border width (px) |
| `borderRadius` | `number (≥0)` | `18` | Corner radius (px) |

### Typography & Colors

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fontFamily` | `string` | _(optional)_ | Custom font; falls back to global theme |
| `labelFontSize` | `number (>0)` | `18` | Label font size |
| `valueFontSize` | `number (>0)` | `42` | Value font size |
| `unitFontSize` | `number (>0)` | `18` | Unit font size |
| `labelColor` | `string` | `"#cbd5e1"` | Label text color |
| `valueColor` | `string` | `"#ffffff"` | Value text color |
| `unitColor` | `string` | `"#cbd5e1"` | Unit text color |
| `showLabel` | `boolean` | `true` | Whether to show the label (default `false` for map widgets) |

### Aspect Ratios

Each widget has a fixed aspect ratio derived from `scale`:

| Widget | Aspect Ratio |
|--------|-------------|
| Speed | 5:3 |
| Heart Rate | 5:3 |
| Power | 5:3 |
| Cadence | 5:3 |
| Elevation | 5:3 |
| Distance | 5:3 |
| Time | 5:3 |
| Noodle Map | 5:3 |
| City Map | 5:3 |

---

## Widget Details

### Speed

Displays the current speed (3-second average). Supports zone-based value coloring and a bar chart of speed history.

![Speed Widget](images/widget-speed.png)

*colorByZone mode:*

![Speed Widget with Zone Colors](images/widget-speed-zone.png)

*without-bgc style:*

![Speed Widget without background](images/widget-speed-without-bgc.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `precision` | `number (0–3)` | `1` | Decimal places |
| `unit` | `"km/h" \| "mph"` | `"km/h"` | Speed unit |
| `showUnit` | `boolean` | `true` | Whether to show the unit |
| `colorByZone` | `boolean` | `false` | Color the value by speed zone |
| `zones` | `Zone[]` | `[]` | Custom speed zones |
| `zoneThresholds` | `number[4]` | _(optional)_ | 4 thresholds → 5 auto-generated zones |
| `showChart` | `boolean \| "auto"` | `"auto"` | Show speed chart. `"auto"` shows chart when activity > 60 s |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | Chart time range: `short`=60s, `medium`=300s, `long`=1200s |

#### Default Speed Zones (km/h)

When `colorByZone` is enabled with no custom `zones`:

| Zone | Range | Color |
|------|-------|-------|
| Zone 1 | 0 – 20 | `#60a5fa` (blue) |
| Zone 2 | 20 – 25 | `#34d399` (green) |
| Zone 3 | 25 – 30 | `#fbbf24` (yellow) |
| Zone 4 | 30 – 35 | `#fb923c` (orange) |
| Zone 5 | 35+ | `#f87171` (red) |

> When using `mph`, thresholds are automatically converted.

These defaults are designed around recreational cycling. For other activities or high-intensity riding, customize zones via configuration for the best visual result.

Providing 4 thresholds auto-generates 5 zones:

```json
"zoneThresholds": [12, 18, 22, 28]
```

#### Example

```json
{
  "id": "speed-main",
  "type": "speed",
  "x": 80,
  "y": 760,
  "scale": 0.146,
  "colorByZone": true,
  "showChart": "auto",
  "chartRange": "medium"
}
```

---

### Heart Rate

Displays the current heart rate (BPM). Like the Speed widget, it supports zone coloring and a history chart.

![Heart Rate Widget](images/widget-heart-rate.png)

*colorByZone mode:*

![Heart Rate Widget with Zone Colors](images/widget-heart-rate-zone.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showUnit` | `boolean` | `true` | Whether to show the "bpm" unit |
| `colorByZone` | `boolean` | `false` | Color the value by heart rate zone |
| `zones` | `Zone[]` | `[]` | Custom heart rate zones |
| `showChart` | `boolean \| "auto"` | `"auto"` | Show heart rate chart |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | Chart time range |

#### Default Heart Rate Zones (BPM)

Default zones are provided as a starting point. Heart rates vary greatly between individuals, so treat these as placeholders:

| Zone | Range | Color |
|------|-------|-------|
| Zone 1 | < 100 | `#60a5fa` (blue) |
| Zone 2 | 100 – 120 | `#34d399` (green) |
| Zone 3 | 120 – 140 | `#fbbf24` (yellow) |
| Zone 4 | 140 – 160 | `#fb923c` (orange) |
| Zone 5 | ≥ 160 | `#f87171` (red) |

Since everyone's training methodology differs, the system provides flexible zone configuration. Whether you use 5 zones or 7, it's fully configurable:

```json
"zones": [
  { "max": 106, "color": "#94a3b8" },
  { "min": 106, "max": 133, "color": "#60a5fa" },
  { "min": 133, "max": 148, "color": "#34d399" },
  { "min": 148, "max": 158, "color": "#fbbf24" },
  { "min": 158, "max": 166, "color": "#fb923c" },
  { "min": 166, "color": "#f87171" }
]
```

#### Example

```json
{
  "id": "hr-main",
  "type": "heart-rate",
  "x": 390,
  "y": 760,
  "scale": 0.146,
  "colorByZone": true,
  "showChart": "auto"
}
```

---

### Power

Displays the current power output (Watts, 3-second average). Supports zone-based value coloring and a history chart.

![Power Widget](images/widget-power.png)

*colorByZone mode:*

![Power Widget with Zone Colors](images/widget-power-zone.png)

*without-bgc style:*

![Power Widget without background](images/widget-power-without-bgc.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showUnit` | `boolean` | `true` | Whether to show the "W" unit |
| `colorByZone` | `boolean` | `false` | Color the value by power zone |
| `zones` | `Zone[]` | `[]` | Custom power zones |
| `showChart` | `boolean \| "auto"` | `"auto"` | Show power chart. `"auto"` shows chart when activity > 60 s |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | Chart time range: `short`=60s, `medium`=300s, `long`=1200s |

#### Default Power Zones (Watts)

When `colorByZone` is enabled with no custom `zones`:

| Zone | Range | Color |
|------|-------|-------|
| Zone 1 | 0 – 150 | `#60a5fa` (blue) |
| Zone 2 | 150 – 200 | `#34d399` (green) |
| Zone 3 | 200 – 250 | `#fbbf24` (yellow) |
| Zone 4 | 250 – 300 | `#fb923c` (orange) |
| Zone 5 | 300+ | `#f87171` (red) |

These defaults are designed around recreational cycling. For racing or training-specific power zones, customize via `zones` or `zoneThresholds`.

#### Example

```json
{
  "id": "power-main",
  "type": "power",
  "x": 390,
  "y": 760,
  "scale": 0.146,
  "colorByZone": true,
  "showChart": "auto",
  "chartRange": "medium"
}
```

---

### Cadence

Displays the current cadence (RPM, 3-second average). Supports zone-based value coloring and a history chart.

![Cadence Widget](images/widget-cadence.png)

*colorByZone mode:*

![Cadence Widget with Zone Colors](images/widget-cadence-zone.png)

*without-bgc style:*

![Cadence Widget without background](images/widget-cadence-without-bgc.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showUnit` | `boolean` | `true` | Whether to show the "rpm" unit |
| `colorByZone` | `boolean` | `false` | Color the value by cadence zone |
| `zones` | `Zone[]` | `[]` | Custom cadence zones |
| `showChart` | `boolean \| "auto"` | `"auto"` | Show cadence chart. `"auto"` shows chart when activity > 60 s |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | Chart time range: `short`=60s, `medium`=300s, `long`=1200s |

#### Default Cadence Zones (RPM)

When `colorByZone` is enabled with no custom `zones`:

| Zone | Range | Color |
|------|-------|-------|
| Zone 1 | 0 – 70 | `#60a5fa` (blue) |
| Zone 2 | 70 – 80 | `#34d399` (green) |
| Zone 3 | 80 – 90 | `#fbbf24` (yellow) |
| Zone 4 | 90 – 100 | `#fb923c` (orange) |
| Zone 5 | 100+ | `#f87171` (red) |

#### Example

```json
{
  "id": "cadence-main",
  "type": "cadence",
  "x": 390,
  "y": 760,
  "scale": 0.146,
  "colorByZone": true,
  "showChart": "auto",
  "chartRange": "medium"
}
```

---

### Elevation

Displays the current altitude. Optionally shows cumulative elevation gain and a grade-colored chart.

![Elevation Widget](images/widget-elevation.png)

*without-bgc style:*

![Elevation Widget without background](images/widget-elevation-without-bgc.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showAscent` | `boolean` | `false` | Show cumulative ascent |
| `altitudeUnit` | `"m" \| "ft"` | `"m"` | Altitude unit |
| `ascentUnit` | `"m" \| "ft"` | `"m"` | Ascent unit |
| `colorByGrade` | `boolean` | `false` | Color the chart bars by road grade percentage |
| `gradeThresholds` | `number[4]` | `[3, 5, 8, 10]` | 4 grade thresholds (%) → 5 auto-generated zones |
| `showChart` | `boolean \| "auto"` | `"auto"` | Show elevation chart. `"auto"` shows chart when activity > 60 s |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | Chart time range: `short`=5min, `medium`=30min, `long`=60min |

#### Example

```json
{
  "id": "elev-main",
  "type": "elevation",
  "x": 700,
  "y": 760,
  "scale": 0.146,
  "showAscent": true,
  "altitudeUnit": "m"
}
```

---

### Distance

Displays the cumulative distance traveled. If an activity is split into multiple outputs due to a long pause, the distance remains cumulative across segments.

![Distance Widget](images/widget-distance.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `precision` | `number (0–3)` | `2` | Decimal places |
| `unit` | `"km" \| "mi"` | `"km"` | Distance unit |
| `showUnit` | `boolean` | `true` | Whether to show the unit |

#### Example

```json
{
  "id": "distance-main",
  "type": "distance",
  "x": 1010,
  "y": 760,
  "scale": 0.146,
  "unit": "km",
  "precision": 2
}
```

---

### Time

Displays time-related information. Supports three modes: elapsed time, clock time, or both.

*Elapsed mode:*

![Time Widget (elapsed)](images/widget-time-elapsed.png)

*Both mode:*

![Time Widget (both)](images/widget-time-both.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `"elapsed" \| "clock" \| "both"` | `"elapsed"` | Time display mode |
| `timezone` | `string` | _(optional)_ | Timezone for clock display, e.g. `"Asia/Singapore"` |
| `elapsedFormat` | `"hh:mm:ss" \| "mm:ss"` | `"hh:mm:ss"` | Elapsed time format |
| `clockFormat` | `"HH:mm:ss" \| "HH:mm"` | `"HH:mm:ss"` | Clock time format |

#### Mode Details

| Mode | Primary | Secondary |
|------|---------|-----------|
| `elapsed` | Elapsed activity time | — |
| `clock` | Current clock time | — |
| `both` | Elapsed activity time | Current clock time |

#### Example

```json
{
  "id": "time-main",
  "type": "time",
  "x": 1320,
  "y": 760,
  "scale": 0.188,
  "mode": "both",
  "timezone": "Asia/Singapore",
  "elapsedFormat": "hh:mm:ss"
}
```

---

### Noodle Map

Renders the GPS track as an abstract 2D projection without a map background, offering good privacy protection.

The track is always oriented with north pointing up.

![Noodle Map Widget](images/widget-noodlemap.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showLabel` | `boolean` | `false` | Show "Noodle Map" label |
| `lineColor` | `string` | `"#ffffff"` | Track line color |
| `lineWeight` | `"S" \| "M" \| "L"` | `"M"` | Track line thickness |

#### Example

```json
{
  "id": "noodlemap-main",
  "type": "noodlemap",
  "x": 1560,
  "y": 80,
  "scale": 0.146,
  "lineColor": "#ffffff",
  "lineWeight": "M"
}
```

---

### City Map

Displays the GPS track on a real street map using MapLibre GL with customizable map styles.

> Note: The City Map widget requires a network connection to load map tiles and automatically enables GPU rendering (`gl=angle`).

![City Map Widget](images/widget-citymap.png)

#### Specific Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showLabel` | `boolean` | `false` | Show "City Map" label |
| `mapStyle` | `string` | OpenFreeMap Liberty style URL | Map tile style URL |
| `lineColor` | `string` | `"#34d399"` | Route line color |
| `lineWeight` | `"S" \| "M" \| "L"` | `"M"` | Route line thickness |

#### Example

```json
{
  "id": "citymap-main",
  "type": "citymap",
  "x": 1560,
  "y": 80,
  "scale": 0.146,
  "mapStyle": "https://tiles.openfreemap.org/styles/liberty",
  "lineColor": "#34d399",
  "lineWeight": "M"
}
```

---

## Style Presets

Widgets support two style presets via the `style` field:

### with-bgc (default)

Semi-transparent dark background + glass blur effect + thin border. Works well in most scenarios.

```
style: "with-bgc"
```

- Background: `rgba(10, 18, 24, 0.55)`
- Border: `rgba(255, 255, 255, 0.2)`
- Applies `backdrop-filter: blur(10px)` glass effect

### without-bgc

Transparent background with text shadow/glow for readability on any background.

```
style: "without-bgc"
```

- Background and border are transparent
- All text gets an inverted glow shadow
- Noodle Map SVG lines get an outline filter
