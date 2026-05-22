/** Días recientes donde el cron puede refrescar snapshot (late-arriving data). */
export const SNAPSHOT_CORRECTION_WINDOW_DAYS = 7;

/** Filas por chunk en exports CSV (memoria O(chunk)). */
export const EXPORT_CHUNK_SIZE = 5_000;
