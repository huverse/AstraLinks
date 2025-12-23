# GameWorldEngine 文档

## 设计目标

验证 World Engine 支持"非语言、强规则世界"：

| 要求 | 实现 |
|------|------|
| 不复用辩论逻辑 | ✅ 完全独立 |
| 不使用 Moderator/Narrator | ✅ 无 LLM 调用 |
| 纯规则驱动 | ✅ 硬编码规则 |
| Agent 只产生 Action | ✅ 无自然语言 |

---

## 世界设定

```
回合制卡牌对战
- 2~3 个 Agent
- 每个 Agent: hp (100), hand (attack, attack, heal)
- 轮流行动，直到只剩一人存活
```

---

## 组件架构

```
┌───────────────────────────────────────┐
│           GameWorldEngine              │
│  ┌─────────────────────────────────┐  │
│  │ GameArbiter                      │  │
│  │ → 只允许当前回合 Agent 行动     │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ GameRuleEngine                   │  │
│  │ → 验证 Action + 应用卡牌效果    │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ GameScheduler                    │  │
│  │ → 回合推进 + 胜负判定            │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

---

## Action 定义

### play_card

```typescript
{
    actionType: 'play_card',
    params: {
        card: 'attack' | 'heal',
        targetAgentId?: string  // 攻击时必须
    }
}
```

### pass

```typescript
{
    actionType: 'pass',
    params: {}
}
```

---

## 规则验证

| 检查项 | 拒绝条件 |
|--------|----------|
| 回合检查 | 非当前回合 Agent 的 Action |
| 存活检查 | 发起者已死亡 |
| 手牌检查 | 卡牌不在手牌中 |
| 目标检查 | 攻击未指定目标 / 目标已死亡 / 攻击自己 |

---

## 卡牌效果

| 卡牌 | 效果 |
|------|------|
| `attack` | 对目标造成 20 伤害 |
| `heal` | 自己回复 15 生命 |
| `draw` | 抽一张随机卡 |

---

## 完整回合执行示例

### 初始状态

```
Agent A: hp=100, hand=[attack, attack, heal]
Agent B: hp=100, hand=[attack, attack, heal]
当前回合: Agent A
```

### 输入 Actions

```typescript
[
    { agentId: 'A', actionType: 'play_card', params: { card: 'attack', targetAgentId: 'B' } },
    { agentId: 'B', actionType: 'play_card', params: { card: 'attack', targetAgentId: 'A' } }
]
```

### 执行流程

```
Step 1: Arbiter 筛选
├── 当前回合是 Agent A
├── Agent A 的 Action → 保留 ✅
└── Agent B 的 Action → 拒绝 ❌ (不是他的回合)

Step 2: RuleEngine 验证 Agent A
├── 回合检查 → ✅
├── 存活检查 → ✅
├── 手牌检查 (attack in hand) → ✅
└── 目标检查 (B 存活) → ✅

Step 3: RuleEngine 应用
├── 从手牌移除 attack
├── Agent B.hp = 100 - 20 = 80
└── 生成 Events: [card_played, damage_dealt]

Step 4: 约束检查
└── B 存活 → 游戏继续

Step 5: 回合推进
├── turn_end (A)
├── currentTurnAgentId = B
└── turn_start (B)
```

### 输出 Events

```json
[
    { "eventType": "action_rejected", "source": "B", "content": { "reason": "不是 B 的回合" } },
    { "eventType": "card_played", "source": "A", "content": { "card": "attack", "target": "B" } },
    { "eventType": "damage_dealt", "source": "A", "content": { "target": "B", "damage": 20, "newHp": 80 } },
    { "eventType": "turn_end", "source": "system", "content": { "agentId": "A" } },
    { "eventType": "turn_start", "source": "system", "content": { "agentId": "B" } }
]
```

### 结果状态

```
Agent A: hp=100, hand=[attack, heal]
Agent B: hp=80, hand=[attack, attack, heal]
当前回合: Agent B
```

---

## 使用示例

```typescript
import { createGameWorldEngine } from './GameWorldEngine';

// 创建游戏
const engine = await createGameWorldEngine(['A', 'B', 'C'], 20);

// 游戏循环
while (!engine.isTerminated()) {
    const currentAgent = engine.getCurrentTurnAgent();
    
    // 获取当前 Agent 状态
    const state = engine.getAgentState(currentAgent);
    
    // 生成 Action（这里模拟 AI 决策）
    const action = {
        actionId: uuid(),
        agentId: currentAgent,
        actionType: 'play_card',
        params: { card: state.hand[0], targetAgentId: getEnemy(currentAgent) },
        confidence: 1.0,
        timestamp: Date.now()
    };
    
    // 执行
    const results = await engine.step([action]);
    
    // 处理结果
    console.log(results);
}

console.log('游戏结束:', engine.getTerminationReason());
```
