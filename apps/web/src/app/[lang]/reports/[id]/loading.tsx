// Instant shell while a report streams in: gives the [id] param a Suspense boundary
// (Cache Components "instant navigation") and mirrors the detail layout to avoid layout shift.
export default function ReportLoading() {
  return (
    <div className="container page" aria-busy="true">
      <span className="skeleton skeleton--line" style={{ width: 140, marginBottom: 20 }} />
      <div className="detail">
        <div className="detail__main">
          <span className="skeleton skeleton--media" />
          <div className="detail__header">
            <span className="skeleton skeleton--line" style={{ width: 180 }} />
            <span className="skeleton skeleton--title" />
            <span className="skeleton skeleton--line" style={{ width: '80%' }} />
          </div>
        </div>
        <div className="card card--padded">
          <span className="skeleton skeleton--button" />
          <span className="skeleton skeleton--line" style={{ width: '60%', margin: '14px auto 0' }} />
        </div>
      </div>
    </div>
  );
}
