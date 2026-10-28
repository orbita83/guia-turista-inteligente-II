/// <reference types="node" />
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vite-plus/test';

const tokensCss = readFileSync('src/styles/tokens-base.css', 'utf8');

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tokensCss.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!match) throw new Error(`Bloco de tema ausente: ${selector}`);
  return match[1];
}

function color(name: string, dark: boolean): string {
  const declarations = dark ? `${block(':root')}\n${block("[data-theme='dark']")}` : block(':root');
  const matches = [...declarations.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))];
  const value = matches.at(-1)?.[1];
  if (!value) throw new Error(`Token de cor ausente: ${name}`);
  return value;
}

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g);
  if (!channels) throw new Error(`Cor inválida: ${hex}`);
  const [red, green, blue] = channels.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first: string, second: string): number {
  const left = luminance(first);
  const right = luminance(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

describe.each([false, true])('contraste do tema escuro: %s', (dark) => {
  it.each([
    ['--text-main', '--bg-card'],
    ['--text-secondary', '--bg-subtle'],
    ['--text-muted', '--bg-card'],
    ['--primary', '--bg-subtle'],
    ['--success', '--success-surface'],
    ['--danger', '--error-surface'],
    ['--warning', '--warning-surface'],
    ['--info-ink', '--info-surface'],
    ['--header-ink', '--header-bg'],
    ['--header-muted', '--header-bg'],
    ['--header-brand', '--header-bg'],
    ['--placeholder', '--bg-card'],
    ['--on-action', '--action-bg'],
    ['--on-action', '--danger-action-hover'],
  ])('%s sobre %s atende 4,5:1', (foreground, background) => {
    expect(contrast(color(foreground, dark), color(background, dark))).toBeGreaterThanOrEqual(4.5);
  });

  it('mantém o contorno dos controles perceptível', () => {
    expect(
      contrast(color('--control-border', dark), color('--bg-card', dark)),
    ).toBeGreaterThanOrEqual(3);
  });
});
