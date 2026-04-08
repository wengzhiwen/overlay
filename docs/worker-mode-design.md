# Worker 模式设计文档

v2.0

## 1. 文档目的

本文档描述 overlay 项目的分布式 Worker 模式：如何作为长驻进程与 MotionO 协同工作，实现自动化任务抢占、渲染和结果上传。本文档与 `docs/overlay-generator-design.md` 互补，前者描述单次 CLI 渲染，本文档描述分布式调度模式。

## 2. 背景与动机

overlay 最初是纯 CLI 工具，用户手动执行 `overlay render` 生成视频。随着 MotionO 前端的出现，需要一种方式让 overlay 作为后端处理器自动响应 MotionO 上的用户请求。

设计目标：

- Worker 作为独立长驻进程运行
- 支持多个 Worker 实例并发抢占任务
- 完整复用现有 `renderOverlay()` 渲染管线
- 不新增 npm 运行时依赖
- 支持服务端重启和 Worker 崩溃恢复

## 3. 架构

### 3.1 系统上下文

```
┌──────────────────┐        ┌──────────────────┐
│   MotionO        │  REST  │  overlay Worker  │
│   (Flask+Mongo)  │◄──────►│  (Node.js)       │
│                  │        │                  │
│  用户/任务/调度    │        │  抢占/渲染/上传    │
└──────────────────┘        └──────────────────┘
```

Worker 与 MotionO 之间通过 REST API 通信。任务状态由服务端 MongoDB 管理，Worker 通过本地状态文件持久化进行中的任务。

### 3.2 模块结构

```
src/worker/
  config.ts        — Worker 配置 (Zod schema)
  logger.ts        — 结构化日志
  api-client.ts    — MotionO REST API 客户端
  file-transfer.ts — 分块上传封装
  job-runner.ts    — 单任务执行（下载→渲染→上传）+ 进度上报 + 抢占检测
  job-state.ts     — 本地任务状态持久化（崩溃恢复）
  retry.ts         — 指数退避重试工具
  index.ts         — 主循环（心跳+轮询+恢复+优雅退出）
```

加上 CLI 注册：`src/cli/index.ts` 中新增 `worker` 子命令。

### 3.3 依赖关系

Worker 模块仅依赖项目内已有模块：

- `src/render/render-overlay.ts` — 调用 `renderOverlay()` 执行渲染
- `src/utils/files.ts` — `ensureDirectoryPath`、`writeJsonFile` 等文件工具
- `zod` — 配置校验
- Node.js 原生 `fetch` — HTTP 请求

**不引入任何新的 npm 依赖。**

## 4. 数据流

### 4.1 单任务处理

```
claimNextJob()
    │
    ▼
saveJobState()              ← 写入本地状态文件（崩溃恢复用）
    │
    ▼
downloadActivityFile()      ← HTTP Range 断点续传
    │
    ▼
writeJsonFile(config)       ← 写入布局配置到本地
    │
    ▼
startJob()                  ← 通知 MotionO: processing（带重试）
    │
    ▼
renderOverlay()             ← 复用完整渲染管线
    │  onProgress → 解析帧进度 → 每15秒定时上报
    │  上报前检查 abortedJobs → 若被抢占则抛出 JobAbortedError
    ▼
uploadFileWithResume()      ← 5MB 分块上传（带重试）
    │
    ▼
completeJob()               ← 携带全部结果文件清单通知完成（激进重试）
    │
    ▼
removeJobState()            ← 删除本地状态文件
```

### 4.2 主循环

```
Worker 启动
    │
    ├── 首次心跳（失败则退出）
    │
    ├── 启动恢复
    │   ├── loadJobStates() — 读取本地状态文件
    │   ├── getActiveJobs() — 查询服务端活跃任务
    │   ├── 本地有 + 服务端有 → 恢复执行
    │   ├── 本地有 + 服务端没有 → 清理本地状态
    │   └── 服务端有 + 本地没有 → 上报失败清理残留
    │
    └── 主循环 ──────────────────────────────┐
         │                                   │
         ├─ 清理已完成的 Promise              │
         │                                   │
         ├─ 有空闲槽位？                      │
         │   ├─ 是 → claimNextJob()          │
         │   │   ├─ 抢到 → runJob() (async)  │
         │   │   └─ 超时 → 继续              │
         │   └─ 否 → 等待                    │
         │                                   │
         ├─ sleep(pollInterval)              │
         │                                   │
         └───────────────────────────────────┘

    后台心跳线程（每 heartbeatInterval）
        │
        └─ 对比服务端 active_jobs 与本地 activeJobs
           └─ 本地有但服务端没有 → 加入 abortedJobs Set
```

## 5. 关键设计决策

### 5.1 长轮询而非 WebSocket

Worker 通过 `GET /workers/jobs/next` 长轮询（30s 超时）抢占任务。

选择长轮询的理由：
- Worker 数量少（1-5），无需 WebSocket 的双向通信
- 无需维护连接状态，重启即恢复
- MongoDB `findOneAndUpdate` 天然原子，无需分布式锁
- HTTP 语义简单，调试方便

### 5.2 原子抢占

MotionO 端使用 MongoDB `findOneAndUpdate` 实现原子抢占：

```javascript
// 伪代码
db.jobs.findOneAndUpdate(
  { status: "pending" },
  { $set: { status: "claimed", worker_id: "..." } },
  { sort: { created_at: 1 } }
)
```

多个 Worker 同时调用，MongoDB 保证只有一个能成功。这是无锁调度的关键。

### 5.3 分块上传

结果视频可能数百 MB，使用 init → chunk → complete 三步协议：

```
1. POST upload-init     → 获得 upload_id
2. PUT  upload-chunk    → 5MB/块，可并发
3. POST upload-complete → 验证并定稿
```

选择自定义协议而非 tus 的理由：
- 避免引入 tus 库到两个项目
- Worker 数量少，协议复杂度与规模匹配
- 服务端实现简单（追加写入 + 大小校验）

### 5.4 不新增 npm 依赖

Worker 使用 Node.js >= 20 原生 `fetch` API。`ReadableStream` 处理下载流，`Buffer` 处理上传分块。通过动态 `import("node:fs")` 按需加载文件系统模块。

### 5.5 定时进度上报

renderOverlay 的 `onProgress` 回调频率很高（每帧都可能触发），不可能每次都调用 API。设计为：

1. 解析进度消息提取百分比（帧进度 > 步骤估算）
2. 每 `progressReportIntervalMs`（默认 15 秒）向服务端上报一次
3. 服务端据此更新 `last_progress_at` 字段

进度估算规则：
- 帧进度 `frame X/Y` → 精确百分比
- 步骤 01-06（加载/准备）：0%–30%
- 步骤 07-13（数据处理）：30%–85%
- 步骤 14（渲染）：85%–99%
- 步骤 15（后处理）：99%–100%

### 5.6 任务抢占检测

心跳响应携带 `active_jobs` 列表。Worker 心跳循环对比本地 `activeJobs` 与服务端列表：

- 本地有 + 服务端有 → 正常
- 本地有 + 服务端没有 → 任务已被回收，加入 `abortedJobs`
- `job-runner.ts` 在关键步骤（渲染前、上传前、complete 前）检查 `abortedJobs`
- 检测到抢占抛出 `JobAbortedError`，不调用 `failJob`（任务已不属于自己）

### 5.7 崩溃恢复

Worker 在 `{workDir}/state/{jobId}.json` 持久化任务状态：

```json
{
  "jobId": "...",
  "activity_format": "gpx",
  "activity_filename": "activity.gpx",
  "activity_size_bytes": 123,
  "layout_config": {},
  "status": "claimed",
  "claimedAt": "2026-04-08T..."
}
```

启动恢复流程：
1. 读取本地状态文件
2. 查询服务端 `GET /workers/jobs/active` 获取活跃任务
3. 本地 + 服务端都有 → 恢复执行（从头开始，利用下载断点续传）
4. 本地有服务端没有 → 清理本地
5. 服务端有本地没有 → 上报失败清理残留

## 6. 服务端超时机制

MotionO 实现两层超时保护：

### 6.1 Worker 心跳超时

- 配置：`WORKER_HEARTBEAT_TIMEOUT_SECONDS`（默认 300s = 5 分钟）
- 触发条件：Worker 的 `last_heartbeat_at` 早于阈值
- 行为：Worker 标记为 offline，其所有 claimed/processing 任务回收为 pending
- 运行频率：每 10 分钟（scheduler），也在每次心跳时触发

### 6.2 任务进度超时

- 配置：`JOB_PROGRESS_TIMEOUT_SECONDS`（默认 600s = 10 分钟）
- 触发条件：任务的 `last_progress_at` 早于阈值（fallback 到 `updated_at`）
- 行为：任务回收为 pending，Worker 的 `current_job_id` 清除
- 运行频率：每 5 分钟（scheduler）
- 意义：捕获 Worker 心跳正常但渲染进程卡死的场景

## 7. CLI 用法

```bash
# 开发模式
npm run dev -- worker --server http://localhost:5000 --api-key sk-xxxx

# 构建后
npm run build
node dist/cli/index.js worker --server http://localhost:5000 --api-key sk-xxxx
```

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--server` | 是 | — | MotionO 服务 URL |
| `--api-key` | 是 | — | Worker API Key |
| `--work-dir` | 否 | /tmp/overlay-worker | 临时文件目录 |
| `--heartbeat-interval` | 否 | 60 | 心跳间隔（秒） |
| `--poll-interval` | 否 | 1 | 轮询间隔（秒） |
| `--concurrency` | 否 | 1 | 最大并发任务数 |

## 8. 错误处理

| 场景 | Worker 行为 |
|------|------------|
| MotionO 不可达 | 指数退避重试（1s → 60s），不退出 |
| API Key 无效（401） | 立即退出，日志输出错误 |
| 任务抢占冲突（409） | 正常，继续轮询 |
| 渲染失败 | 调用 `failJob()` 上报错误，继续下一个任务 |
| 任务被服务端回收 | 检测到后抛出 `JobAbortedError`，不调用 `failJob`，继续下一个 |
| 下载中断 | 下次恢复时通过 Range 头续传 |
| 上传中断 | 重新初始化上传（新 upload_id） |
| Worker 崩溃重启 | 读取本地状态文件，对比服务端活跃任务，恢复未完成的任务 |
| MotionO 重启 | 所有 API 调用带重试，恢复后自动接上 |
| SIGTERM / SIGINT | 停止抢占，等待当前任务完成（最多 30s），优雅退出 |

## 9. 本地文件管理

### 工作目录结构

```
<work-dir>/
  state/
    <jobId>.json          # 任务状态文件（崩溃恢复）
  job-<id>/
    <filename>.gpx        # 下载的活动文件
    config.json           # 写入的布局配置
    output/               # renderOverlay() 输出
      <run-id>/
        output.mov        # 渲染结果
        metadata.json     # 渲染元数据
        logs/             # 渲染日志
```

### 清理

- 每个 `runJob()` 在 finally 块中删除状态文件和 `job-<id>/` 目录
- 正常流程：渲染完成、上传成功、清理
- 异常流程：渲染失败、上报错误、清理
- 崩溃场景：状态文件残留，下次启动时恢复或清理

## 10. 配置 Schema

```typescript
// src/worker/config.ts
const WorkerConfigSchema = z.object({
  serverUrl: z.string().url(),
  apiKey: z.string().min(1),
  workDir: z.string().default("/tmp/overlay-worker"),
  heartbeatIntervalMs: z.number().int().min(5000).default(60000),
  pollIntervalMs: z.number().int().min(1000).default(1000),
  maxConcurrency: z.number().int().min(1).default(1),
  chunkSizeBytes: z.number().int().min(1048576).default(5242880), // 5MB
  progressReportIntervalMs: z.number().int().min(5000).default(15000),
});
```

所有参数通过 CLI 传入，Zod 校验后传给各模块。

## 11. 与 render 命令的关系

| 维度 | `overlay render` | `overlay worker` |
|------|-----------------|-----------------|
| 生命周期 | 单次执行 | 长驻进程 |
| 输入来源 | 本地文件路径 | MotionO API 下载 |
| 配置来源 | 本地 JSON/YAML | MotionO 传输的 JSON |
| 输出目标 | 本地目录 | MotionO API 上传 |
| 进度报告 | console.log | MotionO progress API（定时上报） |
| 适用场景 | 开发调试、批量处理 | 生产环境自动化 |

两者共享 `renderOverlay()` 核心渲染管线，差异仅在输入获取和输出提交方式。

Worker 会上传该次渲染产生的全部 `.mov` 结果文件，MotionO 则向最终用户展示 1-N 个下载链接。
