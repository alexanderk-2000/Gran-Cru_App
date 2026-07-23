import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Cpu, Save, Sparkles } from 'lucide-react';
import { settingsService, type AIProvider } from '../../../services/settings.ts';
import { geminiModels, openaiModels, openrouterModels } from '../aiModelCatalog.ts';

export const AiProviderSettingsForm = () => {
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [geminiModel, setGeminiModel] = useState('gemini-pro-latest');
  const [openaiModel, setOpenaiModel] = useState('gpt-5.2');
  const [openrouterModel, setOpenrouterModel] = useState('nvidia/llama-3.1-nemotron-70b-instruct');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const userSettings = await settingsService.getUserSettings();
        if (!active || !userSettings) return;
        setProvider(userSettings.ai_provider || 'openai');
        setGeminiModel(userSettings.gemini_model || 'gemini-pro-latest');
        setOpenaiModel(userSettings.openai_model || 'gpt-5.2');
        setOpenrouterModel(userSettings.openrouter_model || 'nvidia/llama-3.1-nemotron-70b-instruct');
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

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

  const models = provider === 'gemini' ? geminiModels : provider === 'openai' ? openaiModels : openrouterModels;
  const selectedModel = provider === 'gemini' ? geminiModel : provider === 'openai' ? openaiModel : openrouterModel;
  const setSelectedModel = provider === 'gemini' ? setGeminiModel : provider === 'openai' ? setOpenaiModel : setOpenrouterModel;

  return (
    <>
      <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
          <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-charcoal">KI-Provider</h2>
            <p className="text-sm text-stone-gray mt-1">Wähle dein bevorzugtes Modell - alle laufen über OpenRouter</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setProvider('gemini')}
            className={`p-6 rounded-2xl border-2 transition-all ${
              provider === 'gemini' ? 'border-burgundy bg-burgundy/5' : 'border-burgundy/10 hover:border-burgundy/30'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-charcoal">Google Gemini</h3>
              {provider === 'gemini' && <CheckCircle className="w-5 h-5 text-burgundy" />}
            </div>
            <p className="text-sm text-stone-gray text-left">Gemini Modelle via OpenRouter (Web-Search, Fallback aktiv)</p>
          </button>

          <button
            onClick={() => setProvider('openai')}
            className={`p-6 rounded-2xl border-2 transition-all ${
              provider === 'openai' ? 'border-burgundy bg-burgundy/5' : 'border-burgundy/10 hover:border-burgundy/30'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-charcoal">OpenAI</h3>
              {provider === 'openai' && <CheckCircle className="w-5 h-5 text-burgundy" />}
            </div>
            <p className="text-sm text-stone-gray text-left">GPT Modelle via OpenRouter (Web-Search, Fallback aktiv)</p>
          </button>

          <button
            onClick={() => setProvider('openrouter')}
            className={`p-6 rounded-2xl border-2 transition-all ${
              provider === 'openrouter' ? 'border-burgundy bg-burgundy/5' : 'border-burgundy/10 hover:border-burgundy/30'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-charcoal">Nemotron</h3>
              {provider === 'openrouter' && <CheckCircle className="w-5 h-5 text-burgundy" />}
            </div>
            <p className="text-sm text-stone-gray text-left">NVIDIA Nemotron via OpenRouter (Web-Search, Fallback aktiv)</p>
          </button>
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
        <div className="flex items-center gap-4 mb-8 pb-6 border-alabaster">
          <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-charcoal">KI-Modell</h2>
            <p className="text-sm text-stone-gray mt-1">
              Wähle das {provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'Nemotron'}-Modell für Weinanalysen
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {models.map((model) => {
            const isSelected = selectedModel === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`w-full p-6 rounded-2xl border-2 transition-all text-left ${
                  isSelected ? 'border-burgundy bg-burgundy/5' : 'border-burgundy/10 hover:border-burgundy/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-charcoal mb-1">{model.name}</h3>
                    <p className="text-sm text-stone-gray">{model.description}</p>
                  </div>
                  {isSelected && <CheckCircle className="w-6 h-6 text-burgundy shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

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
    </>
  );
};
