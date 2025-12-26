# 隔离模式代码审查与完善报告

## 一、模块逻辑概览（当前架构）
隔离模式后端的主链路为：
1. **SessionManager** 创建会话 → 加载场景 → 初始化 Moderator 状态 → 创建 Agent → 订阅 EventBus。
2. **ModeratorController + RuleEngine** 负责发言顺序与轮次推进；**DiscussionLoop** 驱动自动发言与事件发布。
3. **EventLogService + EventBus** 是唯一共享通道：事件被写入日志并广播给 Agent / 前端。
4. 前端 **IsolationModeContainer** 通过 REST 创建/启动/结束讨论，通过 WebSocket 接收事件与状态。

并行存在的“新架构”包含 **ScenarioConfigLoader + ModeratorControllerCore + DebateWorldEngine**，但当前 UI 与 HTTP 会话仍走旧链路，因此两套逻辑未完全打通。

---

## 二、关键问题与优化点（隔离模式为重点）
1. **前后端加密算法不一致**：前端 PBKDF2，后端使用 scrypt，导致用户 LLM 配置无法解密。
2. **规则引擎未绑定会话**：`ModeratorController` 未接入 `RuleEngine`，导致发言选择返回 `null`，讨论循环停滞。
3. **speakingOrder=free/moderated 时无发言者**：RuleEngine 返回 `null`，DiscussionLoop 无法推进。
4. **WebSocket 协议不对齐**：前端连 `/world-engine`，后端讨论事件在 `/isolation`；`full_state` 等事件缺失。
5. **前端创建会话后未加入 WebSocket**：讨论开始后无法接收实时事件。
6. **场景配置分裂**：`scenarios/presets` 与 `config/scenarios` 两套 Schema 并存，旧版场景与新 Schema 不兼容。
7. **LLM 配置未注入 Agent**：Session 接收 `llmConfig` 但 Agent 未使用，导致用户配置失效。

---

## 三、本次已完成的完善项
### 后端
- **加密兼容**：后端改为 PBKDF2（与前端一致），并保留 scrypt 解密兼容。
- **规则引擎绑定会话**：为每个 session 绑定 RuleEngine，删除会话时清理。
- **speakingOrder 降级策略**：`free` 与 `moderated` 模式改为轮询选择发言者，保障自动讨论推进。
- **LLM 配置注入**：Session 创建时解析用户加密配置，注入 AgentAdapter；未提供时使用默认 Adapter。
- **WebSocket 对齐**：补齐 `/isolation` namespace 的 `world_event`、`state_update`、`simulation_ended`、`full_state`。

### 前端
- **Socket 连接改为 /isolation**，并在创建会话后立即 `join_session`。
- **事件类型兼容**：UI 兼容 `SPEECH` 事件类型展示为发言。
- **阻断无效 API**：`create_session/step/auto_simulation` 标记为隔离模式不支持，避免悬挂请求。

---

## 四、仍需推进的方向（建议）
1. **统一场景 Schema**：选择 `ScenarioConfigLoader` 或 `ScenarioLoader` 作为唯一入口，统一 YAML 格式。
2. **整合新架构**：ModeratorControllerCore / DebateWorldEngine 与现有 SessionManager 需明确归口。
3. **事件结构进一步统一**：明确 UI 展示层的 event 类型映射（例如 SYSTEM/SUMMARY/VOTE）。
4. **LLM 开关策略**：是否允许用户自定义配置在 `WE_LLM_ENABLED=false` 时启用，需产品策略确认。

---

## 五、代码调整清单（关键文件）
- 后端：
  - `server/src/isolation-mode/utils/crypto.ts`
  - `server/src/isolation-mode/moderator/ModeratorController.ts`
  - `server/src/isolation-mode/moderator/RuleEngine.ts`
  - `server/src/isolation-mode/session/SessionManager.ts`
  - `server/src/isolation-mode/orchestrator/DiscussionLoop.ts`
  - `server/src/isolation-mode/api/websocket/DiscussionGateway.ts`
  - `server/src/index.ts`
- 前端：
  - `services/isolationSocket.ts`
  - `components/isolation-mode/IsolationModeContainer.tsx`

---

如需进一步对接 **新场景配置** 或 **ModeratorControllerCore**，请告知优先级与目标行为，我可以继续完成整合与迁移。
