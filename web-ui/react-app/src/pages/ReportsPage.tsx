export function ReportsPage() {
  return (
    <div className="stack" data-testid="page-reports">
      <div>
        <h1 className="page-title">报告</h1>
        <p className="page-lead">
          占位工作区。周报 / 就诊摘要 / FHIR 导出仍由 legacy PWA 与 lib
          内核提供；本壳不重写临床文案。
        </p>
      </div>
      <div className="card">
        <h2>后续阶段</h2>
        <p>
          完整报告页迁移不在本 dual-track baseline 范围（见
          docs/DUAL_TRACK_UI.md Non-goals）。
        </p>
      </div>
    </div>
  );
}
