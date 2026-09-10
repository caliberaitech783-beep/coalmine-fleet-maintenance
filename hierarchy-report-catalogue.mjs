import {IN_OUT_REPORT_TITLE} from './in-out-report.mjs';
import {canonicalReportTitle} from './director-report-bundle.mjs';

// The Hierarchy master ticks the same report headings the Reports menu shows:
// General Report, then Production, Maintenance and MIS.
// General transfer and movement reports remain separate from the MIS site/day register.
export const HIERARCHY_REPORTS={
  roadStatus:'Report for On Road / Off Road & Idle',
  vehicleTransfer:'Vehicle Transfer Report',
  locationWise:'Total Equipment / Vehicle Location Wise',
  recentBreakdown:'Recent Breakdown Cases',
  inOut:IN_OUT_REPORT_TITLE,
  // Department headings are spelled out so a reordered DEPARTMENT_REPORT_TITLES cannot shift a tick onto another report.
  summary:'Summary Report',
  totalSubmitted:'Total Request Submitted Report',
  ticketAcceptance:'Ticket Acceptance from Maintenance (Timelinewise)',
  maintenancePending:'Maintenance Status Pending',
  repairTat:'Turn Around Time for Repair',
  openOffRoad:'Open Off road Cases',
  availability:'Availability Report',
  arrivalRedFlag:'Vehicle Arrival Red Flag Report',
  mismatch30:'30 Min. Mismatch',
  unverified:'Unverified Cases',
  misVerificationTime:'MIS Turn Around Time',
  totalFleet:'Total Fleet',
  misInOut:'Total In and out count report',
  misRedFlag:'MIS Red Flag Report',
};

export const HIERARCHY_REPORT_GROUPS=[
  {group:'General Report',viewKey:'C',className:'common',reports:[
    HIERARCHY_REPORTS.roadStatus,HIERARCHY_REPORTS.vehicleTransfer,HIERARCHY_REPORTS.locationWise,HIERARCHY_REPORTS.recentBreakdown,HIERARCHY_REPORTS.summary,
  ]},
  {group:'Production Report',viewKey:'P',className:'production',reports:[
    HIERARCHY_REPORTS.totalSubmitted,HIERARCHY_REPORTS.ticketAcceptance,HIERARCHY_REPORTS.maintenancePending,
  ]},
  {group:'Maintenance Report',viewKey:'M',className:'maintenance',reports:[
    HIERARCHY_REPORTS.repairTat,HIERARCHY_REPORTS.openOffRoad,HIERARCHY_REPORTS.availability,HIERARCHY_REPORTS.arrivalRedFlag,
  ]},
  {group:'MIS Report',viewKey:'S',className:'mis',reports:[
    HIERARCHY_REPORTS.mismatch30,HIERARCHY_REPORTS.unverified,HIERARCHY_REPORTS.misVerificationTime,HIERARCHY_REPORTS.totalFleet,HIERARCHY_REPORTS.misInOut,HIERARCHY_REPORTS.misRedFlag,
  ]},
];

export const HIERARCHY_REPORT_TITLES=HIERARCHY_REPORT_GROUPS.flatMap((group)=>group.reports);
// Display codes only; stored report titles and visibility keys remain unchanged.
export const HIERARCHY_REPORT_CODES=new Map(HIERARCHY_REPORT_GROUPS.flatMap(group=>
  group.reports.map((title,index)=>[title,`${({C:'G',P:'P',M:'M',S:'MS '})[group.viewKey]}${index+1}`])
));

// Reports that used to be ticked in the Hierarchy master, and the scheduled
// WhatsApp bundles that still carry them, map onto the catalogue heading that
// covers the same cases so existing ticks keep meaning what they meant.
export const LEGACY_HIERARCHY_REPORT_EQUIVALENTS=new Map([
  ['Time Taken for MIS Verification',HIERARCHY_REPORTS.misVerificationTime],
  ['Location wise opened BD',HIERARCHY_REPORTS.totalSubmitted],
  ['Location wise closing BD',HIERARCHY_REPORTS.repairTat],
  ['MIS Verification Report',HIERARCHY_REPORTS.misVerificationTime],
  ['Idle Vehicle Report',HIERARCHY_REPORTS.openOffRoad],
  ['Off Road to MIS Veri.',HIERARCHY_REPORTS.misVerificationTime],
  ['Off Road to Maint. Close',HIERARCHY_REPORTS.repairTat],
  ['Event close Report - Maint. Closing to MIS Verif.',HIERARCHY_REPORTS.misVerificationTime],
  ['Idle with PM verif.',HIERARCHY_REPORTS.openOffRoad],
  ['On Road with first trip veri.',HIERARCHY_REPORTS.mismatch30],
  // The General In and Out Report left the Reports menu; its tick and scheduled bundle follow the MIS in/out register.
  [HIERARCHY_REPORTS.inOut,HIERARCHY_REPORTS.misInOut],
]);

export function hierarchyReportEquivalent(title){
  const canonical=canonicalReportTitle(title);
  return LEGACY_HIERARCHY_REPORT_EQUIVALENTS.get(canonical)||canonical;
}

export function normalizeHierarchyReportAccess(value=''){
  return [...new Set(String(value||'').split(/\s*\|\s*/).map((report)=>hierarchyReportEquivalent(report.trim())).filter(Boolean))].join(' | ');
}

// A due scheduled report is delivered when its catalogue equivalent is ticked.
export function hierarchyAccessAllowsReport(reportAccess,title){
  const allowed=new Set(normalizeHierarchyReportAccess(reportAccess).split(/\s*\|\s*/).filter(Boolean));
  return allowed.has(hierarchyReportEquivalent(title));
}
