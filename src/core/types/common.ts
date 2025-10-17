import type { ManualEditorState } from '../manual/types';
import type { ManualLayoutSnapshot, StoredStrategy } from '../storage/schema';
import type { ExtractionStrategy } from './strategy';
import type { PageContext, View } from './view';

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
  | { type: 'STOP_MANUAL_MODE' }
  | { type: 'MANUAL_GET_STATE' }
  | { type: 'MANUAL_SET_TEXT'; value: string }
  | { type: 'MANUAL_SET_ATTRIBUTE'; name: string; value: string }
  | { type: 'MANUAL_SET_STYLE'; property: string; value: string }
  | { type: 'MANUAL_SELECT_PARENT' }
  | { type: 'MANUAL_SELECT_CHILD'; index: number }
  | { type: 'MANUAL_RESET' }
  | { type: 'MANUAL_SAVE_LAYOUT' }
  | { type: 'OPEN_SIDE_PANEL'; tabId: number }
  | { type: 'MANUAL_STATE_UPDATED'; payload: ManualEditorState };
