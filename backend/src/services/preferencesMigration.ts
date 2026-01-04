import { query } from '../db/connection.js';

/**
 * 迁移用户的localStorage设置到数据库
 * 这个函数应该在用户登录后调用一次
 */
export async function migrateUserPreferences(userId: string, localStoragePrefs: any) {
  try {
    // 获取当前数据库中的偏好设置
    const result = await query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      console.error(`User ${userId} not found`);
      return { success: false, error: 'User not found' };
    }

    const dbPrefs = result.rows[0].preferences || {};

    // 如果数据库中已有设置且有有效的theme/language，不覆盖
    // 否则使用localStorage的设置
    const shouldMigrate = !dbPrefs.theme && !dbPrefs.language;

    if (shouldMigrate && localStoragePrefs) {
      const mergedPrefs = {
        ...dbPrefs,
        theme: localStoragePrefs.theme || 'blue',
        mode: localStoragePrefs.mode || 'dark',
        language: localStoragePrefs.language || 'zh',
        modelName: localStoragePrefs.modelName || 'gemini-3-flash-preview',
        featureFlags: {
          showContextDrawer: localStoragePrefs.showContextDrawer !== false,
          showThoughtChain: localStoragePrefs.showThoughtChain !== false,
          showFollowUps: localStoragePrefs.showFollowUps !== false,
          showRichActions: localStoragePrefs.showRichActions !== false,
          showTrendAnalysis: localStoragePrefs.showTrendAnalysis !== false,
          showSimulator: localStoragePrefs.showSimulator !== false,
          enableStylePrompt: localStoragePrefs.enableStylePrompt !== false,
          showGoalLanding: localStoragePrefs.showGoalLanding === true,
          enableWebSocket: localStoragePrefs.enableWebSocket === true,
          allowModelSelect: localStoragePrefs.allowModelSelect !== false,
        },
      };

      await query(
        'UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(mergedPrefs), userId]
      );

      console.log(`✅ Migrated preferences for user ${userId}`);
      return { success: true, preferences: mergedPrefs };
    }

    return { success: true, preferences: dbPrefs, migrated: false };
  } catch (error: any) {
    console.error('Preference migration error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 确保preferences字段是JSONB类型
 * 这个函数在服务器启动时调用
 */
export async function ensurePreferencesSchema() {
  try {
    // 检查preferences列的类型
    const typeCheck = await query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'preferences'
    `);

    if (typeCheck.rows.length > 0) {
      const dataType = typeCheck.rows[0].data_type;
      
      if (dataType === 'text') {
        console.log('🔄 Migrating users.preferences from TEXT to JSONB...');
        
        // 迁移现有数据
        await query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences_backup TEXT;
          UPDATE users SET preferences_backup = preferences WHERE preferences IS NOT NULL;
          
          ALTER TABLE users ALTER COLUMN preferences TYPE JSONB USING 
            CASE 
              WHEN preferences IS NULL OR preferences = '' THEN '{}'::jsonb
              ELSE jsonb_build_object('userInstructions', preferences)
            END;
          
          ALTER TABLE users ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;
        `);
        
        console.log('✅ Successfully migrated preferences column to JSONB');
      } else if (dataType === 'jsonb') {
        console.log('✅ Preferences column is already JSONB');
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ Schema migration error:', error);
    return { success: false, error: error.message };
  }
}

