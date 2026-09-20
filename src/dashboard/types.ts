export interface Activity {
  run_id: string | number;
  name: string;
  distance: number;
  moving_time: string;
  type: string;
  subtype?: string;
  start_date?: string;
  start_date_local: string;
  location_country?: string | null;
  summary_polyline?: string | null;
  average_heartrate?: number | null;
  average_speed: number;
  elevation_gain: number | null;
  source?: string;
  streak: number;
}

export type SportFilter = 'all' | 'Run';
