# GameWorldEngine 文档

## 设计目标

验证 World Engine 支持"非语言、强规则世界"：

| 要求 | 结果 |
|------|------|
| 不写任何 prompt 也能运行 | ✅ |
| 不生成任何自然语言 | ✅ |
| 所有世界变化可从 Event Log 复原 | ✅ |
| Agent 无法"靠嘴赢" | ✅ |

---

## 模块对应

### 1️⃣ GameWorldEngine

```typescript
class GameWorldEngine implements IWorldEngine {
    initialize(config: WorldConfig): Promise<void>;
    step(agentActions: Action[]): Promise<ActionResult[]>;
    getWorldState(): GameWorldState;
    isTerminated(): boolean;
}
```

### 2️⃣ GameWorldState

```typescript
interface GameWorldState {
    game: {
        currentTurnAgentId: string;  // 当前回合 Agent
        turnOrder: string[];
        totalTurns: number;
        gamePhase: 'playing' | 'ended';
        winnerId: string | null;
    };
    agents: Map<string, {
        agentId: string;
        hp: number;
        hand: CardType[];
        isAlive: boolean;
    }>;
    isTerminated: boolean;
}
```

### 3️⃣ GameRuleEngine

```typescript
class GameRuleEngine implements IRuleEngine {
    validateAction(action, worldState): ValidationResult;  // 回合/手牌/目标验证
    applyAction(action, worldState): ActionResult;         // 卡牌效果
    enforceConstraints(worldState): changes;               // 胜负判定 (hp <= 0)
}
```

### 4️⃣ GameScheduler

```typescript
class GameScheduler implements IScheduler {
    advanceTurn(worldState): void;     // 回合轮转
    shouldTerminate(worldState): boolean;
    // currentTurnAgent 由 worldState.game.currentTurnAgentId 决定
}
```

### 5️⃣ GameArbiter

```typescript
class GameArbiter implements IArbiter {
    resolveConflicts(actions, worldState): Action[];
    // 从 agentActions 中选出"唯一有效 Action"
    // 拒绝其他 Action（非当前回合）
}
```

---

## Event Log 格式

### 结构化事件类型

| 事件类型 | 说明 |
|----------|------|
| `ACTION_ACCEPTED` | Action 被接受并执行 |
| `ACTION_REJECTED` | Action 被拒绝（含原因） |
| `STATE_CHANGED` | 世界状态变化（含 oldValue/newValue） |
| `GAME_OVER` | 游戏结束（含胜者） |

### 事件结构

```typescript
interface GameEvent {
    eventId: string;
    eventType: 'ACTION_ACCEPTED' | 'ACTION_REJECTED' | 'STATE_CHANGED' | 'GAME_OVER';
    timestamp: number;
    source: string;   // agentId 或 'system'
    content: {
        // ACTION_ACCEPTED
        actionType?: string;
        card?: string;
        target?: string;
        
        // ACTION_REJECTED
        reason?: string;
        
        // STATE_CHANGED
        changeType?: 'hp_decrease' | 'hp_increase' | 'agent_died';
        entityId?: string;
        field?: string;
        oldValue?: any;
        newValue?: any;
        cause?: { agentId: string; action: string };
        
        // GAME_OVER
        winnerId?: string;
        totalTurns?: number;
    };
}
```

---

## 完整示例

### 1. 初始 WorldState

```json
{
    "worldId": "game-001",
    "worldType": "game",
    "isTerminated": false,
    "game": {
        "currentTurnAgentId": "A",
        "turnOrder": ["A", "B"],
        "turnIndex": 0,
        "totalTurns": 0,
        "maxTurns": 20,
        "gamePhase": "playing",
        "winnerId": null
    },
    "agents": {
        "A": { "agentId": "A", "hp": 100, "maxHp": 100, "hand": ["attack", "attack", "heal"], "isAlive": true },
        "B": { "agentId": "B", "hp": 100, "maxHp": 100, "hand": ["attack", "attack", "heal"], "isAlive": true }
    }
}
```

### 2. 一轮完整回合执行

#### 输入: Agent 提交 Action

```json
[
    {
        "actionId": "act-001",
        "agentId": "A",
        "actionType": "play_card",
        "params": { "card": "attack", "targetAgentId": "B" },
        "confidence": 1.0,
        "timestamp": 1703328000000
    },
    {
        "actionId": "act-002",
        "agentId": "B",
        "actionType": "play_card",
        "params": { "card": "attack", "targetAgentId": "A" },
        "confidence": 1.0,
        "timestamp": 1703328000000
    }
]
```

#### Step 1: Arbiter 裁决

```
当前回合: A
├── A 的 Action → 保留 ✅
└── B 的 Action → 拒绝 ❌ (不是他的回合)
```

#### Step 2: RuleEngine 验证

```
验证 A 的 Action:
├── 回合检查: A === currentTurnAgentId → ✅
├── 存活检查: A.isAlive === true → ✅
├── 手牌检查: "attack" in A.hand → ✅
└── 目标检查: B.isAlive === true → ✅
```

#### Step 3: RuleEngine 应用

```
应用 attack:
├── A.hand.remove("attack")
├── B.hp = 100 - 20 = 80
└── 生成 Events
```

#### Step 4: Scheduler 推进

```
advanceTurn:
├── turnIndex = (0 + 1) % 2 = 1
├── currentTurnAgentId = "B"
└── totalTurns = 1
```

### 3. Event Log (JSON)

```json
[
    {
        "eventId": "evt-001",
        "eventType": "ACTION_REJECTED",
        "timestamp": 1703328000001,
        "source": "B",
        "content": {
            "actionId": "act-002",
            "reason": "不是 B 的回合，当前回合是 A"
        }
    },
    {
        "eventId": "evt-002",
        "eventType": "ACTION_ACCEPTED",
        "timestamp": 1703328000002,
        "source": "A",
        "content": {
            "actionType": "play_card",
            "card": "attack",
            "target": "B"
        },
        "meta": { "actionId": "act-001" }
    },
    {
        "eventId": "evt-003",
        "eventType": "STATE_CHANGED",
        "timestamp": 1703328000003,
        "source": "system",
        "content": {
            "changeType": "hp_decrease",
            "entityId": "B",
            "field": "hp",
            "oldValue": 100,
            "newValue": 80,
            "cause": { "agentId": "A", "action": "attack" }
        }
    },
    {
        "eventId": "evt-004",
        "eventType": "turn_start",
        "timestamp": 1703328000004,
        "source": "system",
        "content": {
            "turn": 2,
            "agentId": "B"
        }
    }
]
```

---

## 胜负判定 (GAME_OVER)

当 Agent B 的 hp 降到 0 时：

```json
{
    "eventId": "evt-100",
    "eventType": "STATE_CHANGED",
    "timestamp": 1703328010000,
    "source": "system",
    "content": {
        "changeType": "agent_died",
        "entityId": "B",
        "field": "isAlive",
        "oldValue": true,
        "newValue": false
    }
}
```

```json
{
    "eventId": "evt-101",
    "eventType": "GAME_OVER",
    "timestamp": 1703328010001,
    "source": "system",
    "content": {
        "winnerId": "A",
        "totalTurns": 5,
        "finalState": [
            { "agentId": "A", "hp": 60, "isAlive": true },
            { "agentId": "B", "hp": 0, "isAlive": false }
        ]
    }
}
```

---

## 成功判定标准 ✅

| 标准 | 结果 |
|------|------|
| 不写任何 prompt 也能运行 | ✅ 纯 TypeScript 规则 |
| 不生成任何自然语言 | ✅ 事件全结构化 |
| 所有世界变化可从 Event Log 复原 | ✅ oldValue/newValue |
| Agent 无法"靠嘴赢" | ✅ 只看 Action + 规则 |

---

## 使用示例

```typescript
import { createGameWorldEngine } from './GameWorldEngine';
import { v4 as uuid } from 'uuid';

// 创建游戏
const engine = await createGameWorldEngine(['A', 'B'], 20);

// 游戏循环
while (!engine.isTerminated()) {
    const currentAgent = engine.getCurrentTurnAgent();
    const state = engine.getAgentState(currentAgent)!;
    
    // 构建 Action（无 prompt，无自然语言）
    const action = {
        actionId: uuid(),
        agentId: currentAgent,
        actionType: 'play_card' as const,
        params: { 
            card: state.hand[0], 
            targetAgentId: engine.getAliveAgents().find(a => a !== currentAgent) 
        },
        confidence: 1.0,
        timestamp: Date.now()
    };
    
    // 执行
    const results = await engine.step([action]);
}

// 获取完整事件历史（可复原全部变化）
const events = engine.getEvents(100);
console.log('游戏结束:', engine.getTerminationReason());
```
