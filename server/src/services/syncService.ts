import { pool, oldDbPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface WpUser {
    ID: number;
    user_login: string;
    user_email: string;
}

interface SyncResult {
    success: boolean;
    usersSynced: number;
    usersSkipped: number;
    errors: string[];
}

/**
 * Run the database sync from WordPress to new database
 * - Reads users from old WordPress wp_users table
 * - Inserts new users with needs_password_reset = TRUE
 * - Does NOT sync passwords (WordPress uses incompatible hash)
 */
export async function runSync(): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        usersSynced: 0,
        usersSkipped: 0,
        errors: []
    };

    const connection = await pool.getConnection();

    try {
        console.log('🔄 Starting WordPress user sync...');

        // 1. Fetch users from old WordPress database
        const [wpUsers] = await oldDbPool.execute<RowDataPacket[]>(
            'SELECT ID, user_login, user_email FROM wp_users'
        );

        console.log(`📥 Found ${wpUsers.length} users in WordPress database`);

        // 2. Get existing synced users (by wp_user_id)
        const [existingUsers] = await connection.execute<RowDataPacket[]>(
            'SELECT wp_user_id FROM users WHERE wp_user_id IS NOT NULL'
        );
        const existingWpIds = new Set(existingUsers.map(u => u.wp_user_id));

        // 3. Process each WordPress user
        for (const wpUser of wpUsers as WpUser[]) {
            try {
                // Skip if already synced
                if (existingWpIds.has(wpUser.ID)) {
                    result.usersSkipped++;
                    continue;
                }

                // Check if username already exists (manual registration)
                const [existingUsername] = await connection.execute<RowDataPacket[]>(
                    'SELECT id FROM users WHERE username = ?',
                    [wpUser.user_login]
                );

                if (existingUsername.length > 0) {
                    // Link existing user to WordPress ID
                    await connection.execute(
                        'UPDATE users SET wp_user_id = ? WHERE username = ?',
                        [wpUser.ID, wpUser.user_login]
                    );
                    result.usersSkipped++;
                    continue;
                }

                // Insert new user with needs_password_reset = TRUE
                await connection.execute<ResultSetHeader>(
                    `INSERT INTO users (username, email, wp_user_id, needs_password_reset, created_at)
           VALUES (?, ?, ?, TRUE, NOW())`,
                    [wpUser.user_login, wpUser.user_email || null, wpUser.ID]
                );

                result.usersSynced++;

            } catch (err: any) {
                const errorMsg = `Failed to sync user ${wpUser.user_login}: ${err.message}`;
                console.error(errorMsg);
                result.errors.push(errorMsg);
            }
        }

        // 4. Log sync result
        await connection.execute<ResultSetHeader>(
            `INSERT INTO sync_logs (users_synced, status, error_message)
       VALUES (?, ?, ?)`,
            [
                result.usersSynced,
                result.errors.length > 0 ? 'failed' : 'success',
                result.errors.length > 0 ? result.errors.join('; ') : null
            ]
        );

        result.success = result.errors.length === 0;
        console.log(`✅ Sync complete: ${result.usersSynced} synced, ${result.usersSkipped} skipped`);

    } catch (error: any) {
        console.error('❌ Sync failed:', error);
        result.errors.push(error.message);

        // Log failure
        try {
            await pool.execute(
                `INSERT INTO sync_logs (users_synced, status, error_message)
         VALUES (0, 'failed', ?)`,
                [error.message]
            );
        } catch (logError) {
            console.error('Failed to log sync error:', logError);
        }

    } finally {
        connection.release();
    }

    return result;
}
