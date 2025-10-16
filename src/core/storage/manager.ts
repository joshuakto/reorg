import { Err, Ok, type Result } from '../types/common';
import type { StoredStrategy } from './schema';

export class StorageManager {
  private readonly storageArea: chrome.storage.StorageArea;

  constructor(storageArea: chrome.storage.StorageArea = chrome.storage.local) {
    this.storageArea = storageArea;
  }

  async saveStrategy(domain: string, strategy: StoredStrategy): Promise<Result<void>> {
    try {
      await this.storageArea.set({ [`strategy:${domain}`]: strategy });
      return Ok(undefined);
    } catch (error) {
      return Err(error as Error);
    }
  }

  async getStrategy(domain: string): Promise<Result<StoredStrategy | null>> {
    try {
      const result = await this.storageArea.get(`strategy:${domain}`);
      const strategy = result[`strategy:${domain}`] ?? null;
      return Ok(strategy);
    } catch (error) {
      return Err(error as Error);
    }
  }

  async updateMetadata(
    domain: string,
    update: Partial<StoredStrategy['metadata']>,
  ): Promise<Result<void>> {
    const strategyResult = await this.getStrategy(domain);
    if (!strategyResult.success || !strategyResult.data) {
      return Err(new Error('Strategy not found'));
    }

    const updated: StoredStrategy = {
      ...strategyResult.data,
      metadata: { ...strategyResult.data.metadata, ...update },
    };

    return this.saveStrategy(domain, updated);
  }

  async listStrategies(): Promise<Result<Array<[string, StoredStrategy]>>> {
    try {
      const all = await this.storageArea.get(null);
      const strategies = Object.entries(all)
        .filter(([key]) => key.startsWith('strategy:'))
        .map(([key, value]) => [key.replace('strategy:', ''), value] as [string, StoredStrategy]);
      return Ok(strategies);
    } catch (error) {
      return Err(error as Error);
    }
  }
}
