import type { PrismaLike } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createFakePrisma(): PrismaLike & { executions(): Row[]; usages(): Row[] } {
  const executions: Row[] = [];
  const usages: Row[] = [];
  return {
    aIExecution: {
      async create({ data }: { data: Row }) {
        const record = { id: genId('exec'), createdAt: new Date(), ...data };
        executions.push(record);
        return record;
      },
    },
    aIUsage: {
      async create({ data }: { data: Row }) {
        const record = { id: genId('usage'), createdAt: new Date(), ...data };
        usages.push(record);
        return record;
      },
    },
    executions() {
      return executions;
    },
    usages() {
      return usages;
    },
  };
}
