export { renderReportDocx, renderReportDocxFromModel } from "./docx";
export { renderReportPdf, renderReportPdfFromModel } from "./pdf";
export {
  buildReportModel,
  buildCharts,
  deriveRecommendations,
  deriveRisks,
  disclaimerParagraphs,
  MANDATORY_DISCLAIMER,
  type Block,
  type ReportModel,
  type Section,
  type TableColumn,
  type TableRow,
  type Recommendation,
  type RiskItem,
} from "./model";
export * from "./format";
