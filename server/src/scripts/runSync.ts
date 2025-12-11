import { runSync } from '../services/syncService';

async function main() {
    console.log('====================================');
    console.log('🔄 WordPress 用户数据同步工具');
    console.log('====================================');

    try {
        const result = await runSync();

        console.log('');
        console.log('====================================');
        console.log('📊 同步结果:');
        console.log(`   ✅ 同步成功: ${result.usersSynced} 用户`);
        console.log(`   ⏩ 跳过: ${result.usersSkipped} 用户`);

        if (result.errors.length > 0) {
            console.log(`   ❌ 错误: ${result.errors.length} 个`);
            result.errors.forEach(err => console.log(`      - ${err}`));
        }

        console.log('====================================');
        process.exit(result.success ? 0 : 1);

    } catch (error) {
        console.error('❌ 同步失败:', error);
        process.exit(1);
    }
}

main();
