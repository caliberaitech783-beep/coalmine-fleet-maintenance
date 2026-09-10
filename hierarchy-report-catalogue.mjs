import {DEPARTMENT_REPORT_TITLES} from './department-reports.mjs';
import {IN_OUT_REPORT_TITLE} from './in-out-report.mjs';
import {canonicalReportTitle} from './director-report-bundle.mjs';

// The Hierarchy master ticks the same report headings the Reports menu shows:
// General Report -> Common Report, then Production, Maintenance and MIS.
// General transfer and movement reports remain separate from the MIS site/day register.
export const HIERARCHY_REPORTS={
  roadStatus:'Report for On Road / Off Road & Idle',
  vehicleTransfer:'Vehicle Transfer Report',
  locationWise:'Total Equipment / Vehicle Location Wise',
  recentBreakdown:'Recent Breakdown Cases',
  inOut:IN_OUT_REPORT_TITLE,
  summary:DEPARTMENT_REPORT_TITLES[13],
  totalSubmitted:DEPARTMENT_REPORT_TITLES[8],
  ticketAcceptance:DEPARTMENT_REPORT_TITLES[9],
  maintenancePending:DEPARTMENT_REPORT_TITLES[10],
  repairTat:DEPARTMENT_REPORT_TITLES[0],
  openOffRoad:DEPARTMENT_REPORT_TITLES[1],
  availability:DEPARTMENT_REPORT_TITLES[2],
  arrivalRedFlag:DEPARTMENT_REPORT_TITLES[11],
  mismatch30:DEPARTMENT_REPORT_TITLES[3],
  unverified:DEPARTMENT_REPORT_TITLES[4],
  misVerificationTime:DEPARTMENT_REPORT_TITLES[5],
  totalFleet:DEPARTMENT_REPORT_TITLES[6],
  misInOut:DEPARTMENT_REPORT_TITLES[7],
  misRedFlag:DEPARTMENT_REPORT_TITLES[12],
};

export const HIERARCHY_REPORT_GROUPS=[
  {group:'Common Report',viewKey:'C',className:'common',reports:[
    HIERARCHY_REPORTS.roadStatus,HIERARCHY_REPORTS.vehicleTransfer,HIERARCHY_REPORTS.locationWise,HIERARCHY_REPORTS.recentBreakdown,HIERARCHY_REPORTS.inOut,HIERARCHY_REPORTS.summary,
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
export const HIERARCHY_REPORT_CODES=new Map(HIERARCHY_REPORT_TITLES.map((title,index)=>[title,`R${index+1}`]));

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
  [DEPARTMENT_REPORT_TITLES[8],HIERARCHY_REPORTS.inOut],
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
