import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import type { Booking } from '../types';
import { BookingProvider, useBooking } from './BookingContext';

function wrapper({ children }: PropsWithChildren) {
  return <BookingProvider>{children}</BookingProvider>;
}

const initialDraft = { brand: '', model: '', plate: '', photos: [], distanceKm: 10 };

describe('BookingContext', () => {
  it('démarre avec le brouillon initial et sans course active', () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    expect(result.current.active).toBeNull();
    expect(result.current.draft).toEqual(initialDraft);
  });

  it('fusionne les mises à jour partielles du brouillon sans écraser le reste', () => {
    const { result } = renderHook(() => useBooking(), { wrapper });

    act(() => result.current.updateDraft({ brand: 'Renault' }));
    expect(result.current.draft).toMatchObject({ brand: 'Renault', model: '' });

    act(() => result.current.updateDraft({ model: 'Clio' }));
    expect(result.current.draft).toMatchObject({ brand: 'Renault', model: 'Clio' });
  });

  it('réinitialise le brouillon à son état initial', () => {
    const { result } = renderHook(() => useBooking(), { wrapper });

    act(() => result.current.updateDraft({ brand: 'Renault', distanceKm: 42 }));
    act(() => result.current.resetDraft());

    expect(result.current.draft).toEqual(initialDraft);
  });

  it('mémorise et efface la course active', () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    const booking = { id: 'booking-1' } as Booking;

    act(() => result.current.setActive(booking));
    expect(result.current.active).toBe(booking);

    act(() => result.current.setActive(null));
    expect(result.current.active).toBeNull();
  });

  it('lève une erreur si utilisé hors du provider', () => {
    expect(() => renderHook(() => useBooking())).toThrow('BookingProvider manquant');
  });
});
