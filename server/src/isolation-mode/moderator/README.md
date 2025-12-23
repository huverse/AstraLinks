# Moderator Controller 文档

## 设计定位

Moderator Controller 是一个**系统级控制组件**，不是普通 Agent，也不是 LLM Prompt。

### 职责

- 决定"现在是谁可以说话"
- 决定"是否要打断 / 点名 / 拉偏架"
- 决定"是否该总结 / 切换阶段 / 结束讨论"

### 特性

- ✅ 确定性的（deterministic）
- ✅ 可测试的
- ✅ 不依赖 LLM 的推理能力

## 状态机流程

```
              ┌─────────────┐
              │ NOT_STARTED │
              └──────┬──────┘
                     │ startSession()
                     ▼
              ┌─────────────┐
         ┌────│   OPENING   │
         │    └──────┬──────┘
         │           │ phaseRound >= maxRounds
         │           ▼
         │    ┌─────────────────┐
         │    │ FREE_DISCUSSION │◄────────────┐
         │    └───────┬─────────┘             │
         │            │                       │ rollback
         │            ▼                       │
         │    ┌─────────────────┐             │
         │    │ FOCUSED_CONFLICT│─────────────┤
         │    └───────┬─────────┘             │
         │            │                       │
         │            ▼                       │
         │    ┌─────────────┐                 │
         │    │ CONVERGENCE │─────────────────┘
         │    └──────┬──────┘
         │           │
         │           ▼
         │    ┌─────────────┐
         └───►│   CLOSING   │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │    ENDED    │
              └─────────────┘
```

## 核心类型

### ModeratorAction 枚举

| 动作 | 说明 |
|------|------|
| `ALLOW_SPEECH` | 允许发言（批准 INTENT） |
| `REJECT_SPEECH` | 拒绝发言（驳回 INTENT） |
| `PROMPT_QUESTION` | 提出问题（主持人主动引导） |
| `CALL_AGENT` | 点名发言 |
| `FORCE_SUMMARY` | 强制总结 |
| `SWITCH_PHASE` | 切换阶段 |
| `END_DISCUSSION` | 结束讨论 |
| `WAIT` | 等待（无操作） |
| `WARN_AGENT` | 警告（发言过多） |

### 干预级别 (0-3)

| 级别 | 说明 | 行为 |
|------|------|------|
| 0 | 不干预 | 纯观察，冷场时也不干预 |
| 1 | 低度 | 严重冷场时点名 |
| 2 | 中度 | 主动点名发言少的人 |
| 3 | 高度 | 主动提问引导话题 |

## 决策逻辑

### 核心方法

```typescript
decideNextAction(
  state: ModeratorState,
  intents: Intent[],
  recentEvents: Event[]
): ModeratorDecision
```

### 决策流程

1. **检查阶段切换** → 达到 maxRounds 时切换阶段或结束
2. **分析健康度** → 检测冷场/过热
3. **处理发言意图** → 根据 speakingOrder 模式决定
4. **主动干预** → 高干预级别时主动引导
5. **等待** → 无操作

## 典型场景决策示例

### 场景1：正常讨论

**状态**:
```
currentPhaseType: FREE_DISCUSSION
phaseRound: 3
idleRounds: 0
speakingOrder: free
lastSpeakerId: agent-1
consecutiveSpeaks: 1
```

**输入意图**:
```
[
  { agentId: 'agent-2', type: 'speak', urgency: 3 },
  { agentId: 'agent-3', type: 'speak', urgency: 2 }
]
```

**决策**:
```
{
  action: ALLOW_SPEECH,
  targetAgentId: 'agent-2'  // urgency 最高
}
```

### 场景2：冷场

**状态**:
```
currentPhaseType: FREE_DISCUSSION
idleRounds: 4
coldThreshold: 3
interventionLevel: 2
speakCounts: { 'agent-1': 5, 'agent-2': 2, 'agent-3': 1 }
```

**输入意图**: `[]` (无意图)

**决策**:
```
{
  action: CALL_AGENT,
  targetAgentId: 'agent-3',  // 发言最少
  reason: '请发表您的观点'
}
```

### 场景3：插话冲突

**状态**:
```
currentPhaseType: FOCUSED_CONFLICT
allowInterrupt: true
lastSpeakerId: agent-1
consecutiveSpeaks: 2  // 已达最大值
```

**输入意图**:
```
[
  { agentId: 'agent-1', type: 'speak', urgency: 3 },
  { agentId: 'agent-2', type: 'interrupt', urgency: 4 }
]
```

**决策**:
```
{
  action: ALLOW_SPEECH,
  targetAgentId: 'agent-2',  // agent-1 连续发言过多被过滤
  metadata: { isInterrupt: true }
}
```

## 规则约束

| 规则 | 实现 |
|------|------|
| 不允许所有人同时说话 | 每次只返回一个 `targetAgentId` |
| 同一 Agent 不允许连续霸占 | `MAX_CONSECUTIVE_SPEAKS = 2` |
| 插话需要条件 | `urgency >= 3` + `allowInterrupt = true` |
| 冷场处理 | `idleRounds >= coldThreshold` → 点名/提问 |
| phaseRound 达上限 | `FORCE_SUMMARY` → `SWITCH_PHASE` |

## 使用示例

```typescript
import { ModeratorControllerCore } from './ModeratorControllerCore';

// 创建控制器
const controller = new ModeratorControllerCore(scenario);

// 创建初始状态
let state = controller.createInitialState(['agent-1', 'agent-2', 'agent-3']);

// 决策循环
const decision = controller.decideNextAction(state, intents, recentEvents);

// 根据决策更新状态
if (decision.action === ModeratorAction.ALLOW_SPEECH) {
    state = controller.updateStateAfterSpeech(state, decision.targetAgentId!);
} else if (decision.action === ModeratorAction.SWITCH_PHASE) {
    state = controller.updateStateAfterPhaseSwitch(state, decision.nextPhaseId!);
}
```
