// 偏好设置工具函数 - 用于 App.tsx
import { Language, ThemeId, ThemeMode } from '../types';

export interface UserPreferences {
  theme?: ThemeId;
  mode?: ThemeMode;
  language?: Language;
  modelName?: string;
  featureFlags?: {
    showContextDrawer?: boolean;
    showThoughtChain?: boolean;
    showFollowUps?: boolean;
    showRichActions?: boolean;
    showTrendAnalysis?: boolean;
    showSimulator?: boolean;
    enableStylePrompt?: boolean;
    showGoalLanding?: boolean;
    enableWebSocket?: boolean;
    allowModelSelect?: boolean;
  };
  // 供前台 Chat 使用的模型列表（原来在 localStorage）
  availableModels?: { id: string; name: string }[];
  [key: string]: any;
}

/**
 * 从用户的 preferences 对象中提取并应用设置到 App 状态
 */
export function extractPreferences(preferences: any): {
  theme: ThemeId;
  mode: ThemeMode;
  language: Language;
  modelName: string;
  showContextDrawer: boolean;
  showThoughtChain: boolean;
  showFollowUps: boolean;
  showRichActions: boolean;
  showTrendAnalysis: boolean;
  showSimulator: boolean;
  enableStylePrompt: boolean;
  showGoalLanding: boolean;
  enableWebSocket: boolean;
  allowModelSelect: boolean;
  availableModels: { id: string; name: string }[];
} {
  const prefs = preferences || {};
  const flags = prefs.featureFlags || {};

  return {
    theme: prefs.theme || 'blue',
    mode: prefs.mode || 'dark',
    language: prefs.language || 'zh',
    modelName: prefs.modelName || 'gemini-3-flash-preview',
    showContextDrawer: flags.showContextDrawer !== false,
    showThoughtChain: flags.showThoughtChain !== false,
    showFollowUps: flags.showFollowUps !== false,
    showRichActions: flags.showRichActions !== false,
    showTrendAnalysis: flags.showTrendAnalysis !== false,
    showSimulator: flags.showSimulator !== false,
    enableStylePrompt: flags.enableStylePrompt !== false,
    showGoalLanding: flags.showGoalLanding === true,
    enableWebSocket: flags.enableWebSocket === true,
    allowModelSelect: flags.allowModelSelect !== false,
    availableModels: Array.isArray(prefs.availableModels) ? prefs.availableModels : [],
  };
}

/**
 * 构建完整的偏好设置对象用于保存到数据库
 */
export function buildPreferences(state: {
  theme: ThemeId;
  mode: ThemeMode;
  language: Language;
  modelName: string;
  showContextDrawer: boolean;
  showThoughtChain: boolean;
  showFollowUps: boolean;
  showRichActions: boolean;
  showTrendAnalysis: boolean;
  showSimulator: boolean;
  enableStylePrompt: boolean;
  showGoalLanding: boolean;
  enableWebSocket: boolean;
  allowModelSelect: boolean;
  availableModels: { id: string; name: string }[];
}): UserPreferences {
  return {
    theme: state.theme,
    mode: state.mode,
    language: state.language,
    modelName: state.modelName,
    availableModels: state.availableModels,
    featureFlags: {
      showContextDrawer: state.showContextDrawer,
      showThoughtChain: state.showThoughtChain,
      showFollowUps: state.showFollowUps,
      showRichActions: state.showRichActions,
      showTrendAnalysis: state.showTrendAnalysis,
      showSimulator: state.showSimulator,
      enableStylePrompt: state.enableStylePrompt,
      showGoalLanding: state.showGoalLanding,
      enableWebSocket: state.enableWebSocket,
      allowModelSelect: state.allowModelSelect,
    },
  };
}

