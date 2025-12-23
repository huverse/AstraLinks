# Moderator LLM 文档

## 设计定位

Moderator LLM 是主持人的**语言表达层**，只负责生成文本。

### 可以做 ✅

| 功能 | 方法 |
|------|------|
| 讨论大纲 | `generateOutline()` |
| 引导问题 | `generateQuestion()` |
| 阶段总结 | `generateSummary()` |
| 开场白 | `generateOpening()` |
| 结束语 | `generateClosing()` |

### 不可以做 ❌

- 判断谁该说话
- 判断 phase 是否切换
- 判断是否冷场
- 决定是否结束讨论

**所有"是否"的判断由 Moderator Controller 决定。**

## 调用关系

```
Moderator Controller
    │
    │ (需要语言：FORCE_SUMMARY / PROMPT_QUESTION)
    ▼
Moderator LLM Service
    │
    │ (返回结构化文本)
    ▼
Event Log（SUMMARY / SYSTEM 事件）
```

**Moderator LLM 永远不能直接访问 Event Log 或 Agent 私有上下文。**

## Prompt 系统约束

```
1. 你不能做任何决策
   - 不能决定谁该发言
   - 不能决定是否切换阶段
   - 不能决定是否结束讨论

2. 你只能基于给定输入生成文本
   - 不要推测未提供的信息
   - 不要假设任何未明确说明的状态

3. 输出必须简洁、可控
   - 不要复述完整发言内容
   - 严格遵守输出格式

4. 保持中立
   - 不表达个人观点
   - 不偏袒任何一方
```

## 示例

### 1. Outline Prompt 示例

**输入:**
```typescript
{
  topic: "远程办公是否应该成为主流工作方式",
  alignmentType: "opposing",
  factions: [
    { id: "pro", name: "正方", position: "支持远程办公" },
    { id: "con", name: "反方", position: "反对远程办公" }
  ],
  phases: [
    { id: "opening", name: "开场", type: "opening", description: "介绍议题" },
    { id: "free", name: "自由辩论", type: "free_discussion", description: "自由交锋" }
  ]
}
```

**输出:**
```json
{
  "title": "远程办公辩论",
  "phaseOutlines": [
    {
      "phaseId": "opening",
      "phaseName": "开场",
      "keyPoints": ["介绍辩题背景", "明确双方立场"],
      "suggestedQuestions": ["请正方先阐述核心观点"]
    },
    {
      "phaseId": "free",
      "phaseName": "自由辩论",
      "keyPoints": ["效率问题", "管理问题", "工作生活平衡"],
      "suggestedQuestions": ["如何解决远程协作的效率问题？"]
    }
  ],
  "moderatorNotes": ["注意时间控制，每人发言不超过2分钟"]
}
```

### 2. Question Prompt 示例

**输入:**
```typescript
{
  topic: "远程办公是否应该成为主流工作方式",
  currentPhase: { id: "free", name: "自由辩论", round: 3, maxRounds: 8 },
  divergencePoints: ["协作效率问题", "员工管理难度"],
  recentSpeechSummaries: [
    { speaker: "李强", summary: "认为远程协作工具可以弥补效率损失" },
    { speaker: "王明", summary: "强调面对面沟通的不可替代性" }
  ],
  targetAgent: { id: "agent-3", name: "张华" }
}
```

**输出:**
```json
{
  "question": "张华，您作为技术专家，如何看待现有协作工具在弥补效率损失方面的实际效果？",
  "questionType": "directed",
  "targetName": "张华"
}
```

### 3. Summary Prompt 示例

**输入:**
```typescript
{
  topic: "远程办公是否应该成为主流工作方式",
  phase: { id: "free", name: "自由辩论", type: "free_discussion" },
  condensedEvents: [
    { speaker: "李强", keyPoint: "远程协作工具效率高" },
    { speaker: "王明", keyPoint: "面对面沟通不可替代" },
    { speaker: "张华", keyPoint: "混合模式可能是折中方案" }
  ],
  consensusPoints: ["工具支持是远程办公的基础"],
  divergencePoints: ["效率问题", "沟通质量"],
  summaryType: "phase_end"
}
```

**输出:**
```json
{
  "summaryText": "本阶段讨论围绕协作效率展开。正方认为协作工具可以弥补效率损失，反方则强调面对面沟通的不可替代性。双方在工具支持的重要性上达成共识，但对效率和沟通质量问题仍存分歧。张华提出的混合模式值得进一步探讨。",
  "consensusHighlights": ["工具支持是基础"],
  "divergenceHighlights": ["效率问题", "沟通质量"],
  "nextStepsSuggestion": "建议下一阶段聚焦混合模式的可行性"
}
```

### 4. 完整调用流程

```
┌────────────────────────────────────────────────────────────┐
│ 1. Controller 决定"该总结"                                  │
├────────────────────────────────────────────────────────────┤
│ // 在 ModeratorControllerCore.decideNextAction() 中        │
│                                                            │
│ if (state.phaseRound >= currentPhase.maxRounds) {          │
│   if (currentPhase.forceSummary) {                         │
│     return {                                               │
│       action: ModeratorAction.FORCE_SUMMARY,               │
│       llmRequestType: 'summary'                            │
│     };                                                     │
│   }                                                        │
│ }                                                          │
│                                                            │
│ // Controller 返回决策，不生成任何文本                      │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 2. 协调层调用 Moderator LLM                                 │
├────────────────────────────────────────────────────────────┤
│ // 在 DiscussionOrchestrator 中（尚未实现）                 │
│                                                            │
│ if (decision.action === ModeratorAction.FORCE_SUMMARY) {   │
│   // 准备结构化输入（不是 Event Log 原始数据）              │
│   const summaryInput: SummaryInput = {                     │
│     topic: session.topic,                                  │
│     phase: { ... },                                        │
│     condensedEvents: condensEvents(recentEvents, 10),      │
│     consensusPoints: extractConsensus(recentEvents),       │
│     divergencePoints: extractDivergence(recentEvents),     │
│     summaryType: 'phase_end'                               │
│   };                                                       │
│                                                            │
│   const summary = await moderatorLLM.generateSummary(      │
│     summaryInput                                           │
│   );                                                       │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 3. 写入 Event Log                                           │
├────────────────────────────────────────────────────────────┤
│ eventLogService.appendEvent({                               │
│   sessionId,                                                │
│   type: EventType.SUMMARY,                                  │
│   speaker: 'moderator',                                     │
│   content: summary.summaryText,                             │
│   meta: {                                                   │
│     phaseId: currentPhaseId,                                │
│     consensusHighlights: summary.consensusHighlights,       │
│     divergenceHighlights: summary.divergenceHighlights      │
│   }                                                         │
│ });                                                         │
└────────────────────────────────────────────────────────────┘
```

## Token 治理

| 约束 | 实现 |
|------|------|
| 大纲 | `OUTLINE_MAX_TOKENS = 500` |
| 问题 | `QUESTION_MAX_TOKENS = 100` |
| 总结 | `SUMMARY_MAX_TOKENS = 300` |
| 开场白 | `OPENING_MAX_TOKENS = 200` |
| 结束语 | `CLOSING_MAX_TOKENS = 300` |

输入：只允许 phase 信息 + 精简后的事件，禁止 Event Log 全量。

## 使用示例

```typescript
import { ModeratorLLMService } from './ModeratorLLMService';

const moderatorLLM = new ModeratorLLMService(llmProvider);

// 生成阶段总结
const summary = await moderatorLLM.generateSummary({
  topic: "远程办公是否应该成为主流工作方式",
  phase: { id: "free", name: "自由辩论", type: "free_discussion" },
  condensedEvents: [...],
  consensusPoints: [...],
  divergencePoints: [...],
  summaryType: "phase_end"
});

// summary.summaryText 可直接写入 Event Log
```
