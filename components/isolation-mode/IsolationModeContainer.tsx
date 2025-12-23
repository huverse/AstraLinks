/**
 * 隔离模式容器组件
 * 
 * 多 Agent 结构化讨论的主界面
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    FlaskConical, Users, MessageSquare, Play, Pause, Square,
    Settings, History, ChevronLeft, Plus, RefreshCw, Cpu, Wifi, WifiOff, AlertCircle, Loader2
} from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { encryptLlmConfig, LlmConfigData } from '../../utils/isolationCrypto';
import { Participant, ProviderType } from '../../types';
import { isolationSocket, WorldEvent, StateUpdate } from '../../services/isolationSocket';
import { isolationLogger } from '../../utils/logger';

// ============================================
// 类型定义
// ============================================

interface Agent {
    id: string;
    name: string;
    role: string;
    status: 'idle' | 'thinking' | 'speaking';
    speakCount: number;
}

interface DiscussionEvent {
    id: string;
    type: string;
    sourceId: string;
    timestamp: number;
    sequence: number;
    payload?: {
        content?: string;
        message?: string;
    };
}

interface Session {
    id: string;
    title: string;
    topic: string;
    status: 'pending' | 'active' | 'paused' | 'completed';
    currentRound: number;
    agents: Agent[];
    events: DiscussionEvent[];
}

interface Scenario {
    id: string;
    name: string;
    description: string;
    type: string;
}

interface IsolationModeContainerProps {
    onExit: () => void;
    participants?: Participant[]; // 从 Galaxyous 配置中心传递的 AI 配置
}

// ============================================
// 子组件
// ============================================

// Agent 卡片
const AgentCard: React.FC<{ agent: Agent; isActive?: boolean }> = ({ agent, isActive }) => {
    const statusColors = {
        idle: 'bg-slate-600',
        thinking: 'bg-yellow-500 animate-pulse',
        speaking: 'bg-green-500 animate-pulse',
    };

    return (
        <div className={`
            p-4 rounded-xl border transition-all
            ${isActive
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-white/10 bg-slate-800/50 hover:bg-slate-800'}
        `}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {agent.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{agent.name}</div>
                    <div className="text-xs text-slate-400">{agent.role}</div>
                </div>
                <div className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
            </div>
            <div className="mt-3 text-xs text-slate-500">
                发言 {agent.speakCount} 次
            </div>
        </div>
    );
};

// 事件时间线
const EventTimeline: React.FC<{ events: DiscussionEvent[] }> = ({ events }) => {
    return (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {events.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                    <MessageSquare className="mx-auto mb-2 opacity-50" size={32} />
                    <p>等待讨论开始...</p>
                </div>
            ) : (
                events.map(event => (
                    <div
                        key={event.id}
                        className={`p-4 rounded-xl ${event.type === 'agent:speak'
                            ? 'bg-slate-800/50 border border-white/5'
                            : 'bg-purple-500/10 border border-purple-500/20'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                            <span className="font-medium text-purple-400">
                                {event.sourceId === 'moderator' ? '🎙️ 主持人' : `👤 ${event.sourceId}`}
                            </span>
                            <span>•</span>
                            <span>#{event.sequence}</span>
                            <span>•</span>
                            <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-sm text-slate-200">
                            {event.payload?.content || event.payload?.message || ''}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

// 场景选择器
const ScenarioSelector: React.FC<{
    scenarios: Scenario[];
    selected: string | null;
    onSelect: (id: string) => void;
}> = ({ scenarios, selected, onSelect }) => {
    return (
        <div className="grid grid-cols-2 gap-3">
            {scenarios.map(scenario => (
                <button
                    key={scenario.id}
                    onClick={() => onSelect(scenario.id)}
                    className={`
                        p-4 rounded-xl text-left transition-all
                        ${selected === scenario.id
                            ? 'bg-purple-500/20 border-2 border-purple-500'
                            : 'bg-slate-800/50 border border-white/10 hover:border-purple-500/50'}
                    `}
                >
                    <div className="font-medium text-white">{scenario.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{scenario.description}</div>
                </button>
            ))}
        </div>
    );
};

// ============================================
// 主组件
// ============================================

const IsolationModeContainer: React.FC<IsolationModeContainerProps> = ({ onExit, participants = [] }) => {
    const { token } = useAuth();
    const [view, setView] = useState<'setup' | 'discussion' | 'history'>('setup');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 场景
    const [scenarios] = useState<Scenario[]>([
        { id: 'debate', name: '辩论', description: '正反双方围绕主题辩论', type: 'debate' },
        { id: 'brainstorm', name: '头脑风暴', description: '自由发散思维，产生创意', type: 'brainstorm' },
        { id: 'review', name: '项目评审', description: '多角度评估项目方案', type: 'review' },
        { id: 'academic', name: '学术研讨', description: '深入探讨学术问题', type: 'academic' },
    ]);
    const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

    // 会话
    const [currentSession, setCurrentSession] = useState<Session | null>(null);
    const [topic, setTopic] = useState('');

    // Socket 连接状态
    const [socketConnected, setSocketConnected] = useState(false);
    const socketInitialized = useRef(false);

    // 加载会话历史
    const [sessions, setSessions] = useState<Session[]>([]);

    const loadSessions = useCallback(async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_BASE}/api/isolation/sessions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setSessions(data.data || []);
            }
        } catch (e) {
            console.error('Failed to load sessions', e);
        }
    }, [token]);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    // Socket 连接管理 - 只在 token 变化时重新连接
    const [reconnectInfo, setReconnectInfo] = useState({ attempts: 0, isReconnecting: false });

    useEffect(() => {
        if (!token || socketInitialized.current) return;

        socketInitialized.current = true;

        // 设置 token getter
        isolationSocket.setTokenGetter(() => token);

        // 连接 Socket
        isolationSocket.connect({
            onConnect: () => {
                setSocketConnected(true);
                setReconnectInfo({ attempts: 0, isReconnecting: false });
                isolationLogger.info('WebSocket connected');
            },
            onDisconnect: (reason) => {
                setSocketConnected(false);
                isolationLogger.warn('WebSocket disconnected', { reason });
            },
            onReconnecting: (attempt, delay) => {
                setReconnectInfo({ attempts: attempt, isReconnecting: true });
                isolationLogger.info('Reconnecting', { attempt, delay });
            },
            onWorldEvent: (event) => {
                // 收到实时事件，更新当前会话的事件列表
                setCurrentSession(prev => {
                    if (!prev || event.sessionId !== prev.id) return prev;
                    const newEvent = {
                        id: event.eventId,
                        type: event.type,
                        sourceId: (event.payload as Record<string, unknown>)?.speaker as string || 'system',
                        timestamp: Date.now(),
                        sequence: event.tick,
                        payload: event.payload as { content?: string; message?: string }
                    };
                    return {
                        ...prev,
                        events: [...prev.events, newEvent]
                    };
                });
            },
            onStateUpdate: (state) => {
                // 收到状态更新
                setCurrentSession(prev => {
                    if (!prev || state.sessionId !== prev.id) return prev;
                    if (state.isTerminated) {
                        return { ...prev, status: 'completed' };
                    }
                    return prev;
                });
            },
            onSimulationEnded: ({ sessionId }) => {
                setCurrentSession(prev => {
                    if (!prev || sessionId !== prev.id) return prev;
                    return { ...prev, status: 'completed' };
                });
            },
            onError: (err) => {
                isolationLogger.error('Socket error', { error: err.message });
                setError(`连接错误: ${err.message}`);
            }
        });

        return () => {
            isolationSocket.disconnect();
            socketInitialized.current = false;
        };
    }, [token]); // 只依赖 token，避免 currentSession 变化触发重连

    // 创建新讨论
    const handleCreateSession = async () => {
        if (!selectedScenario || !topic.trim()) {
            setError('请选择场景并输入讨论主题');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 从 participants 获取启用的 AI 配置 (Galaxyous 配置中心)
            let encryptedLlmConfig = undefined;
            const enabledParticipant = participants.find(p => p.config.enabled);

            if (enabledParticipant) {
                const llmConfigData: LlmConfigData = {
                    provider: enabledParticipant.provider,
                    apiKey: enabledParticipant.config.apiKey,
                    baseUrl: enabledParticipant.config.baseUrl,
                    modelName: enabledParticipant.config.modelName,
                    temperature: enabledParticipant.config.temperature
                };
                encryptedLlmConfig = await encryptLlmConfig(llmConfigData);
            }

            const response = await fetch(`${API_BASE}/api/isolation/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title: `${topic} - ${new Date().toLocaleDateString()}`,
                    topic,
                    scenario: { id: selectedScenario, name: selectedScenario, type: selectedScenario },
                    agents: [
                        { id: 'agent-1', name: '正方', role: 'debater', systemPrompt: '你是正方辩手' },
                        { id: 'agent-2', name: '反方', role: 'debater', systemPrompt: '你是反方辩手' },
                    ],
                    llmConfig: encryptedLlmConfig, // 加密的用户 AI 配置
                }),
            });

            if (!response.ok) {
                throw new Error('创建会话失败');
            }

            const data = await response.json();
            setCurrentSession({
                ...data.data,
                id: data.data.id || data.data.sessionId,
                status: 'pending',
                currentRound: 0,
                agents: data.data.agents.map((a: any) => ({ ...a, status: 'idle', speakCount: 0 })),
                events: [],
            });
            setView('discussion');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // 开始讨论
    const handleStartDiscussion = async () => {
        if (!currentSession) return;
        try {
            await fetch(`${API_BASE}/api/isolation/sessions/${currentSession.id}/start`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            setCurrentSession(prev => prev ? { ...prev, status: 'active' } : null);
        } catch (e) {
            console.error('Failed to start', e);
        }
    };

    // 结束讨论
    const handleEndDiscussion = async () => {
        if (!currentSession) return;
        try {
            await fetch(`${API_BASE}/api/isolation/sessions/${currentSession.id}/end`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ reason: 'User ended' }),
            });
            setCurrentSession(prev => prev ? { ...prev, status: 'completed' } : null);
        } catch (e) {
            isolationLogger.error('Failed to end discussion', { error: (e as Error).message });
            setError('结束讨论失败');
        }
    };

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-900 to-purple-900/20">
            {/* 头部 */}
            <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onExit}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <ChevronLeft size={20} className="text-slate-400" />
                    </button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white flex items-center gap-2">
                            <FlaskConical className="text-purple-400" size={24} />
                            隔离模式
                            {/* Socket 连接状态 */}
                            {reconnectInfo.isReconnecting ? (
                                <span className="flex items-center gap-1 text-yellow-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs">重连中 ({reconnectInfo.attempts})</span>
                                </span>
                            ) : socketConnected ? (
                                <Wifi size={16} className="text-green-400" />
                            ) : (
                                <WifiOff size={16} className="text-red-400" />
                            )}
                        </h1>
                        <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                            实验性
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setView('setup')}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === 'setup' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <Plus size={16} className="inline mr-1" />
                        新建
                    </button>
                    <button
                        onClick={() => { setView('history'); loadSessions(); }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === 'history' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <History size={16} className="inline mr-1" />
                        历史
                    </button>
                </div>
            </header>

            {/* 主内容 */}
            <main className="flex-1 overflow-hidden p-6">
                {view === 'setup' && (
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-4">选择讨论场景</h2>
                            <ScenarioSelector
                                scenarios={scenarios}
                                selected={selectedScenario}
                                onSelect={setSelectedScenario}
                            />
                        </div>

                        <div>
                            <h2 className="text-lg font-semibold text-white mb-4">讨论主题</h2>
                            <input
                                type="text"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="输入你想讨论的问题..."
                                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none transition-colors"
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleCreateSession}
                            disabled={loading || !selectedScenario || !topic.trim()}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <RefreshCw className="animate-spin" size={18} />
                            ) : (
                                <Users size={18} />
                            )}
                            创建讨论
                        </button>
                    </div>
                )}

                {view === 'discussion' && currentSession && (
                    <div className="h-full flex gap-6">
                        {/* 左侧 - Agent 面板 */}
                        <div className="w-64 shrink-0 space-y-4">
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                参与者 ({currentSession.agents.length})
                            </h3>
                            <div className="space-y-3">
                                {currentSession.agents.map(agent => (
                                    <AgentCard
                                        key={agent.id}
                                        agent={agent}
                                        isActive={agent.status === 'speaking'}
                                    />
                                ))}
                            </div>

                            <div className="pt-4 border-t border-white/10 space-y-2">
                                {currentSession.status === 'pending' && (
                                    <button
                                        onClick={handleStartDiscussion}
                                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2"
                                    >
                                        <Play size={16} />
                                        开始讨论
                                    </button>
                                )}
                                {currentSession.status === 'active' && (
                                    <>
                                        <button className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg flex items-center justify-center gap-2">
                                            <Pause size={16} />
                                            暂停
                                        </button>
                                        <button
                                            onClick={handleEndDiscussion}
                                            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center gap-2"
                                        >
                                            <Square size={16} />
                                            结束
                                        </button>
                                    </>
                                )}
                                {currentSession.status === 'completed' && (
                                    <div className="text-center text-slate-400 py-2">
                                        讨论已结束
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 右侧 - 事件时间线 */}
                        <div className="flex-1 bg-slate-800/30 rounded-2xl p-6 border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white">
                                    {currentSession.topic}
                                </h3>
                                <div className="text-sm text-slate-400">
                                    第 {currentSession.currentRound} 轮
                                </div>
                            </div>
                            <EventTimeline events={currentSession.events} />
                        </div>
                    </div>
                )}

                {view === 'history' && (
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-lg font-semibold text-white mb-4">讨论历史</h2>
                        {sessions.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                暂无历史记录
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sessions.map((session: any) => (
                                    <div
                                        key={session.sessionId}
                                        className="p-4 bg-slate-800/50 border border-white/10 rounded-xl hover:border-purple-500/30 transition-colors cursor-pointer"
                                    >
                                        <div className="font-medium text-white">{session.title}</div>
                                        <div className="text-sm text-slate-400 mt-1">
                                            {session.scenarioName} • {session.agentCount} 参与者 • {session.eventCount} 条发言
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default IsolationModeContainer;
