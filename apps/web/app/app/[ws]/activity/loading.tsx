export default function Loading() {
  return (
    <div className="pr-body" aria-busy="true" aria-label="Loading activity">
      <div className="sk sk-title" style={{ width: 200, marginBottom: 14 }} />
      <div className="pr-list">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 90px 90px', gap: 14, padding: '14px 16px', borderTop: i ? '1px solid var(--line)' : 0, alignItems: 'center' }}>
            <div className="sk" style={{ width: 20, height: 20, borderRadius: 6 }} />
            <div className="sk sk-line" style={{ width: `${60 - i * 5}%` }} />
            <div className="sk sk-line" />
            <div className="sk" style={{ height: 20 }} />
            <div className="sk sk-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
