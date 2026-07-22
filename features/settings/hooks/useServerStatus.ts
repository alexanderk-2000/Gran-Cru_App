import { useEffect, useState } from 'react';

export type ServerStatus = 'checking' | 'online' | 'offline';

export const useServerStatus = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    let active = true;
    const checkServerStatus = async () => {
      try {
        const response = await fetch('/api/health');
        if (!active) return;
        setServerStatus(response.ok ? 'online' : 'offline');
      } catch {
        if (active) setServerStatus('offline');
      }
    };
    void checkServerStatus();
    return () => {
      active = false;
    };
  }, []);

  return serverStatus;
};
