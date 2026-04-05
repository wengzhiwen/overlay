# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

运动数据 Overlay 生成器。输入 GPX/TCX 活动文件和 JSON/YAML 配置，输出带透明通道的 overlay 素材（MOV/ProRes 4444 或 PNG 序列），供剪辑软件与原视频合成。

## Commands

```bash
npm run build          # TypeScript 编译 (tsc)
npm run typecheck      # 类型检查 (--noEmit)
npm run lint           # ESLint 检查
npm run test           # Vitest 运行所有测试
npm run dev -- render  # 开发态运行 CLI（tsx 直执行）
npm run start          # 构建后运行 CLI

# 运行单个测试文件
npx vitest run tests/build-frame-data.test.ts

# 渲染示例
npm run dev -- render -i ref_input/activity.tcx -c examples/sample-config.json -o output/demo
npm run dev -- render -i ref_input/activity.tcx -c examples/sample-config.json -o output/preview --sample
```

开发流程顺序：`typecheck` → `lint` → `test` → 端到端 `dev render`。

## Architecture

### 数据流管线

```
GPX/TCX → sports-lib 解析 → 内部 Activity 模型 → 归一化 → 派生指标 → 插值 → 平滑 → 逐帧数据 → Remotion 渲染 → 输出
```

管线在 `src/render/render-overlay.ts` 中按步骤编排，每步独立日志输出到 `output/<run>/logs/`。

### 模块职责

| 目录 | 职责 |
|------|------|
| `src/cli/` | Commander CLI 入口，只接收路径参数，不承载渲染配置 |
| `src/config/` | Zod schema 定义 (`schema.ts`) 与配置加载 (`load-config.ts`)，所有视觉行为收敛到配置文件 |
| `src/domain/` | 内部统一领域模型：`Activity`、`ActivityMetrics`、`FrameData`、`FrameSnapshot` |
| `src/parsers/` | `activity-loader.ts` 通过 sports-lib 解析 GPX/TCX，转换为内部 Activity 模型 |
| `src/preprocess/` | 归一化、派生指标、插值、平滑、逐帧数据生成。每步是独立纯函数 |
| `src/remotion/` | Remotion 渲染层。`Root.tsx` → `OverlayComposition.tsx` → 各 Widget 组件 |
| `src/render/` | 调用 Remotion 的 bundle + renderMedia 管线，处理 MOV/PNG 输出和编码参数 |
| `src/utils/` | 通用工具：文件操作、时间格式化、单位转换 |

### 关键设计约束

- **领域模型隔离**：Remotion 组件不直接依赖 sports-lib 对象，只消费 `FrameSnapshot` + `OverlayConfig` + `theme`
- **配置驱动**：所有视觉/布局参数在配置文件中定义，CLI 不暴露渲染参数
- **Widget 纯函数**：每个 widget 只依赖当前帧数据 + 自身配置 + 全局主题，无副作用无 IO
- **透明背景**：Composition 根节点不设不透明背景，透明通道由 ProRes 4444 编码保证
- **缺失数据策略**：字段缺失时显示 `--`，不因单个 widget 数据为空导致渲染失败

### 配置与 Widget

配置通过 Zod discriminated union (`type` 字段) 区分五种 widget：`speed`、`heart-rate`、`elevation`、`distance`、`time`。每个 widget 共享 `BaseWidgetSchema` 并扩展各自特有字段。配置支持全局 theme 和 per-widget 样式覆盖。

## Collaboration Rules

详见 `agent.md`。核心要点：

- 与用户直接沟通使用简体中文
- 代码注释、日志、CLI 输出使用英文
- 每次编码任务完成后必须运行 lint
- `ref_input/` 仅用于开发调试，不作为正式测试 fixture
- Commit message 使用英文，推荐 Conventional Commits 格式
- 优先级排序：正确性 > 清晰性 > 可维护性 > 可调试性 > 性能 > 便利性
- README 的更新由用户决定，不要因为修改了代码功能而自动联动修改 README

## README Structure

- `README.md`（根目录）— 英文主版本
- `docs/README_zh-CN.md` — 简体中文版本
- `docs/README_ja.md` — 日文版本
- 每个文件顶部包含三语切换链接，互相指向
- `docs/` 目录同时用于存放示例视频、截图等未来素材

## Tech Stack

- TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Node.js >= 20, ESM (`"type": "module"`, `NodeNext` module resolution)
- Remotion 4.x — 视频渲染
- @sports-alliance/sports-lib — GPX/TCX 解析
- Zod 4.x — 配置校验
- Vitest — 测试
- Commander — CLI 框架
