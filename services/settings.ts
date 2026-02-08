
import { supabase } from './supabase.ts';

export type AIProvider = 'gemini' | 'openai';

export interface UserSettings {
    user_id: string;
    ai_provider: AIProvider;
    gemini_model: string;
    openai_model: string;
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

        const { data: { user } } = await supabase.auth.getUser();

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
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No settings exist, create them
                    return await settingsService.createDefaultSettings();
                }
                throw error;
            }

            // Save to localStorage for faster access next time
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
            return data as UserSettings;

        } catch (e) {
            console.error('Error fetching settings:', e);
            // Fallback to defaults + cache
            return {
                user_id: user.id,
                ...DEFAULT_SETTINGS,
                ...cached,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        }
    },

    // Create default settings for new user
    createDefaultSettings: async (): Promise<UserSettings> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user logged in');

        const { data, error } = await supabase
            .from('user_settings')
            .insert([{
                user_id: user.id,
                ...DEFAULT_SETTINGS
            }])
            .select()
            .single();

        if (error) throw error;

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        return data as UserSettings;
    },

    // Update user settings
    updateSettings: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
        const { data: { user } } = await supabase.auth.getUser();

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
        const { data, error } = await supabase
            .from('user_settings')
            .update({
                ...settings,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        return data as UserSettings;
    },

    // Get selected model based on provider (enforced)
    getModel: async (): Promise<string> => {
        const settings = await settingsService.getUserSettings();
        if (!settings) return DEFAULT_SETTINGS.gemini_model;

        if (settings.ai_provider === 'openai') return DEFAULT_SETTINGS.openai_model;
        return DEFAULT_SETTINGS.gemini_model;
    },

    // Get AI provider
    getProvider: async (): Promise<AIProvider> => {
        const settings = await settingsService.getUserSettings();
        return settings?.ai_provider || DEFAULT_SETTINGS.ai_provider;
    }
};
