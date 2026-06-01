import { supabase } from '@/lib/supabase';

export type StopReportType =
  | 'missing_stop'
  | 'stop_moved'
  | 'stop_name_error'
  | 'stop_removed'
  | 'route_change'
  | 'other';

export type StopReportStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';
export type StopReportDirection = 'ida' | 'vuelta' | 'ambos' | 'sin_definir';

export type StopReportDraft = {
  userId: string;
  reportType: StopReportType;
  description: string;
  reportedStopName?: string | null;
  suggestedRouteName?: string | null;
  reportedRouteCode?: string | null;
  reportedDirection?: StopReportDirection | null;
  latitude?: number | null;
  longitude?: number | null;
  contextOriginName?: string | null;
  contextDestinationName?: string | null;
  contextRouteName?: string | null;
  contextRouteCode?: string | null;
};

export type StopReportSummary = {
  id: number;
  reportType: StopReportType;
  status: StopReportStatus;
  reportedStopName: string | null;
  suggestedRouteName: string | null;
  reportedRouteCode: string | null;
  reportedDirection: StopReportDirection | null;
  createdAt: string;
};

function toNullableString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function submitStopReport(draft: StopReportDraft) {
  const payload = {
    user_id: draft.userId,
    report_type: draft.reportType,
    descripcion: draft.description.trim(),
    reported_stop_name: toNullableString(draft.reportedStopName),
    suggested_route_name: toNullableString(draft.suggestedRouteName),
    reported_route_code: toNullableString(draft.reportedRouteCode),
    reported_direction: draft.reportedDirection ?? null,
    latitude: typeof draft.latitude === 'number' ? draft.latitude : null,
    longitude: typeof draft.longitude === 'number' ? draft.longitude : null,
    context_origin_name: toNullableString(draft.contextOriginName),
    context_destination_name: toNullableString(draft.contextDestinationName),
    context_route_name: toNullableString(draft.contextRouteName),
    context_route_code: toNullableString(draft.contextRouteCode),
    source: 'mobile_manual',
  };

  const { data, error } = await supabase
    .from('stop_reports')
    .insert(payload)
    .select(
      'id, report_type, status, reported_stop_name, suggested_route_name, reported_route_code, reported_direction, created_at',
    )
    .single();

  if (error) throw error;

  return {
    id: Number(data.id),
    reportType: data.report_type as StopReportType,
    status: data.status as StopReportStatus,
    reportedStopName: data.reported_stop_name ?? null,
    suggestedRouteName: data.suggested_route_name ?? null,
    reportedRouteCode: data.reported_route_code ?? null,
    reportedDirection: (data.reported_direction as StopReportDirection | null) ?? null,
    createdAt: data.created_at as string,
  } satisfies StopReportSummary;
}

export async function listMyStopReports(userId: string, limit = 5): Promise<StopReportSummary[]> {
  const { data, error } = await supabase
    .from('stop_reports')
    .select(
      'id, report_type, status, reported_stop_name, suggested_route_name, reported_route_code, reported_direction, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    reportType: row.report_type as StopReportType,
    status: row.status as StopReportStatus,
    reportedStopName: row.reported_stop_name ?? null,
    suggestedRouteName: row.suggested_route_name ?? null,
    reportedRouteCode: row.reported_route_code ?? null,
    reportedDirection: (row.reported_direction as StopReportDirection | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
