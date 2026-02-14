
import React, { useState } from 'react';
import { Wine, Mail, Lock, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { storageService } from '../services/storage.ts';

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
    setIsDemoLoading(true);
    try {
      const user = await storageService.signInAnonymously();
      if (user) onLogin(user);
    } catch {
      setError("Demo-Modus fehlgeschlagen.");
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-alabaster flex items-center justify-center p-6 relative overflow-hidden">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-burgundy rounded-2xl shadow-burgundy-glow mb-6">
            <Wine className="w-8 h-8 text-alabaster" />
          </div>
          <h1 className="font-serif text-4xl font-bold text-burgundy mb-2">Grand Cru Vault</h1>
          <p className="text-stone-gray font-medium tracking-wide">Premium Kellerverwaltung & Asset-Portfolio.</p>
        </div>

        <div className="bg-white border-2 border-burgundy/5 p-10 rounded-[2.5rem] shadow-premium relative group">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 rounded-xl bg-red-50 text-red-600 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-xs font-bold leading-relaxed">{error}</p>
              </div>
            )}
            {success && (
              <div className="p-4 rounded-xl bg-sage/10 text-sage flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <p className="text-xs font-bold leading-relaxed">{success}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-1">E-Mail Adresse</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
                <input 
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@domain.com"
                  className="w-full pl-12 pr-4 py-4 bg-alabaster border-2 border-transparent focus:border-burgundy/20 rounded-2xl focus:outline-none font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-1">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
                <input 
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-4 bg-alabaster border-2 border-transparent focus:border-burgundy/20 rounded-2xl focus:outline-none font-medium"
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full py-5 bg-burgundy hover:bg-burgundy-light text-white font-black rounded-2xl shadow-xl uppercase tracking-[0.2em] text-xs">
              {isLoading ? "Lädt..." : (isSignUp ? 'KONTO ERSTELLEN' : 'ZUGANG GEWÄHREN')}
            </button>

            <button type="button" onClick={handleDemoMode} disabled={isDemoLoading} className="w-full py-4 bg-white border border-burgundy/10 text-burgundy font-black rounded-2xl flex items-center justify-center gap-3 uppercase tracking-[0.15em] text-[10px]">
              <Sparkles className="w-4 h-4 text-gold" /> Demo-Modus nutzen
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-alabaster text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-bold text-stone-gray hover:text-burgundy transition-colors uppercase tracking-widest"
            >
              {isSignUp ? 'Bereits Mitglied? Login' : 'Neuer Sammler? Account erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
