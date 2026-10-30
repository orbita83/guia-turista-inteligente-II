/** A screenshot completed before the deadline is a conservative visual witness.
 * A late capture does not establish when the browser first painted the text.
 */
export function assessLatency(sample, { controlled = false, limitMs = 300 } = {}) {
  if (
    controlled ||
    sample.controlled ||
    sample.httpStatus !== 200 ||
    sample.diagnostic?.fallback_utilizado !== false ||
    sample.diagnostic?.status !== 'sucesso'
  ) {
    return {
      verdict: 'BLOCKED',
      exitCode: 2,
      reason: 'Provedor real sem contingência não comprovado.',
    };
  }
  const { requestAt, contentAt, screenshotAt } = sample;
  if (
    ![requestAt, contentAt, screenshotAt].every(Number.isFinite) ||
    contentAt < requestAt ||
    screenshotAt < contentAt
  ) {
    return {
      verdict: 'BLOCKED',
      exitCode: 2,
      reason: 'Sem testemunho visual e timestamps válidos.',
    };
  }
  const domMs = contentAt - requestAt;
  const visualUpperBoundMs = screenshotAt - requestAt;
  return {
    verdict: visualUpperBoundMs < limitMs ? 'PASS' : 'NOT_CERTIFIED',
    exitCode: visualUpperBoundMs < limitMs ? 0 : 1,
    domMs,
    visualUpperBoundMs,
    limitMs,
    reason:
      visualUpperBoundMs < limitMs
        ? 'Captura com conteúdo concluída antes do limite.'
        : 'Captura não comprova conteúdo visível antes do limite; não determina o instante exato de pintura.',
  };
}
