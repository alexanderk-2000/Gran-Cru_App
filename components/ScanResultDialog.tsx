import React, { useMemo } from 'react';
import { WineCaptureForm } from '../features/wine-capture/WineCaptureForm.tsx';
import type { ScanResult } from '../services/scanner.ts';
import type { Wine } from '../types.ts';

interface ScanResultDialogProps {
  open: boolean;
  result: ScanResult | null;
  onClose: () => void;
  onSaved: () => void;
  wishlist?: boolean;
  targetSubcellar?: string;
  existingWines?: Wine[];
}

export const ScanResultDialog: React.FC<ScanResultDialogProps> = ({
  open,
  result,
  onClose,
  onSaved,
  wishlist = false,
  targetSubcellar = '',
  existingWines = []
}) => {
  const initialData = useMemo<Partial<Wine> | undefined>(() => {
    if (!result) return undefined;
    return {
      name: result.name || result.raw || '',
      producer: result.producer || '',
      vintage: result.vintage || new Date().getFullYear(),
      barcode: result.type === 'barcode' ? result.raw || '' : ''
    };
  }, [result]);

  if (!result) return null;

  return (
    <WineCaptureForm
      open={open}
      mode="create"
      initialData={initialData}
      existingWines={existingWines}
      wishlist={wishlist}
      targetSubcellar={targetSubcellar}
      title={result.type === 'barcode' ? 'Barcode erkannt' : 'Etikett erkannt'}
      subtitle={result.raw}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
};
