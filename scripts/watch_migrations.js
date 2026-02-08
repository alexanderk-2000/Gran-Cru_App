import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_DIR = path.join(__dirname, '../supabase/migrations');
const DEBOUNCE_MS = 2000;
let timeoutId = null;

console.log(`👀 Watching for new migrations in: ${MIGRATION_DIR}`);

// Helper to parse .env file
function parseEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').reduce((acc, line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            acc[key] = value;
        }
        return acc;
    }, {});
}

fs.watch(MIGRATION_DIR, (eventType, filename) => {
    if (filename && filename.endsWith('.sql')) {
        console.log(`Detected change in ${filename} (${eventType})`);

        // Debounce to avoid running twice for one save
        if (timeoutId) clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            runMigration();
        }, DEBOUNCE_MS);
    }
});

function runMigration() {
    console.log('🚀 Running automated migration...');

    // Load secrets from server/.env
    const serverEnvPath = path.join(__dirname, '../server/.env');
    const serverEnv = parseEnv(serverEnvPath);
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || serverEnv.SUPABASE_DB_PASSWORD;

    if (!dbPassword) {
        console.warn('⚠️ No SUPABASE_DB_PASSWORD found in env or server/.env. Migration might fail if interactive.');
    }

    const env = {
        ...process.env,
        SUPABASE_DB_PASSWORD: dbPassword
    };

    const migration = spawn('npm', ['run', 'db:push'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: env
    });

    migration.on('close', (code) => {
        if (code === 0) {
            console.log('✅ Migration successfully applied!');
        } else {
            console.error('❌ Migration failed.');
        }
    });
}
