import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant: 'burgundy' | 'gold' | 'sage' | 'bordeaux';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant }) => {
  const styles = {
    burgundy: 'bg-burgundy/10 text-burgundy border-burgundy/20',
    gold: 'bg-gold/10 text-gold border-gold/20',
    sage: 'bg-sage/10 text-sage border-sage/20',
    bordeaux: 'bg-burgundy text-white border-transparent'
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${styles[variant]}`}>
      {children}
    </span>
  );
};