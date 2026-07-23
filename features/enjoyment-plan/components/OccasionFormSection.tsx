import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { RepeatRule } from '../../../types.ts';
import type { UseOccasionFormResult } from '../hooks/useOccasionForm.ts';

interface OccasionFormSectionProps {
  form: UseOccasionFormResult;
}

export const OccasionFormSection: React.FC<OccasionFormSectionProps> = ({ form }) => (
  <section className="bg-white border border-burgundy/10 p-10 rounded-[2.5rem] shadow-premium animate-in slide-in-from-top-4 duration-500">
    <div className="flex items-center gap-3 mb-10">
      <Sparkles className="text-gold w-6 h-6" />
      <h3 className="font-serif text-3xl font-bold text-charcoal">Event-Serie konfigurieren</h3>
    </div>
    <form onSubmit={form.handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Titel der Serie</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
          placeholder="z.B. Monatliche Raritätenprobe"
          className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-medium"
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Startdatum</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => {
              const nextStart = e.target.value;
              form.setStartDate(nextStart);
              form.setDrinkAnchorDate((prev) => (prev ? prev : nextStart));
            }}
            className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Enddatum</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => form.setEndDate(e.target.value)}
            className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Immer trinken am (optional)</label>
        <input
          type="date"
          value={form.drinkAnchorDate}
          onChange={(e) => form.setDrinkAnchorDate(e.target.value)}
          className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl"
        />
        <p className="text-[11px] text-stone-gray ml-2">
          Steuert den wiederkehrenden Trinktag bei monatlicher/jährlicher Wiederholung.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Wiederholung</label>
          <select
            value={form.repeatRule}
            onChange={(e) => form.setRepeatRule(e.target.value as RepeatRule)}
            className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl font-bold"
          >
            <option value="none">Keine (Einmalig)</option>
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Intervall (Jede X-te Einheit)</label>
          <input
            type="number"
            min="1"
            value={form.repeatInterval}
            onChange={(e) => form.setRepeatInterval(Math.max(1, Number(e.target.value || 1)))}
            className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl font-bold"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Max. Wiederholungen (optional)</label>
        <input
          type="number"
          min="1"
          value={form.maxOccurrences}
          onChange={(e) => form.setMaxOccurrences(e.target.value)}
          placeholder="leer = bis Enddatum"
          className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl font-bold"
        />
      </div>

      <button
        type="submit"
        className="w-full py-5 bg-gold text-white font-black rounded-2xl shadow-xl hover:bg-gold-bright transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs"
      >
        <span>{form.editingOccasionId ? 'Termine aktualisieren' : 'Termine erstellen'}</span>
        <ArrowRight className="w-5 h-5" />
      </button>
    </form>
  </section>
);
