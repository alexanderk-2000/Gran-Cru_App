import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Wine } from '../../../types.ts';
import { storageService } from '../../../services/storage.ts';
import { normalizeSubcellar } from '../../../domain/wine/normalization.ts';
import { buildPocketSummaries } from '../inventorySelectors.ts';
import { MAIN_CELLAR_FILTER } from '../constants.ts';

export const usePockets = (wines: Wine[], wishlistOnly: boolean, onWineUpdate: () => void) => {
  const [storedPocketNames, setStoredPocketNames] = useState<string[]>([]);
  const [targetSubcellar, setTargetSubcellar] = useState('');
  const [isPocketModalOpen, setIsPocketModalOpen] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [isPocketSaving, setIsPocketSaving] = useState(false);
  const [draggedWineId, setDraggedWineId] = useState<string | null>(null);
  const [dropTargetPocketId, setDropTargetPocketId] = useState<string | null>(null);
  const [isMovingWine, setIsMovingWine] = useState(false);

  const refreshStoredPockets = useCallback(async () => {
    try {
      const pockets = await storageService.getCellarPockets();
      setStoredPocketNames(pockets.map((pocket) => normalizeSubcellar(pocket.name)).filter((name) => name.length > 0));
    } catch {
      setStoredPocketNames([]);
    }
  }, []);

  useEffect(() => {
    void refreshStoredPockets();
  }, [refreshStoredPockets]);

  const availableSubcellars = useMemo(() => {
    const set = new Set<string>();
    for (const pocketName of storedPocketNames) {
      if (pocketName) set.add(pocketName);
    }
    for (const wine of wines) {
      if (wine.wishlist !== wishlistOnly) continue;
      const name = normalizeSubcellar(wine.subcellar);
      if (!name) continue;
      set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }, [storedPocketNames, wines, wishlistOnly]);

  const pocketSummaries = useMemo(
    () => buildPocketSummaries(wines, wishlistOnly, availableSubcellars),
    [wines, wishlistOnly, availableSubcellars]
  );

  const createPocket = useCallback(async (): Promise<string | undefined> => {
    const normalizedName = normalizeSubcellar(newPocketName);
    if (!normalizedName || isPocketSaving) return undefined;

    setIsPocketSaving(true);
    try {
      const created = await storageService.createCellarPocket(normalizedName);
      if (!created) {
        alert('Pocket konnte nicht gespeichert werden. Bitte Datenbank-Migration ausführen.');
        return undefined;
      }
      await refreshStoredPockets();
      setTargetSubcellar(normalizedName);
      setNewPocketName('');
      setIsPocketModalOpen(false);
      return normalizedName;
    } catch (error: any) {
      alert(error?.message || 'Pocket konnte nicht angelegt werden.');
      return undefined;
    } finally {
      setIsPocketSaving(false);
    }
  }, [newPocketName, isPocketSaving, refreshStoredPockets]);

  const getPocketIdForWine = useCallback((wine: Wine): string => normalizeSubcellar(wine.subcellar) || MAIN_CELLAR_FILTER, []);

  const moveWineToPocket = useCallback(
    async (wineId: string, targetPocketId: string) => {
      if (targetPocketId === 'All') return;
      const wine = wines.find((entry) => entry.id === wineId);
      if (!wine) return;

      const currentPocketId = getPocketIdForWine(wine);
      if (currentPocketId === targetPocketId) return;

      setIsMovingWine(true);
      try {
        await storageService.transferWine(wine.id, targetPocketId === MAIN_CELLAR_FILTER ? '' : targetPocketId);
        await onWineUpdate();
      } catch (error: any) {
        alert(error?.message || 'Verschieben in Pocket fehlgeschlagen.');
      } finally {
        setIsMovingWine(false);
      }
    },
    [wines, getPocketIdForWine, onWineUpdate]
  );

  const handleWineDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>, wine: Wine) => {
      setDraggedWineId(wine.id);
      setDropTargetPocketId(getPocketIdForWine(wine));
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', wine.id);
    },
    [getPocketIdForWine]
  );

  const handleWineDragEnd = useCallback(() => {
    setDraggedWineId(null);
    setDropTargetPocketId(null);
  }, []);

  const handlePocketDragOver = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, pocketId: string) => {
      if (!draggedWineId || pocketId === 'All') return;
      event.preventDefault();
      if (dropTargetPocketId !== pocketId) {
        setDropTargetPocketId(pocketId);
      }
    },
    [draggedWineId, dropTargetPocketId]
  );

  const handlePocketDragEnter = useCallback(
    (pocketId: string) => {
      if (draggedWineId && pocketId !== 'All') setDropTargetPocketId(pocketId);
    },
    [draggedWineId]
  );

  const handlePocketDragLeave = useCallback((pocketId: string) => {
    setDropTargetPocketId((prev) => (prev === pocketId ? null : prev));
  }, []);

  const handlePocketDrop = useCallback(
    async (event: React.DragEvent<HTMLButtonElement>, pocketId: string) => {
      event.preventDefault();
      if (!draggedWineId || pocketId === 'All') return;
      await moveWineToPocket(draggedWineId, pocketId);
      setDraggedWineId(null);
      setDropTargetPocketId(null);
    },
    [draggedWineId, moveWineToPocket]
  );

  return {
    availableSubcellars,
    pocketSummaries,
    targetSubcellar,
    setTargetSubcellar,
    isPocketModalOpen,
    setIsPocketModalOpen,
    newPocketName,
    setNewPocketName,
    isPocketSaving,
    createPocket,
    draggedWineId,
    dropTargetPocketId,
    isMovingWine,
    handleWineDragStart,
    handleWineDragEnd,
    handlePocketDragOver,
    handlePocketDragEnter,
    handlePocketDragLeave,
    handlePocketDrop
  };
};

export type UsePocketsResult = ReturnType<typeof usePockets>;
