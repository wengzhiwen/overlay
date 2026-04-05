# Overlay

运动数据 Overlay 生成器的基础项目框架。

当前阶段重点是把项目整理成一个可编译、可 lint、可执行最小 CLI 的 Node.js + TypeScript 工程，业务逻辑暂未实现。

## Requirements

- Node.js >= 20
- npm >= 10

## Setup

```bash
npm install
```

## Available Scripts

```bash
npm run build
npm run typecheck
npm run lint
npm run dev -- --help
npm run dev -- render --input ref_input/activity_22292952339.tcx --config examples/sample-config.json
```

## CLI Usage

开发态运行：

```bash
npm run dev -- --help
```

构建后运行：

```bash
npm run build
npm run start -- --help
```

最小 `render` 命令示例：

```bash
npm run dev -- render \
  --input ref_input/activity_22292952339.tcx \
  --config examples/sample-config.json \
  --output output/dev-run
```

说明：

- 当前 `render` 命令只做参数解析、基础路径检查和占位输出。
- 实际的活动解析、预处理、Remotion 渲染和导出流程尚未实现。

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
├─ agent.md
├─ eslint.config.mjs
├─ package.json
├─ tsconfig.json
└─ README.md
```

## Development Notes

- `ref_input/` 下的文件仅用于开发和调试。
- 所有代码注释使用英语。
- 所有日志和 CLI 输出使用英语。
- 每次编码完成后应运行 lint。

## Debugging

基础调试流程：

1. 使用 `npm run dev -- --help` 检查 CLI 入口是否正常。
2. 使用 `npm run dev -- render ...` 验证参数解析和文件路径检查。
3. 使用 `npm run build` 验证 TypeScript 构建产物。
4. 使用 `npm run lint` 和 `npm run typecheck` 验证代码质量。

## Next Steps

- 接入配置文件解析与校验
- 接入活动文件加载层
- 接入预处理与逐帧数据构建
- 接入 Remotion 渲染链路
