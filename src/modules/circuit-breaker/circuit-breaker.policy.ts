/** Fallos en ventana deslizante antes de abrir el circuito. */
export const CIRCUIT_FAILURE_THRESHOLD = 5;

/** Ventana para contar fallos (ms). */
export const CIRCUIT_FAILURE_WINDOW_MS = 60_000;

/** Tiempo en OPEN antes de pasar a HALF_OPEN (ms). */
export const CIRCUIT_OPEN_COOLDOWN_MS = 30_000;

/** Éxitos consecutivos en HALF_OPEN para volver a CLOSED. */
export const CIRCUIT_HALF_OPEN_SUCCESS_THRESHOLD = 2;
