# Bloque 4.5 — Strategy & Execution Research: Mean Reversion y Opening Range Breakout

**Fecha:** 2026-08-16 · **Rama:** `claude/trading-analysis-platform-ku9orx`

**Pregunta de investigación:** ¿Mean Reversion (MR) y Opening Range Breakout (ORB) —las dos
estrategias del Bloque 4 con edge bruto positivo (+42.8% y +34.7% zero-cost)— tienen un edge real
y explotable después de costes realistas?

> **Respuesta corta: NO.** Ninguna de las dos sobrevive a un coste de fricción mayor a ~1 punto
> básico. El coste de ejecución modelado en el Bloque 4 (~5bps) es entre 6 y 9 veces mayor que el
> punto de equilibrio de cada estrategia. Esto se confirma de forma consistente en 10.5 años de
> datos reales (2016-2026, más de 5,000 trades combinados), en 4 timeframes, en 3 de 4 activos
> probados, en dev/validation/out-of-sample, y en absolutamente todos los regímenes de mercado
> detectados. **Clasificación final: REJECTED para ambas.** No se optimizó ni un solo parámetro
> para llegar a esta conclusión.

---

## 0. Qué se hizo (resumen de método)

Se auditó el modelo de costes trade por trade, se corrió un barrido de sensibilidad a costes
(0 a 10bps), se aislaron spread y slippage por separado, se probaron 4 timeframes por estrategia,
se amplió el histórico a 2016-2026 (el máximo que ofrece el feed `sip` de Alpaca), se probó
cross-asset (SPY/QQQ/IWM/DIA), y se corrigió un bug numérico real del Sortino ratio encontrado en
el Bloque 4. El motor de ejecución LIMIT se implementó y se testeó, pero la comparación Market vs
Limit sobre datos reales **no se pudo completar** por un bloqueo de red a mitad de sesión (§17).
En ningún momento se tocaron las reglas de las 5 estrategias, se descartaron trades perdedores, ni
se ajustaron parámetros para mejorar el resultado.

---

## 1. Qué estaba destruyendo el rendimiento

**El slippage, no el spread.** La auditoría trade-por-trade (Fase 1, 991 trades reales, cero
violaciones de invariantes — ver §16) descompuso el coste total en sus cuatro componentes
(slippage/spread × entrada/salida) para cada trade. El resultado es contundente:

| Componente | Mean Reversion | Opening Range Breakout |
|---|---:|---:|
| Slippage total | $8,671.93 | $10,139.60 |
| Spread total | $140.62 | $166.49 |
| **Ratio slippage:spread** | **~62:1** | **~61:1** |

La razón es estructural, no un artefacto: `slippagePct` (0.05% del precio) escala con el precio de
SPY (~$700-780 en el período), mientras que `halfSpread` es un monto fijo de $0.005 por acción,
independiente del precio. A los precios de SPY en este dataset, 5bps de slippage equivalen a
~$0.35-0.39 por acción — setenta veces más que el spread fijo modelado. **El spread, aislado, casi
no destruye el edge** (Fase 3, "spread-only": MR queda en +0.13 expectancyR, ORB en +0.08 —
prácticamente el mismo resultado que sin ningún coste). **El slippage, aislado, destruye
prácticamente todo el edge** (Fase 3, "slippage-only": MR cae a -0.60, ORB a -0.78 — casi idéntico
al escenario con ambos costes combinados).

## 2. Coste real medio por operación

De la auditoría de Fase 1 (costes realistas, 991 trades):

| | Mean Reversion | Opening Range Breakout |
|---|---:|---:|
| Coste medio/trade | $20.54 | $18.34 |
| Coste mediano/trade | $15.90 | $13.00 |
| P10 / P90 | $6.71 / $40.57 | $4.13 / $40.53 |
| Coste como % del edge bruto | **592.6%** | **767.0%** |
| Impacto entrada vs salida | $5,201 vs $3,612 | $6,383 vs $3,923 |

Los costes de entrada superan a los de salida en ambas estrategias — coherente con el diseño: la
entrada siempre paga slippage+spread, pero la salida solo los paga si es `STOP_LOSS`/`TIME_EXIT`
(un `TAKE_PROFIT` se llena exacto, sin fricción, por convención de orden límite en descanso).

**"Coste como % del edge bruto" > 500% significa que el coste total es 6-8 veces mayor que
cualquier ganancia bruta que la secuencia de trades (ya afectada por los costes en sus decisiones
de entrada/salida) generó** — el edge no solo se reduce, se revierte varias veces.

## 3. Coste expresado en R

| | Mean Reversion | Opening Range Breakout |
|---|---:|---:|
| Coste medio en R | 0.76R | 0.89R |
| Coste mediano en R | 0.66R | 0.78R |

Es decir: en la operación mediana, el coste de fricción por sí solo se come entre dos tercios y
cuatro quintos de un R completo de riesgo — antes de contar si el trade ganó o perdió.

## 4-5. Break-even cost (coste de equilibrio)

Por interpolación lineal sobre el barrido de 8 puntos (Fase 2), el nivel de coste al que
`expectancyR` cruza cero:

| Estrategia | Break-even cost | Coste "realista" del Bloque 4 (~5bps) | Múltiplo |
|---|---:|---:|---:|
| Mean Reversion | **~0.90 bps** | 5 bps | **5.6x por encima del break-even** |
| Opening Range Breakout | **~0.53 bps** | 5 bps | **9.4x por encima del break-even** |

Ninguna estrategia soporta ni siquiera 1 punto básico de coste de fricción. El coste "realista"
usado en el Bloque 4 —ya de por sí una estimación conservadora, no agresiva— está muy por encima
de lo que cualquiera de las dos estrategias puede tolerar.

## 6. Sensibilidad a costes (barrido completo)

| bps | MR expectancyR | MR Return | MR PF | ORB expectancyR | ORB Return | ORB PF |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | +0.154 | +42.80% | 1.227 | +0.095 | +34.69% | 1.139 |
| 0.5 | +0.064 | +14.37% | 1.078 | +0.005 | +0.01% | 1.000 |
| 1 | -0.016 | -5.74% | 0.969 | -0.086 | -26.13% | 0.884 |
| 2 | -0.176 | -35.98% | 0.797 | -0.267 | -59.32% | 0.707 |
| 3 | -0.331 | -55.50% | 0.670 | -0.425 | -74.63% | 0.597 |
| 5 (≈"realista") | -0.604 | -73.25% | 0.519 | -0.797 | -89.62% | 0.404 |
| 7.5 | -0.993 | -85.60% | 0.367 | -1.252 | -96.23% | 0.256 |
| 10 | -1.424 | -92.54% | 0.257 | -1.705 | -98.66% | 0.154 |

El deterioro es rápido y monótono — no hay ninguna "zona dulce" a un coste intermedio. Cada punto
básico adicional de coste degrada el resultado de forma prácticamente lineal en la región relevante.

## 7. Market vs Limit (Fase 4) — INCOMPLETA, ver §17

Se implementó y testeó completamente el modo de ejecución `LIMIT` en el motor (órdenes en
descanso al precio exacto de la señal, sin slippage/spread si se llenan, canceladas como
`NO_FILL` si el precio no regresa dentro de `limitOrderTimeoutBars`, sin look-ahead — verificado
con tests dedicados en `tests/core/backtesting/event-driven-simulator.test.ts`). **La comparación
sobre datos reales no se pudo ejecutar**: el proxy de red de este entorno bloqueó el acceso a
`data.alpaca.markets` a mitad de la Fase 7 (ver §17) y las instrucciones del propio proxy indican
explícitamente no reintentar un bloqueo de política. Como proxy parcial: la Fase 3 ya muestra que
eliminar spread Y slippage por completo ("none": costo cero) recupera el edge bruto original
(+0.154R / +0.095R) — que es exactamente lo que un LIMIT que se llena siempre lograría. La pregunta
que solo LIMIT real puede responder —qué fracción de señales se pierde por `NO_FILL`, y si esa
pérdida de oportunidad es peor que el coste de MARKET— queda pendiente para cuando se restaure la
conectividad.

## 8. Resultados por timeframe (Fase 5, mismas reglas y parámetros, sin ajuste por timeframe)

| Estrategia | Timeframe | Velas | Trades | expectancyR | Return | Sample |
|---|---|---:|---:|---:|---:|---|
| Mean Reversion | 5m | 94,961 | 516 | **-1.880** | -99.27% | HIGH |
| Mean Reversion | 15m (nativo) | 31,942 | 429 | -0.604 | -73.25% | HIGH |
| Mean Reversion | 30m | 15,979 | 268 | -0.506 | -49.82% | HIGH |
| Mean Reversion | 1h | 7,995 | 149 | -0.415 | -27.00% | HIGH |
| Opening Range Breakout | 1m | 427,343 | 442 | -1.902 | -98.60% | HIGH |
| Opening Range Breakout | 5m (nativo) | 94,961 | 562 | -0.797 | -89.62% | HIGH |
| Opening Range Breakout | 15m | 31,942 | 413 | -0.429 | -59.34% | HIGH |
| Opening Range Breakout | 30m | 15,979 | **0** | 0.000 | 0.00% | **INSUFFICIENT** |

**Ningún timeframe es positivo para ninguna estrategia.** El patrón es interesante: cuanto más
fino el timeframe, peor el resultado (más señales, más fricción acumulada por trade de menor
magnitud). ORB a 30m produce **cero trades** — hallazgo estructural esperado y documentado de
antemano (Bloque 4.5 plan): con `openingRangeMinutes=15` (default, nunca ajustado), 15 no es
múltiplo de 30, así que la estrategia queda en WAIT permanente. Esto no es evidencia a favor ni en
contra — es una limitación de configuración, no un resultado de mercado.

## 9. Resultados por activo (Fase 7, mismas reglas y parámetros, sin ajuste por activo)

| Estrategia | Activo | Velas | Trades | expectancyR | Return | Sample |
|---|---|---:|---:|---:|---:|---|
| Mean Reversion | SPY (SP500) | 31,942 | 429 | -0.604 | -73.25% | HIGH |
| Mean Reversion | QQQ (NASDAQ100) | 31,925 | 465 | **-0.296** (menos malo) | -51.05% | HIGH |
| Mean Reversion | IWM (RUSSELL2000) | 31,880 | 437 | -0.346 | -54.09% | HIGH |
| Mean Reversion | DIA (DOWJONES) | 27,539 | 360 | -0.672 (peor) | -70.83% | HIGH |
| Opening Range Breakout | SPY (SP500) | 94,961 | 562 | -0.797 | -89.62% | HIGH |
| Opening Range Breakout | QQQ/IWM/DIA | — | — | **NO DISPONIBLE — ver §17** | — | — |

Mean Reversion es negativa en los 4 activos probados — el fenómeno se reproduce de forma
consistente entre índices relacionados (S&P 500, Nasdaq 100, Russell 2000, Dow Jones), no es
específico de SPY. Para Opening Range Breakout solo se pudo probar SPY (también negativo); los
otros 3 activos quedaron bloqueados por la caída de red — ver §17.

## 10-11. Resultados históricos e Out-of-Sample (Fase 6, 2016-2026)

Máximo histórico fiable disponible en `sip`: **2016-01-01 hasta 2026-08-14** (~10.5 años). Split
cronológico solicitado (2016-2022 dev / 2023-2024 validation / 2025-2026 OOS) se cumplió
exactamente — la data sí alcanza hacia atrás lo suficiente, sin necesidad de fallback proporcional.

| | Mean Reversion | Opening Range Breakout |
|---|---:|---:|
| **Full period** | 2,153 trades, expR **-0.661**, retorno **-99.93%** | 2,904 trades, expR **-0.926**, retorno **-100.00%** |
| **Dev (2016-2022)** | 1,377 trades, expR -0.676, retorno -99.12% | 1,885 trades, expR -0.944, retorno -99.99% |
| **Validation (2023-2024)** | 418 trades, expR -0.677, retorno -76.30% | 545 trades, expR -1.012, retorno -93.82% |
| **Out-of-Sample (2025-2026)** | 358 trades, expR **-0.587**, retorno -65.72% | 473 trades, expR **-0.752**, retorno -83.48% |

**Cada uno de los tres tramos es negativo, para las dos estrategias, sin excepción.** El
out-of-sample —el único tramo que nunca pudo haber influido ninguna decisión— es negativo con
muestra HIGH (358 y 473 trades respectivamente). Sobre el capital inicial de $10,000 con el
modelo de riesgo compuesto (0.5%/trade), ambas estrategias llegan esencialmente a la ruina total
de la cuenta en el horizonte de 10.5 años bajo costes realistas.

## 12. Walk-Forward

No se re-ejecutó walk-forward en este bloque porque ninguna combinación calificó como
"prometedora" (Fase 8, §14) — el propio diseño de la Fase 8 reserva ese pipeline pesado solo para
candidatos con expectancyR positiva en full-period Y out-of-sample, y ninguna lo tuvo. Como
referencia, el **Bloque 4** ya corrió walk-forward completo para ambas estrategias en su
configuración nativa (2 años, timeframe nativo, costo realista): Mean Reversion, 51 ventanas, solo
13 rentables (25.5%); Opening Range Breakout, 50 ventanas, solo 5 rentables (10%). Ambos resultados
—ya débiles en el Bloque 4— son coherentes con el panorama mucho más amplio de este bloque.

## 13. Monte Carlo

Igual que walk-forward: no se volvió a correr aquí (ninguna combinación prometedora). Referencia
del Bloque 4 (2 años, configuración nativa, costo realista): Mean Reversion, drawdown mediano
73.7% [P5 63.9% – P95 80.8%]; Opening Range Breakout, drawdown mediano 89.9% [P5 86.0% – P95
92.6%]. Ambos ya indicaban en el Bloque 4 una probabilidad muy alta de pérdidas severas de cuenta,
consistente con los retornos de -99.93%/-100.00% observados aquí sobre 10.5 años reales.

## 14. Regímenes de mercado (Fase 6, muestra de 10.5 años)

| Estrategia | Régimen | Trades | winRate | expectancyR | Profit Factor | Sample |
|---|---|---:|---:|---:|---:|---|
| Mean Reversion | LOW_VOLATILITY | 1,416 | 30.2% | -0.665 | 0.550 | HIGH |
| Mean Reversion | RANGE | 737 | 28.8% | -0.654 | 0.430 | HIGH |
| Opening Range Breakout | HIGH_VOLATILITY | 1,788 | 33.1% | -0.887 | 0.329 | HIGH |
| Opening Range Breakout | DOWNTREND | 415 | 32.3% | -1.032 | 0.468 | HIGH |
| Opening Range Breakout | UPTREND | 391 | 35.5% | -1.023 | 0.266 | HIGH |
| Opening Range Breakout | STRONG_DOWNTREND | 180 | 36.7% | -0.880 | 0.236 | HIGH |
| Opening Range Breakout | STRONG_UPTREND | 130 | 35.4% | -0.887 | 0.225 | HIGH |

**Cada régimen probado, con muestra HIGH (130 a 1,788 trades), es negativo.** No existe un
subconjunto de condiciones de mercado donde alguna de las dos estrategias muestre expectativa
positiva sobre el histórico completo.

## 15. Clasificación final (Fase 10)

Criterios (documentados en el plan de este bloque, aplicados sin relajar el estándar):

- **REJECTED**: expectancyR ≤ 0 a costo realista en full-period O en out-of-sample.
- **RESEARCH**: full-period Y OOS positivos, pero walk-forward <50% ventanas rentables, o sample
  <MEDIUM, o no reproduce en otro timeframe/activo.
- **CANDIDATE**: lo anterior de RESEARCH resuelto favorablemente, pero sin confirmar cross-asset/regímenes.
- **VALIDATED**: todo lo de CANDIDATE + reproduce en otro timeframe Y otro activo + Monte Carlo no
  catastrófico + al menos un régimen positivo con muestra suficiente.

| Estrategia | Full-period (realista) | Out-of-Sample | Timeframes probados | Activos probados | Regímenes positivos | **Clasificación** |
|---|---:|---:|---:|---:|---:|---|
| Mean Reversion | -0.604 | -0.587 | 0/4 positivos | 0/4 positivos | 0/2 | **REJECTED** |
| Opening Range Breakout | -0.797 | -0.752 | 0/4 positivos (1 sin trades) | 0/1 probado (3 bloqueados) | 0/5 | **REJECTED** |

**Ninguna combinación de las 42+ probadas en este bloque calificó para ningún nivel superior a
REJECTED.** El resultado honesto de esta investigación es: **NO VALID STRATEGY FOUND** entre las
dos estrategias con edge bruto positivo del Bloque 4, bajo ningún timeframe, activo, o régimen
probado, una vez aplicados costes de ejecución realistas. No se bajó el estándar para forzar un
CANDIDATE.

## 16. Bugs encontrados

1. **Fix de Sortino ratio (Bloque 4.5, Fase 9)** — el bug numérico del Bloque 4 (valores absurdos
   como `-2.65e15` cuando la desviación a la baja es casi-cero por punto flotante) está corregido:
   `sortinoDenominator` ahora se compara contra un epsilon (`1e-6`), no contra cero exacto. Tests
   nuevos cubren el caso de desviación casi-cero (antes producía el bug) y el caso normal (sin
   regresión). Confirmado en los datos de este bloque: ningún resultado nuevo muestra un Sortino
   extremo, incluso en los escenarios de costo cero donde el bug se manifestaba antes.
2. **Trampa de rendimiento O(n²) en la evaluación de estrategias (encontrada y corregida en este
   bloque)** — cada estrategia recalculaba sus propios indicadores desde cero sobre TODA la
   historia acumulada en cada vela, ya documentado como "costo aceptado" en el Bloque 4. A la
   escala de este bloque (10.5 años, 1m, 5 activos) esto lo hacía computacionalmente inviable (una
   sola corrida de 2 años tardaba 20-30 minutos). Se corrigió acotando la ventana que cada
   estrategia ve a las últimas 1000 velas (`STRATEGY_LOOKBACK_BARS`) — generoso frente a
   EMA20/ATR14/RSI14 (convergen en ~100-200 velas) y frente a la lógica de VWAP/opening-range
   (ancladas a la sesión actual, siempre dentro de las últimas velas). Verificado: los conteos de
   trades en el dataset de 2 años son **idénticos** a los del Bloque 4 (429 para MR, 562 para
   ORB) — el fix no cambió ningún resultado, solo el tiempo de cómputo (de ~20-30min a ~90s por
   corrida completa).
3. **Auditoría de costes (Fase 1): cero bugs encontrados.** Se verificaron automáticamente, sobre
   991 trades reales, los invariantes: `grossPnl - costesTotales = netPnl` (exacto, dentro de
   tolerancia de punto flotante), `pnlR = pnlAmount/riskAmount`, ningún componente de costo
   negativo, y ningún `TAKE_PROFIT` con costo de salida. **Cero violaciones.** El modelo de costos
   del motor es correcto tal como está implementado.

## 17. Limitaciones

1. **Bloqueo de red a mitad de sesión (importante, no resuelto).** El proxy de egress de este
   entorno bloqueó `data.alpaca.markets` (HTTP 403 en el CONNECT, "policy denial or upstream
   failure") a partir de aproximadamente las 21:45 UTC del 2026-08-16, después de completar 39 de
   42 experimentos del barrido principal. Afectó: los 3 fetches cross-asset de Opening Range
   Breakout (QQQ/IWM/DIA a 5m, Fase 7) y la comparación Market vs Limit completa (Fase 4, que
   requería datos frescos). Las instrucciones del propio proxy son explícitas: *"Do not retry or
   route around it — report the blocked host."* Se siguió esa instrucción — no se reintentó de
   forma indefinida ni se buscó un rodeo. El resto del bloque (39 experimentos, incluyendo el
   histórico completo de 10.5 años) se había completado ANTES del bloqueo y no se ve afectado.
2. **Fase 4 (Market vs Limit) incompleta** — ver §7 y el punto anterior. El motor está listo y
   testeado; falta la corrida real.
3. **Break-even cost por interpolación lineal** entre 2 puntos del barrido — una aproximación
   razonable dado que la relación coste→expectancy es monótona y casi lineal en la región
   relevante (§6), pero no una búsqueda exacta.
4. **Opening Range Breakout a 30m produce cero trades** por el desajuste `openingRangeMinutes=15`
   no siendo múltiplo de 30 — un artefacto de configuración, no evidencia de mercado (§8).
5. **Cross-asset limitado a 4 activos relacionados** (todos ETFs de índices de EE.UU.) — no se
   probó ningún activo de una clase distinta (forex, materias primas, cripto).
6. **El modelo de costes usa un spread fijo** ($0.005 half-spread) en vez de una serie histórica
   real de bid/ask — una simplificación ya documentada en el Bloque 4, no nueva de este bloque.

## 18. Recomendación para el Bloque 5

**No implementar el Consensus Engine con Mean Reversion ni Opening Range Breakout como
componentes** — ninguna de las dos tiene una expectativa validada, y combinar estrategias sin edge
individual no produce un edge de consenso automáticamente.

Antes de decidir el siguiente paso, sugiero revisar juntos:

1. **Completar la Fase 4 (Market vs Limit)** cuando se restaure el acceso a `data.alpaca.markets`
   — es la única pieza de este bloque que quedó sin ejecutar sobre datos reales. El motor ya está
   listo; es una corrida de ~10-15 minutos una vez haya red.
2. **Con el break-even cost tan bajo (<1bp para ambas), la pregunta relevante ya no es "¿qué tan
   buena es la estrategia?"** sino **"¿existe algún broker/estructura de ejecución real con
   fricción por debajo de 1bp para este volumen y frecuencia de trading?"** — en la práctica,
   poco probable para un trader minorista, pero vale la pena que la decidamos juntos antes de
   descartar la idea de fondo (mean-reversion / opening-range-breakout) para siempre, en vez de
   solo estas implementaciones concretas.
3. **Dado que las 7 estrategias probadas hasta ahora (5 del Bloque 4 + 2 de este bloque, contando
   MR/ORB una sola vez) no muestran ninguna con expectativa validada**, valdría la pena discutir
   si el Bloque 5 debería explorar familias de estrategias genuinamente distintas en vez de seguir
   ajustando las 5 existentes — sin que esto signifique optimizar parámetros de las actuales.
4. Solo después de esa conversación, y solo si aparece algo con expectativa real, tendría sentido
   retomar el Consensus Engine.

---

## Anexo — reproducibilidad

- Scripts: `scripts/audit-cost-model.ts` (Fase 1), `scripts/run-strategy-research.ts` (Fases
  2/3/5/6/7), `scripts/run-block45-deep-validation.ts` (Fase 8 — confirmó 0 candidatos, no requirió
  red).
- Comando: `NODE_OPTIONS="--conditions=react-server" npx tsx scripts/<script>.ts`
- Resultados crudos (JSON completos, incluyendo cada trade auditado en CSV):
  `.block4-5-results/**` — no versionado (`.gitignore`), regenerable con datos reales frescos.
- Config: capital inicial $10,000, riesgo 0.5%/trade, feed Alpaca `sip`, política de ambigüedad
  `CONSERVATIVE`, semilla Monte Carlo 42 (heredada del Bloque 4, no re-ejecutada aquí).
