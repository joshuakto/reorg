export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export const Ok = <T>(data: T): Result<T> => ({ success: true, data });
export const Err = <E>(error: E): Result<never, E> => ({ success: false, error });

export type Command =
  | { type: 'CAPTURE_PAGE'; tabId: number }
  | { type: 'GENERATE_STRATEGY'; context: PageContext }
  | { type: 'EXECUTE_STRATEGY'; strategy: ExtractionStrategy }
  | { type: 'DISPLAY_VIEWS'; views: View[] }
  | { type: 'SAVE_STRATEGY'; domain: string; strategy: StoredStrategy }
  | { type: 'SAVE_MANUAL_LAYOUT'; layout: ManualLayoutSnapshot }
  | { type: 'GET_MANUAL_LAYOUT'; domain: string }
  | { type: 'GET_DOM_STRUCTURE' }
  | { type: 'START_MANUAL_MODE' }
  | { type: 'STOP_MANUAL_MODE' };

import type { ExtractionStrategy } from './strategy';
import type { PageContext, View } from './view';
import type { ManualLayoutSnapshot, StoredStrategy } from '../storage/schema';
