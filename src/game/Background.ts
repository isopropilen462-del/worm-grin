export type BackgroundId = 'day' | 'sunset' | 'night' | 'storm';

export interface BackgroundTheme {
  id: BackgroundId;
  label: string;
  skyTop: string;
  skyBottom: string;
  sunColor: string;
  sunGlow: string;
  hillColor: string;
  water: string;
  waterDeep: string;
  stars?: boolean;
  rain?: boolean;
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundTheme> = {
  day: {
    id: 'day',
    label: 'День',
    skyTop: '#1A3A5C',
    skyBottom: '#4A8BC2',
    sunColor: 'rgba(255,212,0,0.55)',
    sunGlow: 'rgba(255,212,0,0)',
    hillColor: 'rgba(10,10,10,0.25)',
    water: '#1E5F8A',
    waterDeep: '#0D3A54',
  },
  sunset: {
    id: 'sunset',
    label: 'Закат',
    skyTop: '#2D1B4E',
    skyBottom: '#FF6B35',
    sunColor: 'rgba(255,120,40,0.7)',
    sunGlow: 'rgba(255,80,20,0)',
    hillColor: 'rgba(30,10,20,0.35)',
    water: '#3D2A5C',
    waterDeep: '#1A1030',
  },
  night: {
    id: 'night',
    label: 'Ночь',
    skyTop: '#050510',
    skyBottom: '#1A2040',
    sunColor: 'rgba(255,212,0,0.35)',
    sunGlow: 'rgba(255,212,0,0.08)',
    hillColor: 'rgba(0,0,0,0.45)',
    water: '#0A1525',
    waterDeep: '#020810',
    stars: true,
  },
  storm: {
    id: 'storm',
    label: 'Шторм',
    skyTop: '#1A2530',
    skyBottom: '#3A4A55',
    sunColor: 'rgba(200,210,220,0.25)',
    sunGlow: 'rgba(200,210,220,0)',
    hillColor: 'rgba(10,15,20,0.4)',
    water: '#152530',
    waterDeep: '#0A1520',
    rain: true,
  },
};

export function pickRandomBackground(seed?: number): BackgroundTheme {
  const ids = Object.keys(BACKGROUNDS) as BackgroundId[];
  if (seed === undefined) {
    return BACKGROUNDS[ids[Math.floor(Math.random() * ids.length)]]!;
  }
  return BACKGROUNDS[ids[seed % ids.length]]!;
}

export function backgroundById(id: BackgroundId): BackgroundTheme {
  return BACKGROUNDS[id];
}
