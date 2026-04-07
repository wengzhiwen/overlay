# Widget 設定ガイド

**[English](widget-guide_en.md)** | **日本語** | **[简体中文](widget-guide_zh-CN.md)**

このドキュメントでは、Overlay ジェネレーターがサポートするすべての Widget タイプとその設定項目について説明します。

## 目次

- [Widget 一覧](#widget-一覧)
- [共通設定項目](#共通設定項目)
- [各 Widget の詳細](#各-widget-の詳細)
  - [Speed — スピード](#speed--スピード)
  - [Heart Rate — 心拍数](#heart-rate--心拍数)
  - [Elevation — 標高](#elevation--標高)
  - [Distance — 距離](#distance--距離)
  - [Time — 時間](#time--時間)
  - [Noodle Map — ルート図](#noodle-map--ルート図)
  - [City Map — 都市地図](#city-map--都市地図)
- [スタイルプリセット](#スタイルプリセット)

---

## Widget 一覧

| Widget | type フィールド | 説明 |
|--------|----------------|------|
| Speed | `speed` | 現在のスピードを表示。ゾーンカラーリングと履歴チャートに対応 |
| Heart Rate | `heart-rate` | 現在の心拍数を表示。ゾーンカラーリングと履歴チャートに対応 |
| Elevation | `elevation` | 現在の標高を表示。累積獲得標高の表示にも対応 |
| Distance | `distance` | 累積移動距離を表示 |
| Time | `time` | 経過時間または現在時刻を表示 |
| Noodle Map | `noodlemap` | GPS トラックの抽象的な 2D 投影図（地図タイルなし） |
| City Map | `citymap` | 実際の地図上に GPS トラックを表示 |

---

## 共通設定項目

すべての Widget は以下の基本フィールド（`BaseWidgetSchema`）を共有します：

### レイアウトと配置

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `id` | `string` | _(必須)_ | Widget の一意識別子 |
| `enabled` | `boolean` | `true` | Widget の表示/非表示 |
| `x` | `number (≥0)` | `0` | キャンバス左端からの水平オフセット（px） |
| `y` | `number (≥0)` | `0` | キャンバス上端からの垂直オフセット（px） |
| `scale` | `number (0.01–1)` | `0.15` | Widget の幅をキャンバス幅に対する割合で指定 |
| `opacity` | `number (0–1)` | `1` | Widget の不透明度 |

### 外観

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `style` | `"with-bgc" \| "without-bgc"` | `"with-bgc"` | スタイルプリセット。詳しくは[スタイルプリセット](#スタイルプリセット)を参照 |
| `backgroundColor` | `string` | `"rgba(10, 18, 24, 0.55)"` | 背景色 |
| `borderColor` | `string` | `"rgba(255, 255, 255, 0.2)"` | ボーダー色 |
| `borderWidth` | `number (≥0)` | `1` | ボーダー幅（px） |
| `borderRadius` | `number (≥0)` | `18` | 角丸半径（px） |

### フォントとカラー

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `fontFamily` | `string` | _(オプション)_ | カスタムフォント。未設定時はグローバルテーマを使用 |
| `labelFontSize` | `number (>0)` | `18` | ラベルのフォントサイズ |
| `valueFontSize` | `number (>0)` | `42` | 数値のフォントサイズ |
| `unitFontSize` | `number (>0)` | `18` | 単位のフォントサイズ |
| `labelColor` | `string` | `"#cbd5e1"` | ラベルのテキスト色 |
| `valueColor` | `string` | `"#ffffff"` | 数値のテキスト色 |
| `unitColor` | `string` | `"#cbd5e1"` | 単位のテキスト色 |
| `showLabel` | `boolean` | `true` | ラベルの表示/非表示（Noodle Map / City Map はデフォルト `false`） |

### アスペクト比

各 Widget には固定のアスペクト比があり、`scale` から自動計算されます：

| Widget | アスペクト比 |
|--------|------------|
| Speed | 5:3 |
| Heart Rate | 5:3 |
| Elevation | 5:3 |
| Distance | 5:3 |
| Time | 2:1 |
| Noodle Map | 5:3 |
| City Map | 5:3 |

---

## 各 Widget の詳細

### Speed — スピード

現在のスピード（3秒平均）を表示します。スピードゾーンによる数値のカラーリングと、スピード履歴のバーチャートに対応しています。

![Speed Widget](images/widget-speed.png)

*colorByZone モード：*

![Speed Widget with Zone Colors](images/widget-speed-zone.png)

*without-bgc スタイル：*

![Speed Widget without background](images/widget-speed-without-bgc.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `precision` | `number (0–3)` | `1` | 小数点以下の桁数 |
| `unit` | `"km/h" \| "mph"` | `"km/h"` | スピードの単位 |
| `showUnit` | `boolean` | `true` | 単位の表示/非表示 |
| `colorByZone` | `boolean` | `false` | スピードゾーンによるカラーリングの有効/無効 |
| `zones` | `Zone[]` | `[]` | カスタムスピードゾーン |
| `zoneThresholds` | `number[4]` | _(オプション)_ | 4つの閾値で5つのゾーンを自動生成 |
| `showChart` | `boolean \| "auto"` | `"auto"` | スピードチャートの表示。`"auto"` はアクティビティが60秒を超える場合に表示 |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | チャートの時間範囲：`short`=60秒, `medium`=300秒, `long`=1200秒 |

#### デフォルトのスピードゾーン（km/h）

`colorByZone` を有効にし、カスタム `zones` を指定しない場合のデフォルト：

| ゾーン | 範囲 | 色 |
|--------|------|----|
| Zone 1 | 0 – 20 | `#60a5fa`（青） |
| Zone 2 | 20 – 25 | `#34d399`（緑） |
| Zone 3 | 25 – 30 | `#fbbf24`（黄） |
| Zone 4 | 30 – 35 | `#fb923c`（オレンジ） |
| Zone 5 | 35+ | `#f87171`（赤） |

> `mph` を使用する場合、閾値は自動的にマイル単位に変換されます。

これらのデフォルト値はリクリエーショナルサイクリングを基準に設定されています。他のアクティビティや高強度ライドでは、最適な表示結果を得るためにゾーンをカスタマイズすることをお勧めします。

4つの閾値を指定すると、自動的に5つのゾーンが生成されます：

```json
"zoneThresholds": [12, 18, 22, 28]
```

#### 設定例

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

### Heart Rate — 心拍数

現在の心拍数（BPM）を表示します。スピード Widget と同様に、ゾーンカラーリングと履歴チャートに対応しています。

![Heart Rate Widget](images/widget-heart-rate.png)

*colorByZone モード：*

![Heart Rate Widget with Zone Colors](images/widget-heart-rate-zone.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `showUnit` | `boolean` | `true` | "bpm" 単位の表示/非表示 |
| `colorByZone` | `boolean` | `false` | 心拍ゾーンによるカラーリングの有効/無効 |
| `zones` | `Zone[]` | `[]` | カスタム心拍ゾーン |
| `showChart` | `boolean \| "auto"` | `"auto"` | 心拍チャートの表示 |
| `chartRange` | `"short" \| "medium" \| "long"` | `"medium"` | チャートの時間範囲 |

#### デフォルトの心拍ゾーン（BPM）

以下はデフォルトの心拍ゾーンです。心拍数には個人差が大きいため、参考値として扱ってください：

| ゾーン | 範囲 | 色 |
|--------|------|----|
| Zone 1 | < 100 | `#60a5fa`（青） |
| Zone 2 | 100 – 120 | `#34d399`（緑） |
| Zone 3 | 120 – 140 | `#fbbf24`（黄） |
| Zone 4 | 140 – 160 | `#fb923c`（オレンジ） |
| Zone 5 | ≥ 160 | `#f87171`（赤） |

心拍トレーニングの手法は人それぞれ異なるため、柔軟なゾーン設定が可能です。5ゾーンでも7ゾーンでも、完全にカスタマイズできます：

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

#### 設定例

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

### Elevation — 標高

現在の標高を表示します。累積獲得標高（Gain）を副情報として表示することも可能です。

![Elevation Widget](images/widget-elevation.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `showAscent` | `boolean` | `false` | 累積獲得標高の表示 |
| `altitudeUnit` | `"m" \| "ft"` | `"m"` | 標高の単位 |
| `ascentUnit` | `"m" \| "ft"` | `"m"` | 獲得標高の単位 |

#### 設定例

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

### Distance — 距離

累積移動距離を表示します。アクティビティが長い一時停止によって複数の出力に分割された場合でも、距離はセグメント間で累積されます。

![Distance Widget](images/widget-distance.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `precision` | `number (0–3)` | `2` | 小数点以下の桁数 |
| `unit` | `"km" \| "mi"` | `"km"` | 距離の単位 |
| `showUnit` | `boolean` | `true` | 単位の表示/非表示 |

#### 設定例

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

### Time — 時間

時間関連の情報を表示します。経過時間、現在時刻、または両方の3つのモードに対応しています。

*経過時間モード：*

![Time Widget (elapsed)](images/widget-time-elapsed.png)

*両方表示モード：*

![Time Widget (both)](images/widget-time-both.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `mode` | `"elapsed" \| "clock" \| "both"` | `"elapsed"` | 時間表示モード |
| `timezone` | `string` | _(オプション)_ | 現在時刻のタイムゾーン（例：`"Asia/Singapore"`） |
| `elapsedFormat` | `"hh:mm:ss" \| "mm:ss"` | `"hh:mm:ss"` | 経過時間のフォーマット |
| `clockFormat` | `"HH:mm:ss" \| "HH:mm"` | `"HH:mm:ss"` | 現在時刻のフォーマット |

#### モードの説明

| モード | メイン表示 | サブ表示 |
|--------|-----------|---------|
| `elapsed` | アクティビティの経過時間 | — |
| `clock` | 現在時刻 | — |
| `both` | アクティビティの経過時間 | 現在時刻 |

#### 設定例

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

### Noodle Map — ルート図

GPS トラックを抽象的な 2D 投影で表示します。地図タイルを使用しないため、プライバシーの保護に優れています。

トラックは常に北が上向きになるよう固定されます。

![Noodle Map Widget](images/widget-noodlemap.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `showLabel` | `boolean` | `false` | "Noodle Map" ラベルの表示 |
| `lineColor` | `string` | `"#ffffff"` | トラックラインの色 |
| `lineWeight` | `"S" \| "M" \| "L"` | `"M"` | トラックラインの太さ |

#### 設定例

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

### City Map — 都市地図

MapLibre GL を使用して、実際の地図上に GPS トラックを表示します。カスタムマップスタイルに対応しています。

> 注意：City Map Widget はマップタイルの読み込みにネットワーク接続が必要です。また、レンダリング時に GPU モード（`gl=angle`）が自動的に有効になります。

![City Map Widget](images/widget-citymap.png)

#### 個別フィールド

| フィールド | 型 | デフォルト | 説明 |
|------------|------|----------|------|
| `showLabel` | `boolean` | `false` | "City Map" ラベルの表示 |
| `mapStyle` | `string` | OpenFreeMap Liberty スタイル URL | マップタイルのスタイル URL |
| `lineColor` | `string` | `"#34d399"` | ルートラインの色 |
| `lineWeight` | `"S" \| "M" \| "L"` | `"M"` | ルートラインの太さ |

#### 設定例

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

## スタイルプリセット

Widget は `style` フィールドで2つのスタイルプリセットをサポートしています：

### with-bgc（デフォルト）

半透明のダーク背景 + スリガラス（グラスブラー）効果 + 細いボーダー。ほとんどのシーンに適しています。

```
style: "with-bgc"
```

- 背景色デフォルト：`rgba(10, 18, 24, 0.55)`
- ボーダー色デフォルト：`rgba(255, 255, 255, 0.2)`
- `backdrop-filter: blur(10px)` スリガラス効果を適用

### without-bgc

透明背景。テキストシャドウ/グロー効果により、どんな背景でも視認性を確保します。

```
style: "without-bgc"
```

- 背景色とボーダーは透明
- すべてのテキストに反転グローシャドウを追加
- Noodle Map の SVG ラインにアウトラインフィルターを追加
