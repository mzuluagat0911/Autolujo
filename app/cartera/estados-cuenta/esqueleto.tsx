export function EsqueletoEstados() {
  return (
    <div className="mt-8 animate-pulse" aria-busy="true" aria-label="Cargando estado de cuenta">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="mt-6 h-11 rounded-xl bg-surface-2" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
