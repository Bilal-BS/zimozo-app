import { capacitorQuery, capacitorExecute } from './sqlite';

export interface DBResult {
  changes?: number;
  lastInsertRowid?: number | bigint;
  id?: number;
}

const electronAPI = (window as any).electronAPI;

export const db = {
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!electronAPI) {
      return await capacitorQuery(sql, params) as T[];
    }
    return await electronAPI.queryDb(sql, params);
  },

  async execute(sql: string, params: any[] = []): Promise<DBResult> {
    if (!electronAPI) {
      return await capacitorExecute(sql, params);
    }
    return await electronAPI.executeDb(sql, params);
  },

  async getOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }
};
