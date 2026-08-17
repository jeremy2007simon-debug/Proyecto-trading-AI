# Bloque 5 — Strategy Discovery & Validation Engine

## 1. Executive Summary

Se construyó un framework de investigación de estrategias con disciplina anti-overfitting (presupuesto
acotado, funnel de validación de 9 etapas, control de data snooping) y se aplicó a 8 familias
genuinamente nuevas (no derivadas de Mean Reversion/ORB, ya rechazadas en el Bloque 4.5): Momentum/Trend,
Pullback in Trend, Volatility Breakout, Gap/Overnight, Intraday Seasonality, Volatility Regime, Pairs
Relative Value, y Relative Strength. **24 configuraciones base** se probaron en total.

**Resultado**: CANDIDATES FOUND — READY FOR BLOCK 6. Las **22 configuraciones del funnel estándar** (Momentum/Trend, Pullback,
Volatility Breakout, Gap/Overnight, Intraday Seasonality, Volatility Regime, Pairs) fueron **todas
REJECTED** — ninguna sobrevivió siquiera a la Stage 3 (costes), consistente con los Bloques 4 y 4.5.
La **única señal real de este bloque** viene de la Familia F (Relative Strength / rotación mensual
SPY-QQQ-IWM-DIA): la configuración de **3 meses de lookback** bate tanto a Buy&Hold SPY como a un
blend equal-weight de los 4 activos por un margen no trivial (~+2pp de CAGR sobre cada uno), con OOS
positivo y 77% de ventanas rodantes de 12 meses positivas — clasificada **CANDIDATE**. La variante de
**6 meses de lookback**, en cambio, apenas empata con el equal-weight (margen de CAGR ~0.1pp, ruido) y
queda en **RESEARCH**. Esta divergencia entre solo 2 configuraciones de la misma familia es en sí misma
una señal de cautela — ver sección 18 (data snooping) y la recomendación (sección 22).

## 2. Research Methodology

HIPÓTESIS → TEST → INTENTO DE REFUTACIÓN → VALIDACIÓN. Cada estrategia parte de una hipótesis económica
documentada en su propio código fuente (`hypothesis` en la metadata `Strategy`, Fase 1). Funnel de 9
etapas (Sanity, Zero-cost, Costes, Histórico largo, OOS, Walk-forward, Cross-asset, Régimen, Monte Carlo)
implementado en `scripts/research/run-block5-funnel.ts`, reutilizando el motor/metrics/walk-forward/Monte
Carlo del Bloque 4 sin modificarlos (ver Fase 0 más abajo). Ningún parámetro se ajustó después de mirar
resultados OOS/walk-forward — todos definidos ANTES de ejecutar (ver el presupuesto de investigación en
el plan aprobado).

## 3. Estrategias/familias probadas

| Familia | Configs | Mejor config (por expectancyR realista) | expectancyR | Clasificación |
|---|---|---|---|---|
| Gap Continuation | 3 | Gap Continuation (gap>=0.3pct) | -0.254 | REJECTED |
| Momentum Trend | 3 | Momentum Trend (N=40) | -0.232 | REJECTED |
| Pairs Spread Reversion | 4 | Pairs SPY/DIA (z=1.5) | -5.929 | REJECTED |
| Session Momentum | 3 | Session Momentum (window=60min) | -1.169 | REJECTED |
| Trend Pullback | 3 | Trend Pullback (depth=1.5ATR) | -0.106 | REJECTED |
| Volatility Breakout | 3 | Volatility Breakout (compression<=40pct) | -0.955 | REJECTED |
| Volatility Regime Momentum | 3 | Volatility Regime Momentum (ADX>=30) | -0.453 | REJECTED |
| Relative Strength (Familia F, funnel adaptado) | 2 | — | — | ver tabla abajo |

### Relative Strength (Familia F) — detalle

| Config | Retorno total (0bps) | Retorno total (20bps) | Retorno OOS | % ventanas 12m positivas | Clasificación |
|---|---|---|---|---|---|
| Relative Strength (3mo lookback) | 417.08% | 369.35% | 15.75% | 77.0% | CANDIDATE |
| Relative Strength (6mo lookback) | 292.21% | 270.55% | 28.33% | 74.5% | RESEARCH |

## 4. Número total de experimentos

**24** configuraciones base (22 en el funnel estándar de un solo activo/pares + 2 de Relative Strength con funnel adaptado), dentro del presupuesto de 20-50 definido antes de ejecutar.

## 5. Funnel de supervivencia

| Etapa | Sobrevivientes |
|---|---|
| Sanity | 22/22 |
| Zero-cost gross edge | 5/22 |
| Costes (realista, 5bps) | 0/22 |
| OOS | 0/22 |
| Walk-forward (mayoría positiva) | 0/22 |

## 6. Estrategias rechazadas (REJECTED)

| Estrategia | Activo | Timeframe | expectancyR (0bps) | expectancyR (5bps) | Break-even cost | Motivo |
|---|---|---|---|---|---|---|
| Gap Continuation (gap>=0.3pct) | SP500 | 1d | -0.202 | -0.254 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Gap Continuation (gap>=0.5pct) | SP500 | 1d | -0.410 | -0.460 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Gap Continuation (gap>=1pct) | SP500 | 1d | -0.294 | -0.337 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Momentum Trend (N=10) | SP500 | 1h | -0.085 | -0.302 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Momentum Trend (N=20) | SP500 | 1h | -0.068 | -0.253 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Momentum Trend (N=40) | SP500 | 1h | -0.008 | -0.232 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Pairs SPY/DIA (z=1.5) | SP500 | 15m | 0.179 | -5.929 | 0.14bps | Non-positive expectancyR at realistic execution cost (break-even cost ~0.14bps). |
| Pairs SPY/DIA (z=2) | SP500 | 15m | 0.230 | -6.378 | 0.17bps | Non-positive expectancyR at realistic execution cost (break-even cost ~0.17bps). |
| Pairs SPY/QQQ (z=1.5) | SP500 | 15m | 0.170 | -9.051 | 0.09bps | Non-positive expectancyR at realistic execution cost (break-even cost ~0.09bps). |
| Pairs SPY/QQQ (z=2) | SP500 | 15m | 0.268 | -9.983 | 0.13bps | Non-positive expectancyR at realistic execution cost (break-even cost ~0.13bps). |
| Session Momentum (window=30min) | SP500 | 5m | -0.059 | -1.208 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Session Momentum (window=45min) | SP500 | 5m | -0.082 | -1.182 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Session Momentum (window=60min) | SP500 | 5m | -0.046 | -1.169 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Trend Pullback (depth=0.5ATR) | SP500 | 1h | -0.379 | -0.644 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Trend Pullback (depth=1.5ATR) | SP500 | 1h | 0.107 | -0.106 | 2.52bps | Non-positive expectancyR at realistic execution cost (break-even cost ~2.52bps). |
| Trend Pullback (depth=1ATR) | SP500 | 1h | -0.034 | -0.256 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Volatility Breakout (compression<=20pct) | SP500 | 15m | -0.377 | -1.226 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Volatility Breakout (compression<=30pct) | SP500 | 15m | -0.258 | -1.052 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Volatility Breakout (compression<=40pct) | SP500 | 15m | -0.203 | -0.955 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Volatility Regime Momentum (ADX>=20) | SP500 | 30m | -0.167 | -0.495 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Volatility Regime Momentum (ADX>=25) | SP500 | 30m | -0.132 | -0.465 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |
| Volatility Regime Momentum (ADX>=30) | SP500 | 30m | -0.182 | -0.453 | NEGATIVE_AT_ZERO_COST | No positive gross (zero-cost) edge — nothing for realistic costs to erode. |

## 7. Estrategias RESEARCH

Ninguna configuración quedó clasificada como RESEARCH — cada una fue REJECTED o superó el listón hasta CANDIDATE.

## 8. Estrategias CANDIDATE

- **Relative Strength (3mo lookback)** (rotación SPY/QQQ/IWM/DIA) — ver sección 10.

## 9. Estrategias VALIDATED

Ninguna — estándar extremadamente alto, no es obligatorio alcanzarlo en este bloque.

## 10. Mejores resultados netos (top candidatos, si los hay)

### Relative Strength (3mo lookback)

- Hipótesis: rotación mensual hacia el activo (SPY/QQQ/IWM/DIA) con mayor retorno de los últimos 3 meses.
- Retorno total (20bps turnover): 369.35% sobre 124 meses (417.08% a 0bps).
- CAGR: 16.14% vs. Buy&Hold SPY 13.68% (margen +2.46pp) vs. Equal-weight 4 activos 14.10% (margen +2.04pp).
- Max Drawdown: 25.07%. Sharpe (mensual, no anualizado): 0.274.
- Break-even turnover cost: Expectancy stays >= 0 across the entire tested range (0-50bps) — the break-even cost is beyond what was tested here.
- Out-of-sample (últimos 25 meses): 15.75%.
- % de ventanas rodantes de 12 meses positivas (adaptación de walk-forward): 77.0% (113 ventanas).
- Monte Carlo (reshuffle de retornos mensuales, 1000 sims): drawdown P50 23.89%, P95 39.34%; equity terminal P5 1.91x, P50 4.53x.
- Cross-asset / régimen: no aplica de la forma estándar — la estrategia ya rota entre los 4 activos por construcción, y no existe tagging de régimen por trade para una rotación mensual (ver Limitaciones).
- Clasificación: **CANDIDATE** — Clears zero-cost, realistic-cost, OOS, and rolling-window bars, AND beats both naive alternatives by a non-trivial margin (CAGR +2.46pp vs. buy-and-hold, +2.04pp vs. equal-weight). Cross-asset/regime/Monte-Carlo-catastrophe checks don't apply the same way to a rotation strategy that already spans all 4 assets by construction, so this can't reach VALIDATED under the standard criteria.

## 11. Out-of-sample

Ver columna "expectancyR (OOS)" embebida en cada archivo `results/block5/stage-results/*.json` (campo `summary.oosExpectancyR`) — 0 de 22 configuraciones mostraron OOS positivo.

## 12. Walk-forward

0 de 22 configuraciones mostraron mayoría de ventanas forward positivas (>=50%). Ventanas dimensionadas por timeframe (8/2/2/2 meses train/validation/forward/step, aproximado vía barras-por-mes, documentado en `run-block5-funnel.ts`).

## 13. Monte Carlo

Calculado únicamente para configuraciones que superaron la Stage 3 (costes) — ver `monteCarlo` en cada archivo de resultados. Detalle de candidatos en la sección 10.

## 14. Cross-asset

Probado únicamente para estrategias de un solo activo que superaron la Stage 3 (QQQ/IWM/DIA, mismos parámetros, sin retuning). Familia Pairs es intrínsecamente cross-asset por construcción; Relative Strength rota entre los 4 activos por construcción.

## 15. Regime analysis

Extraído directamente de `performanceByRegime` (ya calculado por el motor existente, cero código nuevo) en cada archivo de resultados, para las configuraciones que llegaron a la Stage 3.

## 16. Transaction-cost sensitivity

Barrido 0/1/2/3/5bps aplicado a las 22 configuraciones del funnel estándar (`costSensitivity` en cada resultado). Para Relative Strength, sensibilidad de coste de turnover 0/10/20/30/50bps por rebalanceo (adaptación documentada — no hay slippage/spread por trade en una rotación mensual).

## 17. Break-even costs

Ver columna "Break-even cost" en la sección 6, y `breakEven`/`costRobustness` en cada archivo de resultados.

## 18. Data snooping considerations

**24 configuraciones totales probadas**, 22 rechazadas, 1 en RESEARCH, 1 en CANDIDATE/VALIDATED. Probabilistic/Deflated Sharpe Ratio (Bailey & López de Prado) calculado ÚNICAMENTE para candidatos (Stage 6+), nunca para las 24 configuraciones base — ver sección 10 si aplica. Limitación explícita: el número de "trials" usado en el DSR es el conteo de configuraciones REALMENTE probadas por familia en este bloque, no el universo de estrategias imaginables.

## 19. Correlación entre candidatos

No aplica — se necesitan al menos 2 candidatos para calcular correlación (aquí hay 1).

## 20. Bugs encontrados

- **Motor**: `BacktestConfig.strategyParameterOverrides` NO es leído por el motor (solo se persiste para auditoría en el repositorio) — los scripts de investigación deben usar `StrategyManager.setParameters` para que las variantes de parámetros realmente se apliquen. Corregido en `run-block5-funnel.ts`; documentado explícitamente en el código para que no se repita.
- **Estrategia Pairs Spread Reversion**: el stop inicial (placed relative to the rolling mean via a fixed z-score line) podía quedar en el lado incorrecto de la entrada cuando el z-score real superaba el umbral de entrada por un margen mayor al buffer del stop — invirtiendo el riesgo de la operación. Corregido anclando el stop a la distancia desde la ENTRADA, no desde la media; test de regresión añadido.
- **supportedMarkets**: las 6 estrategias de un solo activo inicialmente solo declaraban SP500 — la Stage 7 (cross-asset) del funnel fallaba con `STRATEGY_ERROR`. Corregido ampliando `supportedMarkets` (mismo patrón ya usado en el Bloque 4.5 para MR/ORB), sin cambios a `generateSignal`.
- Ningún bug de contabilización de costes (el modelo del Bloque 4.5 se reutiliza sin cambios).

## 21. Limitaciones

- El histórico largo (2016-presente) solo se solicita para el activo NATIVO de cada estrategia (y para las dos piernas de cada par) — no para los 3 activos cross-asset, por presupuesto de cómputo.
- Walk-forward corre sobre la ventana de 2 años (no el histórico largo) — consistente con el Bloque 4.5, documentado.
- Relative Strength usa un modelo de coste de turnover simplificado (bps fijos por rebalanceo), no slippage/spread por trade — no hay equivalente exacto para una estrategia de rotación mensual.
- Family I (multi-señal) no se construyó — ninguna estrategia individual superó la Stage 3, precondición explícita del usuario para investigarla.

## 22. Recomendación Bloque 6

**CANDIDATES FOUND — READY FOR BLOCK 6, CON CAUTELA EXPLÍCITA.** El único candidato es Relative Strength (3mo lookback) — sección 10. Antes de darle más peso del que merece: (a) solo se probaron 2 configuraciones de esta familia (3mo y 6mo) — un DSR/PSR calculado sobre una muestra de 2 trials tiene poder estadístico limitado, ver sección 10; (b) la variante de 6mo casi idéntica en espíritu NO reprodujo el mismo margen sobre el equal-weight — la robustez a través de la única variación de parámetro probada es débil, no fuerte; (c) el motor de rotación mensual es nuevo en este bloque y tiene mucho menos escrutinio (menos tests, sin auditoría de costos dedicada tipo Fase 1 del Bloque 4.5) que el motor de trading intradía. Recomendación concreta: llevar esta única configuración a paper trading real (Bloque 6) con capital simulado, sin tocar sus parámetros, y NO tratar el resultado como una estrategia validada hasta observar su comportamiento fuera de esta muestra en tiempo real. Las 22 configuraciones del funnel estándar quedan descartadas — no avanzan a Bloque 6.

---
*Generado por `scripts/research/generate-block5-report.ts`. Resultados crudos en `results/block5/**` (JSON, no versionado — ver `.gitignore`).*

## Apéndice: Market vs Limit (completando el Bloque 4.5)

| Estrategia | MARKET expectancyR (return%) | LIMIT expectancyR (return%) | LIMIT fill rate |
|---|---|---|---|
| mean-reversion | -0.597 (-72.73%) | -0.220 (-41.07%) | 93.5% |
| opening-range-breakout | -0.797 (-89.62%) | -0.264 (-58.27%) | 98.3% |
