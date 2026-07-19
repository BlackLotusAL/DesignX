# DesignX 工作区数据结构

## 工作区

```text
<workspace>/.designx/
├─ workspace.json
├─ repositories/<repoId>/
│  ├─ repository.json
│  └─ checkout/
├─ knowledge/<packageId>/
│  ├─ package.json
│  ├─ draft/
│  │  ├─ draft.json
│  │  ├─ SKILL.md
│  │  ├─ references/
│  │  └─ sources/
│  └─ versions/v1.0/
│     ├─ manifest.json
│     ├─ SKILL.md
│     ├─ references/
│     └─ sources/
├─ tasks/<taskId>/
│  ├─ task.json
│  ├─ input.json
│  ├─ diagnostics.json
│  └─ findings.json
└─ logs/YYYY-MM-DD.jsonl
```

所有 JSON 根对象均带 `schemaVersion: 1`。

## `workspace.json`

保存非敏感工作区设置：

- 创建与更新时间
- 模型基础地址
- 模型名称
- 请求超时
- 结构化输出能力缓存

API 凭据不写入工作区。

## 代码仓

`repository.json` 保存：

- 仓库 ID、名称、远程地址和默认分支
- 当前 Commit
- Git 状态与最近同步时间
- checkout 的工作区相对路径
- 最近完整成功分析的 Commit 基线
- 最近可执行错误

`checkout/` 是系统 Git 创建的单分支本地副本。

## 知识包

`package.json` 保存包级元数据、已发布版本列表与是否存在草稿。

`draft/` 可修改：

- `SKILL.md` 可由用户编辑。
- `references/` 与 `sources/` 由本地解析器生成，UI 只读。
- `draft.json` 保存 reference 到 source 的精确位置映射。

`versions/vX.Y/` 是发布时生成的不可变目录。`manifest.json` 固定名称、类型、scope、发布时间、reference、source 与来源位置。首版是 `v1.0`，后续按 minor 递增。

## 任务与发现

- `input.json` 固定仓库、范围、知识版本和用户关注点。
- `task.json` 保存状态机、阶段、进度、Commit 范围、耗时和发现数。
- `diagnostics.json` 保存阶段、错误码、时间和是否可重试。
- `findings.json` 保存通过本地双侧证据校验的正式发现及忽略状态。

部分失败保留已成功发现；只有完整成功任务更新仓库基线。

## 日志

日志按 UTC 日期写入 JSONL，只包含：

- 时间
- 任务与仓库 ID
- 阶段
- 耗时
- 错误码与级别

日志不保存完整代码、文档、提示词或模型响应，启动时清理七天前的文件。

## `userData`

Electron `userData` 只保存：

```text
recent-workspace.json
credentials.json
```

`credentials.json` 中的 Bearer 凭据是 Electron `safeStorage` 生成的密文；Windows 使用 DPAPI。Renderer 不能读取该文件、密文或明文。

## 一致性与恢复

- JSON：同目录临时文件 → 原子重命名。
- 发布版本：临时目录完整写入 → 不可覆盖重命名。
- 切换工作区：先验证候选目录并完成初始化 → 再替换当前工作区。
- 应用重启：queued/running 任务改为“应用退出导致中断”，保留诊断并允许重试。
- 不迁移原型 `localStorage` 数据。
