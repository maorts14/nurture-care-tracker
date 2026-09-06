export type ActivityKind = "feeding" | "diaper" | "custom";

export interface CareEvent {
  id: string;
  activityId: string;
  kind: ActivityKind;
  title: string;
  eventTime: string;
  createdBy: string;
  note?: string;
  detail?: string;
}

export interface Activity {
  id: string;
  name: string;
  kind: ActivityKind;
  color: string;
  intervalHours?: number;
}
