# Shared Event Log 模块文档

## 概述

Shared Event Log 是整个多 Agent 讨论系统中：
- **唯一允许信息共享的通道**
- Moderator 与 Agent 交互的核心枢纽

## 设计原则

1. Event 是"事实记录"，不是对话历史
2. Event 必须是离散的、结构化的、可裁剪、可归档的
3. 任何 Agent 只能看到 Event，永远不能看到其他 Agent 的私有上下文

## 事件类型 (EventType)

| 类型 | 说明 | 发起者 |
|------|------|--------|
| `INTENT` | Agent 表达发言意图（请求发言权） | Agent |
| `SPEECH` | 实际发言（经 Moderator 允许） | Agent |
| `SUMMARY` | 主持人生成的阶段总结 | Moderator |
| `VOTE` | 投票 / 评分 | Agent/System |
| `SYSTEM` | 系统事件（phase 切换等） | System |

## 事件数据结构

```typescript
interface Event {
    // ===== 标识字段 [SYS] =====
    eventId: string;        // UUID，用于事件去重、引用

    // ===== 核心字段 [LLM] =====
    type: EventType;        // 事件类型
    speaker: EventSpeaker;  // agent_id | "moderator" | "system"
    content: string | object; // 实际内容
    timestamp: string;      // ISO8601 格式

    // ===== 上下文字段 [SYS] =====
    sessionId: string;      // 会话 ID
    sequence: number;       // 会话内单调递增序号

    // ===== 元数据 [可选] =====
    meta?: {
        phase?: string;
        round?: number;
        replyTo?: string;
        tokens?: number;
    };
}
```

### 字段分类说明

- **[LLM]** = 会被送进 LLM 上下文的字段
- **[SYS]** = 仅用于系统逻辑的字段

## EventLogService API

### 写入

```typescript
// 追加事件
const event = eventLogService.appendEvent({
    sessionId: 'session-123',
    type: EventType.SPEECH,
    speaker: 'agent-1',
    content: '我认为这个方案是可行的...',
    meta: { round: 2 }
});
```

### 读取（必须指定 limit）

```typescript
// ⚠️ 没有 getAllEvents() 方法，防止 token 爆炸

// 获取最近 N 条事件
const recent = eventLogService.getRecentEvents('session-123', 10);

// 获取指定类型的事件
const summaries = eventLogService.getEventsByType('session-123', EventType.SUMMARY, 5);

// 增量获取（从某序号之后）
const newEvents = eventLogService.getEventsAfterSequence('session-123', 50, 20);

// 获取 Agent 可见格式（用于 LLM 上下文）
const agentEvents = eventLogService.getAgentVisibleEvents('session-123', 15);
```

### 裁剪

```typescript
// 策略1: 保留最近 N 条
eventLogService.pruneEvents('session-123', { type: 'byCount', keep: 50 });

// 策略2: 只保留 SUMMARY 和 SYSTEM 事件
eventLogService.pruneEvents('session-123', { 
    type: 'byType', 
    keepTypes: [EventType.SUMMARY, EventType.SYSTEM] 
});

// 策略3: 删除指定序号之前的事件
eventLogService.pruneEvents('session-123', { type: 'beforeSequence', sequence: 100 });
```

## 示例事件 (JSON)

### 示例1: SPEECH 事件

```json
{
    "eventId": "evt-a1b2c3d4",
    "type": "SPEECH",
    "speaker": "agent-1",
    "content": "从技术角度来看，这个方案存在以下优势：首先，架构简洁清晰...",
    "timestamp": "2024-12-23T12:30:00.000Z",
    "sessionId": "session-123",
    "sequence": 15,
    "meta": {
        "round": 2,
        "tokens": 128
    }
}
```

### 示例2: SUMMARY 事件

```json
{
    "eventId": "evt-e5f6g7h8",
    "type": "SUMMARY",
    "speaker": "moderator",
    "content": "第一阶段讨论总结：双方就技术可行性达成初步共识，但在成本控制方面存在分歧...",
    "timestamp": "2024-12-23T12:35:00.000Z",
    "sessionId": "session-123",
    "sequence": 30,
    "meta": {
        "phase": "phase-1-end"
    }
}
```

### 示例3: SYSTEM 事件

```json
{
    "eventId": "evt-i9j0k1l2",
    "type": "SYSTEM",
    "speaker": "system",
    "content": {
        "action": "PHASE_TRANSITION",
        "details": {
            "from": "opening",
            "to": "discussion"
        }
    },
    "timestamp": "2024-12-23T12:25:00.000Z",
    "sessionId": "session-123",
    "sequence": 5
}
```

## 典型流程：阶段结束 → SUMMARY → 裁剪

```typescript
// 1. 阶段结束，生成 SUMMARY
eventLogService.appendEvent({
    sessionId,
    type: EventType.SUMMARY,
    speaker: 'moderator',
    content: '第一阶段讨论要点：1) 技术方案可行 2) 成本需要优化 3) 时间表待定',
    meta: { phase: 'phase-1-summary' }
});

// 2. 生成 SYSTEM 事件标记阶段切换
eventLogService.appendEvent({
    sessionId,
    type: EventType.SYSTEM,
    speaker: 'system',
    content: { action: 'PHASE_TRANSITION', details: { from: 'phase-1', to: 'phase-2' } }
});

// 3. 裁剪旧的 SPEECH/INTENT 事件，只保留 SUMMARY 和最近的交互
eventLogService.pruneEvents(sessionId, { 
    type: 'byType', 
    keepTypes: [EventType.SUMMARY, EventType.SYSTEM] 
});

// 或者只保留最近 30 条
eventLogService.pruneEvents(sessionId, { type: 'byCount', keep: 30 });
```

## Agent 实际看到的事件

Agent 通过 `getAgentVisibleEvents()` 获取的是精简格式：

```typescript
interface AgentVisibleEvent {
    type: EventType;      // 事件类型
    speaker: string;      // 发言者
    content: string;      // 内容（始终是字符串）
    timestamp: string;    // 时间戳
}
```

示例：

```json
[
    {
        "type": "SYSTEM",
        "speaker": "system",
        "content": "{\"action\":\"PHASE_TRANSITION\",\"details\":{\"from\":\"opening\",\"to\":\"discussion\"}}",
        "timestamp": "2024-12-23T12:25:00.000Z"
    },
    {
        "type": "SPEECH",
        "speaker": "agent-2",
        "content": "我对这个方案持保留意见，主要原因是...",
        "timestamp": "2024-12-23T12:28:00.000Z"
    },
    {
        "type": "SUMMARY",
        "speaker": "moderator",
        "content": "目前讨论的焦点集中在成本控制方面...",
        "timestamp": "2024-12-23T12:35:00.000Z"
    }
]
```

## 上下文治理约束

| 约束 | 实现方式 |
|------|----------|
| 禁止全量读取 | 不提供 `getAllEvents()` 方法 |
| 强制 limit | 所有读取方法必须指定 limit（最大 100） |
| 自动裁剪 | 单会话超过 500 条时自动裁剪 |
| 保留关键事件 | 自动裁剪时保留所有 SUMMARY 事件 |
