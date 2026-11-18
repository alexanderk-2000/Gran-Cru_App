
import React, { useState } from 'react';
import { Wine, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { storageService } from '../services/storage.ts';
import { isConfigured } from '../services/supabase.ts';

interface AuthProps {
  onLogin: (user: any) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isLengthValid = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const isPasswordStrong = isLengthValid && (hasNumber || hasSpecial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError("Bitte füllen Sie alle Felder aus.");
      return;
    }

    if (isSignUp && !isPasswordStrong) {
      setError("Das Passwort erfüllt nicht die Sicherheitsanforderungen.");
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        await storageService.signUp(email, password);
        setSuccess("Konto erstellt! Bitte prüfen Sie Ihre E-Mails.");
        setIsSignUp(false);
        setPassword('');
      } else {
        const user = await storageService.signIn(email, password);
        if (user) onLogin(user);
      }
    } catch (err: any) {
      setError(err.message || "Authentifizierungsfehler.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoMode = async () => {
    if (!isConfigured) {
      setError("Demo-Modus nicht verfügbar: Supabase ist nicht konfiguriert. Bitte prüfe deine Umgebungsvariablen.");
      return;
    }
    setIsDemoLoading(true);
    try {
      const user = await storageService.signInAnonymously();
      if (user) onLogin(user);
    } catch (err: any) {
      setError(err.message || "Demo-Modus fehlgeschlagen.");
    } finally {
      setIsDemoLoading(false);
    }
  };

  const inputClass =
    'w-full h-12 px-3.5 bg-white border border-line-strong rounded-[10px] text-[15px] text-charcoal placeholder:text-stone-gray focus:outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/15';

  return (
    <div className="min-h-screen bg-alabaster flex flex-wrap text-charcoal">
      <section className="flex-[1_1_420px] flex flex-col justify-between gap-12 bg-burgundy-dark text-alabaster px-6 py-10 md:p-16">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl border border-alabaster/35 flex items-center justify-center">
            <Wine className="w-5 h-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <span className="font-serif text-[22px] font-bold leading-none">Grand Cru</span>
            <span className="text-[11px] tracking-[0.14em] uppercase text-[#E6D9C3]">Vault &amp; Portfolio</span>
          </span>
        </div>
        <div className="flex flex-col gap-5 max-w-[460px]">
          <h1 className="font-serif text-4xl md:text-[52px] font-semibold leading-[1.08]">
            <span className="sr-only">Grand Cru Vault – </span>Jede Flasche zur richtigen Zeit.
          </h1>
          <p className="text-base text-[#EADFD0] max-w-[40ch]">
            Keller verwalten, Trinkfenster im Blick behalten und Anlässe planen. Mit KI-Recherche zu jedem Etikett.
          </p>
        </div>
        <ul className="hidden md:flex flex-col gap-2.5 text-sm text-[#EADFD0]">
          {['Etikett scannen, Daten automatisch ergänzen', 'Reife-Zeitachse für den ganzen Keller', 'Funktioniert offline, synchronisiert später'].map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-gold" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex-[1_1_420px] flex items-center justify-center px-4 py-10 md:p-16">
        <div className="w-full max-w-[400px] flex flex-col gap-5 animate-in fade-in duration-700">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-serif text-[32px] font-semibold leading-tight">{isSignUp ? 'Konto erstellen' : 'Willkommen zurück'}</h2>
            <p className="text-charcoal-soft">
              {isSignUp ? 'In einer Minute startklar. Ihr Keller wird sicher synchronisiert.' : 'Melden Sie sich an, um Ihren Keller zu öffnen.'}
            </p>
          </div>

          <div role="group" aria-label="Modus" className="grid grid-cols-2 p-1 rounded-xl bg-sand">
            <button
              type="button"
              aria-pressed={!isSignUp}
              onClick={() => { setIsSignUp(false); setError(null); }}
              className={`h-10 rounded-[9px] text-sm font-semibold ${!isSignUp ? 'bg-white text-charcoal' : 'text-charcoal-soft'}`}
            >
              Anmelden
            </button>
            <button
              type="button"
              aria-pressed={isSignUp}
              onClick={() => { setIsSignUp(true); setError(null); }}
              className={`h-10 rounded-[9px] text-sm font-semibold ${isSignUp ? 'bg-white text-charcoal' : 'text-charcoal-soft'}`}
            >
              Konto erstellen
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {error && (
              <div role="alert" className="p-3.5 rounded-[10px] bg-burgundy-tint text-burgundy-dark flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
            {success && (
              <div role="status" className="p-3.5 rounded-[10px] bg-sage-light text-sage flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <p className="text-sm">{success}</p>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">E-Mail-Adresse</span>
              <input
                type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de"
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Passwort</span>
              <input
                type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {isSignUp && (
                <span className="text-xs text-stone-gray">
                  Mindestens 8 Zeichen und eine Zahl oder ein Sonderzeichen.
                  {password.length > 0 && (isPasswordStrong ? <span className="text-sage font-semibold"> Passt.</span> : null)}
                </span>
              )}
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="h-[50px] rounded-[10px] bg-burgundy hover:bg-burgundy-dark text-white font-semibold text-[15px] transition-colors disabled:opacity-60"
            >
              {isLoading ? 'Lädt …' : isSignUp ? 'Konto erstellen' : 'Anmelden'}
            </button>
          </form>

          <div className="flex items-center gap-3 text-[13px] text-stone-gray">
            <span className="flex-1 h-px bg-line" />oder<span className="flex-1 h-px bg-line" />
          </div>

          <button
            type="button"
            onClick={handleDemoMode}
            disabled={isDemoLoading}
            className="h-12 rounded-[10px] border border-line-strong bg-white text-charcoal font-semibold text-sm flex items-center justify-center gap-2 hover:bg-alabaster transition-colors disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4 text-gold-dim" />
            {isDemoLoading ? 'Demo startet …' : 'Demo-Modus nutzen'}
          </button>
          <p className="text-xs text-stone-gray text-center">Der Demo-Modus startet einen Gast-Keller ohne Registrierung.</p>
        </div>
      </section>
    </div>
  );
};
