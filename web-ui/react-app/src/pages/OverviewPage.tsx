import {
  useCallback,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Import, Wrench } from 'lucide-react';
import { useHealthStore } from '../store/useHealthStore';
import { Button } from '../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/ui/EmptyState';
import { Drawer } from '../components/ui/Drawer';

import { useLocale } from '../i18n/LocaleProvider';
import { StatusBand } from '../features/overview/StatusBand';
import { TodayStrip } from '../features/overview/TodayStrip';
import { DeferredAdvancedTools } from '../features/overview/DeferredAdvancedTools';
import { SignalList } from '../features/overview/SignalList';
import { KpiVisibilityBar } from '../features/overview/KpiVisibilityBar';
import {
  getKpiOrder,
  getKpiVisibility,
  moveKpiOrder,
  setKpiVisibility,
  type KpiId,
  type KpiVisibility,
} from '../features/overview/kpiVisibility';
import { DataQualityBanner } from '../features/overview/DataQualityBanner';
import {
  buildLlmPrompt,
  type LlmPromptMode,
} from '../core/HealthCoreAdapter';
import { getUserContextForPrompt } from '../core/userContext';
import { isIncludeEventsCtx } from '../core/includeEvents';
import { listLocalHealthEvents } from '../core/localEvents';
import { pickHealthExportFromFolder } from '../core/folderImport';
import { useAutoAnimate } from '../motion/useAutoAnimate';
import { useMediaQuery } from '../hooks/useMediaQuery';
import fixtureXml from '../../../../e2e/fixtures/minimal-export.xml?raw';

const KPI_OPEN_KEY = 'ha-react-overview-kpi-open';
const DOMAINS_OPEN_KEY = 'ha-react-overview-domains-open';

/** sessionStorage open flag; default open when missing/invalid (e2e-safe). */
function readSectionOpen(key: string): boolean {
  try {
    const v = sessionStorage.getItem(key);
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
}

function writeSectionOpen(key: string, open: boolean): void {
  try {
    sessionStorage.setItem(key, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function freshnessLabel(days: number | null): {
  text: string;
  tone: 'ok' | 'watch' | 'alert' | 'neutral';
} {
  if (days == null) return { text: '未知', tone: 'neutral' };
  if (days <= 1)
    return { text: `截至 ${days === 0 ? '今天' : '昨天'}`, tone: 'ok' };
  if (days <= 7) return { text: `${days} 天前`, tone: 'watch' };
  return { text: `${days} 天前（偏旧）`, tone: 'alert' };
}

function priorityFromSummary(summary: NonNullable<
  ReturnType<typeof useHealthStore.getState>['summary']
>): { title: string; detail: string; tone: 'ok' | 'watch' | 'alert' | 'accent' } {
  if (summary.kpis.statusLabel) {
    const tone =
      summary.kpis.statusTone === 'alert'
        ? 'alert'
        : summary.kpis.statusTone === 'watch'
          ? 'watch'
          : summary.kpis.statusTone === 'positive'
            ? 'ok'
            : 'accent';
    return {
      title: summary.kpis.statusLabel,
      detail:
        summary.kpis.recoveryScore != null
          ? `恢复分 ${summary.kpis.recoveryScore} · 负荷 ${summary.kpis.loadScore ?? '—'}`
          : '基于本机分析内核的恢复/负荷启发式（非诊断）',
      tone,
    };
  }
  if (summary.freshnessDays != null && summary.freshnessDays > 7) {
    return {
      title: '数据偏旧，建议重新导入',
      detail: `分析区间止于 ${summary.dateRange.end || '—'}`,
      tone: 'watch',
    };
  }
  if (summary.domainPresence.cgm) {
    return {
      title: '血糖域有数据，可查看趋势与报告',
      detail: `CGM ${summary.counts.cgm} 点 · 均值 ${summary.kpis.cgmMean?.toFixed(2) ?? '—'}`,
      tone: 'accent',
    };
  }
  return {
    title: '已加载本机分析',
    detail: `${summary.dateRange.start} → ${summary.dateRange.end}`,
    tone: 'ok',
  };
}

function viaLabel(via: string | null): string {
  switch (via) {
    case 'worker':
      return '后台解析';
    case 'zip':
      return 'ZIP 导入';
    case 'warehouse':
      return '本机数据';
    case 'hae':
      return '增量合并';
    case 'main':
      return '本机分析';
    default:
      return '';
  }
}

/** User-facing domain names (hide raw keys on the health surface). */
const DOMAIN_LABELS: Record<string, string> = {
  cgm: '血糖',
  bloodPressure: '血压',
  weight: '体重',
  steps: '步数',
  hrv: 'HRV',
  restingHr: '静息心率',
  walkingHr: '步行心率',
  sleep: '睡眠',
  watch: '手表',
  workouts: '训练',
  ecg: '心电',
};

function domainLabel(key: string): string {
  return DOMAIN_LABELS[key] || key;
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const haeRef = useRef<HTMLInputElement>(null);
  const [snapMsg, setSnapMsg] = useState<string | null>(null);
  /** Mobile: collapse advanced toolbar actions; desktop CSS always shows them. */
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  /** Collapsible KPI / domains — default open (e2e); session opt-in collapse. */
  const [kpiOpen, setKpiOpen] = useState(() => readSectionOpen(KPI_OPEN_KEY));
  const [domainsOpen, setDomainsOpen] = useState(() =>
    readSectionOpen(DOMAINS_OPEN_KEY),
  );
  /** KPI card visibility + order — localStorage; default all on (cgm visible for e2e). */
  const [kpiVis, setKpiVis] = useState<KpiVisibility>(() => getKpiVisibility());
  const [kpiOrder, setKpiOrderState] = useState<KpiId[]>(() => getKpiOrder());
  const [promptMsg, setPromptMsg] = useState<string | null>(null);
  const [promptMode, setPromptMode] = useState<LlmPromptMode>('full');
  /** Mobile Vaul drawer for import / advanced tools */
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const [kpiMatrixRef] = useAutoAnimate<HTMLDivElement>();
  /** Match CSS breakpoint for tools presentation (desktop details vs Vaul). */
  const isNarrow = useMediaQuery('(max-width: 899px)');

  const onKpiVisibilityChange = useCallback((id: KpiId, visible: boolean) => {
    setKpiVis(setKpiVisibility({ [id]: visible }));
  }, []);

  const onKpiMove = useCallback((id: KpiId, dir: -1 | 1) => {
    setKpiOrderState(moveKpiOrder(id, dir));
  }, []);
  const {
    status,
    error,
    summary,
    analysis,
    sourceLabel,
    analyzeVia,
    lastSnapshotId,
    lastHaeNotes,
    warehousePersistMsg,
    progressLabel,
    loadXml,
    loadXmlAsync,
    loadZipFile,
    loadHaeFiles,
    cancelHaeImport,
    haeCancellable,
    loadWarehouse,
    persistWarehouse,
    saveSnapshot,
    clear,
  } = useHealthStore();

  const onCopyLlmPrompt = useCallback(async () => {
    if (!analysis) {
      setPromptMsg(t('overview.prompt.noAnalysis'));
      return;
    }
    try {
      const includeEvents = isIncludeEventsCtx();
      const events = includeEvents ? await listLocalHealthEvents() : [];
      const { text } = buildLlmPrompt(analysis, promptMode, {
        locale: locale === 'en' ? 'en' : locale === 'zh-TW' ? 'zh-TW' : 'zh-CN',
        userContext: getUserContextForPrompt(),
        includeEvents,
        events,
      });
      await navigator.clipboard.writeText(text);
      setPromptMsg(
        t('overview.prompt.copied').replace('{n}', String(text.length)),
      );
    } catch {
      setPromptMsg(t('overview.prompt.copyFail'));
    }
  }, [analysis, promptMode, t, locale]);

  const loadFixture = useCallback(() => {
    setSnapMsg(null);
    loadXml(fixtureXml, 'e2e/fixtures/minimal-export.xml');
  }, [loadXml]);

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setSnapMsg(null);
      const name = file.name || 'export';
      const isZip =
        /\.zip$/i.test(name) ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed';
      if (isZip) {
        await loadZipFile(file);
        return;
      }
      if (!/\.xml$/i.test(name) && file.type && !file.type.includes('xml')) {
        useHealthStore.setState({
          status: 'error',
          error: '请选择 export.xml / ZIP，或使用「导入 HAE」选择 JSON/CSV',
          summary: null,
          analysis: null,
          data: null,
          sourceLabel: name,
          analyzeVia: null,
        });
        return;
      }
      const text = await file.text();
      await loadXmlAsync(text, name);
    },
    [loadXmlAsync, loadZipFile],
  );

  const onPickHae = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setSnapMsg(null);
      await loadHaeFiles(Array.from(list));
    },
    [loadHaeFiles],
  );

  const onPickFolder = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setSnapMsg(null);
      const picked = pickHealthExportFromFolder(Array.from(list));
      if (picked.kind === 'none') {
        useHealthStore.setState({
          status: 'error',
          error: t('overview.folder.none'),
          analyzeVia: null,
        });
        return;
      }
      if (picked.kind === 'zip') {
        await loadZipFile(picked.file);
        return;
      }
      const text = await picked.file.text();
      await loadXmlAsync(text, picked.label);
    },
    [loadXmlAsync, loadZipFile, t],
  );

  const onSaveSnap = useCallback(async () => {
    const id = await saveSnapshot('React 预览');
    setSnapMsg(id ? `已保存快照 ${id}` : '保存失败');
  }, [saveSnapshot]);

  /** Navigate to Trends; optional domain query (recovery has no TrendDomain). */
  const openTrends = useCallback(
    (domain?: string) => {
      navigate(domain ? `/trends?domain=${domain}` : '/trends');
    },
    [navigate],
  );

  const kpiCardNavProps = useCallback(
    (testId: string, domain?: string) => ({
      className: 'kpi-card-link',
      role: 'button' as const,
      tabIndex: 0,
      'data-testid': testId,
      title: t('overview.kpi.openTrends'),
      onClick: () => openTrends(domain),
      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTrends(domain);
        }
      },
    }),
    [openTrends, t],
  );

  if (status === 'loading') {
    const label = progressLabel || '正在分析…';
    return (
      <div className="stack" data-testid="page-overview">
        <div
          className="import-progress"
          data-testid="import-progress"
          role="status"
          aria-live="polite"
        >
          <span className="import-progress-dot" aria-hidden />
          <span className="import-progress-label">{label}</span>
          {haeCancellable ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              data-testid="hae-cancel"
              onClick={() => cancelHaeImport()}
            >
              {t('overview.haeCancel')}
            </Button>
          ) : null}
        </div>
        <LoadingState label={label} />
      </div>
    );
  }

  const viaTone =
    analyzeVia === 'worker' ||
    analyzeVia === 'zip' ||
    analyzeVia === 'hae'
      ? ('ok' as const)
      : analyzeVia === 'warehouse'
        ? ('accent' as const)
        : ('watch' as const);

  const importToolbar = (
    <div className="overview-toolbar" data-testid="overview-toolbar">
      <div className="overview-toolbar-primary">
        <Button
          variant="primary"
          onClick={loadFixture}
          data-testid="load-fixture"
        >
          {t('overview.loadFixture')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          data-testid="import-file-btn"
        >
          {t('overview.importFile')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.zip,text/xml,application/xml,application/zip"
          className="sr-only"
          data-testid="import-file-input"
          onChange={(e) => {
            void onPickFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => void loadWarehouse()}
          data-testid="load-warehouse"
        >
          {t('overview.loadWh')}
        </Button>
        <Button
          variant="secondary"
          className="overview-toolbar-more"
          onClick={() => setToolbarMoreOpen((open) => !open)}
          aria-expanded={toolbarMoreOpen}
          aria-controls="overview-toolbar-advanced"
          data-testid="overview-toolbar-more"
        >
          {toolbarMoreOpen ? t('overview.tools.less') : t('overview.tools.more')}
        </Button>
      </div>
      <div
        id="overview-toolbar-advanced"
        className="overview-toolbar-advanced"
        data-open={toolbarMoreOpen ? '1' : '0'}
      >
        <Button
          variant="secondary"
          onClick={() => haeRef.current?.click()}
          data-testid="import-hae-btn"
        >
          {t('overview.importHae')}
        </Button>
        <input
          ref={haeRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          multiple
          className="sr-only"
          data-testid="import-hae-input"
          onChange={(e) => {
            void onPickHae(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => folderRef.current?.click()}
          data-testid="import-folder-btn"
        >
          {t('overview.importFolder')}
        </Button>
        <input
          ref={folderRef}
          type="file"
          multiple
          className="sr-only"
          data-testid="import-folder-input"
          {...({
            webkitdirectory: '',
            directory: '',
          } as InputHTMLAttributes<HTMLInputElement>)}
          onChange={(e) => {
            void onPickFolder(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => void persistWarehouse()}
          disabled={!summary}
          title={t('overview.persistWh')}
          data-testid="persist-warehouse"
        >
          {t('overview.persistWh')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void onSaveSnap()}
          disabled={!summary}
          data-testid="save-snapshot"
        >
          {t('overview.saveSnap')}
        </Button>
        <Button
          variant="secondary"
          onClick={clear}
          disabled={status === 'idle'}
          data-testid="clear-session"
        >
          {t('overview.clear')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="stack" data-testid="page-overview">
      <div>
        <h1 className="page-title">{t('overview.title')}</h1>
        <p className="page-lead">{t('overview.lead')}</p>
      </div>

      {error ? (
        <ErrorState message={error}>
          <div className="error-recover">
            <Button variant="primary" onClick={loadFixture}>
              {t('overview.loadFixture')}
            </Button>
            <Button variant="secondary" onClick={clear}>
              {t('overview.clear')}
            </Button>
          </div>
        </ErrorState>
      ) : null}

      {!summary ? (
        <>
          {/* Empty: import is the primary task — keep toolbar on first screen */}
          {importToolbar}
          <EmptyState
            testId="overview-empty"
            title={t('overview.empty')}
            description={t('overview.emptyHint')}
            actionLabel={t('overview.loadFixture')}
            onAction={loadFixture}
          />
        </>
      ) : (
        <>
          {/* Health stage first — tools demoted below */}
          {(() => {
            const p = priorityFromSummary(summary);
            const f = freshnessLabel(summary.freshnessDays);
            return (
              <>
                <StatusBand
                  summary={summary}
                  priorityTitle={p.title}
                  priorityDetail={p.detail}
                  priorityTone={p.tone}
                  freshnessText={f.text}
                  freshnessTone={f.tone}
                />
                <TodayStrip summary={summary} freshnessText={f.text} />
                <DataQualityBanner summary={summary} />
              </>
            );
          })()}

          <div className="primary-actions" data-testid="primary-actions">
            <Button variant="primary" onClick={() => navigate('/trends')}>
              {t('overview.ctaTrends')}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/reports')}>
              {t('overview.ctaReports')}
            </Button>
            <span className="muted" data-testid="kpi-range">
              {summary.dateRange.start || '—'} → {summary.dateRange.end || '—'}
            </span>
          </div>

          {analysis ? (
            <div className="prompt-actions" data-testid="llm-prompt-bar">
              <span className="muted">{t('overview.prompt.label')}</span>
              <select
                className="theme-select"
                value={promptMode}
                data-testid="llm-prompt-mode"
                onChange={(e) =>
                  setPromptMode(e.target.value as LlmPromptMode)
                }
                aria-label={t('overview.prompt.label')}
              >
                <option value="full">{t('overview.prompt.mode.full')}</option>
                <option value="data">{t('overview.prompt.mode.data')}</option>
                <option value="short">{t('overview.prompt.mode.short')}</option>
              </select>
              <Button
                variant="primary"
                size="sm"
                data-testid="llm-prompt-copy"
                onClick={() => void onCopyLlmPrompt()}
              >
                {t('overview.prompt.copy')}
              </Button>
              {promptMsg ? (
                <span className="muted" data-testid="llm-prompt-status">
                  {promptMsg}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="insight-strip" data-testid="insight-strip">
            {(() => {
              const presentDomains = Object.entries(summary.domainPresence)
                .filter(([, v]) => v)
                .map(([k]) => k);
              return (
                <>
                  <span
                    className="insight-chip insight-chip-count"
                    data-testid="insight-domain-count"
                  >
                    {t('overview.domainsPresentCount').replace(
                      '{n}',
                      String(presentDomains.length),
                    )}
                  </span>
                  {presentDomains.map((k) => (
                    <span key={k} className="insight-chip" data-domain={k}>
                      {domainLabel(k)}
                    </span>
                  ))}
                </>
              );
            })()}
          </div>

          <div className="overview-split">
            <details
              className="overview-collapsible"
              data-testid="overview-kpi-section"
              open={kpiOpen}
              onToggle={(e) => {
                const next = e.currentTarget.open;
                setKpiOpen(next);
                writeSectionOpen(KPI_OPEN_KEY, next);
              }}
            >
              <summary>{t('overview.kpiSection')}</summary>
              <div className="overview-collapsible-body">
                <KpiVisibilityBar
                  visibility={kpiVis}
                  order={kpiOrder}
                  onChange={onKpiVisibilityChange}
                  onMove={onKpiMove}
                />
                <div
                  className="kpi-matrix"
                  data-testid="kpi-matrix"
                  ref={kpiMatrixRef}
                >
                  {kpiOrder.map((id) => {
                    if (kpiVis[id] === false) return null;
                    if (id === 'cgm') {
                      return (
                        <Card
                          key={id}
                          {...kpiCardNavProps('kpi-card-cgm', 'cgmDailyMean')}
                        >
                          <CardTitle>{t('overview.kpi.cgm')}</CardTitle>
                          <p className="kpi" data-testid="kpi-cgm">
                            {summary.kpis.cgmMean != null
                              ? summary.kpis.cgmMean.toFixed(2)
                              : '—'}
                          </p>
                          <CardDesc>
                            {summary.counts.cgm} {t('overview.kpi.points')}
                          </CardDesc>
                        </Card>
                      );
                    }
                    if (id === 'weight') {
                      return (
                        <Card
                          key={id}
                          {...kpiCardNavProps('kpi-card-weight', 'weight')}
                        >
                          <CardTitle>{t('overview.kpi.weight')}</CardTitle>
                          <p className="kpi" data-testid="kpi-weight">
                            {summary.kpis.weightLatest != null
                              ? summary.kpis.weightLatest.toFixed(2)
                              : '—'}
                          </p>
                          <CardDesc>
                            {summary.counts.weight} {t('overview.kpi.points')}
                          </CardDesc>
                        </Card>
                      );
                    }
                    if (id === 'steps') {
                      return (
                        <Card
                          key={id}
                          {...kpiCardNavProps('kpi-card-steps', 'steps')}
                        >
                          <CardTitle>{t('overview.kpi.steps')}</CardTitle>
                          <p className="kpi" data-testid="kpi-steps">
                            {summary.kpis.stepsLatest != null
                              ? String(summary.kpis.stepsLatest)
                              : '—'}
                          </p>
                          <CardDesc>
                            {summary.counts.stepsDays} {t('overview.kpi.days')}
                          </CardDesc>
                        </Card>
                      );
                    }
                    if (id === 'recovery') {
                      return (
                        <Card key={id} {...kpiCardNavProps('kpi-card-recovery')}>
                          <CardTitle>{t('overview.kpi.recovery')}</CardTitle>
                          <p className="kpi" data-testid="kpi-recovery">
                            {summary.kpis.recoveryScore != null
                              ? String(summary.kpis.recoveryScore)
                              : '—'}
                          </p>
                          <CardDesc>{t('overview.kpi.nonDiag')}</CardDesc>
                        </Card>
                      );
                    }
                    if (
                      id === 'restingHr' &&
                      summary.kpis.restingHrLatest != null
                    ) {
                      return (
                        <Card
                          key={id}
                          {...kpiCardNavProps(
                            'kpi-card-restingHr',
                            'restingHr',
                          )}
                        >
                          <CardTitle>{t('overview.kpi.restingHr')}</CardTitle>
                          <p className="kpi" data-testid="kpi-restingHr">
                            {summary.kpis.restingHrLatest}
                          </p>
                          <CardDesc>1 {t('overview.kpi.days')}</CardDesc>
                        </Card>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </details>
            <SignalList summary={summary} />
          </div>

          <details
            className="overview-collapsible"
            data-testid="overview-domains-section"
            open={domainsOpen}
            onToggle={(e) => {
              const next = e.currentTarget.open;
              setDomainsOpen(next);
              writeSectionOpen(DOMAINS_OPEN_KEY, next);
            }}
          >
            <summary>{t('overview.domains')}</summary>
            <div className="overview-collapsible-body">
              <div className="row">
                {Object.entries(summary.domainPresence).map(([k, v]) => (
                  <Badge
                    key={k}
                    tone={v ? 'ok' : 'neutral'}
                    data-domain={k}
                    data-present={v ? '1' : '0'}
                  >
                    {domainLabel(k)}: {v ? '✓' : '—'}
                  </Badge>
                ))}
              </div>
            </div>
          </details>
        </>
      )}

      {/* Desktop: demoted details. Mobile: Vaul bottom drawer. */}
      {(() => {
        const toolsInner = (
          <>
            {summary ? importToolbar : null}
            {summary ? (
              <div
                className="session-ready-strip"
                data-testid="session-ready-strip"
              >
                <div className="status-strip">
                  {sourceLabel ? (
                    <Badge tone="neutral" data-testid="source-label">
                      {t('overview.source')}: {sourceLabel}
                    </Badge>
                  ) : null}
                  {analyzeVia ? (
                    <Badge tone={viaTone} data-testid="analyze-via">
                      {viaLabel(analyzeVia)}
                    </Badge>
                  ) : null}
                </div>
                <p className="muted session-ready-hint">
                  {t('overview.sessionReadyStrip')}
                </p>
              </div>
            ) : null}
            {snapMsg || lastSnapshotId ? (
              <p className="muted" data-testid="snapshot-status">
                {snapMsg || `${t('overview.snapRecent')} ${lastSnapshotId}`}
              </p>
            ) : null}
            {warehousePersistMsg ? (
              <p className="muted" data-testid="warehouse-persist-status">
                {warehousePersistMsg}
              </p>
            ) : null}
            {lastHaeNotes.length ? (
              <Card data-testid="hae-notes">
                <CardTitle>{t('overview.haeNotes')}</CardTitle>
                <ul
                  className="muted"
                  style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}
                >
                  {lastHaeNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <DeferredAdvancedTools />
          </>
        );

        if (isNarrow) {
          return (
            <div className="overview-tools-mobile">
              <Button
                variant="secondary"
                className="overview-tools-mobile-trigger"
                data-testid="overview-tools-mobile-open"
                onClick={() => setToolsDrawerOpen(true)}
              >
                <Import size={16} aria-hidden />
                {t('overview.tools.summary')}
              </Button>
              {/* Keep drawer test id alias for parity with desktop tools surface */}
              <Drawer
                open={toolsDrawerOpen}
                onOpenChange={setToolsDrawerOpen}
                title={t('overview.tools.summary')}
                testId="overview-tools-drawer"
              >
                {toolsInner}
              </Drawer>
            </div>
          );
        }

        return (
          <details
            className="overview-tools-drawer overview-tools-desktop"
            data-testid="overview-tools-drawer"
            open={!summary}
          >
            <summary>
              <Wrench size={16} aria-hidden className="tools-summary-icon" />
              {t('overview.tools.summary')}
            </summary>
            {toolsInner}
          </details>
        );
      })()}
    </div>
  );
}


