
import { doc, getDocFromServer, setDoc, updateDoc } from 'firebase/firestore';
import { db, waitForAuth } from './firebase.ts';

const settingsDoc = (uid: string) => doc(db, 'users', uid);

export type AIProvider = 'gemini' | 'openai' | 'openrouter';

export interface UserSettings {
    user_id: string;
    ai_provider: AIProvider;
    gemini_model: string;
    openai_model: string;
    openrouter_model: string;
    currency: string;
    language: string;
    target_date: string;
    created_at: string;
    updated_at: string;
}

const LOCAL_STORAGE_KEY = 'wine_vault_settings';

const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id' | 'created_at' | 'updated_at'> = {
    ai_provider: 'openai',
    gemini_model: 'gemini-pro-latest',
    openai_model: '5.2',
    openrouter_model: 'nvidia/llama-3.1-nemotron-70b-instruct',
    currency: 'EUR',
    language: 'de',
    target_date: '2044-12-31'
};

export const settingsService = {
    // Get user settings - simplified version
    getUserSettings: async (): Promise<UserSettings | null> => {
        // Always check localStorage first for fast access
        const localSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        let cached: Partial<UserSettings> = {};
        if (localSettings) {
            try {
                cached = JSON.parse(localSettings);
            } catch (e) {
                console.error('Failed to parse local settings', e);
            }
        }

        const user = await waitForAuth();

        // No user = demo mode, use localStorage + defaults
        if (!user) {
            const demoSettings: UserSettings = {
                user_id: 'demo-user',
                ...DEFAULT_SETTINGS,
                ...cached,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            return demoSettings;
        }

        // Try to get from database
        try {
            const snapshot = await getDocFromServer(settingsDoc(user.uid));
            if (!snapshot.exists()) {
                // No settings exist, create them
                return await settingsService.createDefaultSettings();
            }
            const data = { ...(snapshot.data() as Partial<UserSettings>), user_id: user.uid } as UserSettings;

            // Save to localStorage for faster access next time
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
            return data as UserSettings;

        } catch (e) {
            console.error('Error fetching settings:', e);
            // Fallback to defaults + cache
            return {
                user_id: user.uid,
                ...DEFAULT_SETTINGS,
                ...cached,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        }
    },

    // Create default settings for new user
    createDefaultSettings: async (): Promise<UserSettings> => {
        const user = await waitForAuth();
        if (!user) throw new Error('No user logged in');

        const timestamp = new Date().toISOString();
        const data: UserSettings = {
            user_id: user.uid,
            ...DEFAULT_SETTINGS,
            created_at: timestamp,
            updated_at: timestamp
        };
        await setDoc(settingsDoc(user.uid), data);

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        return data as UserSettings;
    },

    // Update user settings
    updateSettings: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
        const user = await waitForAuth();

        // Update localStorage immediately
        const currentLocal = localStorage.getItem(LOCAL_STORAGE_KEY);
        const parsedLocal = currentLocal ? JSON.parse(currentLocal) : {};
        const newLocal = { ...parsedLocal, ...settings };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newLocal));

        // Demo mode - just return local state
        if (!user) {
            return {
                user_id: 'demo-user',
                ...DEFAULT_SETTINGS,
                ...newLocal,
                updated_at: new Date().toISOString()
            } as UserSettings;
        }

        // Update database
        const { user_id: _ignoredUserId, created_at: _ignoredCreatedAt, ...changes } = settings;
        const ref = settingsDoc(user.uid);
        const existing = await getDocFromServer(ref);
        const timestamp = new Date().toISOString();
        if (existing.exists()) {
            await updateDoc(ref, { ...changes, updated_at: timestamp });
        } else {
            await setDoc(ref, { user_id: user.uid, ...DEFAULT_SETTINGS, ...changes, created_at: timestamp, updated_at: timestamp });
        }
        const data = { ...(existing.exists() ? existing.data() : DEFAULT_SETTINGS), ...changes, user_id: user.uid, updated_at: timestamp } as UserSettings;

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        return data as UserSettings;
    },

    // Get selected model based on provider (enforced)
    getModel: async (): Promise<string> => {
        const settings = await settingsService.getUserSettings();
        if (!settings) return DEFAULT_SETTINGS.openai_model;

        if (settings.ai_provider === 'openai') {
            return settings.openai_model || DEFAULT_SETTINGS.openai_model;
        }
        if (settings.ai_provider === 'openrouter') {
            return settings.openrouter_model || DEFAULT_SETTINGS.openrouter_model;
        }
        return settings.gemini_model || DEFAULT_SETTINGS.gemini_model;
    },

    // Get AI provider
    getProvider: async (): Promise<AIProvider> => {
        const settings = await settingsService.getUserSettings();
        return settings?.ai_provider || DEFAULT_SETTINGS.ai_provider;
    }
};
