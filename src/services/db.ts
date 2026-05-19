import { capacitorQuery, capacitorExecute } from './sqlite';

export interface DBResult {
  changes?: number;
  lastInsertRowid?: number | bigint;
  id?: number;
}

const electronAPI = (window as any).electronAPI;

export const db = {
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const safeParams = params.map(p => p === undefined ? null : p);
    if (!electronAPI) {
      return await capacitorQuery(sql, safeParams) as T[];
    }
    return await electronAPI.queryDb(sql, safeParams);
  },

  async execute(sql: string, params: any[] = []): Promise<DBResult> {
    const safeParams = params.map(p => p === undefined ? null : p);
    if (!electronAPI) {
      return await capacitorExecute(sql, safeParams);
    }
    return await electronAPI.executeDb(sql, safeParams);
  },

  async getOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }
};
