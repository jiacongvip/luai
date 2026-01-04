# 路由访问修复说明

## 问题
直接访问 `/admin/login` 等路径时无法正常显示页面。

## 已修复

1. **Vite 配置更新** (`vite.config.ts`)
   - 添加了 `historyApiFallback: true`，让所有路由都返回 `index.html`
   - 这样 Vite 开发服务器会正确处理 SPA 路由

2. **App.tsx 状态初始化**
   - 添加了 `isAdminPath` 和 `adminRoute` 状态的初始化
   - 在组件挂载时检测当前路径，正确设置管理后台路由

3. **路径监听优化**
   - 改进了路径变化监听逻辑
   - 访问 `/admin` 或 `/admin/` 时自动重定向到 `/admin/dashboard`

## 使用方法

### 启动开发服务器

```bash
npm run dev
```

### 访问路径

- **用户端**: `http://localhost:3000` 或 `http://localhost:3000/login`
- **管理后台登录**: `http://localhost:3000/admin/login`
- **管理后台仪表板**: `http://localhost:3000/admin/dashboard`
- **用户管理**: `http://localhost:3000/admin/users`
- **智能体管理**: `http://localhost:3000/admin/agents`
- **系统设置**: `http://localhost:3000/admin/settings`

## 注意事项

1. 确保后端服务正在运行（`http://localhost:3001`）
2. 管理后台需要管理员账户登录
3. 如果访问 `/admin/*` 但未登录或不是管理员，会自动重定向

## 如果仍然无法访问

1. 检查浏览器控制台是否有错误
2. 确认后端 API 是否正常运行
3. 清除浏览器缓存并刷新页面
4. 检查 `vite.config.ts` 中的配置是否正确

