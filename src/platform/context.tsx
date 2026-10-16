import { createContext, use } from 'react';
import type { Platform } from './types';

/** The device under the tutor. main.tsx provides the Android platform. */
export const PlatformContext = createContext<Platform | undefined>(undefined);

export function usePlatform(): Platform {
  const platform = use(PlatformContext);
  if (!platform) throw new Error('The tutor needs a <PlatformContext> provider.');
  return platform;
}
