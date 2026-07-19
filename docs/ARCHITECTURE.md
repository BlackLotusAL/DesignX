# DesignX 架构说明

## 进程边界

```text
Renderer（React）
  │  window.designx：具体、强类型方法
  ▼
Preload（contextBridge）
  │  ipcRenderer.invoke / 只读事件订阅
  ▼
Main（唯一业务与磁盘数据源）
  ├─ Workspace / 原子持久化 / 日志
  ├─ Git / 文档解析 / 知识版本
  ├─ 分析队列 / 证据校验
  └─ Electron net.fetch / safeStorage
```

Renderer 不读取文件系统、不执行 Git、不接触模型明文凭据。UI 状态由启动快照与任务/仓库事件组成；数据 Context 与操作 Context 分离，任务进度不会迫使无关操作对象重建。

## 构建

electron-vite 分别构建：

- `src/main/index.ts` → `out/main/index.js`
- `src/preload/index.ts` → `out/preload/index.cjs`
- `src/renderer/main.tsx` → `out/renderer/`

preload 明确输出 CommonJS，以兼容 Electron sandbox preload 的受限执行环境。Renderer 仍是普通浏览器代码。

## IPC 合约

preload 只暴露 `window.designx`：

- `workspace.bootstrap/select/switch/getSnapshot`
- `repositories.add/sync/refresh`
- `knowledge.chooseFiles/import/saveDraft/publish/createVersion`
- `analysis.start/retry`
- `findings.ignore`
- `settings.get/save/testModel`
- `events.onTaskUpdated/onRepositoryUpdated`

返回值统一为 `Result<T>`。Main 为每个 channel 绑定具体 Zod schema，并验证 `sender` 与 `senderFrame` 都属于主窗口。Renderer 无法发送任意 channel，也无法获得 `ipcRenderer`。

## 安全基线

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`，并在应用 ready 前全局启用 sandbox
- 单实例锁
- CSP 限制脚本、对象、frame 与连接来源
- 拒绝权限请求与权限检查
- 拒绝页面导航、重定向和新窗口；HTTPS 外链交给系统浏览器
- 原生菜单默认隐藏，按 `Alt` 临时显示
- Bearer 凭据由 `safeStorage` 加密后写入 `userData/credentials.json`

已打包应用不读取开发环境变量。

## 持久化

`WorkspaceStore` 是业务磁盘读写入口。JSON 文件含 `schemaVersion`，写入流程为同目录临时文件加原子重命名；Windows 短暂文件占用只对 `EACCES/EBUSY/EPERM` 做有限退避，不删除旧文件。

发布知识版本采用临时目录整体写入后重命名。已存在的目标版本会直接失败，不能覆盖。工作区切换先初始化并验证候选目录，成功后才替换当前 Store。

## Git

Git 使用系统 `git` 与 `execFile`：

- 参数数组传递，不启用 shell
- 受控 `cwd`
- `windowsHide`
- 超时与输出上限
- 添加：`ls-remote` → 分支验证 → `clone --single-branch --branch`
- 同步：检查 dirty → `fetch` → ahead/behind 判断 → `merge --ff-only`

脏工作区、本地领先和分叉都不会触发 reset。

## 知识

文档解析完全在本地：

- Markdown：标题与行号
- PDF：pdfjs-dist 按页提取
- DOCX：mammoth 提取标题与段落

`SKILL.md` 使用固定离线模板生成，可编辑。`references/`、来源文件与位置映射保持只读。发布时校验名称、类型、glob、非空 SKILL、引用路径、来源位置和文件存在性。

## 分析与模型

队列全局并行度为 2，同一仓库由活动 key 互斥。阶段固定为：

```text
准备工作区 → 读取 Git Diff → 选择知识 → 模型分析 → 结构校验 → 保存结果
```

无分析基线时按知识 scope 和用户关注点筛选 tracked files；有基线时读取 commit range Diff。代码上下文使用 Git 的 80 行 hunk 上下文，不使用 AST。

知识选择按 scope glob、路径、语言、标题与关键词评分。每个文件形成一个不超过 60,000 字符的模型批次。

模型通过 Electron `net.fetch` 调用标准 `/v1/chat/completions`。优先 `response_format=json_schema`，服务明确不支持时回退 `json_object` 并缓存能力。输出始终经过本地 Zod 校验；失败只允许一次结构修复请求。

正式发现还要通过两道本地证据校验：

1. 文件、行号与当前 Commit 有效。
2. 知识包、版本、reference、source 与来源位置存在且匹配 manifest。

任一侧失败只写入 `EVIDENCE_INSUFFICIENT` 诊断。部分批次失败时保留成功发现但不更新基线；完整成功（包括零发现）才更新仓库基线。

## 生命周期

应用启动时，遗留的 queued/running 任务会标记为 `APP_EXIT_INTERRUPTED`，保留诊断并允许重试。MVP 不恢复后台执行，也不提供任务取消。
