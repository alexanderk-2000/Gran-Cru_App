
import React, { useEffect, useState } from 'react';
import { settingsService, UserSettings, AIProvider } from '../services/settings.ts';
import { Cpu, Save, CheckCircle, AlertCircle, Sparkles, Server, ExternalLink, Download, RefreshCcw, Smartphone } from 'lucide-react';
import { requestInstallPrompt, subscribeInstallPrompt, hideIOSInstallInstructions, type InstallPromptState } from '../services/pwa/installPrompt.ts';
import { applySwUpdate, subscribeSwUpdateState, type SwUpdateState } from '../services/pwa/swRegistration.ts';
import { getSyncStateSnapshot } from '../services/pwa/offlineDb.ts';
import { subscribeQueueSnapshot } from '../services/pwa/aiQueue.ts';
import { runSyncCycle } from '../services/pwa/syncEngine.ts';
import { storageService } from '../services/storage.ts';

export const Settings: React.FC = () => {
    const [, setSettings] = useState<UserSettings | null>(null);
    const [provider, setProvider] = useState<AIProvider>('openai');
    const [geminiModel, setGeminiModel] = useState('gemini-pro-latest');
    const [openaiModel, setOpenaiModel] = useState('gpt-5.2');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [installState, setInstallState] = useState<InstallPromptState>({
        canPromptInstall: false,
        isInstalled: false,
        isIOS: false,
        instructionsVisible: false
    });
    const [swState, setSwState] = useState<SwUpdateState>({
        updateAvailable: false,
        offlineReady: false
    });
    const [syncState, setSyncState] = useState({
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
        last_sync_started_at: null as string | null,
        last_sync_completed_at: null as string | null,
        last_sync_error: null as string | null,
        write_queue_pending: 0,
        write_queue_failed: 0,
        ai_queue_pending: 0,
        ai_queue_failed: 0,
        syncing: false
    });
    const [installFeedback, setInstallFeedback] = useState<string | null>(null);

    const geminiModels = [
        { id: 'gemini-pro-latest', name: 'Gemini Pro (Latest)', description: 'Höchste Qualität für Recherche' },
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', description: 'Neuste Pro-Generation' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Schneller Flash-Modus' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Starkes Reasoning' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Schnell & günstig' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Sehr günstig' },
    ];

    const openaiModels = [
        { id: 'gpt-5.2', name: 'GPT-5.2 (Search)', description: 'Standard mit Web-Search' },
        { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Fallback 1' },
        { id: 'o3', name: 'o3', description: 'Fallback 2' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fallback 3' },
        { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Fallback 4' }
    ];


    useEffect(() => {
        loadSettings();
        void checkServerStatus();
        void getSyncStateSnapshot().then(setSyncState).catch(() => undefined);

        const unsubscribeInstall = subscribeInstallPrompt(setInstallState);
        const unsubscribeUpdate = subscribeSwUpdateState(setSwState);
        const unsubscribeQueue = subscribeQueueSnapshot(setSyncState);

        return () => {
            unsubscribeInstall();
            unsubscribeUpdate();
            unsubscribeQueue();
        };
    }, []);

    const loadSettings = async () => {
        try {
            const userSettings = await settingsService.getUserSettings();
            if (userSettings) {
                setSettings(userSettings);
                setProvider(userSettings.ai_provider || 'openai');
                setGeminiModel(userSettings.gemini_model || 'gemini-pro-latest');
                setOpenaiModel(userSettings.openai_model || 'gpt-5.2');
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };

    const checkServerStatus = async () => {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                setServerStatus('online');
            } else {
                setServerStatus('offline');
            }
        } catch {
            setServerStatus('offline');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus('idle');
        try {
            await settingsService.updateSettings({
                ai_provider: provider,
                gemini_model: geminiModel,
                openai_model: openaiModel
            });
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInstallClick = async () => {
        const result = await requestInstallPrompt();
        if (result === 'accepted') {
            setInstallFeedback('Installation gestartet.');
            setTimeout(() => setInstallFeedback(null), 3000);
            return;
        }
        if (result === 'dismissed') {
            setInstallFeedback('Installation abgebrochen.');
            setTimeout(() => setInstallFeedback(null), 3000);
            return;
        }
        if (result === 'ios_instructions') {
            setInstallFeedback('Auf iOS: Teilen -> Zum Home-Bildschirm.');
            return;
        }
        setInstallFeedback('Installation derzeit nicht verfügbar.');
        setTimeout(() => setInstallFeedback(null), 3000);
    };

    const handleSyncNow = async () => {
        await runSyncCycle(storageService);
        const latest = await getSyncStateSnapshot();
        setSyncState(latest);
    };

    const handleApplyUpdate = async () => {
        await applySwUpdate();
    };

    return (
        <div className="min-h-screen bg-alabaster/40 pt-16 pb-40 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-12">
                    <h1 className="font-serif text-5xl font-bold text-charcoal mb-4">Einstellungen</h1>
                    <p className="text-stone-gray text-lg">Konfiguriere deine persönlichen KI-Einstellungen</p>
                </div>

                {/* Server Status */}
                <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
                        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
                            <Server className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl font-bold text-charcoal">API Server Status</h2>
                            <p className="text-sm text-stone-gray mt-1">Verbindung zum Backend-Server</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${serverStatus === 'online' ? 'bg-green-500' :
                            serverStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
                            }`} />
                        <span className="font-bold text-charcoal">
                            {serverStatus === 'online' ? 'Server läuft' :
                                serverStatus === 'offline' ? 'Server nicht erreichbar' : 'Prüfe Verbindung...'}
                        </span>
                    </div>

                    {serverStatus === 'offline' && (
                        <div className="mt-6 bg-red-50 p-6 rounded-2xl border border-red-200">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-bold text-red-800 mb-2">Server nicht gestartet</p>
                                    <p className="text-red-700 mb-3">
                                        Der API-Server muss für KI-Funktionen laufen. Starte ihn mit:
                                    </p>
                                    <code className="bg-red-100 px-3 py-2 rounded-lg block font-mono text-xs">
                                        cd server && npm install && npm run dev
                                    </code>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 bg-alabaster/40 p-6 rounded-2xl border border-burgundy/5">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                            <div className="text-sm text-stone-gray">
                                <p className="font-bold text-charcoal mb-1">API Keys konfigurieren</p>
                                <p className="mb-2">
                                    API Keys werden sicher im Backend gespeichert. Bearbeite die Datei:
                                </p>
                                <code className="bg-charcoal/5 px-3 py-2 rounded-lg block font-mono text-xs mb-3">
                                    server/.env
                                </code>
                                <div className="flex gap-4 mt-3">
                                    <a
                                        href="https://aistudio.google.com/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-burgundy hover:underline flex items-center gap-1"
                                    >
                                        Gemini Key erstellen <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <a
                                        href="https://platform.openai.com/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-burgundy hover:underline flex items-center gap-1"
                                    >
                                        OpenAI Key erstellen <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* PWA Status / Install / Sync */}
                <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
                        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
                            <Smartphone className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl font-bold text-charcoal">PWA, Offline & Sync</h2>
                            <p className="text-sm text-stone-gray mt-1">Installation, Queue-Status und manuelle Synchronisation</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
                            <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Installierbarkeit</p>
                            <p className="font-bold text-charcoal">
                                {installState.isInstalled ? 'Bereits installiert' : installState.canPromptInstall ? 'Installierbar (Chrome)' : installState.isIOS ? 'iOS Anleitung verfügbar' : 'Nicht verfügbar'}
                            </p>
                        </div>
                        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
                            <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Service Worker</p>
                            <p className="font-bold text-charcoal">
                                {swState.updateAvailable ? 'Update verfügbar' : swState.offlineReady ? 'Offline bereit' : 'Initialisierung läuft'}
                            </p>
                        </div>
                        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
                            <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Write Queue</p>
                            <p className="font-bold text-charcoal">
                                {syncState.write_queue_pending} offen, {syncState.write_queue_failed} fehlgeschlagen
                            </p>
                        </div>
                        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
                            <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">AI Queue</p>
                            <p className="font-bold text-charcoal">
                                {syncState.ai_queue_pending} offen, {syncState.ai_queue_failed} fehlgeschlagen
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <button
                            onClick={handleInstallClick}
                            disabled={installState.isInstalled}
                            className="px-5 py-3 rounded-xl bg-burgundy text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            {installState.isInstalled ? 'Installiert' : 'App installieren'}
                        </button>

                        <button
                            onClick={handleSyncNow}
                            disabled={syncState.syncing}
                            className="px-5 py-3 rounded-xl border border-burgundy/20 text-burgundy font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <RefreshCcw className={`w-4 h-4 ${syncState.syncing ? 'animate-spin' : ''}`} />
                            {syncState.syncing ? 'Synchronisiert...' : 'Jetzt synchronisieren'}
                        </button>

                        {swState.updateAvailable && (
                            <button
                                onClick={handleApplyUpdate}
                                className="px-5 py-3 rounded-xl bg-charcoal text-white font-bold text-sm"
                            >
                                Update laden
                            </button>
                        )}
                    </div>

                    {installFeedback && (
                        <p className="text-sm text-burgundy mb-3">{installFeedback}</p>
                    )}

                    {installState.instructionsVisible && installState.isIOS && (
                        <div className="bg-burgundy/5 border border-burgundy/15 rounded-2xl p-5">
                            <p className="text-sm text-charcoal mb-2 font-bold">iOS Installation</p>
                            <p className="text-sm text-stone-gray mb-3">In Safari auf <span className="font-medium">Teilen</span> tippen und <span className="font-medium">Zum Home-Bildschirm</span> wählen.</p>
                            <button onClick={hideIOSInstallInstructions} className="text-xs uppercase tracking-wider text-burgundy font-bold">
                                Verstanden
                            </button>
                        </div>
                    )}

                    <div className="mt-4 text-xs text-stone-gray">
                        Letzter Sync Start: {syncState.last_sync_started_at || '—'} | Letzter Sync Ende: {syncState.last_sync_completed_at || '—'}
                        {syncState.last_sync_error ? ` | Fehler: ${syncState.last_sync_error}` : ''}
                    </div>
                </section>

                {/* Provider Selection */}
                <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
                        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl font-bold text-charcoal">KI-Provider</h2>
                            <p className="text-sm text-stone-gray mt-1">Wähle deinen bevorzugten KI-Anbieter</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setProvider('gemini')}
                            className={`p-6 rounded-2xl border-2 transition-all ${provider === 'gemini'
                                ? 'border-burgundy bg-burgundy/5'
                                : 'border-burgundy/10 hover:border-burgundy/30'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-charcoal">Google Gemini</h3>
                                {provider === 'gemini' && <CheckCircle className="w-5 h-5 text-burgundy" />}
                            </div>
                            <p className="text-sm text-stone-gray text-left">Gemini Modelle (Fallback aktiv)</p>
                        </button>

                        <button
                            onClick={() => setProvider('openai')}
                            className={`p-6 rounded-2xl border-2 transition-all ${provider === 'openai'
                                ? 'border-burgundy bg-burgundy/5'
                                : 'border-burgundy/10 hover:border-burgundy/30'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-charcoal">OpenAI</h3>
                                {provider === 'openai' && <CheckCircle className="w-5 h-5 text-burgundy" />}
                            </div>
                            <p className="text-sm text-stone-gray text-left">GPT Modelle (Search zuerst)</p>
                        </button>
                    </div>
                </section>

                {/* Model Selection */}
                <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-alabaster">
                        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl font-bold text-charcoal">KI-Modell</h2>
                            <p className="text-sm text-stone-gray mt-1">
                                Wähle das {provider === 'gemini' ? 'Gemini' : 'OpenAI'}-Modell für Weinanalysen
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {(provider === 'gemini' ? geminiModels : openaiModels).map((model) => {
                            const isSelected = provider === 'gemini'
                                ? geminiModel === model.id
                                : openaiModel === model.id;

                            return (
                                <button
                                    key={model.id}
                                    onClick={() => provider === 'gemini' ? setGeminiModel(model.id) : setOpenaiModel(model.id)}
                                    className={`w-full p-6 rounded-2xl border-2 transition-all text-left ${isSelected
                                        ? 'border-burgundy bg-burgundy/5'
                                        : 'border-burgundy/10 hover:border-burgundy/30'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-bold text-charcoal mb-1">{model.name}</h3>
                                            <p className="text-sm text-stone-gray">{model.description}</p>
                                        </div>
                                        {isSelected && (
                                            <CheckCircle className="w-6 h-6 text-burgundy shrink-0" />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Save Button */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 py-5 bg-burgundy hover:bg-burgundy-light text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <Save className="w-5 h-5" />
                        {isSaving ? 'Speichern...' : 'Einstellungen Speichern'}
                    </button>

                    {saveStatus === 'success' && (
                        <div className="flex items-center gap-2 text-sage">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-bold text-sm">Gespeichert!</span>
                        </div>
                    )}

                    {saveStatus === 'error' && (
                        <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-bold text-sm">Fehler beim Speichern</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
