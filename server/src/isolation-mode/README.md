# 隔离模式 - 多 Agent 结构化讨论引擎

## 概述

隔离模式是一个嵌入式后端模块，提供多 Agent 结构化讨论能力。

## 目录结构

```
isolation-mode/
├── core/           # 核心类型与接口
├── agents/         # Agent 系统
├── moderator/      # 主持人系统 (Controller + LLM)
├── event-log/      # 公共事件日志 (唯一共享通道)
├── scenarios/      # 讨论场景 (YAML 配置)
├── llm/            # LLM Provider 抽象层
├── session/        # 会话管理
├── api/            # REST + WebSocket API
└── index.ts        # 模块入口
```

## 核心原则

1. **Agent 独立性**: 每个 Agent 维护私有上下文
2. **唯一共享通道**: Shared Event Log (EventBus)
3. **Moderator 系统级**: Controller + LLM 组合

## 使用方式

```typescript
import { isolationRouter } from './isolation-mode';

app.use('/api/isolation', isolationRouter);
```

## 场景扩展

添加新场景只需在 `scenarios/presets/` 中创建 YAML 文件。
