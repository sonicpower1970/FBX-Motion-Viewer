export type BackgroundMode = 'dark' | 'light'

// Display helpers only. Never apply these colors to FBX materials or lights.
export const BACKGROUND_THEMES = {
  dark: {
    background: '#1c232b', gridMinor: '#465361', gridMajor: '#758492',
    boneStart: '#ffe0a3', boneEnd: '#dd9745',
    burnInText: '#f0f0f0', burnInOutline: 'rgba(0,0,0,0.8)', shadowOpacity: 0.32,
  },
  light: {
    background: '#b8b8b8', gridMinor: '#787878', gridMajor: '#505050',
    boneStart: '#754000', boneEnd: '#a35400',
    burnInText: '#20252b', burnInOutline: 'rgba(255,255,255,0.85)', shadowOpacity: 0.32,
  },
} as const
