# Bloque 4 — Backtesting Individual de las 5 Estrategias: Informe Final

**Fecha del experimento:** 2026-08-16
**Rama:** `claude/trading-analysis-platform-ku9orx`
**Alcance:** motor de backtesting event-driven, sin look-ahead, con costos de ejecución realistas, sizing vía Risk Engine, y **cero modificación de las 5 estrategias existentes**. Sin Consensus Engine. Sin broker. Sin dinero real.

> **Resultado en una frase:** las 5 estrategias, tal como están implementadas hoy (Bloque 3), tienen **expectativa negativa después de costos realistas** sobre 2 años reales de SPY, y las 5 pierden claramente contra un simple Buy & Hold del mismo período. Dos de las cinco (Mean Reversion y Opening Range Breakout) muestran expectativa **positiva antes de costos**, lo que sugiere que su "edge" bruto es menor que el costo de operar. Esto es un resultado real, no una limitación del motor — no se tocó ningún parámetro para mejorarlo.

---

## 1. Arquitectura del Backtesting Engine

Motor puro, síncrono, sin I/O (`src/core/backtesting/event-driven-simulator.ts`), que implementa la interfaz `BacktestingEngine` (`run(config, candles)`). Simulación **estrictamente cronológica**: por cada vela `i`,

1. si hay posición abierta, se evalúa primero su salida (`resolveIntrabarExit`) contra la vela actual;
2. solo si sigue plana y el *daily risk gate* lo permite, se recalculan indicadores/régimen sobre `candles.slice(0, i+1)` (nunca datos futuros) y se evalúa la estrategia objetivo;
3. al final del dataset, cualquier posición abierta se cierra a `close` con `TIME_EXIT`.

Piezas nuevas de este bloque:
- **Position Sizer** (`risk-engine/position-sizer.ts`): tamaño de posición real desde `accountEquity`, `riskPct`, `entry`, `stopLoss`.
- **Same-candle resolver** (`same-candle-resolver.ts`): política `CONSERVATIVE` (default, asume el resultado desfavorable) para cuando SL y TP caen en la misma vela; toda resolución ambigua queda marcada (`ambiguousIntrabarExit`).
- **Daily risk gate** (`daily-risk-gate.ts`): reutiliza `DEFAULT_RISK_RULES` ya existente (0.5% riesgo/trade, 1% pérdida diaria máx, 2 trades/día máx) — exactamente los valores pedidos.
- **Métricas** (`metrics.ts`, `sample-quality.ts`): expectancy en $ y en R, Sharpe/Sortino, drawdown, breakdowns por régimen/hora/día/mes/sesión, etiqueta de calidad de muestra.
- **Dataset split** (`dataset-split.ts`) y **Walk-Forward** (`walk-forward.ts`): split cronológico 60/20/20, ventanas train/validation/forward deslizantes por número de velas.
- **Monte Carlo** (`monte-carlo.ts`): bootstrap con reemplazo sobre la secuencia real de R-multiples, 1000 simulaciones, semilla fija (42) para reproducibilidad.
- **Buy & Hold baseline** (`baseline-buy-and-hold.ts`): un solo trade conceptual, sin gestión de riesgo — no comparable 1:1 con las métricas basadas en R.
- **Condiciones de fallo** (`BacktestSimulationError`): timestamps desordenados, velas duplicadas, warm-up insuficiente, error de estrategia/indicador, modo no soportado — el motor nunca produce un resultado parcial disfrazado de completo.

No se implementó `RiskEngine.evaluate()` completo (depende de `ConsensusResult`, que no existe todavía) — se usó `PositionSizer` + `evaluateDailyRiskGate` directamente, sin inventar un `ConsensusResult` falso.

Dashboard: página `/backtesting` (formulario + resultados) y endpoint `POST /api/backtesting/run`, con gráficos SVG hechos a mano (Equity Curve, Drawdown Curve, Cumulative R) — sin librerías nuevas.

---

## 2-5. Dataset, período y calidad de datos

**Proveedor:** Alpaca Market Data API, feed **`sip`** (consolidado, no `iex`). Hallazgo empírico de este bloque: `iex` es inconsistente para SPY antes de ~2020; `sip` es confiable en esta cuenta. El feed ahora es configurable (`ALPACA_FEED`, default `sip`) en vez de estar hardcodeado a `iex` como antes.

**Instrumento:** SPY (ETF, proxy de SP500). **Ventana solicitada:** los últimos 2 años exactos desde el momento de ejecución (16 ago 2024 → 16 ago 2026), documentado como decisión de alcance — Alpaca `sip` en esta cuenta permite pedir bastante más histórico (~hasta 2016), pero 2 años ya produce datasets grandes (ver abajo) y es computacionalmente razonable para esta sesión. La arquitectura soporta rangos mayores sin cambios.

| Estrategia | Timeframe | Rango real recibido | Velas | Gaps detectados | Calidad de datos |
|---|---|---|---|---|---|
| Trend Following | 15m | 2024-08-16 08:00 UTC → 2026-08-14 23:45 UTC | 31,944 | 0 | **PASS** |
| Breakout | 15m | idéntico | 31,944 | 0 | **PASS** |
| VWAP | 15m | idéntico | 31,944 | 0 | **PASS** |
| Mean Reversion | 15m | idéntico | 31,944 | 0 | **PASS** |
| Opening Range Breakout | 5m | 2024-08-16 08:00 UTC → 2026-08-14 23:55 UTC | 94,970 | **3** | **WARN** |

Las 9 reglas del Data Quality Engine (sin duplicados, timestamps monótonos, OHLC internamente consistente, precios/volumen no-negativos, muestra suficiente, sin gaps inesperados, intervalo esperado, no obsoleto) pasaron para las 4 estrategias de 15m. Opening Range Breakout quedó en **WARN** por 3 gaps inesperados en horario de mercado sobre 94,970 velas de 5m (0.003% del dataset) — **no** bloqueó la simulación porque solo un `FAIL` lo hace (diseño explícito del punto 26); un `FAIL` real habría detenido esa estrategia sin simular, y ninguna de las 5 lo produjo.

**Hallazgo de infraestructura no trivial:** el feed `sip` de esta cuenta tiene un **embargo de recencia de ~15 minutos** — pedir datos hasta el instante exacto actual devuelve HTTP 403 ("subscription does not permit querying recent SIP data"). Se resolvió omitiendo el parámetro `to` (tal como documenta la interfaz: "omit to request up to latest"), no adivinando un margen de seguridad arbitrario.

Última vela disponible en todos los casos: **2026-08-14**, el último día hábil antes del fin de semana en que corrió el experimento — coherente, no un bug.

---

## 6. Supuestos de riesgo y capital

- **Capital inicial:** $10,000
- **Riesgo por trade:** 0.5% del equity (vía `PositionSizer`)
- **Pérdida diaria máxima:** 1% (bloquea nuevas entradas ese día calendario Eastern, posiciones abiertas se gestionan igual hasta su salida natural)
- **Trades máximos por día:** 2
- **Stop loss:** obligatorio, sin excepciones
- **Martingala / promediar a la baja:** deshabilitados

Estos son exactamente los valores por defecto ya existentes en `DEFAULT_RISK_RULES` (`src/core/risk-engine/types.ts`) — no se inventaron ni ajustaron para este experimento.

## 7. Supuestos de costos de ejecución

Cada estrategia se corrió en **dos escenarios**, nunca uno solo:

| Escenario | Comisión/fill | Slippage | Half-spread |
|---|---|---|---|
| **Zero-cost baseline** | $0 | 0% | $0 |
| **Realistic cost** | $0 (Alpaca es zero-commission en equities) | 0.05% (5bps) | $0.005 |

Comisión y slippage se cobran en cada fill (entrada + salida); slippage/spread solo se aplican adversamente a entradas y salidas por `STOP_LOSS`/`TIME_EXIT` (fills tipo mercado) — un `TAKE_PROFIT` se llena exacto en el nivel (convención de orden límite en descanso). Ninguno de los dos valores se presenta como "óptimo", son puntos de partida razonables y documentados.

---

## 8-9. Resultados por estrategia y por timeframe

**Limitación importante de alcance (léase antes de la tabla):** las 5 estrategias del Bloque 3 tienen cada una **un solo `supportedTimeframes` hardcodeado** — Trend Following, Breakout, VWAP y Mean Reversion solo soportan `15m`; Opening Range Breakout solo soporta `5m`. Probar la misma estrategia en 5m/15m/30m/1h (como pedía el punto 9 original) habría requerido **modificar el código de las estrategias**, algo explícitamente fuera de alcance de este bloque ("no cambies las estrategias"). Por eso la comparación por timeframe de este informe es, en la práctica, una comparación 15m (4 estrategias) vs. 5m (1 estrategia) — no una matriz completa. Se documenta como limitación real, no oculta.

### Tabla comparativa — período completo, costos realistas

| Estrategia | TF | Trades | Win Rate | Avg R | Expectancy R | Profit Factor | Max DD | Return | Sharpe | Muestra |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Trend Following | 15m | 491 | 24.8% | -0.65 | -0.65 | 0.42 | 80.0% | **-80.0%** | -0.39 | HIGH |
| Breakout | 15m | 294 | 32.3% | -0.58 | -0.58 | 0.46 | 58.5% | **-58.0%** | -0.37 | HIGH |
| VWAP | 15m | 810 | 21.9% | -1.29 | -1.29 | 0.19 | 99.5% | **-99.5%** | -0.77 | HIGH |
| Mean Reversion | 15m | 429 | 30.5% | -0.60 | -0.60 | 0.52 | 73.8% | **-73.3%** | -0.30 | HIGH |
| Opening Range Breakout | 5m | 562 | 36.5% | -0.80 | -0.80 | 0.40 | 89.8% | **-89.6%** | -0.46 | HIGH |
| Buy & Hold SPY (mismo período) | — | 1 | 100% | n/a | n/a | n/a | 0% | **+40.0%** | n/a | INSUFFICIENT* |

\* Buy & Hold no es comparable 1:1: un solo trade conceptual, sin stop, expuesto el 100% del tiempo — se muestra igual porque el punto 25 lo pide explícitamente, con esta nota.

**Ninguna de las 5 estrategias tiene expectativa positiva después de costos realistas sobre este período.** Las 5 pierden dinero. Las 5 pierden contra Buy & Hold por un margen enorme (entre 47 y 139 puntos porcentuales de diferencia de retorno).

### Antes de costos (zero-cost baseline) — el hallazgo más interesante

| Estrategia | Trades | Win Rate | Avg R | Profit Factor | Return |
|---|---:|---:|---:|---:|---:|
| Trend Following | 525 | 25.1% | -0.12 | 0.82 | -28.1% |
| Breakout | 308 | 31.8% | -0.05 | 0.93 | -7.5% |
| VWAP | 984 | 24.1% | -0.28 | 0.63 | -75.0% |
| **Mean Reversion** | 490 | 30.4% | **+0.15** | **1.23** | **+42.8%** |
| **Opening Range Breakout** | 660 | 36.5% | **+0.10** | **1.14** | **+34.7%** |

Mean Reversion y Opening Range Breakout son **rentables antes de costos** pero se vuelven claramente negativas con 5bps de slippage + $0.005 de spread — su "edge" bruto es más chico que el costo típico de operar en este timeframe/frecuencia. Trend Following, Breakout y VWAP ya pierden incluso sin ningún costo.

---

## 10-12. Resultados Train / Validation / Out-of-Sample (split cronológico 60/20/20)

| Estrategia | Train (expR / Return) | Validation (expR / Return) | **Out-of-Sample (expR / Return)** | Muestra OOS |
|---|---|---|---|---|
| Trend Following | -0.72 / -65.4% | -0.53 / -21.3% | **-0.49 / -21.9%** | HIGH (100 trades) |
| Breakout | -0.63 / -43.7% | -0.16 / -4.6% | **-0.86 / -22.2%** | MEDIUM (58 trades) |
| VWAP | -1.36 / -96.0% | -1.46 / -69.9% | **-0.92 / -55.6%** | HIGH (174 trades) |
| Mean Reversion | -0.74 / -61.3% | -0.46 / -18.9% | **-0.36 / -14.6%** | MEDIUM (86 trades) |
| Opening Range Breakout | -0.78 / -73.3% | -0.82 / -37.1% | **-0.85 / -38.6%** | HIGH (113 trades) |

El out-of-sample **nunca** se usó para ajustar nada — es la salida directa del split cronológico, corrida con los mismos parámetros base que el resto. En los 5 casos, el signo de la expectativa se mantiene negativo en train, validation y out-of-sample: no hay ninguna estrategia que "se salve" en la porción no vista.

---

## 13. Walk-Forward (ventanas deslizantes, sin optimización)

Ventanas dimensionadas desde el tamaño real de cada dataset (train ≈ 6 meses, validation/forward ≈ 1 mes cada una, mismo tamaño de paso). **Los mismos parámetros base se usaron en todas las ventanas — cero optimización entre ventanas.**

| Estrategia | Ventanas | Ventanas forward rentables | % rentables | Expectancy R mediana (forward) |
|---|---:|---:|---:|---:|
| Trend Following | 51 | 13 | 25.5% | -0.59 |
| Breakout | 51 | 11 | 21.6% | -0.62 |
| VWAP | 51 | **1** | **2.0%** | -1.25 |
| Mean Reversion | 51 | 14 | 27.5% | -0.61 |
| Opening Range Breakout | 50 | 5 | 10.0% | -0.90 |

Ninguna estrategia es rentable en la mayoría de sus ventanas forward — la mejor (Mean Reversion) solo gana en poco más de 1 de cada 4. VWAP es prácticamente rentable en ninguna. Esto refuerza que el resultado negativo del período completo **no es un artefacto de un solo tramo malo** — es persistente a través de docenas de sub-períodos independientes.

## 14. Análisis de riesgo Monte Carlo (bootstrap, 1000 simulaciones, semilla 42)

*Análisis de riesgo de secuencia, no una predicción de rentabilidad — reordena los mismos R-multiples reales con reemplazo.*

| Estrategia | Max Drawdown (P5 / P50 / P95) | Equity final (P5 / P50 / P95) | Racha perdedora (P5 / P50 / P95) |
|---|---|---|---|
| Trend Following | 73.7% / 80.5% / 85.4% | $1,480 / $1,980 / $2,704 | 13 / 18 / 27 |
| Breakout | 48.5% / 58.5% / 66.7% | $3,351 / $4,201 / $5,234 | 8 / 12 / 18 |
| VWAP | 99.2% / **99.5%** / 99.6% | $36 / **$52** / $80 | 17 / 22 / 32 |
| Mean Reversion | 63.9% / 73.7% / 80.8% | $1,949 / $2,704 / $3,764 | 10 / 14 / 21 |
| Opening Range Breakout | 86.0% / 89.9% / 92.6% | $744 / $1,026 / $1,423 | 9 / 12 / 17 |

VWAP es, con diferencia, la más destructiva: en la simulación mediana, el drawdown reordenado es del 99.5% (quiebra virtual de la cuenta) independientemente del orden real de los trades.

---

## 15. Comparación de estrategias — resumen

Ranking por expectancy R (costos realistas, de menos mala a peor): **Breakout (-0.58) ≈ Mean Reversion (-0.60) < Trend Following (-0.65) < Opening Range Breakout (-0.80) ≪ VWAP (-1.29)**. Ninguna posición en este ranking es "ganadora" — todas son negativas. VWAP es categóricamente la peor en todas las dimensiones (expectancy, profit factor, drawdown, Monte Carlo, walk-forward).

## 16. Equity curves, Drawdown curves, Cumulative R

Disponibles interactivamente en el dashboard (`/backtesting`, componentes `EquityCurveChart`/`DrawdownCurveChart`/`CumulativeRChart`, SVG sin dependencias) para cualquier corrida ad-hoc. Para este experimento real, los datos crudos (equity/drawdown/R por trade) están en `.backtest-results/<strategy>.json` (no versionado, ver §21) — no se embeben aquí como imágenes para mantener este documento auditable como texto plano.

## 17-19. Max Drawdown, Expectancy en R, Profit Factor — ya cubiertos en las tablas de §9, §13 y §14.

## 20. Calidad de muestra

Las 5 estrategias alcanzan `HIGH` (≥100 trades) en el período completo. En Out-of-Sample, 3 de 5 llegan a `HIGH`/`MEDIUM` con 58-174 trades — suficiente para no ser ruido puro, aunque ninguna alcanza una muestra que permitiría afirmaciones fuertes de "ley de los grandes números" al nivel de un fondo cuantitativo real. Los breakdowns por hora/mes individuales caen frecuentemente a `LOW`/`INSUFFICIENT` (ver JSON crudo) — correctamente etiquetados, nunca presentados como concluyentes.

---

## 21-25. Verificación técnica

| Check | Resultado |
|---|---|
| **Tests** | **240/240 pasando** (43 archivos de test) — cobertura de cronología, no-look-ahead, sizing, comisión/slippage, ambigüedad intrabar, límites de riesgo diario, cálculo de R, drawdown, expectancy, profit factor, split train/val/OOS, límites de walk-forward, entre otros (ver `tests/core/backtesting/**`, `tests/core/risk-engine/**`) |
| **Lint (ESLint)** | 0 errores, 0 warnings sobre `src` y `tests` |
| **TypeScript** | `tsc --noEmit` limpio, sin `any` nuevos sin justificar |
| **Build** | `next build` exitoso — 22 rutas generadas, incluyendo `/backtesting` (estática) y `POST /api/backtesting/run` (dinámica) |

## 26. Limitaciones (documentadas, no ocultas)

1. **Una sola estrategia = un solo timeframe hardcodeado** (Bloque 3) — impidió la matriz completa 5m/15m/30m/1h × 5 estrategias que pedía el punto 9 original; se probó cada estrategia solo en su timeframe soportado.
2. **Ventana de 2 años**, no el histórico completo disponible (~2016+) — decisión de alcance por tiempo de cómputo en esta sesión, no una limitación del proveedor de datos.
3. **Embargo de recencia de ~15 min en el feed `sip`** de esta cuenta — irrelevante para backtesting histórico, documentado por si se usa este mismo código para datos "en vivo".
4. **Opening Range Breakout corrió con `WARN`** (3 gaps de 94,970 velas) — no bloqueó la simulación por diseño (solo `FAIL` bloquea), pero es la única de las 5 sin `PASS` limpio.
5. **Resultados específicos a este período real** (ago 2024 - ago 2026, mercado mayormente alcista según Buy & Hold +40%) — no se puede asumir que se repliquen en otro régimen de mercado.
6. **Sin Consensus Engine ni combinación multi-estrategia** — por pedido explícito del usuario.

## 27. Bugs encontrados (durante este bloque, todos corregidos y verificados)

1. **Trampa O(n²)** en el detector de régimen / motor de indicadores al recalcular desde cero en cada vela simulada — resuelto con versiones de una sola pasada (`detectSeries`, `computeIndicatorSnapshotSeries`), verificadas bit-idénticas a las originales.
2. **Bug de límite en `detectSeries`**: las primeras `CONFIRMATION_BARS-1` posiciones de la serie no coincidían con lo que `detect()` habría dicho sobre un prefijo igual de corto — corregido y cubierto con tests de estabilidad de prefijo.
3. **Feed `iex` hardcodeado e inconsistente** para SPY antes de ~2020 — reemplazado por `sip` configurable.
4. **Embargo de recencia SIP no documentado** — encontrado empíricamente (HTTP 403), resuelto omitiendo `to` según el propio contrato de la interfaz.
5. **`server-only` incompatible fuera de Next.js** al correr el script standalone — resuelto invocando con `NODE_OPTIONS="--conditions=react-server"`, sin debilitar el guard en el código de producción.
6. **El proxy de red de este entorno sandbox no es respetado por el `fetch` nativo de Node** — resuelto con un shim basado en `curl` **scopeado únicamente al script del experimento**, nunca al adapter de producción.
7. **Bug de matemática de fechas**: `setFullYear(getFullYear() - EXPERIMENT_YEARS)` truncaba un `EXPERIMENT_YEARS` fraccionario a un año entero — corregido con resta en milisegundos.
8. **Hallazgo no corregido, reportado para revisión conjunta:** el Sortino ratio produce valores numéricamente inestables (magnitudes absurdas, ej. `-2.65e15`) en el escenario **zero-cost** para 4 de las 5 estrategias — probablemente por una desviación a la baja cercana a cero cuando muchos trades cierran en exactamente -1.00R sin fricción. **No se tocó `metrics.ts`** para no modificar código de análisis a mitad del review que pediste; se documenta como candidato a arreglo en la próxima sesión. El Sharpe ratio y todos los resultados con costos realistas no muestran este problema.

## 28. Conclusiones (sin modificar ninguna estrategia)

- Las 5 estrategias, **con sus reglas y parámetros actuales**, tienen expectativa negativa después de costos realistas sobre 2 años reales de SPY (15m para 4 de ellas, 5m para Opening Range Breakout).
- Mean Reversion y Opening Range Breakout muestran expectativa positiva **antes** de costos — su edge bruto existe pero es menor que 5bps de slippage + $0.005 de spread en este timeframe/frecuencia de trading.
- El resultado negativo persiste en train, validation, out-of-sample y en la gran mayoría de las ventanas walk-forward — no es un artefacto de un solo tramo de mercado.
- Ningún régimen de mercado de los detectados (UPTREND, DOWNTREND, STRONG_UPTREND, STRONG_DOWNTREND, RANGE, HIGH_VOLATILITY, LOW_VOLATILITY) mostró expectativa positiva para ninguna estrategia.
- Las 5 pierden claramente contra un simple Buy & Hold del mismo período (+40.0%/+40.1% según la ventana exacta de cada dataset).
- VWAP es, en todas las métricas, la peor de las 5 — el análisis Monte Carlo sugiere una probabilidad muy alta de destruir prácticamente toda la cuenta.
- Esto **no** significa que las ideas subyacentes sean inválidas para siempre — significa que el conjunto de reglas y parámetros tal como están codificados hoy no tienen un edge validado sobre esta muestra real, neto de costos.

## 29. Recomendación para el próximo bloque

No implementar Consensus Engine todavía, tal como pediste. Antes de decidir el siguiente paso, sugiero revisar juntos:

1. **¿Extender la ventana histórica?** El proveedor permite datos hasta ~2016 con `sip` — una muestra más larga daría más confianza estadística, especialmente para las ventanas walk-forward y los breakdowns por mes/hora que hoy caen en `LOW`/`INSUFFICIENT`.
2. **¿Resolver la limitación de un solo timeframe por estrategia?** Sería un cambio de código en las estrategias del Bloque 3 (agregar timeframes a `supportedTimeframes` y validar que la lógica generalice) — decisión tuya, no algo que se debería hacer sin tu aprobación explícita dado que "no reconstruir el proyecto" fue una instrucción base.
3. **¿Qué hacer con el hallazgo de Mean Reversion / ORB con edge bruto positivo?** Vale la pena decidir juntos si esto amerita explorar (manualmente, sin optimización automática) alternativas de ejecución que reduzcan el costo efectivo, antes de descartar esas dos estrategias.
4. **Arreglar el bug de Sortino** en `metrics.ts` (§27, punto 8) — cambio acotado, de higiene numérica, no de resultados de estrategias.
5. Solo después de esa revisión conjunta, decidir si tiene sentido construir el Consensus Engine — y ser honestos en que combinar 5 estrategias con expectativa negativa individual no produce automáticamente un consenso con expectativa positiva; el Consensus Engine, si se construye, necesitaría su propia validación honesta, igual que este bloque.

---

## Anexo — reproducibilidad

- Script: `scripts/run-backtest-experiment.ts` (`NODE_OPTIONS="--conditions=react-server" EXPERIMENT_YEARS=2 npx tsx scripts/run-backtest-experiment.ts`)
- Resultados crudos completos (incluyendo las 51/50 ventanas walk-forward por estrategia): `.backtest-results/*.json` — no versionado (`.gitignore`), regenerable en cualquier momento con datos reales frescos.
- Config exacta usada: capital inicial $10,000, riesgo 0.5%/trade, política de ambigüedad `CONSERVATIVE`, split 60/20/20, semilla Monte Carlo 42, feed Alpaca `sip`.
