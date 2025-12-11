import { pool } from '../config/database';
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

// Sync API configuration
const SYNC_API_URL = process.env.SYNC_API_URL || 'https://galaxyous.com/sync-api.php';
const SYNC_API_KEY = process.env.SYNC_API_KEY || 'astralinks_sync_2024_secret';

/**
 * Run the database sync from WordPress via HTTP API
 * - Fetches users from old WordPress via sync-api.php
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
        console.log('🔄 Starting WordPress user sync via HTTP API...');
        console.log(`📡 Fetching from: ${SYNC_API_URL}`);

        // 1. Fetch users from sync API
        const response = await fetch(`${SYNC_API_URL}?key=${SYNC_API_KEY}`, {
            method: 'GET',
            headers: {
                'X-Sync-Key': SYNC_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { success: boolean; users: WpUser[]; error?: string };

        if (!data.success || !Array.isArray(data.users)) {
            throw new Error(data.error || 'Invalid API response');
        }

        const wpUsers = data.users;
        console.log(`📥 Found ${wpUsers.length} users from sync API`);

        // 2. Get existing synced users (by wp_user_id)
        const [existingUsers] = await connection.execute<RowDataPacket[]>(
            'SELECT wp_user_id FROM users WHERE wp_user_id IS NOT NULL'
        );
        const existingWpIds = new Set(existingUsers.map(u => u.wp_user_id));

        // 3. Process each WordPress user
        for (const wpUser of wpUsers) {
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

