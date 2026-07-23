import { useState } from 'react';
import { Occasion, RepeatRule } from '../../../types.ts';
import { storageService } from '../../../services/storage.ts';

export const useOccasionForm = (onSavedSeries: (occasion: Occasion) => Promise<void>, setError: (message: string | null) => void) => {
  const [showForm, setShowForm] = useState(false);
  const [editingOccasionId, setEditingOccasionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [drinkAnchorDate, setDrinkAnchorDate] = useState('');
  const [repeatRule, setRepeatRule] = useState<RepeatRule>('none');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [maxOccurrences, setMaxOccurrences] = useState('');

  const resetForm = () => {
    setEditingOccasionId(null);
    setTitle('');
    setStartDate('');
    setEndDate('');
    setDrinkAnchorDate('');
    setRepeatRule('none');
    setRepeatInterval(1);
    setMaxOccurrences('');
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (occasion: Occasion) => {
    setEditingOccasionId(occasion.id);
    setTitle(occasion.title || '');
    setStartDate(occasion.start_date || '');
    setEndDate(occasion.end_date || '');
    setDrinkAnchorDate(occasion.drink_anchor_date || occasion.start_date || '');
    setRepeatRule(occasion.repeat_rule || 'none');
    setRepeatInterval(Math.max(1, occasion.repeat_interval || 1));
    setMaxOccurrences(occasion.max_occurrences ? String(occasion.max_occurrences) : '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !startDate || !endDate) {
      const message = 'Titel, Startdatum und Enddatum sind erforderlich.';
      setError(message);
      alert(message);
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      const message = 'Startdatum darf nicht nach Enddatum liegen.';
      setError(message);
      alert(message);
      return;
    }

    if (!Number.isFinite(repeatInterval) || repeatInterval < 1) {
      const message = 'Intervall muss mindestens 1 sein.';
      setError(message);
      alert(message);
      return;
    }

    const maxCountParsed = maxOccurrences.trim() ? Number(maxOccurrences) : null;
    if (maxCountParsed !== null && (!Number.isFinite(maxCountParsed) || maxCountParsed < 1)) {
      const message = 'Max. Wiederholungen muss größer als 0 sein.';
      setError(message);
      alert(message);
      return;
    }

    try {
      const saved = await storageService.saveOccasion({
        id: editingOccasionId ?? undefined,
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        drink_anchor_date: drinkAnchorDate || startDate,
        repeat_rule: repeatRule,
        repeat_interval: repeatInterval,
        repeat_weekdays: null,
        max_occurrences: maxCountParsed
      });
      setShowForm(false);
      resetForm();
      await onSavedSeries(saved);
    } catch (err: any) {
      const message = err?.message || 'Fehler beim Planen der Serie.';
      setError(message);
      alert(message);
    }
  };

  return {
    showForm,
    setShowForm,
    editingOccasionId,
    title,
    setTitle,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    drinkAnchorDate,
    setDrinkAnchorDate,
    repeatRule,
    setRepeatRule,
    repeatInterval,
    setRepeatInterval,
    maxOccurrences,
    setMaxOccurrences,
    openCreateForm,
    openEditForm,
    handleSubmit
  };
};

export type UseOccasionFormResult = ReturnType<typeof useOccasionForm>;
