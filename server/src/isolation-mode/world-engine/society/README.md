# SocietyWorldEngine 文档

## 设计目标

验证"全自治社会仿真"的可行性：

| 要求 | 结果 |
|------|------|
| 无用户干预持续运行 | ✅ Tick 驱动 |
| 行为不以对话为中心 | ✅ 资源/关系/情绪 |
| Tick 驱动时间 | ✅ 非回合制 |
| 状态可观察/回放/分析 | ✅ Event Log |

---

## 世界设定

```
最小社会:
- Agent 数量: 5 (可配置)
- 世界单位: 单一社区
- Scheduler: tick-based
- 用户角色: 仅初始化参数
```

---

## World State

```typescript
interface SocietyWorldState {
    timeTick: number;
    agents: Map<string, AgentSocialState>;
    globalResources: {
        communityPool: number;
        environmentPool: number;
        regenerationRate: number;
    };
    stabilityIndex: number;  // 0.0 ~ 1.0
    statistics: SocietyStatistics;
}

interface AgentSocialState {
    agentId: string;
    name: string;
    role: 'worker' | 'merchant' | 'leader' | 'helper' | 'neutral';
    resources: number;
    mood: number;           // -1.0 ~ 1.0
    relationships: Map<string, number>;  // agentId -> strength
    isActive: boolean;
    zeroResourceTicks: number;
}
```

---

## Action 定义

| Action | 说明 | 效果 |
|--------|------|------|
| `work` | 增加资源 | 按强度获得 5/10/15 资源 |
| `consume` | 消耗资源 | 成功: mood +0.1, 失败: mood -0.2 |
| `talk` | 改变关系 | friendly: +0.1, hostile: -0.15 |
| `help` | 转移资源 | 关系 +0.2, 双方 mood 提升 |
| `conflict` | 冲突 | 双方资源损失, 关系 -0.3 |
| `idle` | 无行为 | 无 |

---

## RuleEngine 规则

| 规则 | 说明 |
|------|------|
| 资源约束 | 资源不能为负 |
| Mood 影响 | 情绪影响 work 成功率 (70% + mood*30%) |
| 关系影响 | 关系影响 talk/help/conflict 结果 |
| 退出机制 | 资源为 0 连续 5 tick → 退出社会 |

---

## Event Log

### TICK_START / TICK_END
```json
{ "eventType": "TICK_START", "content": { "tick": 1 } }
{ "eventType": "TICK_END", "content": { "tick": 1, "activeAgentCount": 5, "stabilityIndex": 0.95 } }
```

### ACTION_ACCEPTED / ACTION_REJECTED
```json
{ "eventType": "ACTION_ACCEPTED", "source": "agent-1", "content": { "actionType": "work", "reward": 10 } }
{ "eventType": "ACTION_REJECTED", "source": "agent-2", "content": { "actionType": "help", "reason": "资源不足" } }
```

### STATE_DELTA
```json
{
    "eventType": "STATE_DELTA",
    "content": {
        "tick": 10,
        "averageResources": 45.2,
        "averageMood": 0.32,
        "giniCoefficient": 0.15,
        "stabilityIndex": 0.78
    }
}
```

### AGENT_EXIT
```json
{ "eventType": "AGENT_EXIT", "content": { "agentId": "agent-3", "reason": "resources_depleted" } }
```

---

## 完整 Tick 执行示例

### 初始状态 (Tick 0)

```json
{
    "timeTick": 0,
    "agents": {
        "agent-1": { "name": "Alice", "role": "worker", "resources": 50, "mood": 0.5 },
        "agent-2": { "name": "Bob", "role": "merchant", "resources": 50, "mood": 0.5 },
        "agent-3": { "name": "Carol", "role": "leader", "resources": 50, "mood": 0.5 },
        "agent-4": { "name": "David", "role": "helper", "resources": 50, "mood": 0.5 },
        "agent-5": { "name": "Eve", "role": "neutral", "resources": 50, "mood": 0.5 }
    },
    "stabilityIndex": 1.0,
    "statistics": { "giniCoefficient": 0.0 }
}
```

### Tick 1 输入 (所有 Agent 并行)

```json
[
    { "agentId": "agent-1", "actionType": "work", "params": { "intensity": 2 } },
    { "agentId": "agent-2", "actionType": "consume", "params": { "amount": 10 } },
    { "agentId": "agent-3", "actionType": "talk", "params": { "targetAgentId": "agent-1", "talkType": "friendly" } },
    { "agentId": "agent-4", "actionType": "help", "params": { "targetAgentId": "agent-5", "amount": 5 } },
    { "agentId": "agent-5", "actionType": "idle" }
]
```

### Tick 1 Event Log

```json
[
    { "eventType": "TICK_START", "content": { "tick": 1 } },
    { "eventType": "ACTION_ACCEPTED", "source": "agent-1", "content": { "actionType": "work", "reward": 15, "newResources": 65 } },
    { "eventType": "ACTION_ACCEPTED", "source": "agent-2", "content": { "actionType": "consume", "actual": 10, "newResources": 40, "newMood": 0.6 } },
    { "eventType": "ACTION_ACCEPTED", "source": "agent-3", "content": { "actionType": "talk", "target": "agent-1", "newRelationship": 0.15 } },
    { "eventType": "ACTION_ACCEPTED", "source": "agent-4", "content": { "actionType": "help", "target": "agent-5", "amount": 5, "relationshipChange": 0.24 } },
    { "eventType": "TICK_END", "content": { "tick": 1, "activeAgentCount": 5, "stabilityIndex": 0.98 } },
    { "eventType": "STATE_DELTA", "content": { "tick": 1, "averageResources": 52.0, "giniCoefficient": 0.12 } }
]
```

### Tick 1 结果状态

```json
{
    "timeTick": 1,
    "agents": {
        "agent-1": { "resources": 65, "mood": 0.55 },   // work 成功
        "agent-2": { "resources": 40, "mood": 0.6 },    // consume
        "agent-3": { "resources": 50, "mood": 0.55 },   // talk friendly
        "agent-4": { "resources": 45, "mood": 0.6 },    // help
        "agent-5": { "resources": 55, "mood": 0.65 }    // 被帮助
    },
    "statistics": {
        "totalInteractions": 2,
        "helpCount": 1,
        "giniCoefficient": 0.12
    }
}
```

---

## 成功判定标准 ✅

| 标准 | 验证 |
|------|------|
| 可连续运行 ≥ 50 tick | ✅ 默认 maxTicks=-1 无限运行 |
| 无用户输入也不崩溃 | ✅ Agent 自主决策 |
| 社会状态出现分化 | ✅ Gini 系数追踪 |
| Event Log 可完整回放 | ✅ TICK_START/END + STATE_DELTA |

---

## 使用示例

```typescript
import { createDefaultSociety, createSocietyWorldEngine } from './SocietyWorldEngine';
import { v4 as uuid } from 'uuid';

// 创建默认 5 Agent 社会
const engine = await createDefaultSociety(100);

// 模拟 50 ticks
for (let tick = 0; tick < 50 && !engine.isTerminated(); tick++) {
    // 收集所有 Agent 的 Actions（模拟 AI 决策）
    const actions = engine.getActiveAgents().map(agent => ({
        actionId: uuid(),
        agentId: agent.agentId,
        actionType: generateAction(agent), // AI 决策
        params: generateParams(agent),
        confidence: 1.0,
        timestamp: Date.now()
    }));

    // 执行 tick
    await engine.step(actions);

    // 可选：打印社会摘要
    const summary = await engine.generateSummary();
    if (summary) {
        console.log(summary);
    }
}

console.log('Final Statistics:', engine.getStatistics());
console.log('Stability Index:', engine.getStabilityIndex());
```

---

## 角色加成

| 角色 | 加成 |
|------|------|
| worker | work 效率 x1.5 |
| merchant | (未实现交易) |
| leader | talk 影响力 x1.5 |
| helper | help 关系加成 x1.2 |
| neutral | 无加成 |
