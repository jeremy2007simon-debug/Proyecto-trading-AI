# Bloque 6 — Candidate Verification & Paper Trading

*Todas las cifras de este informe provienen de una única ejecución consistente de los scripts de
`scripts/block6/` contra datos reales de Alpaca (`adjustment: "all"`, splits + dividendos), generada el
2026-08-17 ~15:20 UTC. Los JSON fuente viven en `results/block6/**` (gitignored) — este documento es la
única versión persistida en el repositorio.*

## 1. Resumen ejecutivo

El Bloque 5 dejó un único candidato: **Relative Strength, lookback de 3 meses**, rotación mensual entre
SPY/QQQ/IWM/DIA, ganador único al 100%. El objetivo de este bloque no era mejorar la estrategia sino
**intentar refutarla**: congelarla de forma inmutable, auditar su motor de forma independiente, y
construir (sin activar) la infraestructura de paper trading real contra Alpaca.

**La auditoría no encontró bugs.** El motor no tiene look-ahead bias, el cash handling y el resampling
mes-a-mes son correctos, y una reimplementación independiente (código separado, sin compartir ni una
línea con el motor de producción) reproduce sus 124 rebalanceos con **0 discrepancias**. Se confirmó y
cuantificó un hallazgo real: `alpaca.adapter.ts` nunca fijaba el parámetro `adjustment` de Alpaca, así
que todo el resultado del Bloque 5 se calculó sobre precios sin ajustar por dividendos/splits — el CAGR
correcto (ajustado) es 17.24%, no el 16.11% reportado antes (ver sección 6).

**Pero la verificación histórica completa reveló algo que cambia la conclusión**: aunque el candidato
tiene un edge positivo en toda su historia (2016-2026, CAGR 17.24% vs SPY 15.46%), en los **últimos 25
meses** (aprox. sept-2024 a ago-2026) muestra un **underperformance severo y persistente**: -26.9 puntos
porcentuales de retorno frente a SPY, alpha anualizado -14.0%, information ratio -1.12, y una relación de
captura invertida (captura solo 84.5% de las subidas de SPY pero 159.7% de las bajadas) — tres años
consecutivos de underperformance (2024: -17.6pp, 2025: -9.4pp, 2026 YTD: -0.3pp). Ver sección 11.

Presentado este hallazgo al usuario antes de tocar la Alpaca Trading API real, la decisión explícita fue:
**construir toda la infraestructura de paper trading (Fases 16-19) para tenerla lista y probada, pero NO
activar el envío real de órdenes ni crear la Routine mensual automática**. El resultado de este bloque
es por tanto:

> ## DECISIÓN: **AUDIT PASSED — PAPER READY**
> *(nunca PAPER RUNNING, nunca VALIDATED — ver sección 22)*

La auditoría pasó y la infraestructura está lista y probada (código + 540 tests), pero **deliberadamente
no se ha activado** dado el hallazgo de underperformance reciente. `PAPER_READY` no significa que la
estrategia esté validada — significa que la auditoría es correcta, es reproducible, no tiene look-ahead,
los benchmarks son correctos, y la infraestructura de ejecución (aún inactiva) está lista.

## 2. El candidato congelado: `RS3M_CANDIDATE_V1`

Definido en `src/core/paper-trading/rs3m/candidate.ts`, `Object.freeze` profundo, hash determinista
(`fnv1a` sobre JSON canónico, reutilizado de `experiment-registry.ts` del Bloque 5):

| Campo | Valor |
|---|---|
| `candidateId` | `RS3M_CANDIDATE_V1` |
| `version` | 1 |
| `lookbackMonths` | 3 |
| `universe` | SP500 (SPY), NASDAQ100 (QQQ), RUSSELL2000 (IWM), DOWJONES (DIA) |
| `rebalanceFrequency` | MONTHLY |
| `weighting` | SINGLE_WINNER_100PCT |
| `referenceRebalanceCostBps` | 20 |
| `priceAdjustment` | `"all"` (splits + dividendos) |
| `datasetFrom` | 2016-01-01 |
| **Hash** | **`1c28b57c`** |

Un test de regresión (`tests/core/paper-trading/rs3m/candidate.test.ts`) fija este hash como literal: si
alguien edita `RS3M_CANDIDATE_V1` in-place, el test falla. Cualquier cambio de parámetro futuro debe
publicarse como `RS3M_CANDIDATE_V2`, nunca como una edición de V1. Inmutabilidad en runtime verificada
(`Object.isFrozen`, incluyendo el array `universe`).

## 3. Principio rector: qué NO se hizo

Cero cambios a lookback, universo, frecuencia de rebalanceo, weighting, o la ausencia de stop-loss/take-
profit. No se probaron 1m/2m/4m/5m/7m de lookback (la comparación 3m-vs-6m de la sección 20 reutiliza
resultados YA EXISTENTES del Bloque 5). No se construyó el Consensus Engine. No se usó ningún dato
forward (no existe todavía) para reajustar el candidato. Ningún hallazgo de esta auditoría cambió un solo
parámetro de `RS3M_CANDIDATE_V1` — cualquier resultado desfavorable se reporta como tal, no se "arregla."

## 4. Pipeline documentado: data cutoff → señal → orden → ejecución

1. **Data cutoff**: cierre del último día hábil del mes calendario. Solo se usan velas con timestamp
   ≤ ese cierre.
2. **Señal**: ranking de los 4 activos del universo por retorno total a 3 meses, calculado EN ese
   cierre. El timestamp de la señal es ese mismo cierre.
3. **Orden**: planeada para la **apertura de la SIGUIENTE sesión de trading** — nunca el mismo cierre
   que generó la señal.
4. **Ejecución**: fill teórico al precio real de esa apertura.

**Desviación documentada respecto al backtest del Bloque 5**: `runRelativeStrengthBacktest` calcula el
retorno de cada periodo cierre-a-cierre (una simplificación implícita de "mismo cierre"). El ledger
(sección 7) y el camino de paper trading (sección 21) usan la convención más realista de arriba
(apertura de la sesión siguiente). Es una diferencia conocida y documentada, no un bug parcheado
silenciosamente en los números históricos del candidato congelado.

## 5. Auditoría independiente del motor

`scripts/block6/audit-rotation-engine.ts`, contra datos reales 2016-presente.

- **Look-ahead bias: NO ENCONTRADO.** Dos tests adversariales dedicados
  (`tests/core/backtesting/research/relative-strength.test.ts`): (1) truncar todos los meses posteriores
  al mes de decisión T no cambia la selección ni el retorno de T; (2) un pico futuro adversarial colocado
  estrictamente después del cierre del mes de decisión nunca influye en el ranking de ese mes.
- **Cash handling**: confirmado por inspección de código — el motor está siempre 100% invertido en el
  activo seleccionado, o 0% ("cash" sintético) cuando ningún activo tiene suficiente histórico — nunca
  hay capital parcial o remanente.
- **Resampling**: correcto — `buildMonthlyCloses` se queda con la ÚLTIMA vela vista por mes calendario
  (el cierre real del último día hábil), no un lookup ingenuo del último día del calendario que podría
  caer en fin de semana/festivo.
- **Missing data**: ninguno — los 4 activos tienen una vela en cada mes calendario de su rango, tanto en
  la versión raw como en la ajustada.
- **Turnover**: 49 cambios de activo en 124 rebalanceos (raw), 50 en la versión ajustada.

## 6. Hallazgo cuantificado: ajuste de precios (raw vs adjusted)

**Confirmado, no hipotético.** `alpaca.adapter.ts` nunca fijaba el parámetro `adjustment` de Alpaca antes
de este bloque — todo el resultado del Bloque 5 se calculó sobre precios **raw** (sin ajustar por splits
ni dividendos). Se añadió el parámetro de forma aditiva (`AlpacaCredentials.adjustment`, default
`undefined` = sin cambio de comportamiento para código existente) y se re-auditó el candidato bajo ambos
ajustes:

| | Raw (replica del Bloque 5) | Ajustado (`"all"`, el `priceAdjustment` real del candidato) |
|---|---|---|
| Retorno total | 367.93% | **417.41%** |
| CAGR | 16.11% | **17.24%** |
| MaxDD | 25.07% | 23.99% |
| Sharpe (mensual, sin anualizar) | 0.27 | 0.29 |

**Delta: +1.13pp de CAGR.** Además, la SELECCIÓN mensual de activo difirió en **2 de 124 rebalanceos**
entre raw y ajustado (2019-06: NASDAQ100→SP500; 2023-08: NASDAQ100→RUSSELL2000) — parte del edge
reportado en el Bloque 5 pudo ser un artefacto de precios sin ajustar, no solo en el retorno realizado
sino en el propio ranking. **A partir de aquí, todas las cifras de este informe usan la versión
ajustada** (`priceAdjustment: "all"`), que es la que el candidato congelado declara oficialmente.

**Hallazgo metodológico adicional (honesto, no oculto)**: al re-ejecutar los scripts de este bloque en
distintos momentos de la sesión, el CAGR ajustado varió en un rango de ~17.2%-17.3% — no por un bug, sino
porque cada fetch captura datos "hasta ahora," y el mes calendario en curso (agosto 2026, aún
incompleto) entra en el último bucket mensual con un retorno parcial que cambia según cuándo se ejecute
el fetch. El propio motor de backtest (`runRelativeStrengthBacktest`) no tiene forma de saber si el
último mes de los datos está completo o no. El **scheduler de producción (sección 21) no tiene este
problema**: capa explícitamente su fetch en el cierre exacto del mes objetivo (`to` en
`fetchRs3mUniverse`), así que nunca usa un mes parcial. Los scripts de auditoría/análisis, en cambio,
heredan esta variación de bajo orden (~0.1pp de CAGR) cuando se ejecutan "a través de ahora" — documentado
aquí explícitamente en vez de presentar una única cifra como si fuera perfectamente estable.

## 7. Ledger rebalanceo-por-rebalanceo

`scripts/block6/generate-rebalance-ledger.ts` → `results/block6/ledger/rs3m_rebalance_ledger.csv`
(124 filas, gitignored). Por cada rebalanceo: fecha de señal, ranking de los 4 activos, activo
anterior/seleccionado, precio teórico (cierre de señal), precio de ejecución REAL (apertura de la
siguiente sesión — dato real, no simulado), shares/notional, valor de cartera, turnover, coste, P&L,
benchmarks. Cartera de referencia $10,000 → **$51,740.61** al final de la serie, consistente con la
equity curve del motor (multiplicador 5.174×).

## 8. Reproducción independiente

`scripts/block6/independent-reproduction.ts` — bucle de ranking/selección/retorno escrito desde cero,
que deliberadamente NO importa ni comparte código con `relative-strength.ts`.

**Resultado: 0 discrepancias en 124 rebalanceos.** CAGR idéntico (17.24% ambos), retorno total idéntico
(417.41% ambos), selección de activo y retorno de cada periodo coinciden exactamente mes a mes. Esta es
evidencia fuerte contra un bug compartido entre "el motor" y "el que lo audita."

## 9. Metodología de benchmarks

`src/core/backtesting/research/benchmarks.ts` (nuevo) + el `equalWeightEquityCurve` ya existente del
motor. Tres benchmarks, calculados sobre EXACTAMENTE el mismo rango de fechas y capital inicial que el
candidato, **nunca mezclados en una misma cifra**:

- **SPY Buy&Hold**: comprar y mantener SPY.
- **Equal-Weight Buy&Hold (estático)**: 1/4 en cada activo al inicio, pesos que derivan libremente
  (nunca rebalanceado).
- **Equal-Weight (rebalanceado mensual)**: reutilizado directamente del propio motor (`equalWeightEquityCurve`)
  — se rebalancea a pesos iguales cada mes.

## 10. Verificación histórica completa (toda la serie, 2016-2026, 124 meses)

| | RS3M_CANDIDATE_V1 | SPY Buy&Hold | EW Buy&Hold (estático) | EW Rebalanceado |
|---|---|---|---|---|
| Retorno total | **417.30%** | 341.70% | 366.62% | 350.03% |
| CAGR | **17.24%** | 15.46% | 16.07% | 15.67% |
| Volatilidad anualizada | 17.40% | 15.14% | 16.36% | 16.27% |
| MaxDD | 23.99% | 23.93% | 26.33% | 25.32% |
| Sharpe (anualizado) | **1.01** | 1.03 | 1.00 | 0.98 |
| Sortino (anualizado) | **1.84** | 1.48 | 1.44 | 1.41 |
| Calmar | **0.72** | 0.65 | 0.61 | 0.62 |

Sobre TODA la historia, el candidato bate a los 3 benchmarks en retorno/CAGR/Sortino/Calmar, con
volatilidad y MaxDD comparables (no claramente peores). Esto por sí solo sería una historia razonable —
la sección siguiente es la que la complica.

## 11. Out-of-sample: últimos 25 meses — EL HALLAZGO CRÍTICO

Mismos 25 meses exactos, misma ventana, para el candidato y los 3 benchmarks (aprox. sept-2024 a
ago-2026):

| | RS3M_CANDIDATE_V1 | SPY Buy&Hold | EW Buy&Hold (estático) | EW Rebalanceado |
|---|---|---|---|---|
| Retorno total | **17.32%** | 44.18% | 46.25% | 44.16% |
| CAGR | **7.97%** | 19.20% | 20.02% | 19.19% |
| MaxDD | 19.01% | 7.58% | 9.40% | 10.53% |
| Sharpe (anualizado) | **0.52** | 1.48 | 1.34 | 1.33 |
| Sortino (anualizado) | **0.90** | 2.74 | 2.74 | 2.63 |

**Excess return vs SPY: -26.87pp. Excess vs Equal-Weight rebalanceado: -26.84pp.** No es un solo mal
mes — es una tendencia de 3 años:

| Año | RS3M | SPY | Excess vs SPY | Switches |
|---|---|---|---|---|
| 2024 | 7.27% | 24.89% | **-17.61pp** | 9 |
| 2025 | 8.29% | 17.72% | **-9.43pp** | 6 |
| 2026 (parcial, hasta ago) | 14.06% | 14.37% | -0.32pp | 4 |

El candidato tuvo su mejor año relativo en 2020 (+45.18pp de excess, casi todo el edge histórico
concentrado ahí — ver sección 13) y desde entonces el margen se ha ido erosionando, cruzando a negativo
en 2024-2025. Esto es exactamente el tipo de señal que el criterio de rechazo "severe OOS
underperformance" describe.

## 12. Performance relativa avanzada (alpha, beta, tracking error, information ratio, capture)

| | Toda la historia (124m) | Últimos 25 meses |
|---|---|---|
| Beta (vs SPY) | 1.00 | 1.26 |
| Alpha anualizado | **+1.84%** | **-14.03%** |
| Tracking error anualizado | 8.50% | 8.30% |
| Information ratio | **+0.22** | **-1.12** |
| Upside capture | 103.5% | 84.5% |
| Downside capture | 93.7% | **159.7%** |
| Correlación con SPY | 0.87 | 0.90 |

Sobre toda la historia el perfil es sano: alpha positivo, IR positivo, captura de subidas ligeramente por
encima de la captura de bajadas (el patrón que se espera de un edge genuino). En los últimos 25 meses el
perfil se **invierte por completo**: alpha fuertemente negativo, IR muy negativo, y — el dato más
preocupante — el candidato ahora captura MÁS bajadas que subidas relativas a SPY (159.7% vs 84.5%), justo
lo opuesto de lo que una estrategia de momentum debería hacer.

## 13. Concentración de retorno y stress tests

De 124 meses, el retorno total (417.41%) está fuertemente concentrado en un puñado de meses excepcionales:

| Mejores 5 meses | Activo | Retorno |
|---|---|---|
| 2020-11 | RUSSELL2000 | +18.21% |
| 2020-04 | NASDAQ100 | +14.97% |
| 2026-04 | RUSSELL2000 | +12.09% |
| 2022-10 | RUSSELL2000 | +11.16% |
| 2020-08 | NASDAQ100 | +10.94% |

3 de los 5 mejores meses son de 2020 (recuperación post-COVID). Stress tests (poniendo esos meses a 0%,
nunca negativos, y recomponiendo el resto):

| Escenario | Retorno total resultante |
|---|---|
| Base (sin cambios) | 417.41% |
| Quitando el mejor mes | 337.69% (-19% relativo) |
| Quitando los 3 mejores meses | 239.65% (-43% relativo) |
| Quitando los 5 mejores meses | 175.41% (-58% relativo) |

Quitar apenas el 4% de los meses (5 de 124) reduce el retorno total más de la mitad. Este es un edge
genuino pero fuertemente dependiente de un puñado de meses excepcionales, en su mayoría de un régimen de
mercado específico (recuperación 2020) que no se ha repetido desde entonces.

## 14. Tabla anual completa

| Año | RS3M | SPY | EW | Excess vs SPY | MaxDD del año | Switches |
|---|---|---|---|---|---|---|
| 2016 | 11.42% | 10.09% | 14.49% | +1.33pp | 1.65% | 5 |
| 2017 | 30.22% | 21.75% | 24.24% | +8.48pp | 2.32% | 4 |
| 2018 | -1.35% | -4.97% | -4.94% | +3.61pp | 11.73% | 4 |
| 2019 | 22.16% | 31.14% | 30.11% | -8.98pp | 8.22% | 7 |
| 2020 | **63.64%** | 18.45% | 23.89% | **+45.18pp** | 12.90% | 1 |
| 2021 | 31.31% | 28.60% | 22.93% | +2.71pp | 5.68% | 2 |
| 2022 | -14.29% | -18.17% | -19.85% | +3.88pp | 23.99% | 3 |
| 2023 | 21.28% | 26.17% | 28.04% | -4.89pp | 8.82% | 5 |
| 2024 | 7.27% | 24.89% | 19.34% | **-17.61pp** | 8.57% | 9 |
| 2025 | 8.29% | 17.72% | 16.55% | **-9.43pp** | 13.12% | 6 |
| 2026 (parcial) | 14.06% | 14.37% | 17.69% | -0.32pp | 6.71% | 4 |

## 15. Análisis de régimen (retrospectivo, sin look-ahead)

Vía `rule-based-regime-detector.ts` (Bloque 3-4) sobre velas diarias de SPY — el régimen leído en la
fecha de decisión de cada rebalanceo nunca usa información posterior (el detector es prefix-stable por
construcción: el régimen confirmado en la posición k depende solo de `rawSeries[0..k]`).

| Régimen | Meses | Retorno medio mensual | Excess medio vs SPY | Hit rate |
|---|---|---|---|---|
| UPTREND | 18 | +2.71% | **+1.13pp** | 83.3% |
| LOW_VOLATILITY | 43 | +1.39% | +0.35pp | 67.4% |
| RANGE | 18 | +1.55% | -0.29pp | 66.7% |
| HIGH_VOLATILITY | 31 | +1.35% | -0.07pp | 61.3% |
| DOWNTREND | 11 | +0.47% | -0.63pp | 54.5% |

El candidato solo muestra una ventaja clara en régimen UPTREND (+1.13pp de excess medio mensual); en el
resto de regímenes el excess está cerca de cero o es ligeramente negativo. Consistente con una estrategia
de momentum long-only: funciona mejor cuando el mercado tiende al alza con claridad.

## 16. Comportamiento de holding y rotación

| Activo | % del tiempo mantenido |
|---|---|
| NASDAQ100 (QQQ) | 45.2% |
| RUSSELL2000 (IWM) | 25.8% |
| DOWJONES (DIA) | 22.6% |
| SP500 (SPY) | 6.5% |

49 cambios de activo en 124 rebalanceos (39.5% de los meses son un switch). Racha media de tenencia: 2.48
meses; mediana: 2 meses. El candidato pasa la mayor parte del tiempo en QQQ, coherente con el sesgo de
crecimiento del Nasdaq 100 durante buena parte de 2016-2026.

## 17. Auditoría de costes extendida

Barrido 0/5/10/20/30/50/75/100/150/200/300/400/500bps sobre `rebalanceCostBps`. **Cada cifra de bps es
el coste de IDA-Y-VUELTA COMBINADO de un rebalanceo con cambio de activo** (vender + comprar), nunca
por-orden-individual — el equivalente aproximado por-pierna es `bps/2`.

| bps (round-trip) | bps (por-orden, aprox.) | Retorno total (× inicial) |
|---|---|---|
| 0 | 0 | 4.71× |
| 20 (referencia del candidato) | 10 | 4.17× |
| 100 | 50 | 2.48× |
| 300 | 150 | 0.27× |
| 400 | 200 | -0.24× |

**Break-even: ~353.1bps** (interpolado entre 300bps y 400bps). El candidato usa 20bps de referencia —
el break-even está **17.6× por encima** de ese valor. Extremadamente robusto a costes de transacción,
consistente con ser una estrategia de baja frecuencia (12 rebalanceos/año, no cientos de trades).

## 18. Modelo de slippage dedicado

SPY/QQQ/IWM/DIA están entre los ETFs más líquidos que se negocian — spreads NBBO típicos de centésimas de
dólar sobre precios de $100-700. Modelo propio de 3 escenarios (NO reutilizado del 5bps intradía del
Bloque 4.5, que estaba calibrado para un round-trip del mismo día en el mismo instrumento, no para un
swap mensual de ETFs líquidos):

| Escenario | bps | Razonamiento | CAGR resultante |
|---|---|---|---|
| Optimista | 2 | Fill casi al precio medio, notional bien dentro del volumen diario | 18.25% |
| Realista | 8 | Medio-spread en ambas piernas + impacto de mercado conservador en la apertura | 17.92% |
| Conservador | 15 | Spreads más anchos en volatilidad elevada + riesgo de cola/impacto al abrir | 17.52% |

El `referenceRebalanceCostBps` del candidato (20bps) está **por encima incluso del escenario
conservador** — una asunción deliberadamente prudente ya incorporada al candidato congelado, no ajustada
después de ver este modelo.

## 19. Monte Carlo extendido (10,000 simulaciones)

Sobre los retornos mensuales realizados (coste de referencia 20bps), dos métodos:

| | Reshuffle (independiente) | Block bootstrap (bloques de 4 meses) |
|---|---|---|
| Equity terminal P5 / P50 / P95 | 2.13× / 5.24× / 12.81× | 2.32× / 5.31× / 12.40× |
| MaxDD P50 / P95 | 22.5% / 37.8% | 20.7% / 33.1% |
| Prob. de pérdida terminal | 0.15% | 0.03% |
| **Prob. de underperform vs SPY** | **37.9%** | **35.5%** |
| Prob. de underperform vs EW | 39.2% | 37.0% |

El reshuffle de un solo mes destruye la autocorrelación/momentum temporal real de la serie — limitación
reconocida, no oculta; el block bootstrap la preserva parcialmente. Ambos métodos coinciden en lo
esencial: incluso reordenando la historia al azar, hay **más de 1 de cada 3 posibilidades de terminar
por debajo de un simple buy&hold de SPY**. La cola baja (P5 ~2.1-2.3×) sigue siendo positiva en términos
absolutos, pero el riesgo relativo frente a los benchmarks es real y cuantificado, no solo intuido.

## 20. Estabilidad sin optimización (reutilizando resultados del Bloque 5, sin cómputo nuevo)

Solo se compara 3m vs 6m — las dos únicas configuraciones que el Bloque 5 probó para esta familia. No se
prueban 1m/2m/4m/5m/7m en este bloque ni se prueban ahora.

| Lookback | CAGR (0bps) | CAGR (20bps) | Clasificación (Bloque 5) |
|---|---|---|---|
| 3 meses (el candidato) | 17.23% | 16.14% | CANDIDATE |
| 6 meses | 14.51% | 13.87% | RESEARCH |

La configuración de 6 meses nunca alcanzó el margen mínimo (+1pp de CAGR sobre ambos benchmarks) que el
Bloque 5 exigía para CANDIDATE — solo 3 meses lo hizo, y por un margen moderado, no aplastante. Esta
sensibilidad a un único parámetro adyacente (3m vs 6m) ya era motivo de cautela explícita en el informe
del Bloque 5, y el hallazgo OOS de la sección 11 de este bloque refuerza esa cautela.

## 21. Infraestructura de paper trading

Construida en su totalidad (Fases 16-19), **NO activada** (ver sección 22 para la decisión y el porqué).

**Arquitectura**:
- `src/core/execution/alpaca-paper-client.ts` — cliente de la Trading API de Alpaca hecho a mano.
  `https://paper-api.alpaca.markets/v2` es la ÚNICA constante de base-URL en todo el archivo — no existe
  ninguna variable de entorno ni parámetro, en ningún método público, que pueda apuntar a
  `api.alpaca.markets` (live). Un test dedicado (`tests/core/execution/alpaca-paper-client.test.ts`)
  grepea el propio código fuente del archivo buscando el dominio live, para detectar una regresión
  incluso si alguien añadiera una constante nueva más adelante.
- `src/core/paper-trading/rs3m/signal-calculator.ts` — reutiliza `rankAssetsByTrailingReturn` (extraída
  de `relative-strength.ts` en este mismo bloque), la MISMA función que usa el motor de backtest, para
  que el camino de producción y el backtest nunca puedan divergir silenciosamente.
- `rebalance-planner.ts` — cartera actual + señal → plan de órdenes (single-winner 100%, no-op si no
  cambia el activo).
- `safety-guards.ts` — paper-only (re-verifica la URL exacta en runtime), whitelist de símbolos
  (SPY/QQQ/IWM/DIA únicamente), sin shorts, sin leverage/margen, protección de duplicados/idempotencia,
  señal obsoleta (rechaza datos de más de 10 días o con timestamp futuro). Colecciona TODAS las
  violaciones de una vez — nunca para en la primera. "Si cualquier safeguard falla: NO OPERAR."
- `rs3m-engine.ts` — inyección de dependencias explícita. `dryRun()` únicamente hace llamadas de lectura
  (`getAccount`, `getPositions`) — nunca llama a `submitNotionalOrder`, verificado por test.
  `execute()` es el ÚNICO camino de código en todo el repositorio que puede enviar una orden, y solo
  actúa si el plan de `dryRun()` habría ejecutado (todos los guards pasaron).

**Scheduler** (`scripts/block6/paper/run-rebalance.ts`, `scheduling.ts`): idempotente y consciente del
calendario NYSE por diseño — no depende de que un cron externo conozca festivos. Cada disparo decide por
sí mismo si hoy es el día correcto: el "mes objetivo" es siempre el mes calendario ANTERIOR (el único
garantizado completo), nunca el actual/en formación; la descarga de datos se capa exactamente en el
cierre de ese mes, así que aunque el script corra varios días tarde tras una caída, sigue calculando la
señal correcta en vez de derivar hacia un mes futuro parcial.

**Estado del dry-run real**: el código de `dryRun()` está completo y probado exhaustivamente con un
cliente Alpaca simulado (10 tests en `rs3m-engine.test.ts` cubriendo cuenta vacía, activo ya en cartera,
idempotencia, señal obsoleta, datos insuficientes, fallo de cuenta, y fallo de envío de orden). **Sin
embargo, no se ha ejecutado ni una sola vez contra la cuenta paper real de Alpaca en esta sesión** —
`.env.local` no tenía configuradas `ALPACA_PAPER_API_KEY_ID`/`ALPACA_PAPER_API_SECRET_KEY` (el usuario
mostró el Key ID en una captura del dashboard, pero el Secret Key —que Alpaca solo muestra una vez— nunca
llegó a añadirse). El usuario optó explícitamente por añadir estas credenciales él mismo; en el momento
de cerrar esta sesión, seguían sin estar presentes. **Esta es la única pieza del plan original de la
Fase 19 ("dry-run ejecutado varias veces sobre el estado real de la cuenta paper") que no se completó**
— queda documentado aquí como trabajo pendiente, no como algo hecho.

**No ejecutado, por decisión explícita** (no por limitación técnica): Fase 20-23 (envío real de órdenes
paper, reconciliación contra datos forward reales), la Routine mensual automática. `backtest-vs-paper.ts`
(el módulo de reconciliación) está construido y probado, pero solo con fixtures sintéticos — no hay
datos forward reales que reconciliar todavía.

## 22. Estado, duración del paper trading, y decisión final

**Modelo de estado** (`src/core/paper-trading/rs3m/status.ts`, `results/block6/candidate/rs3m-v1-status.json`):
histórico append-only de transiciones, con `VALIDATED` estructuralmente irrepresentable (no existe como
miembro del tipo `Rs3mStatus` en absoluto). Historial real de esta sesión:

1. `CANDIDATE_FROZEN` — candidato congelado desde el único CANDIDATE del Bloque 5.
2. `AUDIT_PASSED` — auditoría del motor + verificación estadística completa (Fases 2-15) sin bugs.
3. `PAPER_READY` — infraestructura de paper trading lista y probada; **no avanza a `PAPER_RUNNING`**
   porque no se ha enviado ninguna orden.

**Distinción honesta de duración**:
- **"Infraestructura lista"**: SÍ — hecha en esta sesión, con 540 tests pasando.
- **"Paper iniciado"**: NO — no se ha ejecutado ni un dry-run contra la cuenta real (bloqueado en
  credenciales), y no se ha enviado ninguna orden ni creado ninguna Routine.
- **"Evidencia forward suficiente"**: NO EXISTE — y no puede existir sin que el paper trading arranque
  primero. Si en algún momento se activa, se recomienda un mínimo razonable de 6-12 rebalanceos mensuales
  (~6-12 meses) antes de considerar cualquier evidencia forward mínimamente informativa.

**Qué haría falta para avanzar** (no se hace en esta sesión):
1. Añadir `ALPACA_PAPER_API_KEY_ID`/`ALPACA_PAPER_API_SECRET_KEY` a `.env.local` y ejecutar
   `run-rebalance.ts` en modo `DRY_RUN=true` contra la cuenta real varias veces.
2. Una decisión humana explícita, informada por el hallazgo de la sección 11, sobre si tiene sentido
   activar `PAPER_TRADING=true` dado el underperformance OOS reciente.
3. Solo si esa decisión es afirmativa: crear la Routine mensual (`create_trigger`) descrita en la sección
   21 — nunca automáticamente, y nunca si el resultado fuera `AUDIT_FAILED`/`REJECTED_FORWARD`.

### Decisión final

## **AUDIT PASSED — PAPER READY**

La auditoría es correcta y reproducible (0 discrepancias en la reproducción independiente), no tiene
look-ahead bias, los benchmarks están calculados correctamente y nunca mezclados, el modelo de costes deja
un margen enorme (break-even ~353bps vs 20bps de referencia), y la infraestructura de paper trading está
completa y probada. **Pero el edge histórico, aunque real en la serie completa (2016-2026), se ha
revertido en los últimos 3 años**, con underperformance severo y persistente frente a ambos benchmarks
—el criterio explícito de "OOS no invalida claramente" está, como mínimo, en tensión seria con la
evidencia de la sección 11. Por esto, y porque el propio usuario lo decidió así al ver estos datos, la
infraestructura queda lista pero **no se activa esta sesión**. Esto no es `VALIDATED` ni lo pretende ser.

---

*Bloque 6 completo. No se inicia el Bloque 7.*
