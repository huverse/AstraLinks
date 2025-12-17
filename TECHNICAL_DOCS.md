# Galaxyous 技术架构文档 🏗️

本文档详细介绍了 **Galaxyous Union AI Mix** 的系统架构、数据流向以及核心模块（特别是 AI 聚会系统）的技术实现。

## 1. 核心架构：AI 聚会系统 (AI Party System)

Galaxyous 的核心是一个基于即时通讯架构的 AI 混合会话引擎。

### 1.1 会话状态管理 (Session Management)

所有核心会话逻辑位于 `App.tsx` 和 `hooks/useWorkspace` 中。

- **Session 数据结构**:
  ```typescript
  interface Session {
    id: string;
    messages: Message[];
    participants: Participant[]; // 参与该会话的 AI 列表
    gameMode: 'FREE_CHAT' | 'JUDGE_MODE'; // 自由对话 vs 裁判模式
    isAutoLoop: boolean; // 是否开启 AI 自主对话循环
    refereeContext: RefereeContext; // 裁判系统的上下文状态
    votingState: VotingState; // 投票系统状态
    // ...
  }
  ```

- **自动循环引擎 (Auto-Loop Engine)**:
  - 系统维护一个 `autoLoopTimerRef`。
  - 当检测到上一条消息处理完毕且 `isAutoLoop` 开启时，系统会根据 `GameMode` 策略自动调度下一个发言的 AI。
  - **随机调度**: 在自由模式下，随机选择一个 enabled 的 AI 发言。
  - **裁判调度**: 在裁判模式下，由裁判 Agent (Special Role) 解析当前局势，通过 `[[NEXT: participant_id]]` 指令指定下一个发言者。

### 1.2 裁判与指令解析系统 (Referee & Command Parser)

Galaxyous 实现了一套基于文本指令的控制协议，允许裁判 AI 控制流程。

- **指令集**:
  - `[[NEXT: id]]`: 指定下一个发言者。
  - `<<KICK: id>>`: 踢出违规或掉线的参与者。
  - `[[VOTE_START: candidates]]`: 开启投票环节。
  - `[[PRIVATE: id]]`: 发送仅特定 ID 可见的私聊消息。

- **解析逻辑**:
  前端 `parseRefereeResponse` 函数实时解析裁判的流式输出，动态触发生命周期事件（如弹窗确认踢人、更新 UI 状态）。

### 1.3 社交拟真协议 (Social Protocol)

为了让 AI 表现得更像人类，我们定义了特殊的 Token 格式：

- **Token 类型**:
  - `Action (//...//)`: 描述动作，如 `//点头//`。
  - `Thought ([...])`: 描述内心独白，如 `[这有点奇怪...]`。
  - `Whisper ({...})`: 描述私密低语，如 `{别告诉他}`。
  - **Social Block (JSON)**: 包含更复杂元数据的 JSON 块，用于描述微表情、心理状态和虚拟时间轴。

---

## 2. 系统模块架构

```mermaid
graph TD
    User[用户]
    App[App.tsx (主控制器)]
    
    subgraph Core Engines
        PartyEngine[聚会循环引擎]
        WorkflowEngine[工作流引擎]
        MultimodalEngine[多模态生成引擎]
    end
    
    subgraph Features
        Chat[Chat Interface]
        Judge[裁判逻辑]
        RAG[RAG 知识库]
        MCP[MCP 工具链]
    end
    
    subgraph Backend Services
        API[Express API]
        DB[(MySQL)]
        VectorDB[(Vector Store)]
        Redis[(Redis Cache)]
    end
    
    User --> App
    App --> PartyEngine
    App --> WorkflowEngine
    App --> MultimodalEngine
    
    PartyEngine --> Chat
    PartyEngine --> Judge
    
    Chat --> API
    API --> DB
    API --> VectorDB
```

## 3. 其他核心模块详解

### 3.1 工作流引擎 (Workflow Engine)

- **位置**: `core/workflow/`
- **机制**: 基于 DAG 的异步执行器。支持 AI 节点、代码节点、MCP 节点等。
- **特点**: 支持循环 (Loop)、条件判断 (If-Else) 和长时任务。

### 3.2 MCP 系统 (Model Context Protocol)

- **位置**: `core/mcp/`
- **机制**: 标准化工具调用接口。支持 Smithery 市场源，具备降级策略（当市场不可用时回退到内置工具）。
- **统一数据源**: 通过 `/api/mcp/available` 端点，确保 Sidebar、Settings 和 Profile Center 显示一致的工具列表。

### 3.3 多模态中心 (Multimodal Center)

- **位置**: `components/MultimodalCenter.tsx`
- **机制**: 统一封装 Image/Video/Audio 生成 API。
- **流式处理**: 支持实时语音连接 (Live API)，使用 WebSocket 传输音频流。

### 3.4 数据库设计

- **`model_tiers`**: 定义模型等级规则 (Free/Pro/Ultra)，持久化存储，并在部署时通过 Migration 自动创建。
- **`config_templates`**: 存储用户分享的 AI 角色配置模板（支持加密）。
- **`knowledge_vectors`**: 存储上传文档的向量数据。

## 4. 部署与运维

- **Docker 化**: 项目包含 `Dockerfile` 和 `deploy.sh`。
- **自动化**: `deploy.sh` 脚本负责拉取代码、构建前端、编译后端 TS、运行数据库迁移 (Migrations) 并重启 PM2 进程。

---

此文档旨在帮助开发者深入理解 Galaxyous 的技术实现细节。
