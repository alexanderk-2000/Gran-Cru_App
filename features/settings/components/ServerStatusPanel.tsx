import { AlertCircle, ExternalLink, Server } from 'lucide-react';
import type { ServerStatus } from '../hooks/useServerStatus.ts';

export const ServerStatusPanel = ({ serverStatus }: { serverStatus: ServerStatus }) => (
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
      <div
        className={`w-3 h-3 rounded-full ${
          serverStatus === 'online' ? 'bg-green-500' : serverStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
        }`}
      />
      <span className="font-bold text-charcoal">
        {serverStatus === 'online' ? 'Server läuft' : serverStatus === 'offline' ? 'Server nicht erreichbar' : 'Prüfe Verbindung...'}
      </span>
    </div>

    {serverStatus === 'offline' && (
      <div className="mt-6 bg-red-50 p-6 rounded-2xl border border-red-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-red-800 mb-2">Server nicht gestartet</p>
            <p className="text-red-700 mb-3">Der API-Server muss für KI-Funktionen laufen. Starte ihn mit:</p>
            <code className="bg-red-100 px-3 py-2 rounded-lg block font-mono text-xs">cd server && npm install && npm run dev</code>
          </div>
        </div>
      </div>
    )}

    <div className="mt-6 bg-alabaster/40 p-6 rounded-2xl border border-burgundy/5">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <div className="text-sm text-stone-gray">
          <p className="font-bold text-charcoal mb-1">API Key konfigurieren</p>
          <p className="mb-2">Gemini, GPT und Nemotron laufen alle über einen einzigen OpenRouter-Key. Trage ihn sicher im Backend ein:</p>
          <code className="bg-charcoal/5 px-3 py-2 rounded-lg block font-mono text-xs mb-3">server/.env</code>
          <div className="flex gap-4 mt-3">
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-burgundy hover:underline flex items-center gap-1">
              OpenRouter Key erstellen <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
);
