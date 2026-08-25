# AI Qt 原型生成器 PRD

## 1. 产品定义与目标用户

AI Qt 原型生成器是一款供个人在 Windows 本地使用的 AI 原型工具。用户输入功能需求文字并添加相关附件，产品仅通过 OpenCode Server 生成可直接操作的 PySide2 原型，并支持加载用户自定义 SKILL、对 Qt 控件添加位置化批注，以及基于全部批注继续迭代。

目标用户是需要快速验证页面结构、功能流程和基础交互的产品创建者。用户能够判断需求和原型效果，但不需要为每次评审手工编写 Qt 代码。

产品的核心价值是：通过 OpenCode，将需求可靠地转化为可运行的原生 PySide2 原型，并基于 Qt 控件语义完成可恢复的批量迭代。

## 2. 功能需求

### FR-001 首次环境准备

用户首次打开产品时，系统自动检查 OpenCode、Python 3.9.11，以及项目目录下的 Python/PySide2 虚拟环境。环境检查通过后进入工作台。

验收要求：

- 系统自动探测用户已安装的 OpenCode，并验证 `opencode serve` 能够启动及通过健康检查；产品不提供 OpenCode CLI JSON 模式或其他 AI 接入方式作为降级路径。
- 系统自动探测用户已安装的 Python，只有精确版本 Python 3.9.11 才视为通过；未找到时提示用户安装，不自动下载 Python，也不要求用户手工配置解释器路径。
- 系统在项目目录中创建或复用 `.venv`，并确保其解释器为 Python 3.9.11，安装 `PySide2==5.15.2.1` 和产品内置的 `designx_runtime`。
- 已有 `.venv` 的 Python 或 PySide2 版本不匹配时，系统不直接覆盖，显示差异并允许用户确认后重建环境。
- 页面分别显示 OpenCode、Python、虚拟环境和 PySide2 的检查状态；失败时显示简短原因并允许重试。
- 环境检查通过后进入工作台，后续打开产品时自动复检，并复用有效环境。

### FR-002 用户自定义 SKILL 管理

产品不提供预置设计系统或预置的用户可见 SKILL。用户可以将自己的 SKILL 添加到本地库，并为一个项目同时启用零份、一份或多份 SKILL。

验收要求：

- 用户通过选择本地目录添加 SKILL；所选目录的根目录中必须包含 `SKILL.md`，并可同时包含 `assets/`、`references/`、脚本及其他辅助文件。
- `SKILL.md` 必须符合 OpenCode 原生 SKILL 规则，至少包含有效的 `name` 和 `description`；校验失败时不加入本地库，并显示简短原因。
- 添加操作将完整 SKILL 目录复制到产品的本地 SKILL 库，不依赖原目录后续继续存在。
- 再次添加同名 SKILL 时，由用户确认是否替换；未确认前保留现有版本。
- 用户可以同时启用多份 SKILL。启用状态按项目保存，并应用于之后开始的生成任务。
- 用户可以删除未启用的 SKILL；已启用的 SKILL 需要先取消启用后才能删除。
- 任务开始时冻结本次启用的 SKILL 集合；生成期间不能修改该任务使用的 SKILL，但不影响用户为后续任务调整选择。
- 任务执行前，系统将本次启用的完整 SKILL 目录复制到 candidate 工作区的 `.opencode/skills/<name>/`，由 OpenCode 原生发现和加载。
- 产品内部用于约束 PySide2 项目结构、运行入口和批注协议的生成契约不显示在用户 SKILL 列表中，由系统提示词强制注入。

### FR-003 功能需求与附件输入

用户可以粘贴功能需求文字，并可以添加多个本地文件作为附件。附件不限定格式，由产品原样保存并交给 OpenCode 读取。

验收要求：

- 用户可以输入、编辑并保留功能需求文字，也可以添加、查看和删除多个附件。
- 至少存在有效需求文字或一个可读取的附件时，用户才可以开始生成。
- 产品将附件原样复制到项目的 `inputs/` 目录，保留原始文件名元数据，并为重名文件生成不冲突的存储名称。
- 产品不对附件执行格式专属解析、正文提取、OCR、图片理解或格式转换，也不承诺 OpenCode 能理解所有附件格式。
- 每次任务冻结当时的需求文字和附件清单，并在 candidate 工作区中提供对应文件及路径。
- 附件复制失败时不开始任务，保留已输入的需求和附件清单，并显示失败文件及简短原因。

### FR-004 原型生成与预览

用户通过一次操作调用 OpenCode Server。系统结合当前功能需求、附件和本次启用的全部 SKILL 生成 PySide2 原型，并自动补充产品评审所需的模拟数据和基础交互。缺少不影响主要页面或流程的信息时，系统采用常见默认值。

验收要求：

- 用户无需经过项目向导、规格确认、模型选择或技术参数选择即可开始生成；模型及凭据沿用用户现有的 OpenCode 配置。
- 原型使用项目 `.venv` 中的 Python 3.9.11、`PySide2==5.15.2.1` 和 `designx_runtime`。
- 原型只允许依赖 Python 标准库、PySide2 和 `designx_runtime`；不得动态安装或引入其他第三方 Python 包。
- 需求明确描述的页面、表单、列表、弹窗和基础交互可以实际操作；外部服务和后端能力以模拟数据或模拟反馈呈现。
- OpenCode 生成的入口必须符合 `create_main_window()` 契约，并为所有面向用户且具有语义的可批注控件提供稳定的 `designxId`。
- 生成结果必须依次通过语法、导入、依赖、控件 ID、预览进程启动、握手和心跳验证，才视为成功。
- 验证成功后，页面直接显示嵌入式、可操作的 Qt 原型预览；静态截图、不可操作界面或仅生成代码不视为成功。
- 生成、验证或启动失败时，页面保留需求、附件和 SKILL 选择，显示简短失败原因并允许重试。

### FR-005 原型批注

原型生成成功后，用户可以进入批注模式，在当前原型上添加位置化文字批注。系统基于 Qt 控件语义记录页面、控件、父控件链、控件内位置和必要的运行状态，不以屏幕绝对坐标作为主要定位依据。

验收要求：

- 用户可以添加、定位、编辑和删除当前 revision 上的批注。
- 每条批注包含文字、`revisionId`、`pageId`、`designxId`、控件类型、父控件路径、控件内归一化位置和必要的界面状态。
- 用户可以从批注定位到当前原型中的对应控件；窗口缩放、布局变化或滚动后，批注标记仍跟随目标控件。
- 对 `QTableView`、`QListView` 和 `QTreeView` 的项目批注额外记录行、列、表头、显示值和可用的业务 key，而不是将单元格误认为独立 QWidget。
- 批注模式下，移动指针可以高亮当前目标，点击用于创建或选择批注，不触发目标控件原有操作；滚动仍可用于寻找目标。
- 退出批注模式后，批注覆盖层隐藏，原型恢复正常操作。
- 主窗口、`QDialog` 及运行过程中新增的顶层窗口均可注册批注覆盖层和控件上下文。

### FR-006 基于批注重新生成

用户可以一次提交当前 revision 上的全部有效批注。系统冻结功能需求、附件、启用的 SKILL、当前原型和批注，将它们作为一个整体交给单次 OpenCode 任务，在独立 candidate 中生成修改后的原型。

验收要求：

- 没有有效批注时，用户不能开始重新生成。
- 一次操作提交全部有效批注，并只创建一个 OpenCode Session 和一次整体修改任务；不按批注拆分为多个独立任务。
- 任务始终从提交时的 current revision 创建全新的 candidate，不直接修改当前可用版本，也不在上一次失败的半成品上继续修改。
- 处理期间页面显示生成、验证和预览预热状态，并允许用户取消任务。
- candidate 通过全部验证且新预览完成握手和稳定心跳后，系统才更新 current revision；旧预览在此之前保持可用。
- 成功切换后，只清空本次已提交的批注；任务开始后新增的批注不受影响。
- 生成失败、验证失败、OpenCode 异常退出、用户取消或新预览崩溃时，current revision 保持不变，旧预览和全部未应用批注继续保留，并允许重试。

## 3. 技术约束与选型

### 3.1 固定约束

- 首发平台仅支持 Windows。
- 主程序和生成原型统一采用 PySide2；项目运行时固定为用户预装的 Python 3.9.11，项目依赖固定为 `PySide2==5.15.2.1`。
- AI 执行层仅使用 OpenCode Server HTTP/SSE API；不直接调用任何模型 SDK，不实现多 Agent CLI 适配，也不提供 `opencode run --format json` 降级。
- 原型生成依赖仅限 Python 标准库、PySide2 和产品内置 `designx_runtime`。
- 产品以 Qt-first 方式独立实现，不 fork OpenDesign、Open CoDesign 或其他 Web AI 设计产品。
- OpenDesign 仅作为项目、任务和失败恢复状态设计的参考；Open CoDesign 仅作为普通模式、批注模式、pin 和批注列表交互的参考。其 Electron、Web、iframe、DOM selector 和 CSS 修改实现均不进入本产品技术栈。

### 3.2 非目标

- 不支持 macOS、Linux 或跨平台原生窗口适配。
- 不提供预置设计系统、预置的用户可见 SKILL、ZIP 专属导入或在线 SKILL 市场。
- 不对附件进行 Markdown、TXT、DOCX 或其他格式的专属解析。
- 不支持 OpenCode CLI 兼容模式、多模型直连或其他 AI Provider。
- 不允许 OpenCode 为生成原型动态安装第三方依赖。
- 不提供多人协作、云端项目同步或生产级应用发布能力。

## 4. 技术架构

### 4.1 总体结构

```text
DesignX 主程序（PySide2）
├─ EnvironmentManager
│  ├─ OpenCode Server 能力检查
│  ├─ Python 3.9.11 检查
│  └─ 项目 .venv / PySide2 / designx_runtime 管理
├─ SkillStore / InputStore / AnnotationStore
├─ RevisionController / JobController
├─ OpenCodeController
│  └─ 临时 opencode serve + HTTP/SSE
└─ PreviewSupervisor
   ├─ QProcess 管理预览子进程
   ├─ QWindow.fromWinId + QWidget.createWindowContainer
   └─ QLocalSocket IPC

项目 .venv 中的预览子进程（PySide2）
├─ 当前 revision 的生成代码
└─ designx_runtime
   ├─ QApplication 与生成入口
   ├─ 控件注册和稳定 designxId
   ├─ QApplication eventFilter 与控件命中
   ├─ AnnotationOverlay
   └─ IPC、心跳、日志与错误上报
```

### 4.2 项目与版本目录

```text
<project>/
├─ .venv/
├─ inputs/
├─ project.json
├─ revisions/
│  └─ <revision-id>/
└─ jobs/
   └─ <job-id>/
      ├─ job.json
      ├─ candidate/
      │  ├─ inputs/
      │  └─ .opencode/skills/<name>/
      └─ logs/
```

- `project.json` 保存需求文字、附件元数据、已启用 SKILL、`currentRevisionId` 和未提交批注的索引。
- `revisions/<revision-id>/` 是已经验证成功的只读版本；预览始终从某个明确 revision 启动。
- `jobs/<job-id>/job.json` 保存任务开始时冻结的 base revision、需求、附件、SKILL、批注和内容哈希。
- candidate 仅用于当前生成任务。成功时移动为新 revision；失败或取消时保留 candidate 和日志供诊断，但重试必须从相同 base revision 新建 candidate。

### 4.3 OpenCode Server 集成

每次初次生成或批量再生成均启动一个由当前任务独占的临时 OpenCode Server：

1. 以 candidate 为工作目录，通过 `QProcess` 启动 `opencode serve`。
2. 绑定 `127.0.0.1` 的动态空闲端口，并通过临时 `OPENCODE_SERVER_PASSWORD` 启用认证；密码只保存在当前进程内存中。
3. 调用 `/global/health` 确认服务和版本可用。
4. 通过 `POST /session` 创建本任务唯一 Session。
5. 通过 `POST /session/:id/prompt_async` 提交系统约束和任务 Prompt，并通过 `/event` SSE 接收进度、工具调用、权限请求、结果和错误。
6. 用户取消时调用 `POST /session/:id/abort`，随后终止本任务的 OpenCode 进程树。
7. 成功、失败或取消后均关闭临时 Server，不在项目间共享 OpenCode Server 实例或 Session。

OpenCode 沿用用户已有 Provider、模型和凭据配置。candidate 中的项目级 OpenCode 配置必须将所有权限明确设为允许或拒绝，不留下无人处理的 `ask` 状态；文件读写范围限制在 candidate，并拒绝访问外部目录、网络、发布操作和动态安装依赖。语法、导入、依赖和预览验证由 DesignX 在 OpenCode 任务结束后使用项目 `.venv` 独立执行，不要求 OpenCode 访问 candidate 之外的解释器。

参考：[OpenCode Server 文档](https://opencode.ai/docs/server/)、[OpenCode Agent Skills 文档](https://opencode.ai/docs/skills/)。

### 4.4 PySide2 生成与运行契约

生成项目的 `main.py` 必须提供统一入口：

```python
def create_main_window():
    """创建并返回唯一的主 QWidget 或 QMainWindow，不创建 QApplication。"""
    ...


if __name__ == "__main__":
    from designx_runtime import run

    run(create_main_window)
```

`designx_runtime` 是产品维护并安装到项目 `.venv` 的内部包，OpenCode 不得修改。它负责：

- 创建唯一的 `QApplication`，加载 `create_main_window()` 并启动事件循环。
- 建立 `QLocalSocket` IPC、发送 ready 和心跳，并上报日志与未捕获异常。
- 注册主窗口、对话框及其他顶层窗口。
- 安装应用级 `eventFilter`、控件命中逻辑和批注覆盖层。
- 输出主窗口 HWND，供主程序通过 `QWindow.fromWinId()` 和 `QWidget.createWindowContainer()` 嵌入。

生成代码必须为每个面向用户且具有语义的可批注控件设置全局唯一、稳定且可读的 `designxId` 动态属性。ID 应表达业务含义，例如 `customer.editor.save`，在视觉样式、布局或源码文件调整时保持不变；`objectName`、控件类型和父控件路径只作为辅助定位信息。

由于跨进程 native window container 具有叠放和焦点限制，控件高亮、pin 和批注覆盖层必须在预览子进程内部绘制，不能由主程序在容器上方叠加普通 QWidget。

### 4.5 预览子进程与 IPC

原型始终使用项目 `.venv\Scripts\python.exe` 在独立 `QProcess` 中运行，不把生成代码导入主程序进程。独立进程用于隔离 Python 异常、`sys.exit()`、Qt 崩溃、模块缓存和 QObject 泄漏，但不视为安全沙箱。

主程序与预览进程通过本地 JSON 消息通信，至少支持以下消息：

| 方向 | 类型 | 用途 |
|---|---|---|
| 预览 → 主程序 | `ready` | 上报协议版本、revision、PID、主窗口 HWND 和 DPI |
| 预览 → 主程序 | `heartbeat` | 证明事件循环持续可响应 |
| 预览 → 主程序 | `target` | 上报批注命中的页面、控件、位置和界面状态 |
| 预览 → 主程序 | `error` | 上报启动错误、运行异常和崩溃前日志 |
| 主程序 → 预览 | `set_mode` | 在正常模式与批注模式之间切换 |
| 主程序 → 预览 | `set_annotations` | 同步当前 revision 的 pin 和选择状态 |
| 主程序 → 预览 | `focus_target` | 定位并高亮某条批注对应的控件 |
| 主程序 → 预览 | `shutdown` | 请求有序退出预览进程 |

正式结束或强制取消 OpenCode、验证器及预览时，系统使用 Windows Job Object 清理整个子进程树，避免遗留进程。

## 5. 核心数据与状态

### 5.1 项目状态

```json
{
  "schemaVersion": 1,
  "projectId": "project-id",
  "requirementsText": "...",
  "attachments": [],
  "activeSkills": ["skill-a", "skill-b"],
  "currentRevisionId": "rev-0007"
}
```

### 5.2 批注结构

```json
{
  "schemaVersion": 1,
  "annotationId": "ann-0014",
  "revisionId": "rev-0007",
  "comment": "保存按钮应移动到右下角并作为主按钮",
  "pageId": "page.customer-editor",
  "designxId": "customer.editor.save",
  "widgetClass": "QPushButton",
  "ancestorPath": [
    "page.customer-editor",
    "customer.editor.form",
    "customer.editor.actions"
  ],
  "anchor": {
    "xRatio": 0.82,
    "yRatio": 0.5
  },
  "subTarget": null,
  "widgetSnapshot": {
    "text": "保存",
    "enabled": true
  },
  "uiState": {
    "activeTabId": "customer.editor.basic-tab"
  }
}
```

`subTarget` 用于保存 model/view 项目的行、列、表头、显示值和业务 key。`anchor` 是控件局部归一化坐标，只用于视觉锚定；`designxId` 才是主要语义定位键。

### 5.3 Revision 与 Job

```json
{
  "revisionId": "rev-0007",
  "baseRevisionId": "rev-0006",
  "createdAt": "ISO-8601 timestamp",
  "prototypePath": "revisions/rev-0007",
  "status": "ready"
}
```

初次生成的 `baseRevisionId` 为 `null`。只有完成全部验证并提交的 revision 才能使用 `ready` 状态并成为 `currentRevisionId`。

```json
{
  "jobId": "job-0012",
  "kind": "regenerate",
  "baseRevisionId": "rev-0007",
  "candidatePath": "jobs/job-0012/candidate",
  "openCodeSessionId": "session-id",
  "submittedAnnotationIds": ["ann-0014"],
  "status": "generating"
}
```

`kind` 取值为 `initial` 或 `regenerate`。`status` 使用下述任务状态机中的值；初次生成任务的 `baseRevisionId` 同样为 `null`。

### 5.4 任务状态机

```text
READY(base revision 或 no revision)
  → FREEZING_INPUT
  → PREPARING_CANDIDATE
  → STARTING_OPENCODE
  → GENERATING
  → VALIDATING
  → WARMING_PREVIEW
  → COMMITTING
  → READY(new revision)
```

任一步都可以进入 `FAILED` 或 `CANCELLED`。只有完成 `COMMITTING` 后才能更新 `currentRevisionId` 并清空本次提交的批注；失败和取消不得改变 current revision。

## 6. 验证与失败恢复

candidate 必须按顺序通过以下验证：

1. Python 文件可完成语法编译。
2. 主入口及所有项目模块可以在项目 `.venv` 中导入。
3. 源码和依赖清单未引用标准库、PySide2、`designx_runtime` 之外的第三方包。
4. `create_main_window()` 存在并返回 QWidget 或 QMainWindow。
5. 所有可批注语义控件均有非空且不重复的 `designxId`。
6. 预览子进程能在限定时间内发出合法 `ready` 消息。
7. 主窗口能够嵌入，且预览进程能连续发出稳定心跳。

新 candidate 通过验证并完成预热前，旧预览保持运行。切换时先更新预览容器和 `currentRevisionId`，确认成功后再关闭旧进程。若切换前新预览异常，系统继续使用旧 revision；若已经提交的新 revision 后续崩溃，用户可以重启当前版本或回退到上一成功版本。

## 7. 关键验收场景

- **环境版本：** 仅 Python 3.9.11 通过检查；其他版本、缺少 PySide2、无效 `.venv` 和无法启动 OpenCode Server 均显示明确状态，并支持安全重试或确认重建。
- **多附件：** 同一任务可以包含多个不同格式附件，文件内容原样复制；重名、读取失败和任务冻结后的附件变更均按规则处理。
- **多 SKILL：** 用户可以导入并同时启用多份 SKILL；同名替换需要确认，任务使用开始时的冻结快照。
- **可操作预览：** 含 `QStackedWidget`、表单、`QDialog`、`QTableView`、`QListView` 和基础导航的原型能够在嵌入式预览中正常操作。
- **批注定位：** 普通模式不影响原型操作；批注模式能定位普通控件、滚动区域和 model/view 项目，窗口缩放和布局变化后 pin 仍跟随目标。
- **批量再生成成功：** 三条以上跨页面、父子控件及表格单元格的批注只触发一次 OpenCode 任务；新版本通过验证后切换，并只清空本次提交的批注。
- **事务失败：** OpenCode 失败、验证失败、用户取消、预览进程崩溃或心跳超时均不会覆盖 current revision，旧预览和批注保持可用。
- **依赖限制：** OpenCode 生成包含额外第三方依赖或动态安装命令的 candidate 必须验证失败，不能成为 current revision。
- **Windows 集成：** 验证原型窗口的鼠标、键盘焦点、ComboBox 弹出层、QDialog、高 DPI 缩放及关闭行为，并确保任务取消后无遗留子进程。
