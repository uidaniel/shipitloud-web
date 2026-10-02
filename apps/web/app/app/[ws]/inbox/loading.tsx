export default function Loading() {
  return (
    <div className="pr-body" aria-busy="true" aria-label="Loading inbox">
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[64, 84, 70, 74, 70].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 30 }} />)}
      </div>
      <div className="pr-list">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pr-item">
            <div className="sk" style={{ width: 24, height: 24, borderRadius: 7 }} />
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="sk sk-title" />
              <div className="sk sk-line" style={{ width: '30%' }} />
              <div className="sk sk-block" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div className="sk" style={{ width: 70, height: 28 }} />
              <div className="sk" style={{ width: 90, height: 28 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
