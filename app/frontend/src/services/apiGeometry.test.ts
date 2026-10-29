import { expect, it } from 'vitest';
import { parseTrip } from './api';

it('preserva a geometria real da resposta para o download GPX', () => {
  const points = [
    [-8.0476, -34.877],
    [-8.0089, -34.8553],
  ];
  expect(parseTrip({ id: 'route', percurso: { geometria: points } })?.percurso.geometria).toEqual(
    points,
  );
});

it.each([
  undefined,
  [],
  [[-8, -34]],
  [
    [-8, -34],
    [91, -34],
  ],
  [
    [-8, -34],
    [-8, 180],
  ],
  [
    [-8, -34],
    ['-8', -34],
  ],
  [
    [-8, -34],
    [NaN, -34],
  ],
])('não permite exportar geometria ausente ou inválida %j', (points) => {
  expect(
    parseTrip({ id: 'route', percurso: { geometria: points } })?.percurso.geometria,
  ).toBeUndefined();
});
