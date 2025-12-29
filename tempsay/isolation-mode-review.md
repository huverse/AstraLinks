# 隔离模式审查与完善报告

## 1. 逻辑概览
- SessionManager 负责创建会话，加载 Scenario，初始化 Moderator 状态与 Agent，并订阅 EventBus。
- ModeratorController + RuleEngine 决定发言顺序与轮次推进；DiscussionLoop 驱动自动发言与事件发布。
- EventLogService 作为唯一共享通道：写入事件日志并广播给前端与 Agent。
- 前端 IsolationModeContainer 通过 REST 创建/启动/结束讨论，通过 /isolation WebSocket 接收事件与状态。
- 用户 LLM 配置由前端加密后传入 llmConfig，后端解密并注入到 Agent 适配器。

## 2. 关键问题与已修复
1) 自定义 LLM 仅支持 Gemini：新增 OpenAICompatibleAdapter，LlmAdapterFactory 根据 provider 选择适配器，环境变量与用户配置均可用。
2) 前端未传入配置中心的参与者：App.tsx 现在传入 participants，IsolationModeContainer 仅使用已启用且含 API Key 的配置。
3) 场景列表硬编码：新增 /api/isolation/scenarios，前端动态加载（失败则回退到默认场景）。
4) AgentFactory 预设未加载 & 默认字段缺失：自动注册内置预设，并补齐 name/role/llmProviderId/systemPrompt 默认值。
5) 事件日志存储生产不可靠：已改为可选 Redis Store，事件日志与序号逻辑改为异步，适配多进程部署。
6) 加密密钥生产校验：前后端在生产环境强制要求隔离模式加密密钥。

## 3. 已完成的功能升级
- WebSocket speak:request 已实现 (ModeratorController.triggerAgentSpeak, DiscussionGateway)
- maxTimePerTurn 超时规则已实现 (RuleEngine.checkTimeout, SessionState.currentSpeakerStartTime)
- 云端模板系统已完成 (TemplatePanel, configTemplates routes, 支持 isolation 类型)
- 场景配置已迁移到新格式 (4个预设场景: debate/brainstorm/review/academic)
- Agent 独立 LLM 配置 (每个 Agent 可使用不同模型)
- AI 发言长度限制 (AgentConfig.maxTokens, AgentConfigPanel UI)

## 4. 影响文件
- server/src/isolation-mode/llm/OpenAICompatibleAdapter.ts
- server/src/isolation-mode/llm/LlmAdapterFactory.ts
- server/src/isolation-mode/llm/index.ts
- server/src/isolation-mode/api/routes/scenario.routes.ts
- server/src/isolation-mode/api/routes/index.ts
- server/src/index.ts
- server/src/isolation-mode/agents/AgentFactory.ts
- components/isolation-mode/IsolationModeContainer.tsx
- App.tsx
