# RS3M — Seguimiento de Paper Trading Forward

Este documento es el registro operativo del forward testing de `RS3M_CANDIDATE_V1` en Alpaca Paper
Trading. Complementa a `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` (la auditoría estadística y de
infraestructura) — este archivo se centra en el **proceso** de forward testing: qué corre, cuándo, bajo
qué aprobación, y cómo se mide con el tiempo.

## Estado actual

| | |
|---|---|
| **Bloque 6** | AUDIT PASSED — PAPER READY |
| **Routine (infraestructura)** | VALIDATED — corre correctamente, sin errores, dos disparos de validación confirmados |
| **RS3M_CANDIDATE_V1 (estrategia)** | **NO VALIDATED** — `VALIDATED` no existe como estado alcanzable en `src/core/paper-trading/rs3m/status.ts`, por diseño |
| **Órdenes Paper reales enviadas** | **0** hasta ahora |
| **Evidencia forward** | NOT STARTED — el ledger existe y funciona, pero no contiene ninguna fila `EXECUTED` todavía |
| **Próxima señal fresca** | AWAITING |

**Distinción crítica, repetida aquí a propósito**: que la Routine esté "VALIDATED" significa que la
*automatización* funciona (se ejecuta sin errores, respeta el calendario NYSE, nunca toca el endpoint
live). No dice nada sobre si `RS3M_CANDIDATE_V1` es una buena estrategia. Esa es una pregunta científica
distinta, que solo se puede empezar a responder con meses de evidencia forward real — y ni siquiera
entonces se responde automáticamente (ver "Reglas de invalidación" más abajo).

## Estrategia congelada

- **Candidate ID:** `RS3M_CANDIDATE_V1`
- **Hash:** `1c28b57c` — pinneado de forma independiente en `safety-guards.ts` (`EXPECTED_RS3M_CANDIDATE_V1_HASH`), verificado en cada ejecución real, no solo en tests.
- **Definición:** `src/core/paper-trading/rs3m/candidate.ts` — lookback 3 meses, universo SPY/QQQ/IWM/DIA, rebalanceo mensual, single-winner 100%, sin apalancamiento, coste de referencia 20bps.
- **Ningún parámetro se modifica en esta fase ni en ninguna futura mientras este documento siga vigente.** Cualquier cambio de estrategia exige un candidato nuevo (`RS3M_CANDIDATE_V2`, ...) con su propia investigación independiente — nunca una mutación de este archivo.

## Fecha de inicio del forward testing

- Infraestructura de paper trading construida y auditada: **2026-08-17**.
- Routine automática creada y validada: **2026-08-17** (`trig_01JbjYAAm2J9s32CbM7NiKpx`).
- Modo de aprobación manual activado: **2026-08-18** (este documento).
- **Primera orden Paper real: pendiente** — el reloj de "evidencia forward" empieza a contar desde la primera fila `EXECUTED` en el ledger, no desde esta fecha.

## Política de aprobación

Por decisión explícita del usuario, **ninguna orden Paper real se envía sin aprobación humana
explícita**, mes a mes, hasta que se autorice lo contrario.

1. La Routine corre en `DRY_RUN=true` cada día hábil de NYSE. El propio script decide si hay algo que
   hacer — nunca un cron ciego.
2. Cuando una señal mensual pasa **todos** los guards excepto la aprobación
   (`AWAITING_APPROVAL`), el sistema:
   - Guarda el plan completo en `results/block6/forward/<mes>/awaiting-approval.json` (una sola vez por mes).
   - Envía **una** notificación (`SIGNAL_AWAITING_APPROVAL`) con: fecha, decision month, cutoff, ranking
     completo, ganador, ETF objetivo, posiciones actuales, órdenes propuestas, nocional, turnover, hash
     del candidato, resultado de cada guard, y confirmación explícita de que es PAPER y de que **no se
     ha enviado ninguna orden**.
3. Un humano ejecuta `npx tsx scripts/block6/paper/approve-rebalance.ts <mes> "nota"` — esto **solo**
   escribe un marcador de aprobación (`results/block6/forward/<mes>/approval.json`), pinneado al hash
   del candidato calculado en ese momento. **No envía ninguna orden por sí mismo.**
4. La siguiente vez que la Routine corre con `PAPER_TRADING=true`, `rs3m-engine.ts#execute()` vuelve a
   evaluar **todos** los guards desde cero — señal fresca, hash del candidato, endpoint paper, símbolo
   permitido, sin shorts, sin leverage, sin duplicado, Y aprobación válida. Una aprobación de hace una
   semana para una señal que mientras tanto se volvió `STALE_SIGNAL` sigue bloqueada: la aprobación
   nunca puede "saltarse" un guard que fallaría de todos modos.
5. Tras la primera ejecución real, el sistema **permanece en modo de aprobación manual** — no pasa a
   ejecución mensual completamente automática sin autorización explícita adicional del usuario.

## Benchmarks y métricas

Calculados por `src/core/paper-trading/rs3m/forward-performance.ts` (puro, probado con fixtures
sintéticos, a la espera de datos reales) a partir de la serie de equity del ledger forward:

- CAGR, volatilidad anualizada, máximo drawdown, Sharpe (mensual, no anualizado — misma convención que el backtest).
- Exceso de retorno vs. SPY buy-and-hold y vs. equal-weight del universo.
- Tracking difference (desviación estándar del diferencial de retornos mensuales vs. SPY).
- Turnover y slippage realizados (promedio).
- Conteo de fallos de ejecución y de rebalanceos perdidos.

Estas métricas son **derivadas bajo demanda** a partir de los datos crudos que sí se guardan por fila en
`results/block6/forward/ledger.jsonl` (equity antes/después, posiciones antes/después, fills) — no se
duplican como campos calculados en cada fila, para que nunca puedan divergir de su propia fórmula.

**`forward-performance.ts` siempre devuelve el mismo disclaimer junto a cualquier número**: ningún valor
aquí marca a la estrategia como `VALIDATED`.

## Reglas de invalidación (de una señal/aprobación — no de la estrategia)

Estas son las condiciones, ya implementadas como safety guards, bajo las cuales una señal o una
aprobación deja de ser válida y el sistema se niega a operar:

| Condición | Guard | Efecto |
|---|---|---|
| Señal con más de 10 días desde el cutoff | `STALE_SIGNAL` | Bloquea, incluso con aprobación en archivo |
| Timestamp de señal en el futuro (bug de reloj/datos) | `STALE_SIGNAL` | Bloquea |
| Hash del candidato no coincide con `1c28b57c` | `CANDIDATE_HASH_MISMATCH` | Bloquea — tripwire ante edición del candidato congelado |
| Mes ya ejecutado (marcador local o historial real en Alpaca) | `IDEMPOTENCY` / reconciliación de broker | Bloquea — nunca duplica |
| Endpoint distinto de `paper-api.alpaca.markets` | `PAPER_ONLY` | Estructuralmente imposible, verificado también en runtime |
| Símbolo fuera de SPY/QQQ/IWM/DIA | `SYMBOL_WHITELIST` | Bloquea |
| Venta sin posición previa | `NO_SHORTS` | Bloquea |
| Notional de compra > valor de cartera | `NO_LEVERAGE` | Bloquea |
| Sin aprobación humana en archivo (modo activo) | `APPROVAL_REQUIRED` | Bloquea |
| Datos de mercado corruptos (NaN, precio ≤ 0) | `MALFORMED_DATA` | Bloquea antes de calcular la señal |
| Cuenta o posiciones ilegibles | `ACCOUNT_UNAVAILABLE` / `POSITIONS_UNAVAILABLE` | Bloquea |

**No existe** una regla de "invalidar la estrategia RS3M" en este documento ni en el código — eso sería
una decisión de investigación, explícitamente fuera de alcance de esta fase.

## Separación Paper / Live

- `src/core/execution/alpaca-paper-client.ts` tiene una única constante de URL en todo el archivo:
  `https://paper-api.alpaca.markets/v2`. No existe variable de entorno, parámetro ni configuración capaz
  de apuntar a `api.alpaca.markets` (live) — un test grepea el propio código fuente para detectarlo si
  alguna vez apareciera.
- `assertPaperOnly()` re-verifica esa misma URL en cada ejecución, independientemente del punto anterior.
- Ninguna variable de entorno puede activar LIVE por accidente: `DRY_RUN` y `PAPER_TRADING` solo
  controlan si se llama a `execute()` en absoluto — ninguna de las dos, ni ninguna combinación, cambia el
  endpoint.
- `RS3M_REQUIRE_APPROVAL` (por defecto `true`) solo controla el guard de aprobación — no tiene ningún
  efecto sobre el endpoint ni sobre los límites de símbolo/leverage/shorts.

## Procedimiento ante errores

| Situación | Qué hace el sistema | Notifica |
|---|---|---|
| Credenciales ausentes | Fail closed, no calcula señal | ✅ `SCHEDULER_ERROR` |
| Fallo al descargar datos de mercado | Fail closed, no calcula señal | ✅ `DATA_ERROR` |
| Datos corruptos (NaN, etc.) | Bloquea antes de calcular la señal | ✅ `GUARD_BLOCKED` |
| Cualquier guard inesperado (no `STALE_SIGNAL`/`APPROVAL_REQUIRED` rutinarios) | Bloquea, nunca ejecuta | ✅ `GUARD_BLOCKED` o `STALE_SIGNAL` |
| Hash del candidato no coincide | Bloquea | ✅ `GUARD_BLOCKED` |
| Endpoint incorrecto (no debería ser alcanzable) | Bloquea | ✅ `GUARD_BLOCKED` |
| Intento de duplicado (local o vía broker) | Bloquea, no reenvía | ✅ `GUARD_BLOCKED` |
| Fallo al verificar órdenes existentes antes de enviar | Fail closed, no envía nada | ✅ `BROKER_ERROR` |
| Orden rechazada por Alpaca | Se detiene, reporta, no reintenta con ID nuevo | ✅ `BROKER_ERROR` |
| Fill parcial / orden sigue abierta tras el sondeo | Se registra como `anyOrderStillInFlight`, nunca se asume "filled" | ✅ (vía `PARTIAL_FILL` por orden) |
| Error no capturado en el script | `process.exitCode = 1`, registrado en `events.log` | ✅ `SCHEDULER_ERROR` |
| `STALE_SIGNAL` rutinario fuera de la ventana de rebalanceo | No-op, esperado | ❌ (sin notificación — ver `notification-policy.ts`) |
| Mes ya ejecutado / no es día de ejecución / mercado cerrado | No-op | ❌ (sin notificación) |

En todos los casos de "Fail closed", **no se envía ninguna orden**. La regla general del sistema:
ante cualquier duda, no operar.

## Cómo aprobar el primer rebalanceo real

Cuando llegue la notificación `SIGNAL_AWAITING_APPROVAL`:

```bash
npx tsx scripts/block6/paper/approve-rebalance.ts 2026-09 "aprobado tras revisar el plan"
```

Y después, para que la aprobación surta efecto (fuera de esta sesión, o en la siguiente ventana de la
Routine, siempre con supervisión humana en esta fase):

```bash
NODE_OPTIONS="--conditions=react-server" DRY_RUN=false PAPER_TRADING=true \
  ALPACA_API_KEY_ID="$ALPACA_PAPER_API_KEY_ID" ALPACA_API_SECRET_KEY="$ALPACA_PAPER_API_SECRET_KEY" \
  npx tsx scripts/block6/paper/run-rebalance.ts
```

Tras la primera ejecución real, generar el informe correspondiente:

```bash
npx tsx scripts/block6/paper/execution-report.ts 2026-09
```
