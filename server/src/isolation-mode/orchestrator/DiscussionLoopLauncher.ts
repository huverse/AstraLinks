/**
 * Discussion Loop Launcher
 *
 * 解耦 ModeratorController 与 DiscussionLoop 的循环依赖
 * 通过延迟绑定实现松耦合
 */

import { weLogger } from '../../services/world-engine-logger';

/** 讨论循环启动器接口 */
export interface IDiscussionLoopLauncher {
    start(sessionId: string): Promise<void>;
    stop(sessionId: string): void;
}

/** 默认空实现 */
const noopLauncher: IDiscussionLoopLauncher = {
    async start() {
        weLogger.warn('discussion_loop_launcher_not_registered');
    },
    stop() {},
};

/** 当前注册的启动器 */
let currentLauncher: IDiscussionLoopLauncher = noopLauncher;

/**
 * 注册讨论循环启动器
 */
export function registerDiscussionLoopLauncher(launcher: IDiscussionLoopLauncher): void {
    currentLauncher = launcher;
    weLogger.debug('discussion_loop_launcher_registered');
}

/**
 * 获取讨论循环启动器
 */
export function getDiscussionLoopLauncher(): IDiscussionLoopLauncher {
    return currentLauncher;
}
