/** Shapes of the JSON data files in public/data. */
export type LonLat = [number, number];
export type Ring = LonLat[];
export type Polygon = Ring[];

export interface ProvinceGeo {
  id: string;
  name: string;
  code: string;
  label: LonLat;
  polys: Polygon[];
}

export interface TurkeyGeo {
  source: string;
  provinces: ProvinceGeo[];
  outline: Ring[];
  neighbors: { name: string; polys: Polygon[] }[];
}

export interface CityEntry {
  id: string;
  name: string;
  year: number;
  title: string;
  active: boolean;
  scenario?: string;
  /** Short badge once the scenario is completed (e.g. "FETHEDİLDİ"). */
  doneLabel?: string;
  /** Shown in the map's info panel: exact date, a short account of the event, chapter contents. */
  date?: string;
  summary?: string;
  chapter?: string[];
}

export interface CitiesFile {
  cities: CityEntry[];
}
