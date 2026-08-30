import type { DeliveryRun } from '../domain/types.ts';

export interface RunRepository {
  save(run: DeliveryRun): void;
  find(id: string): DeliveryRun | undefined;
  listNewestFirst(): DeliveryRun[];
}

export class InMemoryRunRepository implements RunRepository {
  readonly #runs = new Map<string, DeliveryRun>();

  save(run: DeliveryRun): void {
    this.#runs.set(run.id, run);
  }

  find(id: string): DeliveryRun | undefined {
    return this.#runs.get(id);
  }

  listNewestFirst(): DeliveryRun[] {
    return [...this.#runs.values()].sort(
      (left, right) => right.draftedAt.getTime() - left.draftedAt.getTime(),
    );
  }
}
