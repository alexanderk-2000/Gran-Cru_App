
import React, { useEffect, useState } from 'react';
import { settingsService, UserSettings, AIProvider } from '../services/settings.ts';
import { Save, CheckCircle, AlertCircle, ExternalLink, Download, RefreshCcw } from 'lucide-react';
import { PageHeader, buttonClass, cardClass } from '../components/PageHeader.tsx';
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
    const [openrouterModel, setOpenrouterModel] = useState('nvidia/llama-3.1-nemotron-70b-instruct');
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

    const openrouterModels = [
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', description: 'Größtes Modell, mit Web-Search' },
        { id: 'nvidia/nemotron-nano-9b-v2', name: 'Nemotron Nano 9B', description: 'Schnell & günstig' },
        { id: 'nvidia/nemotron-nano-12b-v2-vl', name: 'Nemotron Nano 12B VL', description: 'Mit Bildverständnis' }
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
                setOpenrouterModel(userSettings.openrouter_model || 'nvidia/llama-3.1-nemotron-70b-instruct');
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

    const providerOptions: Array<{ id: AIProvider; name: string; description: string }> = [
        { id: 'gemini', name: 'Google Gemini', description: 'Gemini-Modelle' },
        { id: 'openai', name: 'OpenAI', description: 'GPT-Modelle' },
        { id: 'openrouter', name: 'Nemotron', description: 'NVIDIA-Modelle' }
    ];
    const models = provider === 'gemini' ? geminiModels : provider === 'openai' ? openaiModels : openrouterModels;
    const selectedModel = provider === 'gemini' ? geminiModel : provider === 'openai' ? openaiModel : openrouterModel;
    const selectModel = (id: string) => {
        if (provider === 'gemini') setGeminiModel(id);
        else if (provider === 'openai') setOpenaiModel(id);
        else setOpenrouterModel(id);
    };

    const serverBadge =
        serverStatus === 'online'
            ? { label: 'Verbunden', className: 'bg-sage-light text-sage', dot: 'bg-sage' }
            : serverStatus === 'offline'
                ? { label: 'Nicht erreichbar', className: 'bg-burgundy-tint text-burgundy', dot: 'bg-burgundy' }
                : { label: 'Prüfe Verbindung …', className: 'bg-sand text-charcoal-soft', dot: 'bg-gold animate-pulse' };

    const statusRows: Array<{ label: string; value: string; good?: boolean }> = [
        {
            label: 'Installation',
            value: installState.isInstalled ? 'Bereits installiert' : installState.canPromptInstall ? 'Installierbar' : installState.isIOS ? 'Über Safari möglich' : 'Nicht verfügbar',
            good: installState.isInstalled || installState.canPromptInstall
        },
        {
            label: 'Service Worker',
            value: swState.updateAvailable ? 'Update verfügbar' : swState.offlineReady ? 'Offline bereit' : 'Initialisierung läuft',
            good: swState.offlineReady && !swState.updateAvailable
        },
        {
            label: 'Ausstehende Änderungen',
            value: `${syncState.write_queue_pending} offen${syncState.write_queue_failed ? `, ${syncState.write_queue_failed} fehlgeschlagen` : ''}`
        },
        {
            label: 'Ausstehende KI-Anfragen',
            value: `${syncState.ai_queue_pending} offen${syncState.ai_queue_failed ? `, ${syncState.ai_queue_failed} fehlgeschlagen` : ''}`
        }
    ];

    const sectionClass = `${cardClass} p-6 flex flex-col gap-5`;

    return (
        <div className="max-w-[880px] space-y-6 pb-20 animate-in fade-in duration-700">
            <PageHeader eyebrow="System" title="Einstellungen" description="KI-Recherche, Verbindung und Offline-Betrieb." />

            {/* KI-Recherche */}
            <section className={sectionClass}>
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-lg font-semibold text-charcoal">KI-Recherche</h2>
                    <p className="text-[13px] text-stone-gray">Alle Modelle laufen über OpenRouter, mit Web-Suche und automatischem Fallback.</p>
                </div>

                <fieldset className="flex flex-col gap-2">
                    <legend className="text-[13px] font-semibold mb-2">Anbieter</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {providerOptions.map((option) => {
                            const active = provider === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setProvider(option.id)}
                                    className={`min-h-16 px-3.5 py-3 rounded-[10px] text-left flex flex-col gap-0.5 transition-colors ${active ? 'border-2 border-burgundy bg-burgundy-wash' : 'border border-line-strong bg-white hover:bg-alabaster'}`}
                                >
                                    <span className="text-sm font-semibold text-charcoal">{option.name}</span>
                                    <span className="text-xs text-charcoal-soft">{option.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <fieldset className="flex flex-col gap-2">
                    <legend className="text-[13px] font-semibold mb-2">Modell</legend>
                    <div className="flex flex-col border border-line rounded-[10px] overflow-hidden">
                        {models.map((model, index) => {
                            const active = selectedModel === model.id;
                            return (
                                <button
                                    key={model.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => selectModel(model.id)}
                                    className={`min-h-[52px] px-3.5 py-2.5 flex items-center gap-3 text-left transition-colors ${index > 0 ? 'border-t border-line-soft' : ''} ${active ? 'bg-alabaster' : 'bg-white hover:bg-alabaster/60'}`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`w-[18px] h-[18px] shrink-0 rounded-full border-2 flex items-center justify-center ${active ? 'border-burgundy' : 'border-line-strong'}`}
                                    >
                                        {active && <span className="w-2 h-2 rounded-full bg-burgundy" />}
                                    </span>
                                    <span className="flex-1 text-sm font-semibold text-charcoal">{model.name}</span>
                                    <span className="text-[13px] text-charcoal-soft text-right">{model.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    {saveStatus === 'success' && (
                        <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sage">
                            <CheckCircle className="w-4 h-4" /> Gespeichert
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span role="alert" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-burgundy">
                            <AlertCircle className="w-4 h-4" /> Fehler beim Speichern
                        </span>
                    )}
                    <button onClick={handleSave} disabled={isSaving} className={buttonClass.primary}>
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Speichern …' : 'Speichern'}
                    </button>
                </div>
            </section>

            {/* API-Server */}
            <section className={sectionClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                        <h2 className="text-lg font-semibold text-charcoal">API-Server</h2>
                        <p className="text-[13px] text-stone-gray">Verbindung zum Backend für KI-Anfragen</p>
                    </div>
                    <span className={`inline-flex items-center gap-2 h-[30px] px-3 rounded-full text-[13px] font-semibold ${serverBadge.className}`}>
                        <span aria-hidden="true" className={`w-2 h-2 rounded-full ${serverBadge.dot}`} />
                        {serverBadge.label}
                    </span>
                </div>

                {serverStatus === 'offline' && (
                    <div className="bg-burgundy-wash border border-burgundy-tint p-4 rounded-[10px] text-sm flex gap-3">
                        <AlertCircle className="w-5 h-5 text-burgundy shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-2 min-w-0">
                            <p className="font-semibold text-burgundy-dark">Server nicht gestartet</p>
                            <p className="text-charcoal-soft">Der API-Server muss für KI-Funktionen laufen. Starte ihn mit:</p>
                            <code className="bg-white border border-line px-3 py-2 rounded-lg block font-mono text-xs overflow-x-auto">
                                cd server && npm install && npm run dev
                            </code>
                        </div>
                    </div>
                )}

                <div className="bg-alabaster p-4 rounded-[10px] text-sm flex flex-col gap-2">
                    <p className="font-semibold text-charcoal">API-Key konfigurieren</p>
                    <p className="text-charcoal-soft">
                        Gemini, GPT und Nemotron laufen über einen einzigen OpenRouter-Key. Trage ihn im Backend in <code className="font-mono text-xs bg-white border border-line px-1.5 py-0.5 rounded">server/.env</code> ein.
                    </p>
                    <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-burgundy hover:text-burgundy-dark w-fit"
                    >
                        OpenRouter-Key erstellen <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>
            </section>

            {/* Offline & Sync */}
            <section className={sectionClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                        <h2 className="text-lg font-semibold text-charcoal">Offline &amp; Synchronisation</h2>
                        <p className="text-[13px] text-stone-gray">Installation als App, Warteschlangen und manueller Abgleich</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {swState.updateAvailable && (
                            <button onClick={handleApplyUpdate} className={buttonClass.secondary}>Update laden</button>
                        )}
                        <button onClick={handleSyncNow} disabled={syncState.syncing} className={buttonClass.secondary}>
                            <RefreshCcw className={`w-4 h-4 ${syncState.syncing ? 'animate-spin' : ''}`} />
                            {syncState.syncing ? 'Synchronisiert …' : 'Jetzt synchronisieren'}
                        </button>
                    </div>
                </div>

                <dl className="flex flex-col">
                    {statusRows.map((row) => (
                        <div key={row.label} className="flex justify-between gap-3 py-3 border-t border-line-soft">
                            <dt className="text-charcoal">{row.label}</dt>
                            <dd className={`font-semibold text-right ${row.good ? 'text-sage' : 'text-charcoal'}`}>{row.value}</dd>
                        </div>
                    ))}
                </dl>

                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={handleInstallClick} disabled={installState.isInstalled} className={buttonClass.primary}>
                        <Download className="w-4 h-4" />
                        {installState.isInstalled ? 'Installiert' : 'App installieren'}
                    </button>
                    {installFeedback && <p role="status" className="text-sm text-burgundy">{installFeedback}</p>}
                </div>

                {installState.instructionsVisible && installState.isIOS && (
                    <div className="bg-alabaster rounded-[10px] p-4 flex flex-col gap-1.5">
                        <p className="font-semibold text-charcoal">Auf dem iPhone installieren</p>
                        <p className="text-charcoal-soft">In Safari auf <strong className="font-semibold">Teilen</strong> tippen und <strong className="font-semibold">Zum Home-Bildschirm</strong> wählen.</p>
                        <button onClick={hideIOSInstallInstructions} className="mt-1 w-fit text-[13px] font-semibold text-burgundy">
                            Verstanden
                        </button>
                    </div>
                )}

                <p className="text-xs text-stone-gray">
                    Letzter Sync: {syncState.last_sync_completed_at ? new Date(syncState.last_sync_completed_at).toLocaleString('de-DE') : '—'}
                    {syncState.last_sync_error ? ` · Fehler: ${syncState.last_sync_error}` : ''}
                </p>
            </section>
        </div>
    );
};
