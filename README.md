# Crypto AI Trader

Bot de trading de criptomoedas com IA, em modo de simulação (paper trading).
Analisa indicadores técnicos em tempo real e decide automaticamente comprar ou vender.

---

## Estrutura do projeto

```
crypto-trader/
├── backend/
│   ├── core/
│   │   ├── marketData.js     # Fetch de velas e preços via ccxt
│   │   ├── indicators.js     # RSI, MACD, Bollinger Bands, EMA
│   │   ├── paperTrading.js   # Simulador de ordens
│   │   └── tradingLoop.js    # Ciclo principal + WebSocket broadcast
│   ├── strategies/
│   │   └── aiStrategy.js     # Motor de decisão (combina sinais)
│   ├── api/routes/
│   │   └── index.js          # Endpoints REST
│   ├── server.js             # Entry point Express + WebSocket
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── hooks/
    │   │   └── useTrader.js  # WebSocket + estado em tempo real
    │   └── App.jsx           # Dashboard principal
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Instalação e arranque

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edita o .env com as tuas configurações

npm install
npm run dev
```

O servidor arranca em `http://localhost:3001`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

O dashboard abre em `http://localhost:5173`.

---

## Configuração (.env)

| Variável           | Descrição                                        | Default      |
|--------------------|--------------------------------------------------|--------------|
| `EXCHANGE`         | Exchange a usar (binance, kraken, coinbase)      | `binance`    |
| `API_KEY`          | API Key da exchange (pode ficar vazio em sandbox)| —            |
| `API_SECRET`       | API Secret da exchange                           | —            |
| `SANDBOX`          | `true` = paper trading, sem ordens reais         | `true`       |
| `SYMBOL`           | Par a negociar                                   | `BTC/USDT`   |
| `TIMEFRAME`        | Timeframe das velas                              | `1h`         |
| `CHECK_INTERVAL`   | Segundos entre análises                          | `60`         |
| `STARTING_BALANCE` | Saldo inicial simulado em USDT                   | `10000`      |
| `STOP_LOSS_PCT`    | Stop-loss (ex: 0.03 = -3%)                       | `0.03`       |
| `TAKE_PROFIT_PCT`  | Take-profit (ex: 0.06 = +6%)                     | `0.06`       |
| `MAX_POSITION_PCT` | Máx. do saldo por trade (ex: 0.10 = 10%)         | `0.10`       |

---

## Como funciona

1. O **trading loop** corre a cada `CHECK_INTERVAL` segundos
2. Obtém as últimas 200 velas via ccxt (dados reais da exchange)
3. Calcula **RSI, MACD, Bollinger Bands, EMA 50/200 e volume relativo**
4. A **aiStrategy** combina os sinais com pesos e produz: `BUY | SELL | HOLD`
5. Se a confiança for suficiente, executa a ordem no **simulador**
6. O resultado é enviado via **WebSocket** para o dashboard em tempo real

---

## Próximos passos sugeridos

- [ ] Adicionar backtesting com dados históricos (testar a estratégia no passado)
- [ ] Persistir trades em SQLite com `better-sqlite3`
- [ ] Adicionar gráfico de velas interativo com `lightweight-charts`
- [ ] Implementar modelo de ML (ex: predição com LSTM via `brain.js` ou API externa)
- [ ] Suporte a múltiplos pares em simultâneo
- [ ] Notificações por email/Telegram quando há um trade
- [ ] Passar para modo live (mudar `SANDBOX=false` e configurar API keys reais)
