# DesignX

DesignX 是面向系统设计人员与模块负责人的本地研发治理工作台。它把默认分支上的真实代码变更与已发布的业务需求、系统设计和编程规范进行对照，输出同时具备代码证据与知识证据的发现。

当前 MVP 已实现完整本地闭环：

```text
选择工作区 → 克隆/同步仓库 → 导入并发布知识 → 执行模型分析 → 查看并忽略发现
```

生产模式没有示例数据，不使用 `localStorage`。代码、知识、任务和发现全部写入用户选择的工作区。

## 运行要求

- Windows 10/11 x64
- Node.js 24
- npm 11 或与 Node 24 配套的 npm
- Windows 系统 Git
- 可访问的 OpenAI-compatible 模型服务

Git HTTPS 鉴权复用 Git Credential Manager，SSH 鉴权复用系统 SSH Agent。DesignX 不提供独立的 Git 凭据输入界面。

## 安装与开发

```powershell
npm ci
npm run dev
```

`npm run dev` 会启动 electron-vite 开发环境及 Electron 桌面窗口。首次启动时选择一个已存在且可写的本地目录作为工作区。

仅调试 Renderer：

```powershell
npm run dev:renderer
```

单独运行 Renderer 时没有 Electron preload，因此只能检查首次使用页面，不能执行文件、Git 或模型操作。

## 首次配置与使用

1. 选择本地工作区。
2. 在“代码仓”中填写名称、Git 地址和默认分支，执行验证并克隆。
3. 在“知识库”中选择 Markdown、PDF 或 DOCX，检查本地生成的 `SKILL.md` 与只读来源映射，然后发布 `v1.0`。
4. 在设置中填写 HTTPS 模型地址、模型名称、Bearer 凭据和超时，点击“测试连接”。
5. 在“新建分析”中选择仓库、已发布知识版本和范围，开始分析。
6. 在“分析任务”查看真实阶段与诊断，在“发现”查看双侧证据并可填写原因后忽略。

凭据通过 Electron `safeStorage` 使用 Windows DPAPI 加密，只能由 Main 进程解密；Renderer 只能看到“已配置”状态。

## 命令

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run package:win
npm run package:verify
```

- `test:unit`：原子存储、路径边界、解析位置、模型 schema、任务恢复。
- `test:integration`：本地 bare Git、MD/PDF/DOCX、模型回退/超时/错误和完整分析流水线。
- `test:e2e`：Electron 首次工作区、真实闭环、零发现、失败重试、忽略和重启恢复。
- `build`：构建独立的 Main、preload 与 Renderer 产物到 `out/`。
- `package:win`：在 `release/` 生成未签名的 x64 NSIS 安装包和 portable 可执行文件。
- `package:verify`：检查安装包与 portable 产物，并实际启动 unpacked 和 portable 应用做冒烟验证。

安装包暂未签名，Windows 可能显示 SmartScreen 提示。

## 开发与自动化环境变量

复制 `.env.example` 后，可在启动进程中设置：

```dotenv
DESIGNX_DEV_WORKSPACE=
DESIGNX_MODEL_BASE_URL=
DESIGNX_MODEL_NAME=
DESIGNX_MODEL_API_KEY=
DESIGNX_E2E=0
DESIGNX_LOG_LEVEL=info
```

这些变量只用于开发和自动化测试，不使用 `VITE_` 前缀，因此不会注入 Renderer。已打包应用忽略这些变量，只使用设置弹窗与 DPAPI 凭据。

## 固定限制

- 每次最多导入 20 个文件；单文件 25MB；总计 100MB。
- 扫描型 PDF 不执行 OCR；无可提取文本时明确报错。
- 单任务最多 200 个文件或 2MB Diff。
- 单个模型批次的代码与知识文本不超过 60,000 字符。
- 同一仓库只能有一个活动任务，全局最多并行两个任务。
- 只分析默认分支；同步只接受 fast-forward。
- 不支持自定义 CA、自定义鉴权头、其他分支、任务取消、后台续跑、自动修复、报告、协作、RAG 或自动更新。

## 数据与安全

工作区数据结构见 [docs/DATA_LAYOUT.md](docs/DATA_LAYOUT.md)，进程与安全设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

- Renderer 启用 `contextIsolation` 与 sandbox，关闭 Node 集成。
- preload 只暴露强类型的 `window.designx` 方法，不暴露通用 `ipcRenderer`。
- 所有 IPC 入参经过 Zod 校验，并验证请求来自主窗口主 frame。
- Main 阻止任意导航、新窗口和权限请求。
- Git 使用 `execFile` 参数数组，关闭 shell，并设置受控 `cwd`、超时和隐藏窗口。
- 日志只记录任务、阶段、耗时和错误码，保留七天，不复制完整代码、文档或模型请求。

## 常见问题

- **未检测到 Git**：确认 `git --version` 可在新的 PowerShell 窗口运行，然后重启 DesignX。
- **仓库同步被阻止**：先在 Git 工具中处理未提交修改、本地领先提交或分叉；DesignX 不会 reset 或覆盖。
- **PDF 没有文本**：该文件可能是扫描件，MVP 不含 OCR，请提供带文本层的 PDF、Markdown 或 DOCX。
- **模型连接失败**：确认地址为 HTTPS（开发测试的 localhost 可用 HTTP）、Bearer 凭据有效、模型名称存在，并检查 Windows 系统代理与企业证书链。
- **任务在重启后显示失败**：queued/running 任务会被标记为“应用退出导致中断”；诊断会保留，可手动重新运行。

## 项目结构

```text
src/
├─ main/
│  ├─ ipc/
│  ├─ persistence/
│  ├─ security/
│  └─ services/{workspace,git,knowledge,analysis,model,logging}/
├─ preload/index.ts
├─ renderer/
│  ├─ components/
│  ├─ features/
│  ├─ state/
│  └─ styles/
└─ shared/{contracts,schemas,types}.ts
tests/{unit,integration,e2e,fixtures}/
build/electron-builder.yml
docs/{PRD,DESIGN_SYSTEM,ARCHITECTURE,DATA_LAYOUT}.md
```
