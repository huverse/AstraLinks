/**
 * Redis EventLog 存储
 * 
 * 适用于: 多进程部署、生产环境
 * 特点: 持久化、跨进程共享、支持集群
 */

import { Event, EventType } from '../core/types';
import { IEventLogStore } from './IEventLogStore';
import { isolationLogger } from '../../services/world-engine-logger';

// Redis 客户端接口 (兼容 ioredis)
interface RedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<'OK'>;
    lpush(key: string, ...values: string[]): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    llen(key: string): Promise<number>;
    ltrim(key: string, start: number, stop: number): Promise<'OK'>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
}

const EVENT_TTL = 24 * 60 * 60; // 24 小时过期

export class RedisEventLogStore implements IEventLogStore {
    private redis: RedisClient;
    private prefix: string;

    constructor(redis: RedisClient, prefix = 'we:events') {
        this.redis = redis;
        this.prefix = prefix;
    }

    private key(sessionId: string, suffix = ''): string {
        return `${this.prefix}:${sessionId}${suffix ? ':' + suffix : ''}`;
    }

    async append(event: Event): Promise<void> {
        const key = this.key(event.sessionId, 'list');
        const json = JSON.stringify(event);

        await this.redis.lpush(key, json);
        await this.redis.expire(key, EVENT_TTL);

        isolationLogger.debug({
            sessionId: event.sessionId,
            eventId: event.eventId
        }, 'redis_event_appended');
    }

    async getBySession(sessionId: string): Promise<Event[]> {
        const key = this.key(sessionId, 'list');
        const items = await this.redis.lrange(key, 0, -1);

        return items
            .map(item => {
                try {
                    return JSON.parse(item) as Event;
                } catch {
                    return null;
                }
            })
            .filter((e): e is Event => e !== null)
            .reverse(); // Redis lpush 是倒序存储
    }

    async getAgentVisible(sessionId: string, agentId: string, limit = 100): Promise<Event[]> {
        const all = await this.getBySession(sessionId);

        return all
            .filter(e => {
                const meta = e.meta;
                if (!meta) return true; // 无 meta 默认可见
                if (meta.visibility === 'public') return true;
                const scope = meta.scope as string[] | undefined;
                return scope?.includes(agentId) ?? false;
            })
            .slice(-limit);
    }

    async getRecent(sessionId: string, limit: number): Promise<Event[]> {
        const key = this.key(sessionId, 'list');
        const items = await this.redis.lrange(key, 0, limit - 1);

        return items
            .map(item => {
                try {
                    return JSON.parse(item) as Event;
                } catch {
                    return null;
                }
            })
            .filter((e): e is Event => e !== null)
            .reverse();
    }

    async getByType(sessionId: string, type: EventType): Promise<Event[]> {
        const all = await this.getBySession(sessionId);
        return all.filter(e => e.type === type);
    }

    async getNextSequence(sessionId: string): Promise<number> {
        const key = this.key(sessionId, 'seq');
        const seq = await this.redis.incr(key);
        await this.redis.expire(key, EVENT_TTL);
        return seq;
    }

    async setSequence(sessionId: string, sequence: number): Promise<void> {
        const key = this.key(sessionId, 'seq');
        await this.redis.set(key, String(sequence));
        await this.redis.expire(key, EVENT_TTL);
    }

    async prune(sessionId: string, keepCount: number): Promise<number> {
        const key = this.key(sessionId, 'list');
        const currentLen = await this.redis.llen(key);

        if (currentLen <= keepCount) {
            return 0;
        }

        // Redis ltrim 保留 [0, keepCount-1]，但因为是倒序存储需要调整
        await this.redis.ltrim(key, 0, keepCount - 1);

        const pruneCount = currentLen - keepCount;
        isolationLogger.info({
            sessionId,
            pruneCount
        }, 'redis_events_pruned');

        return pruneCount;
    }

    async clear(sessionId: string): Promise<void> {
        await this.redis.del(this.key(sessionId, 'list'));
        await this.redis.del(this.key(sessionId, 'seq'));
    }

    async count(sessionId: string): Promise<number> {
        const key = this.key(sessionId, 'list');
        return await this.redis.llen(key);
    }
}

// ============================================
// 工厂函数
// ============================================

import { MemoryEventLogStore } from './MemoryEventLogStore';

let _storeInstance: IEventLogStore | null = null;

/**
 * 获取 EventLogStore 实例
 * 
 * 根据环境变量 WE_EVENT_STORE 选择后端:
 * - 'redis': 使用 Redis (需要配置 REDIS_URL)
 * - 'memory': 使用内存 (默认)
 */
export function getEventLogStore(): IEventLogStore {
    if (_storeInstance) {
        return _storeInstance;
    }

    const storeType = process.env.WE_EVENT_STORE || 'memory';

    if (storeType === 'redis') {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            isolationLogger.warn('WE_EVENT_STORE=redis but REDIS_URL not set, falling back to memory');
            _storeInstance = new MemoryEventLogStore();
        } else {
            // 动态导入 ioredis
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Redis = require('ioredis');
                const client = new Redis(redisUrl);
                _storeInstance = new RedisEventLogStore(client);
                isolationLogger.info('using_redis_event_store');
            } catch (e) {
                isolationLogger.error({ error: (e as Error).message }, 'failed_to_init_redis_store');
                _storeInstance = new MemoryEventLogStore();
            }
        }
    } else {
        _storeInstance = new MemoryEventLogStore();
        isolationLogger.info('using_memory_event_store');
    }

    return _storeInstance;
}

/** 重置存储实例 (用于测试) */
export function resetEventLogStore(): void {
    _storeInstance = null;
}
