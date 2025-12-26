import fs from 'fs';
import path from 'path';
import { appLogger } from '../services/world-engine-logger';

export function warnEnvDuplicates(envPath = path.resolve(process.cwd(), '.env')): void {
    try {
        if (!fs.existsSync(envPath)) {
            return;
        }
        const content = fs.readFileSync(envPath, 'utf-8');
        const seen = new Set<string>();
        const duplicates = new Set<string>();

        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) {
                continue;
            }
            const key = line.split('=')[0]?.trim();
            if (!key) {
                continue;
            }
            if (seen.has(key)) {
                duplicates.add(key);
            } else {
                seen.add(key);
            }
        }

        if (duplicates.size > 0) {
            appLogger.warn({ duplicates: Array.from(duplicates).sort() }, 'duplicate_env_keys');
        }
    } catch (error: any) {
        appLogger.warn({ error: error.message }, 'failed_to_scan_env_file');
    }
}

export function warnInsecureTlsSetting(): void {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        appLogger.warn('node_tls_reject_unauthorized_disabled');
    }
}
