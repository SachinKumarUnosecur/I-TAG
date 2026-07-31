/** Shared Tailwind class compositions — use these instead of custom CSS class names. */
export const ui = {
  shell: "grid h-screen grid-cols-[236px_1fr] grid-rows-[64px_1fr] max-[860px]:grid-cols-[0_1fr]",
  topbar:
    "col-span-2 row-start-1 z-20 flex items-center gap-4 border-b border-border bg-bg py-0 pl-5 pr-[22px]",
  brand: "flex w-[200px] shrink-0 items-center gap-2.5",
  brandMark:
    "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-grad shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
  brandName: "font-display text-[15px] font-bold tracking-tight text-black primary-color",
  brandSub: "mt-[-2px] block text-[11px] font-medium tracking-wider text-text-3 text-color-secondary",
  searchWrap: "relative max-w-[520px] flex-1 max-[860px]:max-w-none",
  searchInput:
    "w-full rounded-[10px] border border-border bg-card py-[9px] pl-[38px] pr-3.5 text-[13.5px] text-text-1 transition placeholder:text-text-3 focus:border-border-strong focus:bg-card-2 focus:outline-none",
  searchIcon: "pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-text-3",
  kbd: "absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-text-3",
  topActions: "ml-auto flex items-center gap-2",
  orgSwitch:
    "flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-card py-[7px] pl-2 pr-2.5 text-[12.5px]",
  orgDot:
    "flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-500 text-[10px] font-bold text-white",
  iconBtn:
    "relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-card text-text-2 transition hover:border-border-strong hover:bg-card-2 hover:text-text-1",
  dotBadge: "absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full bg-critical shadow-[0_0_0_2px_var(--bg)]",
  aiBtn:
    "flex h-9 w-auto items-center gap-[7px] rounded-[10px] border border-[rgba(139,92,246,0.3)] bg-grad-soft px-[13px] pl-2.5 text-[12.5px] font-semibold text-text-1",
  themeToggle:
    "flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-card text-text-2",
  avatar:
    "flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-border-strong bg-gradient-to-br from-cyan-400 to-blue-500 text-xs font-bold text-[#04243b]",

  sidebar:
    "col-start-1 row-start-2 flex flex-col overflow-y-auto border-r border-border bg-sidebar px-3 py-4 [scrollbar-gutter:stable] max-[860px]:hidden",
  navGroupLabel:
    "px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-bold tracking-[0.08em] text-text-3 uppercase",
  navItem:
    "relative mb-0.5 flex cursor-pointer items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-[13.5px] font-medium text-text-2 transition hover:bg-card hover:text-text-1",
  navItemActive: "bg-grad-soft text-text-1 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.25)] [&_svg]:text-cyan [&_svg]:opacity-100",
  nBadge:
    "n-badge ml-auto rounded-md bg-critical-bg px-1.5 py-px text-[10.5px] font-bold text-red-300",
  sidebarFoot: "mt-auto border-t border-border px-2.5 py-3 text-[11.5px] text-text-3",
  pulse: "mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--success-bg)]",

  main: "col-start-2 row-start-2 overflow-y-auto px-[30px] pt-[26px] pb-[60px] transition-[opacity,transform] duration-500 ease-in-out",
  mainFadeOut: "pointer-events-none opacity-0 translate-y-3",
  page: "animate-[pageEnter_0.55s_ease-out_both]",

  pageHead: "mb-[22px] flex items-start justify-between gap-5",
  pageHeadTitle: "m-0 mb-1 font-display text-[23px] font-bold tracking-tight",
  pageHeadDesc: "m-0 max-w-[560px] text-[13.5px] text-text-2",
  pageEyebrow:
    "mb-1.5 flex items-center gap-1.5 font-display text-[11px] font-bold tracking-[0.08em] text-blue-500 primary-color uppercase",
  pageActions: "flex shrink-0 gap-2",

  btn: "flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3.5 py-[9px] text-[12.5px] font-semibold text-text-1 transition hover:border-border-strong hover:bg-card-2",
  btnPrimary:
    "flex items-center gap-1.5 rounded-[10px] border-0 bg-grad px-3.5 py-[9px] text-[12.5px] font-semibold text-white transition hover:brightness-[1.08]",
  btnGhost: "flex items-center gap-1.5 rounded-[10px] border border-border bg-transparent px-3.5 py-[9px] text-[12.5px] font-semibold text-text-1 transition hover:border-border-strong hover:bg-card-2",
  btnSm: "px-2.5 py-1.5 text-[11.5px]",
  btnSso: "w-full justify-center gap-2.5",

  tabs: "mb-[22px] flex gap-1 border-b border-border",
  tab: "mr-[22px] cursor-pointer border-b-2 border-transparent px-1 py-2.5 text-[13.5px] font-semibold text-text-3 transition hover:text-text-2",
  tabActive: "border-cyan text-text-1",

  grid: "grid gap-10",
  g6: "grid-cols-6 max-[1180px]:grid-cols-3 max-[860px]:grid-cols-2",
  g4: "grid-cols-4 max-[1180px]:grid-cols-2",
  g3: "grid-cols-3 max-[860px]:grid-cols-1",
  g2: "grid-cols-2 max-[860px]:grid-cols-1",
  g126: "grid-cols-[2fr_1fr] max-[1180px]:grid-cols-1",
  g75: "grid-cols-[1.4fr_1fr] max-[1180px]:grid-cols-1",

  card: "relative flex flex-col rounded-md border border-border bg-card p-[18px] shadow-card transition-[border-color,transform,box-shadow] duration-1000 hover:border-border-strong",
  cardGlass: "bg-glass backdrop-blur-[14px]",
  cardTitle: "m-0 mb-0.5 flex items-center gap-2 text-[13px] font-bold",
  cardHead: "mb-3.5 text-size-24px flex items-center justify-between",
  cardHeadH3: "m-0 text-size-24px flex items-center gap-[7px] text-[13.5px] font-bold",
  cardSub: "text-[11.5px] font-medium text-text-3",
  linkMore: "flex items-center gap-[3px] text-[11.5px] font-semibold text-cyan",

  kpi: "p-4 transition hover:-translate-y-0.5 hover:shadow-card",
  kpiTop: "mb-2.5 flex items-center justify-between",
  kpiLabel: "text-[11.5px] font-semibold text-text-2",
  kpiIcon: "flex h-[26px] w-[26px] items-center justify-center rounded-lg",
  kpiValue: "flex items-baseline gap-1.5 font-display text-[26px] font-extrabold tracking-tight",
  kpiValueSmall: "text-[13px] font-semibold text-text-3",
  kpiTrend: "mt-1.5 flex items-center gap-[3px] text-[11.5px] font-bold",
  upGood: "text-success",
  upBad: "text-critical",

  insightCard:
    "insight-card relative flex h-[220px] flex-col overflow-hidden rounded-lg border border-border bg-card p-6 shadow-card",
  insightCardHeading: "m-0 flex h-full w-full flex-col",
  insightCardLink: "insight-card-link",
  insightCardValue:
    "relative z-[1] font-display text-[52px] font-extrabold leading-none tracking-tight text-text-1",
  insightCardLabel:
    "relative z-[1] max-w-full truncate px-1 text-[17px] font-semibold text-text-2",

  badge:
    "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-bold before:block before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
  badgeCritical: "badge-critical bg-critical-bg text-red-400",
  badgeMedium: "badge-medium bg-medium-bg text-orange-400",
  badgeWarning: "badge-warning bg-warning-bg text-yellow-400",
  badgeSuccess: "badge-success bg-success-bg text-green-400",
  badgeInfo: "badge-info bg-info-bg text-blue-400",
  badgeInactive: "badge-inactive bg-inactive-bg text-gray-400",

  chip: "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card-2 px-3 py-1.5 text-xs font-semibold text-text-2 transition hover:border-border-strong hover:text-text-1",
  chipActive: "border-[rgba(37,99,235,0.45)] bg-blue-bg text-blue-300",
  chipCrit: "border-[rgba(239,68,68,0.35)] bg-critical-bg text-red-300",
  chipWarn: "border-[rgba(245,158,11,0.35)] bg-warning-bg text-amber-300",
  chipOk: "border-[rgba(34,197,94,0.35)] bg-success-bg text-green-300",
  chipRow: "mb-3.5 flex flex-wrap gap-2",
  pillTier: "rounded-md border border-border bg-card-2 px-[7px] py-0.5 text-[10.5px] font-bold text-text-2",

  tableWrap: "overflow-x-auto rounded-md border border-border",
  mono: "font-mono",
  cellId: "flex items-center gap-[9px]",
  avatarSm:
    "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#04243b]",
  cellMeta: "text-[11px] text-text-3",
  riskBar: "mr-2 inline-block h-[5px] w-14 overflow-hidden rounded align-middle bg-card-2",
  svcIcon:
    "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-card-2 text-text-2",

  filterbar: "mb-4 flex flex-wrap items-center gap-2",
  searchSm: "relative min-w-[220px] max-w-[320px] flex-1",
  searchSmInput:
    "w-full rounded-[9px] border border-border bg-card py-2 pr-3 pl-8 text-[12.5px] text-text-1 focus:outline-none",
  filterDivider: "mx-1 h-5 w-px bg-border",
  filterBar:
    "mb-4 flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-card p-3",
  filterInput:
    "min-w-[180px] flex-1 rounded-[10px] border border-border bg-card-2 px-3 py-2 text-[13px] text-text-1 focus:outline-none",
  filterSelect:
    "rounded-[10px] border border-border bg-card-2 px-3 py-2 text-[13px] text-text-1 focus:outline-none",

  insight: "mb-2.5 flex gap-3 rounded-[11px] border border-border bg-card-2 p-[13px] last:mb-0",
  insightIcon: "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
  insightBodyB: "mb-0.5 block text-[12.8px]",
  insightBodyP: "m-0 text-[11.8px] leading-normal text-text-2",
  insightCta: "ml-auto shrink-0 self-center",

  listRow: "flex items-center gap-[11px] border-b border-border py-2.5 last:border-b-0 last:pb-0",
  listDot: "h-2 w-2 shrink-0 rounded-full",
  lrTitle: "m-0 text-[12.8px] font-semibold",
  lrMeta: "mt-0.5 text-[11px] text-text-3",

  progress: "h-[7px] overflow-hidden rounded-md bg-card-2",
  progressFill: "block h-full rounded-md bg-grad",

  drawerOverlay:
    "fixed inset-0 z-[100] flex items-stretch justify-end bg-black/55 backdrop-blur-[2px]",
  drawer:
    "h-full w-[460px] max-w-[92vw] animate-[slidein_0.25s_ease] overflow-y-auto border-l border-border-strong bg-card p-[22px]",

  gaugeWrap: "flex items-center gap-5",
  gaugeValue: "font-display text-[28px] font-extrabold tracking-tight",
  gaugeValueSmall: "mt-0.5 block text-center text-[11px] font-semibold text-text-3",

  mitreGrid: "grid grid-flow-col auto-cols-fr gap-px overflow-hidden rounded-[10px] bg-border",
  mitreCol: "bg-card-2 px-2 py-2.5",
  mitreColH5:
    "mb-2 text-center text-[10.5px] font-bold tracking-wide text-text-3 uppercase",
  mitreCell:
    "mb-[5px] rounded-md border border-border bg-card px-[7px] py-1.5 text-center text-[10.5px] text-text-2",
  mitreHit: "border-[rgba(239,68,68,0.3)] bg-critical-bg font-bold text-red-400",

  copilotShell: "grid h-[calc(100vh-190px)] grid-cols-[230px_1fr_260px] gap-4 max-[1180px]:h-auto max-[1180px]:grid-cols-1",
  copilotCol: "overflow-y-auto rounded-md border border-border bg-card p-3.5",
  promptSuggest:
    "mb-1.5 cursor-pointer rounded-[9px] border border-border bg-card-2 px-2.5 py-[9px] text-xs text-text-2 transition hover:border-border-strong hover:text-text-1",
  chatArea: "flex flex-col overflow-hidden rounded-md border border-border bg-card",
  chatScroll: "flex flex-1 flex-col gap-4 overflow-y-auto p-5",
  msgUser: "max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-grad px-3.5 py-2.5 text-[13px] text-white",
  msgAi: "flex max-w-[80%] gap-2.5 self-start",
  aiAvatar: "flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-grad",
  aiBubble: "rounded-[4px_14px_14px_14px] border border-border bg-card-2 px-[15px] py-[13px] text-[13px] leading-relaxed",
  chatInput: "flex items-center gap-2.5 border-t border-border p-3.5",
  chatInputField:
    "flex-1 rounded-[10px] border border-border bg-card-2 px-3.5 py-[11px] text-[13px] text-text-1 focus:outline-none",
  actionItem: "mb-2 rounded-[10px] border border-border bg-card-2 p-[11px]",

  loginScreen:
    "grid min-h-screen grid-cols-[1.1fr_1fr] bg-[radial-gradient(900px_500px_at_20%_20%,rgba(37,99,235,0.25),transparent_55%),radial-gradient(700px_400px_at_80%_80%,rgba(124,58,237,0.2),transparent_50%),#0B1220] max-[1100px]:grid-cols-1",
  loginHero:
    "login-hero relative flex flex-col justify-between overflow-hidden p-12 max-[1100px]:hidden",
  loginPanel: "flex items-center justify-center p-10",
  loginCard:
    "w-full max-w-[420px] rounded-[20px] border border-white/10 bg-[rgba(30,41,59,0.55)] p-8 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)] backdrop-blur-[18px]",
  field: "mb-3.5 flex flex-col gap-1.5",
  fieldLabel: "text-xs font-semibold text-text-2",
  fieldInput:
    "rounded-xl border border-border bg-[rgba(15,23,42,0.65)] px-3.5 py-[11px] text-sm text-text-1 transition focus:border-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.2)] focus:outline-none",
  loginRow: "my-1 mb-[18px] flex items-center justify-between text-[12.5px] text-text-3",
  ssoStack: "mt-3.5 grid gap-2",
  dividerOr:
    "divider-or my-[18px] flex items-center gap-3 text-[11px] tracking-[0.08em] text-text-3 uppercase",
  mfaCode: "mb-[18px] grid grid-cols-6 gap-2",
  mfaInput:
    "rounded-xl border border-border bg-[rgba(15,23,42,0.65)] py-3 text-center font-mono text-lg text-text-1 focus:border-blue focus:outline-none",

  heatmap: "grid grid-cols-12 gap-1",
  heatCell: "aspect-square rounded transition-transform hover:scale-110",
  heatL0: "bg-[rgba(37,99,235,0.12)]",
  heatL1: "bg-[rgba(37,99,235,0.2)]",
  heatL2: "bg-[rgba(245,158,11,0.35)]",
  heatL3: "bg-[rgba(249,115,22,0.45)]",
  heatL4: "bg-[rgba(239,68,68,0.55)]",

  riskMatrix: "flex gap-2.5",
  riskMatrixYLabel:
    "flex w-5 shrink-0 items-center justify-center text-[12px] font-bold tracking-wide text-text-1 [writing-mode:vertical-rl] rotate-180",
  riskMatrixMain: "min-w-0 flex-1",
  riskMatrixGrid:
    "grid grid-cols-[minmax(92px,1.1fr)_repeat(5,minmax(0,1fr))] gap-[3px] overflow-hidden rounded-md bg-bg",
  riskMatrixAxisCell:
    "flex min-h-[44px] items-center justify-center bg-card-2 px-1.5 text-center text-[11px] font-semibold leading-tight text-text-2",
  riskMatrixScore:
    "flex aspect-square min-h-[44px] items-center justify-center text-[15px] font-extrabold text-[#0f172a] transition-transform hover:z-[1] hover:scale-[1.03]",
  riskCatastrophic: "bg-[#e53935]",
  riskUnacceptable: "bg-[#fb8c00]",
  riskUndesirable: "bg-[#fdd835]",
  riskAcceptable: "bg-[#9ccc65]",
  riskDesirable: "bg-[#43a047]",
  riskMatrixXWrap: "mt-[3px] grid grid-cols-[minmax(92px,1.1fr)_repeat(5,minmax(0,1fr))] gap-[3px]",
  riskMatrixXCell:
    "flex min-h-[72px] items-end justify-center bg-card-2 px-1 pb-2 pt-3 text-center text-[10.5px] font-semibold leading-tight text-text-2",
  riskMatrixXTitle: "col-span-full mt-2 text-center text-[12px] font-bold text-text-1",
  riskMatrixLegend: "mt-4 flex flex-wrap gap-x-4 gap-y-2",
  riskMatrixLegendItem: "flex items-center gap-2 text-[11px] text-text-2",
  riskMatrixLegendSwatch: "h-3.5 w-3.5 shrink-0 rounded-[3px]",
  riskMatrixLegendLabel: "font-semibold text-text-1",
  riskMatrixLegendAction: "text-text-3",

  sev: "sev inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-bold tracking-wide uppercase",
  sevCritical: "bg-critical-bg text-red-300",
  sevHigh: "bg-medium-bg text-orange-300",
  sevMedium: "bg-warning-bg text-amber-300",
  sevLow: "bg-info-bg text-cyan-300",
  sevInfo: "bg-blue-bg text-blue-300",

  timeline: "timeline relative pl-5",
  tlItem: "tl-item relative pb-4 pl-3",
  tlTime: "mb-0.5 font-mono text-[11px] text-text-3",
  tlTitle: "mb-0.5 text-[13px] font-semibold",
  tlDesc: "text-[12.5px] leading-snug text-text-3",

  attackChain: "flex items-center gap-2 overflow-x-auto py-2",
  chainStep: "min-w-[120px] shrink-0 rounded-xl border border-border bg-card-2 p-3 text-xs",
  chainArrow: "shrink-0 text-text-3",

  assetCard:
    "cursor-pointer rounded-md border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card",
  scoreBar: "score-bar h-1.5 overflow-hidden rounded-full bg-[rgba(148,163,184,0.15)]",
  spark: "spark flex h-9 items-end gap-[3px]",
  progressRingLabel: "mb-1.5 flex justify-between text-xs text-text-3",
  liveDot: "live-dot inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-success uppercase",

  alertCard: "mb-2.5 overflow-hidden rounded-md border border-border bg-card transition hover:border-border-strong",
  alertCardHead: "flex cursor-pointer items-start gap-3 px-4 py-3.5",
  alertCardBody: "border-t border-border-soft bg-card-2 py-4 pr-4 pl-11",
  bulkBar:
    "mb-3 flex items-center gap-2 rounded-xl border border-[rgba(37,99,235,0.3)] bg-blue-bg px-3 py-2.5 text-[12.5px]",

  settingsLayout: "grid grid-cols-[220px_1fr] gap-4 max-[1100px]:grid-cols-1",
  settingsNav: "h-fit rounded-md border border-border bg-card p-2",
  settingsNavBtn:
    "w-full rounded-[10px] border-0 bg-transparent px-3 py-2.5 text-left text-[13px] font-semibold text-text-2 hover:bg-card-2 hover:text-text-1",
  settingsNavActive: "bg-card-2 text-text-1",

  cloudProvider: "mb-2.5 flex items-center gap-3 rounded-xl border border-border bg-card-2 p-3.5",
  providerMark: "grid h-9 w-9 place-items-center rounded-[10px] text-xs font-extrabold text-white",

  emptyState: "p-12 text-center text-text-3",
  graphPanel:
    "relative overflow-hidden rounded-md border border-border bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.1),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(139,92,246,0.1),transparent_45%),var(--card-2)]",
  graphToolbar: "absolute top-3 right-3 z-[5] flex gap-1.5",
  graphLegend:
    "absolute bottom-3 left-3.5 flex gap-3.5 rounded-[9px] border border-border bg-glass px-3 py-2 text-[11px] text-text-2 backdrop-blur-md",
  stageflow: "flex items-start",
  stage: "relative flex-1 text-center",
  stageNode: "relative z-[2] mx-auto mb-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl",
  stageConn: "absolute top-[26px] right-0 left-0 z-[1] h-0.5 bg-border",
  stageConnDone: "bg-gradient-to-r from-blue-500 to-violet-500",
  lgItem: "flex items-center gap-1.5",
  lgDot: "h-2 w-2 rounded-full",
  toast:
    "fixed right-6 bottom-6 z-[80] animate-[slide-up_0.25s_ease] rounded-xl border border-border-strong bg-card px-4 py-3 shadow-card",
};