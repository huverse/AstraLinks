# Agent Executor 文档

## 设计定位

Agent Executor 是系统中**唯一直接调用 LLM 的地方**。

### 职责

- ✅ 生成发言意图 (Intent)
- ✅ 生成实际发言 (Speech)
- ✅ 管理私有上下文

### 不负责

- ❌ 任何秩序或规则判断
- ❌ 决定是否能发言（由 ModeratorController 决定）

## Agent 可见上下文（严格限制）

Agent 每次调用 LLM 时，只能看到：

| 可见 | 说明 |
|------|------|
| ✅ System Prompt | 角色定义 + 约束 |
| ✅ Persona | 人格 + 立场 |
| ✅ Phase Info | 当前阶段信息 |
| ✅ Recent Events (N条) | 最近公共事件 |
| ✅ Phase Summary | 阶段总结（如果有） |
| ❌ 全量历史 | 永远不允许 |
| ❌ 其他 Agent 私有信息 | 永远不允许 |
| ❌ Moderator 内部状态 | 永远不允许 |

## System Prompt 约束

```
1. 不允许讨论系统本身
2. 不允许推测不可见历史
3. 不允许假设自己一定能发言
4. 必须严格按 JSON schema 输出
```

## 示例

### 1. Agent Persona 示例

```typescript
const persona: AgentPersona = {
    agentId: 'agent-pro-1',
    name: '李强',
    role: '正方主辩',
    personaDescription: '资深辩手，逻辑严密，善于用数据和事实论证观点',
    stance: {
        factionId: 'pro',
        position: '支持远程办公成为主流工作方式'
    },
    speakingStyle: 'analytical',
    expertise: ['人力资源', '组织管理'],
    traits: ['理性', '自信', '善辩']
};
```

### 2. buildPrompt() 完整示例

**System Prompt:**
```
你是一个参与讨论的角色，名字是「李强」。

## 你的身份
资深辩手，逻辑严密，善于用数据和事实论证观点

## 你的说话风格
你注重逻辑和数据，习惯用分析框架来讨论问题。

## 你的立场
阵营：pro
立场：支持远程办公成为主流工作方式

## 重要约束（必须严格遵守）
1. 不允许讨论这个系统本身、你的身份、或 AI 相关话题
2. 不允许推测你无法看到的历史或他人的私有想法
3. 不允许假设你一定能发言——你只是在「表达意图」
4. 必须严格按照指定的 JSON 格式输出
5. 必须保持角色人设，不要出戏
```

**User Message (Intent):**
```
## 当前讨论阶段
- 阶段：自由辩论（free_discussion）
- 进度：第 3 / 8 轮

## 讨论主题
远程办公是否应该成为主流工作方式？

## 最近发言（共 3 条）
1. [王明] 远程办公降低了团队协作效率... (1分钟前)
2. [主持人] 请各位继续讨论 (30秒前)
3. [张华] 我认为沟通工具可以弥补... (15秒前)

## 你的任务
请决定你是否想要发言。输出一个 JSON 对象：
{
  "type": "INTENT",
  "intent": "speak | interrupt | question | respond | pass",
  "urgency": 1-5,
  ...
}
```

### 3. 完整调用流程

```
┌────────────────────────────────────────────────────────────┐
│ 1. Intent 生成                                             │
├────────────────────────────────────────────────────────────┤
│ Agent 收到可见上下文                                        │
│ ↓                                                          │
│ AgentExecutor.runIntentGeneration(visibleContext)          │
│ ↓                                                          │
│ LLM 返回:                                                  │
│ {                                                          │
│   "type": "INTENT",                                        │
│   "intent": "respond",                                     │
│   "urgency": 4,                                            │
│   "target": "王明",                                        │
│   "topic": "反驳协作效率论点"                               │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 2. ModeratorController 决策（系统级，非 LLM）               │
├────────────────────────────────────────────────────────────┤
│ 收集所有 Agent 的 Intent                                    │
│ ↓                                                          │
│ moderator.decideNextAction(state, intents, events)         │
│ ↓                                                          │
│ 返回: { action: ALLOW_SPEECH, targetAgentId: 'agent-pro-1' }│
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 3. Speech 生成（仅在允许后）                                │
├────────────────────────────────────────────────────────────┤
│ AgentExecutor.runSpeechGeneration(visibleContext, topic)    │
│ ↓                                                          │
│ LLM 返回:                                                  │
│ {                                                          │
│   "type": "SPEECH",                                        │
│   "content": "王明同学提到协作效率问题，但根据 Gitlab       │
│               2023 年报告，远程团队的代码提交频率反而提高    │
│               了 15%...",                                   │
│   "tone": "assertive"                                      │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 4. 发布到 Event Log                                         │
├────────────────────────────────────────────────────────────┤
│ eventLogService.appendEvent({                               │
│   sessionId,                                                │
│   type: EventType.SPEECH,                                   │
│   speaker: 'agent-pro-1',                                   │
│   content: speech.content                                   │
│ })                                                          │
└────────────────────────────────────────────────────────────┘
```

## 使用示例

```typescript
import { AgentExecutor, AgentExecutorService } from './agents';

// 创建服务
const service = new AgentExecutorService(llmProvider);

// 创建 Agent
const agent = service.createAgent(persona, '积极参与辩论');

// 生成意图
const intent = await agent.runIntentGeneration(visibleContext);

// 如果被允许发言
if (decision.action === ModeratorAction.ALLOW_SPEECH) {
    const speech = await agent.runSpeechGeneration(visibleContext, intent.topic);
    // 发布到 Event Log
}
```

## Token 治理

| 约束 | 实现 |
|------|------|
| recentEvents 有 limit | `MAX_RECENT_EVENTS_LIMIT = 20` |
| Phase Summary 优先 | 有 summary 时可减少 events |
| shortTermMemory 有上限 | `maxEntries=10, maxTokens=2000` |
| 自动裁剪 | 按 importance 优先删除低重要性 |
