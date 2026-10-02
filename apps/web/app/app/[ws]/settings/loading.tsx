export default function Loading() {
  return (
    <div className="pr-body" style={{ maxWidth: 820 }} aria-busy="true" aria-label="Loading settings">
      {[180, 70, 160].map((h, i) => (
        <div key={i} className="pr-section" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <div className="sk sk-title" style={{ width: 140 }} />
          <div className="sk" style={{ height: h - 60 }} />
        </div>
      ))}
    </div>
  );
}
