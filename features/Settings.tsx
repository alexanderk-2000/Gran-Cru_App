
import React, { useEffect, useState } from 'react';
import { settingsService, UserSettings, AIProvider } from '../services/settings.ts';
import { Cpu, Save, CheckCircle, AlertCircle, Server, ExternalLink, Download, RefreshCcw, Smartphone } from 'lucide-react';
import { requestInstallPrompt, subscribeInstallPrompt, hideIOSInstallInstructions, type InstallPromptState } from '../services/pwa/installPrompt.ts';
import { applySwUpdate, subscribeSwUpdateState, type SwUpdateState } from '../services/pwa/swRegistration.ts';
import { getSyncStateSnapshot } from '../services/pwa/offlineDb.ts';
import { subscribeQueueSnapshot } from '../services/pwa/aiQueue.ts';
import { runSyncCycle } from '../services/pwa/syncEngine.ts';
import { storageService } from '../services/storage.ts';
import { checkApiHealth } from '../services/apiHealth.ts';
import { exportService } from '../services/exportService.ts';

interface ModelTierOption {
    tier: 'fast' | 'balanced' | 'thorough';
    label: string;
    description: string;
    provider: AIProvider;
    model: string;
}

// One tier per real choice a collector has to make, instead of three
// provider tabs with 5-6 raw model IDs each (B21) - "gpt-5.2" or
// "nvidia/llama-3.1-nemotron-70b-instruct" says nothing to someone who just
// wants a wine looked up. Each tier maps to one concrete, already-supported
// (provider, model) pair from server/src/ai/providers/modelCatalog.js, so
// saving/loading stays compatible with the existing ai_provider/*_model
// columns - only this screen's presentation changes.
const MODEL_TIERS: ModelTierOption[] = [
    {
        tier: 'fast',
        label: 'Schnell',
        description: 'Für schnelle Antworten, wenn es nicht auf jedes Detail ankommt.',
        provider: 'openrouter',
        model: 'nvidia/nemotron-nano-9b-v2'
    },
    {
        tier: 'balanced',
        label: 'Ausgewogen',
        description: 'Guter Mittelweg aus Tempo und Recherchetiefe - die empfohlene Wahl.',
        provider: 'openai',
        model: 'gpt-5.2'
    },
    {
        tier: 'thorough',
        label: 'Gründlich',
        description: 'Das gründlichste verfügbare Modell, für Recherchen, bei denen jedes Detail zählt.',
        provider: 'openrouter',
        model: 'nvidia/llama-3.1-nemotron-70b-instruct'
    }
];

export const Settings: React.FC = () => {
    const [, setSettings] = useState<UserSettings | null>(null);
    const [provider, setProvider] = useState<AIProvider>('openai');
    const [geminiModel, setGeminiModel] = useState('gemini-pro-latest');
    const [openaiModel, setOpenaiModel] = useState('gpt-5.2');
    const [openrouterModel, setOpenrouterModel] = useState('nvidia/llama-3.1-nemotron-70b-instruct');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
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
    const [exportState, setExportState] = useState<'idle' | 'csv' | 'json'>('idle');
    const [exportMessage, setExportMessage] = useState<string | null>(null);

    // One tier per real choice a collector has to make, instead of three
    // provider tabs with 5-6 raw model IDs each (B21) - "gpt-5.2" or
    // "nvidia/llama-3.1-nemotron-70b-instruct" says nothing to someone who
    // just wants a wine looked up. Each tier still maps to one concrete,
    // already-supported (provider, model) pair from server/src/ai/providers/
    // modelCatalog.js, so saving/loading stays compatible with the existing
    // ai_provider/*_model columns.


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
                setOpenrouterModel(userSettings.openrouter_model || 'nvidia/llama-3.1-nemotron-70b-instruct');
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };

    const checkServerStatus = async () => {
        const health = await checkApiHealth();
        setServerStatus(health.online ? 'online' : 'offline');
        setKeyConfigured(health.online ? health.openrouterConfigured : null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus('idle');
        try {
            await settingsService.updateSettings({
                ai_provider: provider,
                gemini_model: geminiModel,
                openai_model: openaiModel,
                openrouter_model: openrouterModel
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

    const handleExport = async (format: 'csv' | 'json') => {
        setExportState(format);
        setExportMessage(null);
        try {
            const summary = format === 'csv' ? await exportService.exportCsv() : await exportService.exportJson();
            setExportMessage(
                format === 'csv'
                    ? `${summary.wines} Weine exportiert.`
                    : `${summary.wines} Weine, ${summary.tastings} Notizen und ${summary.events} Bestandsereignisse exportiert.`
            );
        } catch (error) {
            setExportMessage((error as Error)?.message || 'Export fehlgeschlagen.');
        } finally {
            setExportState('idle');
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

                    {serverStatus === 'online' && keyConfigured === false && (
                        <div className="mt-6 bg-gold/5 p-6 rounded-2xl border border-gold/20">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-bold text-charcoal mb-1">Kein KI-Schlüssel hinterlegt</p>
                                    <p className="text-stone-gray">
                                        Der Server läuft, aber ohne OpenRouter-Schlüssel. Recherche, Etikett-Scan und
                                        Anlass-Vorschläge bleiben deshalb ohne Ergebnis.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {serverStatus === 'offline' && (
                        <div className="mt-6 bg-red-50 p-6 rounded-2xl border border-red-200">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-bold text-red-800 mb-2">KI-Funktionen nicht verfügbar</p>
                                    <p className="text-red-700 mb-3">
                                        Recherche, Etikett-Scan und Anlass-Vorschläge brauchen den API-Dienst. Alles
                                        andere - Keller, Bestand, Planung - funktioniert davon unabhängig weiter.
                                    </p>
                                    <p className="text-red-700">
                                        Versuche es später erneut. Bleibt es dabei, prüfe die Konfiguration in den
                                        Projekteinstellungen des Deployments.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 bg-alabaster/40 p-6 rounded-2xl border border-burgundy/5">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                            <div className="text-sm text-stone-gray">
                                <p className="font-bold text-charcoal mb-1">KI-Zugang</p>
                                <p className="mb-2">
                                    Alle drei Stufen laufen über einen einzigen OpenRouter-Schlüssel. Wer für das
                                    Deployment zuständig ist, hinterlegt ihn dort in den Projekteinstellungen - im
                                    täglichen Gebrauch ist hier nichts einzustellen.
                                </p>
                                <div className="flex gap-4 mt-3">
                                    <a
                                        href="https://openrouter.ai/keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-burgundy hover:underline flex items-center gap-1"
                                    >
                                        OpenRouter Key erstellen <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Export / Backup */}
                <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
                        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
                            <Download className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl font-bold text-charcoal">Sammlung exportieren</h2>
                            <p className="text-sm text-stone-gray mt-1">Deine Daten gehören dir - jederzeit herausholbar</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-burgundy/10 bg-alabaster/40 p-5">
                            <p className="font-bold text-charcoal">Kellerliste (CSV)</p>
                            <p className="mt-1 mb-4 text-sm text-stone-gray">
                                Eine Zeile je Wein, direkt in Excel oder Numbers zu öffnen.
                            </p>
                            <button
                                onClick={() => void handleExport('csv')}
                                disabled={exportState === 'csv'}
                                className="inline-flex items-center gap-2 rounded-xl border border-burgundy/20 px-4 py-2.5 text-xs font-bold text-burgundy transition-all hover:bg-burgundy/5 disabled:opacity-50"
                            >
                                {exportState === 'csv' ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                CSV herunterladen
                            </button>
                        </div>

                        <div className="rounded-2xl border border-burgundy/10 bg-alabaster/40 p-5">
                            <p className="font-bold text-charcoal">Vollständiges Backup (JSON)</p>
                            <p className="mt-1 mb-4 text-sm text-stone-gray">
                                Weine, Notizen, Bestandsereignisse, Anlässe und Pockets - verlustfrei.
                            </p>
                            <button
                                onClick={() => void handleExport('json')}
                                disabled={exportState === 'json'}
                                className="inline-flex items-center gap-2 rounded-xl bg-burgundy px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-burgundy-light disabled:opacity-50"
                            >
                                {exportState === 'json' ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Backup herunterladen
                            </button>
                        </div>
                    </div>

                    {exportMessage && (
                        <p className="mt-4 text-sm text-stone-gray">{exportMessage}</p>
                    )}
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

                {/* Model Tier Selection */}
                <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
                        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl font-bold text-charcoal">KI-Recherche</h2>
                            <p className="text-sm text-stone-gray mt-1">Wie gründlich soll die Recherche zu einem Wein sein?</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {MODEL_TIERS.map((option) => {
                            const activeModel =
                                provider === 'gemini' ? geminiModel : provider === 'openai' ? openaiModel : openrouterModel;
                            const isSelected = provider === option.provider && activeModel === option.model;

                            return (
                                <button
                                    key={option.tier}
                                    onClick={() => {
                                        setProvider(option.provider);
                                        if (option.provider === 'gemini') setGeminiModel(option.model);
                                        else if (option.provider === 'openai') setOpenaiModel(option.model);
                                        else setOpenrouterModel(option.model);
                                    }}
                                    className={`w-full p-6 rounded-2xl border-2 transition-all text-left ${isSelected
                                        ? 'border-burgundy bg-burgundy/5'
                                        : 'border-burgundy/10 hover:border-burgundy/30'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-bold text-charcoal mb-1">{option.label}</h3>
                                            <p className="text-sm text-stone-gray">{option.description}</p>
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
