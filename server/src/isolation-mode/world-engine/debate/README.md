# DebateWorldEngine 文档

## 架构说明

```
┌──────────────────────────────────────────────────┐
│           DebateWorldEngine                       │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ DebateArbiter (冲突裁决)                     │ │
│  │ • resolveConflicts() → 选出可执行 Action    │ │
│  │ • 支持 round-robin / moderated / free      │ │
│  └─────────────────────────────────────────────┘ │
│                     ↓                             │
│  ┌─────────────────────────────────────────────┐ │
│  │ DebateRuleEngine (规则验证+应用)            │ │
│  │ • validateAction() → 检查规则合法性          │ │
│  │ • applyAction() → 生成 Events + Effects     │ │
│  │ • 连续发言限制 / 插话限制                   │ │
│  └─────────────────────────────────────────────┘ │
│                     ↓                             │
│  ┌─────────────────────────────────────────────┐ │
│  │ DebateScheduler (阶段+时间)                 │ │
│  │ • shouldAdvancePhase() → 检查阶段结束        │ │
│  │ • getNextPhase() → 获取下一阶段              │ │
│  │ • shouldTerminate() → 检查终止条件          │ │
│  └─────────────────────────────────────────────┘ │
│                     ↓                             │
│  ┌─────────────────────────────────────────────┐ │
│  │ DebateNarrator (LLM 语言生成)               │ │
│  │ • 复用 ModeratorLLMService                  │ │
│  │ • generateSummary / generateQuestion        │ │
│  └─────────────────────────────────────────────┘ │
│                     ↓                             │
│  ┌─────────────────────────────────────────────┐ │
│  │ DebateWorldState (世界状态)                 │ │
│  │ • currentPhase / speakingOrder / speakCounts│ │
│  │ • alignment / interventionLevel             │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 各子组件职责

| 组件 | 职责 | 关键方法 |
|------|------|----------|
| **DebateArbiter** | 裁决 Action 冲突，每轮选出 1 个 Agent 发言 | `resolveConflicts()`, `prioritizeActions()` |
| **DebateRuleEngine** | 验证 Action 合法性，应用规则生成事件 | `validateAction()`, `applyAction()` |
| **DebateScheduler** | 管理阶段流转，控制 max_rounds，触发终止 | `shouldAdvancePhase()`, `getNextPhase()` |
| **DebateNarrator** | 复用 ModeratorLLM，生成总结/问题 | `generateSummary()`, `generateQuestion()` |

---

## DebateWorldState 定义

```typescript
interface DebateWorldState extends WorldState {
    worldType: 'debate';
    topic: string;
    alignment: { type: 'opposing' | 'free' | 'multi-faction', factions?: [...] };
    debate: {
        speakingOrder: 'round-robin' | 'free' | 'moderated';
        activeSpeaker: string | null;
        lastSpeakerId: string | null;
        consecutiveSpeaks: number;
        idleRounds: number;
        allowInterrupt: boolean;
        interventionLevel: number;
        coldThreshold: number;
        speakCounts: Map<string, number>;
        agentIds: string[];
    };
}
```

---

## Action 映射

### speak / interrupt Action ↔ SPEECH / INTENT

| 原系统 | 新系统 (Action 模型) |
|--------|----------------------|
| `INTENT { type: 'speak', urgency: 4 }` | `Action { actionType: 'speak', priority: 4 }` |
| `INTENT { type: 'interrupt', urgency: 5 }` | `Action { actionType: 'interrupt', priority: 5 }` |
| `SPEECH { content: '...', tone: 'calm' }` | `Action { params: { content: '...', tone: 'calm' } }` |

### 转换函数

```typescript
// Intent → Action
function intentToAction(intent: Intent): Action {
    return {
        actionId: uuidv4(),
        agentId: intent.agentId,
        actionType: intent.type,
        params: { topic: intent.topic },
        confidence: intent.urgency / 5,
        priority: intent.urgency,
        timestamp: intent.timestamp
    };
}

// Action → Event
function actionToEvent(action: Action, success: boolean): WorldEvent {
    return {
        eventId: uuidv4(),
        eventType: success ? 'speech' : 'speech_rejected',
        source: action.agentId,
        content: action.params.content,
        timestamp: Date.now()
    };
}
```

### 被拒绝的 Action

| 情况 | 是否进入 Event Log | 事件类型 |
|------|-------------------|----------|
| 验证失败（连续发言过多） | ✅ | `speech_rejected` |
| 冲突裁决被淘汰 | ❌ | 不记录 |
| Pass 类型 | ❌ | 不记录 |

---

## 核心 step() 伪代码

```typescript
async step(agentActions: Action[]): Promise<ActionResult[]> {
    // ========================================
    // 1. Arbiter 裁决：选出可执行的 Action
    // ========================================
    const resolvedActions = arbiter.resolveConflicts(agentActions, state);
    
    if (resolvedActions.length === 0) {
        state.debate.idleRounds++;
        if (shouldModeratorIntervene()) {
            await handleModeratorIntervention(); // → Event
        }
    }

    // ========================================
    // 2. RuleEngine 验证
    // ========================================
    for (const action of resolvedActions) {
        const validation = ruleEngine.validateAction(action, state);
        
        if (!validation.isValid) {
            events.push({ type: 'speech_rejected', ... }); // 记录拒绝
            continue;
        }

        // ========================================
        // 3. RuleEngine 应用
        // ========================================
        const result = ruleEngine.applyAction(action, state);
        events.push(...result.events); // 记录发言

        // ========================================
        // 4. 更新 WorldState
        // ========================================
        updateStateAfterSpeech(action.agentId);
    }

    // ========================================
    // 5. Scheduler 检查阶段推进
    // ========================================
    if (scheduler.shouldAdvancePhase(state)) {
        if (phaseState.forceSummary && narrator) {
            events.push({ type: 'phase_summary', ... }); // 生成总结
        }
        advancePhase(nextPhase);
        events.push({ type: 'phase_switch', ... });
    }

    // ========================================
    // 6. 检查终止条件
    // ========================================
    if (scheduler.shouldTerminate(state)) {
        state.isTerminated = true;
        events.push({ type: 'debate_end', ... });
    }

    return results;
}
```

---

## 完整辩论回合执行示例

### 输入：Agent Actions

```json
[
    { "actionId": "a-001", "agentId": "pro-1", "actionType": "speak", 
      "params": { "content": "我认为远程办公能提高效率...", "tone": "analytical" },
      "priority": 4, "confidence": 0.8 },
      
    { "actionId": "a-002", "agentId": "con-1", "actionType": "speak",
      "params": { "content": "但面对面沟通不可替代...", "tone": "assertive" },
      "priority": 3, "confidence": 0.7 },
      
    { "actionId": "a-003", "agentId": "con-2", "actionType": "pass",
      "params": {}, "priority": 1, "confidence": 0.2 }
]
```

### 执行流程

```
Step 1: Arbiter 裁决
├── 过滤 pass Action → [a-001, a-002]
├── 按 priority 排序 → [a-001 (4), a-002 (3)]
├── speakingOrder=free → 返回 [a-001]
└── con-1 的 a-002 被淘汰（不记录事件）

Step 2: RuleEngine 验证 a-001
├── 检查 valid_speaker → ✅
├── 检查 consecutive_speaks → ✅ (pro-1 未连续发言)
├── 检查 interrupt_allowed → N/A (非 interrupt)
└── 验证通过

Step 3: RuleEngine 应用 a-001
├── 生成 Event: { type: 'speech', source: 'pro-1', content: '我认为...' }
└── 生成 Effect: { lastSpeakerId: 'pro-1' }

Step 4: 更新 WorldState
├── speakCounts['pro-1']++
├── consecutiveSpeaks = 1
├── lastSpeakerId = 'pro-1'
└── phaseRound++

Step 5: Scheduler 检查
├── phaseRound (2) < maxRounds (6) → 不切换
└── 继续当前阶段

Step 6: 终止检查
└── 未达到终止条件 → 继续
```

### 输出：Events

```json
[
    {
        "eventId": "evt-001",
        "eventType": "speech",
        "timestamp": 1703328000000,
        "source": "pro-1",
        "content": "我认为远程办公能提高效率...",
        "meta": {
            "actionId": "a-001",
            "actionType": "speak",
            "tone": "analytical"
        }
    }
]
```

---

## 向后兼容说明

### 原 YAML 场景配置：无需修改 ✅

```yaml
# demo_debate.scenario.yaml - 完全不变
id: demo_debate
name: 远程办公辩论
alignment:
  type: opposing
  ...
flow:
  phases:
    - id: opening
      maxRounds: 2
      allowInterrupt: false
      speakingOrder: moderated
      ...
moderatorPolicy:
  interventionLevel: 2
  ...
```

### 原测试/示例：可运行 ✅

```typescript
// 旧代码（继续工作）
const controller = new ModeratorControllerCore(scenario);
const decision = controller.decideNextAction(state, intents, events);

// 新代码（推荐）
const engine = await createDebateWorldEngineFromScenario(scenario, agentIds, topic);
const results = await engine.step(actions);
```

### 迁移方式

| 场景 | 迁移方式 |
|------|----------|
| 新项目 | 直接使用 DebateWorldEngine |
| 旧项目 | 可继续使用 ModeratorController |
| 渐进迁移 | 两者可共存，共享 ScenarioSchema |
