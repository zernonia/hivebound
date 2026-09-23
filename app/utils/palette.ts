import type { Terrain } from './world'

export interface Palette {
  terrain: Record<Terrain, string>
  /** Tint mixed in for tiles still hidden by fog. */
  fog: string
  soil: string
  soilDark: string
  water: string
  sky: [string, string]
}

/** Soft pastel default palette. */
export const PALETTE_DEFAULT: Palette = {
  terrain: {
    hive: '#f7d28b',
    clearing: '#e9d9a6',
    grass: '#a6d98a',
    meadow: '#c3e38e',
    flowers: '#b9dd97',
    forest: '#7fbf7a',
    water: '#8fd3e8',
    edge: '#f3e9f5',
  },
  fog: '#f6f1ea',
  soil: '#d9b48f',
  soilDark: '#b98f6c',
  water: '#8fd3e8',
  sky: ['#ffe7c2', '#cfe8ff'],
}

/**
 * Colour-vision-friendly palette: terrain is separated by lightness as well as
 * hue (blue / yellow axis), so tiles stay distinct for red-green colour blindness.
 */
export const PALETTE_CVD: Palette = {
  terrain: {
    hive: '#ffd166',
    clearing: '#f2e3b3',
    grass: '#b8d98c',
    meadow: '#e3e58a',
    flowers: '#d6e6a1',
    forest: '#5f9a78',
    water: '#6fb7ea',
    edge: '#eef0f6',
  },
  fog: '#eef0f6',
  soil: '#cfb08e',
  soilDark: '#9e8062',
  water: '#6fb7ea',
  sky: ['#fff0cf', '#d4e9ff'],
}
