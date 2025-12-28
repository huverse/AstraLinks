/**
 * Orchestrator 模块导出
 */

export { DiscussionOrchestrator, discussionOrchestrator } from './DiscussionOrchestrator';
export { runDebateDemo, runProjectReviewDemo, runAllDemos } from './ScenarioDemoRunner';
export { DiscussionLoop, discussionLoop } from './DiscussionLoop';
export type { IDiscussionLoopLauncher } from './DiscussionLoopLauncher';
export {
    registerDiscussionLoopLauncher,
    getDiscussionLoopLauncher,
} from './DiscussionLoopLauncher';
