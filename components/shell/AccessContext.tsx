'use client';

// The account's resolved features, handed to every client component under the shell.
//
// The chart is deep: the rail, the palette, the studies menu and the chart-type menu all sit several
// layers under the page. A context keeps that thread invisible to components that never ask, and one
// provider at the shell is the only place that reads the server's answer. `undefined` means "not
// filtered", which is what unit tests and the marketing pages get.

import { createContext, useContext, type ReactNode } from 'react';
import type { Feature } from '@/lib/plans';

const AccessContext = createContext<readonly Feature[] | undefined>(undefined);

export const AccessProvider = ({ features, children }: { features: readonly Feature[]; children: ReactNode }) => (
    <AccessContext.Provider value={features}>{children}</AccessContext.Provider>
);

/** The features the signed-in account holds, or `undefined` when nothing is filtering. */
export const useFeatures = (): readonly Feature[] | undefined => useContext(AccessContext);
