// Evita ejecuciones simultáneas del LLM en una CPU compartida.
export class SequentialQueue {
  private previous: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.previous.then(task, task);
    this.previous = result.then(() => undefined, () => undefined);
    return result;
  }
}
