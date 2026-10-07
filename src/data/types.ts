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
}

export interface CitiesFile {
  cities: CityEntry[];
}
