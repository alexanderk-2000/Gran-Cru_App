import React from 'react';
import { useServerStatus } from './hooks/useServerStatus.ts';
import { usePwaSyncStatus } from './hooks/usePwaSyncStatus.ts';
import { ServerStatusPanel } from './components/ServerStatusPanel.tsx';
import { PwaSyncPanel } from './components/PwaSyncPanel.tsx';
import { AiProviderSettingsForm } from './components/AiProviderSettingsForm.tsx';

export const Settings: React.FC = () => {
  const serverStatus = useServerStatus();
  const pwaSyncStatus = usePwaSyncStatus();

  return (
    <div className="min-h-screen bg-alabaster/40 pt-16 pb-40 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <h1 className="font-serif text-5xl font-bold text-charcoal mb-4">Einstellungen</h1>
          <p className="text-stone-gray text-lg">Konfiguriere deine persönlichen KI-Einstellungen</p>
        </div>

        <ServerStatusPanel serverStatus={serverStatus} />
        <PwaSyncPanel status={pwaSyncStatus} />
        <AiProviderSettingsForm />
      </div>
    </div>
  );
};
