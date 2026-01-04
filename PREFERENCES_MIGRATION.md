# localStorage 迁移到数据库 - 完成指南

## ✅ 已完成的工作

### 1. 后端 API 和数据库
- ✅ 创建了 `/backend/src/routes/preferences.ts` - 用户偏好设置 API
- ✅ 创建了 `/backend/src/services/preferencesMigration.ts` - 自动迁移服务
- ✅ 更新了 `/backend/src/index.ts` - 注册 preferences 路由，服务器启动时自动迁移schema
- ✅ 更新了 `/backend/src/routes/auth.ts` - 登录时接收并迁移 localStorage 设置
- ✅ 创建了 `/backend/src/db/migrate-user-preferences.sql` - 数据库迁移脚本

### 2. 前端 API 和工具
- ✅ 更新了 `/utils/api.ts` - 添加 `api.preferences.*` 方法，登录时发送localStorage设置
- ✅ 创建了 `/utils/preferences.ts` - 偏好设置提取和构建工具函数

## 🔄 需要的前端更新

### App.tsx 需要的改动

在用户登录后（`handleLogin` 或 `loadInitialData` 中），使用 preferences：

```typescript
import { extractPreferences } from './utils/preferences';

// 在用户登录成功后
const handleLogin = (user: User) => {
  setCurrentUser(user);
  
  // 从 user.preferences 提取设置
  if (user.preferences) {
    const prefs = extractPreferences(user.preferences);
    setLanguage(prefs.language);
    setCurrentTheme(prefs.theme);
    setThemeMode(prefs.mode);
    setSelectedModel(prefs.modelName);
    setShowContextDrawer(prefs.showContextDrawer);
    setShowThoughtChain(prefs.showThoughtChain);
    setShowFollowUps(prefs.showFollowUps);
    setShowRichActions(prefs.showRichActions);
    setShowTrendAnalysis(prefs.showTrendAnalysis);
    setShowSimulator(prefs.showSimulator);
    setEnableStylePrompt(prefs.enableStylePrompt);
    setShowGoalLanding(prefs.showGoalLanding);
    setEnableWebSocket(prefs.enableWebSocket);
    setAllowModelSelect(prefs.allowModelSelect);
  }
  
  // 其他登录逻辑...
};
```

### 当设置改变时保存到数据库

例如在 SettingsTab.tsx 的 `handleSaveSettings` 中：

```typescript
const handleSaveSettings = async () => {
  // 不再使用 storage.saveTheme() 等
  // 而是调用 API
  try {
    await api.preferences.update({
      theme: currentTheme,
      mode: themeMode,
      language,
      modelName: selectedModel,
      featureFlags: {
        showContextDrawer,
        showThoughtChain,
        showFollowUps,
        showRichActions,
        showTrendAnalysis,
        showSimulator,
        enableStylePrompt,
        showGoalLanding,
        enableWebSocket: useWebSocket,
        allowModelSelect,
      },
    });
    
    // 触发回调更新父组件
    if (onLanguageChange) onLanguageChange(language);
    // ... 其他回调
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('保存失败，请重试');
  }
};
```

## 📝 数据流

1. **用户首次登录**：
   - 前端发送 localStorage 设置到 `/api/auth/login`
   - 后端检查数据库中的 preferences，如果为空则保存 localStorage 数据
   - 后端返回 `user.preferences`
   - 前端使用 `extractPreferences()` 提取并设置到状态

2. **用户修改设置**：
   - 前端调用 `api.preferences.update()` 保存到数据库
   - 同时更新本地状态（setState）

3. **服务器启动**：
   - 自动执行 `ensurePreferencesSchema()` 将 preferences 字段从 TEXT 迁移到 JSONB

4. **之后的登录**：
   - 后端直接返回数据库中的 `user.preferences`
   - 前端不再依赖 localStorage

## 🗑️ 可以移除的 localStorage 代码

`/utils/storage.ts` 中的以下函数可以标记为 deprecated：
- `saveTheme`, `loadTheme`
- `saveMode`, `loadMode`
- `saveLang`, `loadLang`
- `saveModelName`, `loadModelName`
- `saveShowContextDrawer`, `loadShowContextDrawer`
- `saveShowThoughtChain`, `loadShowThoughtChain`
- `saveShowFollowUps`, `loadShowFollowUps`
- `saveShowRichActions`, `loadShowRichActions`
- `saveShowTrendAnalysis`, `loadShowTrendAnalysis`
- `saveShowSimulator`, `loadShowSimulator`
- `saveEnableWebSocket`, `loadEnableWebSocket`
- `saveEnableStylePrompt`, `loadEnableStylePrompt`
- `saveShowGoalLanding`, `loadShowGoalLanding`
- `saveAllowModelSelect`, `loadAllowModelSelect`
- `saveAgentCategories`, `loadAgentCategories`
- `saveAvailableModels`, `loadAvailableModels`

这些可以保留用于向后兼容，但新代码应使用 `api.preferences.*`。

## 🧪 测试步骤

1. 重启后端服务 - 确认 schema 迁移成功
2. 用现有账号登录 - 检查 localStorage 设置是否正确迁移到数据库
3. 修改设置（主题、语言等）- 检查是否保存到数据库
4. 退出并重新登录 - 检查设置是否从数据库正确加载
5. 在无痕浏览器登录 - 应该加载数据库中的设置，而不是默认值

## 🎯 下一步

完成以上更新后，所有 UI 偏好设置将完全存储在数据库中，localStorage 仅用作临时缓存。

