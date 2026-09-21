import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Booking, BookingDraft } from '../types';

const initialDraft: BookingDraft = { brand: '', model: '', plate: '', photos: [], distanceKm: 10, serviceType: 'TRANSPORT' };
type BookingContextValue = {
  draft: BookingDraft; active: Booking | null;
  updateDraft(data: Partial<BookingDraft>): void;
  setActive(booking: Booking | null): void;
  resetDraft(): void;
};
const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: React.PropsWithChildren) {
  const [draft, setDraft] = useState<BookingDraft>(initialDraft);
  const [active, setActive] = useState<Booking | null>(null);
  const value = useMemo(() => ({ draft, active, updateDraft: (data: Partial<BookingDraft>) => setDraft((old) => ({ ...old, ...data })), setActive, resetDraft: () => setDraft(initialDraft) }), [draft, active]);
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('BookingProvider manquant');
  return value;
}
