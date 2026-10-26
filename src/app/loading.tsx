export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-32 animate-pulse rounded-2xl bg-navy-100" />
      <div className="h-20 animate-pulse rounded-2xl bg-navy-50" />
      <div className="h-20 animate-pulse rounded-2xl bg-navy-50" />
    </div>
  );
}
