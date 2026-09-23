/**
 * Theme Presets for Zero Studio
 * Multi-theme palette engine with instant CSS variable updates
 */

export interface ThemePreset {
  id: string;
  name: string;
  type: 'dark' | 'light';
  bg: string;
  cardBg: string;
  text: string;
  sidebar: string;
  accent: string;
  border: string;
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  slate: {
    id: 'slate',
    name: 'تاریک استاندارد (Slate)',
    type: 'dark',
    bg: '#0f172a',
    cardBg: '#1e293b',
    sidebar: '#020617',
    text: '#f8fafc',
    accent: '#3b82f6',
    border: '#334155',
  },
  midnight: {
    id: 'midnight',
    name: 'شب تاریک (Midnight)',
    type: 'dark',
    bg: '#0f1620',
    cardBg: '#18222f',
    sidebar: '#0b121b',
    text: '#cdd6e3',
    accent: '#5ea8e0',
    border: '#233246',
  },
  carbon: {
    id: 'carbon',
    name: 'کربن صنعتی (Carbon)',
    type: 'dark',
    bg: '#161616',
    cardBg: '#202020',
    sidebar: '#101010',
    text: '#dad9d6',
    accent: '#d9a566',
    border: '#303030',
  },
  forest: {
    id: 'forest',
    name: 'جنگلی (Forest)',
    type: 'dark',
    bg: '#1b211a',
    cardBg: '#222a21',
    sidebar: '#161b15',
    text: '#d3dad9',
    accent: '#7fbf8b',
    border: '#2f3b2e',
  },
  dracula: {
    id: 'dracula',
    name: 'دراکولا (Dracula)',
    type: 'dark',
    bg: '#282a36',
    cardBg: '#313341',
    sidebar: '#21222c',
    text: '#f8f8f2',
    accent: '#bd93f9',
    border: '#44475a',
  },
  ember: {
    id: 'ember',
    name: 'آتشین (Ember)',
    type: 'dark',
    bg: '#1f1517',
    cardBg: '#2a1c1d',
    sidebar: '#190f11',
    text: '#ecdad6',
    accent: '#e0907a',
    border: '#3d282a',
  },
  paper: {
    id: 'paper',
    name: 'کاغذ روشن (Paper)',
    type: 'light',
    bg: '#f7f7f5',
    cardBg: '#ffffff',
    sidebar: '#eeecea',
    text: '#1a1a1a',
    accent: '#2563eb',
    border: '#cbd5e1',
  },
  rose: {
    id: 'rose',
    name: 'رز صورتی (Rose)',
    type: 'light',
    bg: '#fdf0f4',
    cardBg: '#fff5f8',
    sidebar: '#f8e4ec',
    text: '#2a1020',
    accent: '#d0406a',
    border: '#f3c6d6',
  },
  sky: {
    id: 'sky',
    name: 'آسمانی (Sky)',
    type: 'light',
    bg: '#e8f0fb',
    cardBg: '#ffffff',
    sidebar: '#dce8f8',
    text: '#1a2540',
    accent: '#0284c7',
    border: '#bae6fd',
  },
  emerald: {
    id: 'emerald',
    name: 'زمردی (Emerald)',
    type: 'dark',
    bg: '#064e3b',
    cardBg: '#047857',
    sidebar: '#022c22',
    text: '#ecfdf5',
    accent: '#34d399',
    border: '#059669',
  },
};

export function applyThemePreset(themeId: string) {
  const theme = THEME_PRESETS[themeId] || THEME_PRESETS.slate;
  const root = document.documentElement.style;

  root.setProperty('--zero-bg', theme.bg);
  root.setProperty('--zero-card-bg', theme.cardBg);
  root.setProperty('--zero-sidebar', theme.sidebar);
  root.setProperty('--zero-text', theme.text);
  root.setProperty('--zero-accent', theme.accent);
  root.setProperty('--zero-border', theme.border);

  localStorage.setItem('zero_theme_preset', themeId);
}
