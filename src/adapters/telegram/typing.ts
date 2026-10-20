/** Mantiene la acción "escribiendo" mientras una operación asíncrona está activa.
 * Telegram caduca esta señal aproximadamente a los 5 segundos.
 * La llamada a Telegram es independiente de la respuesta del mensaje.
 */
export function startTyping(
  sendAction: () => Promise<unknown>,
  onError?: (error: unknown) => void,
  intervalMs = 3500
): () => void {
  let stopped = false;
  let sending = false;
  const tick = async () => {
    if (stopped || sending) return;
    sending = true;
    try {
      await sendAction();
    } catch (error) {
      if (!stopped) onError?.(error);
    } finally {
      sending = false;
    }
  };
  void tick(); // visible desde el comienzo de la consulta, incluso si hay cola
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}
