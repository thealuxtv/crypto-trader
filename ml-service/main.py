# ml-service/main.py
import os
import json
import pickle
import time
import numpy as np
import pandas as pd
import ccxt
from collections import Counter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler

app = FastAPI(title="Crypto ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model      = None
scaler     = None
model_info = {}

MODEL_PATH  = "/workspaces/crypto-trader/ml-service/model.pkl"
SCALER_PATH = "/workspaces/crypto-trader/ml-service/scaler.pkl"

FEATURES = [
    "rsi", "rsi_7", "rsi_21",
    "macd", "macd_signal", "macd_hist",
    "bb_position", "bb_width",
    "ema50_dist", "ema200_dist", "ema_cross",
    "sma20_dist", "sma50_dist",
    "volume_ratio",
    "return_1", "return_3", "return_6",
    "momentum_3", "momentum_6", "momentum_12",
    "volatility_6", "volatility_12",
    "high_low_ratio", "close_open_ratio",
]

def convert(obj):
    if isinstance(obj, np.integer):  return int(obj)
    if isinstance(obj, np.floating): return float(obj)
    if isinstance(obj, np.bool_):    return bool(obj)
    if isinstance(obj, np.ndarray):  return obj.tolist()
    return obj

def to_python(obj):
    return json.loads(json.dumps(obj, default=convert))

def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    closes  = df["close"]
    highs   = df["high"]
    lows    = df["low"]
    volumes = df["volume"]

    delta = closes.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    df["rsi"] = 100 - (100 / (1 + gain / (loss + 1e-10)))

    gain7 = delta.clip(lower=0).rolling(7).mean()
    loss7 = (-delta.clip(upper=0)).rolling(7).mean()
    df["rsi_7"] = 100 - (100 / (1 + gain7 / (loss7 + 1e-10)))

    gain21 = delta.clip(lower=0).rolling(21).mean()
    loss21 = (-delta.clip(upper=0)).rolling(21).mean()
    df["rsi_21"] = 100 - (100 / (1 + gain21 / (loss21 + 1e-10)))

    ema12 = closes.ewm(span=12).mean()
    ema26 = closes.ewm(span=26).mean()
    df["macd"]        = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    bb_middle = closes.rolling(20).mean()
    bb_std    = closes.rolling(20).std()
    bb_upper  = bb_middle + 2 * bb_std
    bb_lower  = bb_middle - 2 * bb_std
    df["bb_position"] = (closes - bb_lower) / (bb_upper - bb_lower + 1e-10)
    df["bb_width"]    = (bb_upper - bb_lower) / (bb_middle + 1e-10)

    ema50  = closes.ewm(span=50).mean()
    ema200 = closes.ewm(span=200).mean()
    df["ema50_dist"]  = (closes - ema50)  / (ema50  + 1e-10)
    df["ema200_dist"] = (closes - ema200) / (ema200 + 1e-10)
    df["ema_cross"]   = (ema50 > ema200).astype(int)

    sma20 = closes.rolling(20).mean()
    sma50 = closes.rolling(50).mean()
    df["sma20_dist"] = (closes - sma20) / (sma20 + 1e-10)
    df["sma50_dist"] = (closes - sma50) / (sma50 + 1e-10)

    df["volume_ratio"] = volumes / (volumes.rolling(20).mean() + 1e-10)

    df["return_1"] = closes.pct_change(1)
    df["return_3"] = closes.pct_change(3)
    df["return_6"] = closes.pct_change(6)

    df["momentum_3"]  = closes / closes.shift(3)  - 1
    df["momentum_6"]  = closes / closes.shift(6)  - 1
    df["momentum_12"] = closes / closes.shift(12) - 1

    df["volatility_6"]  = closes.pct_change().rolling(6).std()
    df["volatility_12"] = closes.pct_change().rolling(12).std()

    df["high_low_ratio"]   = (highs - lows) / (closes + 1e-10)
    df["close_open_ratio"] = (closes - df["open"]) / (df["open"] + 1e-10)

    return df

def compute_labels(df: pd.DataFrame) -> pd.Series:
    future_return  = df["close"].shift(-3) / df["close"] - 1
    buy_threshold  = future_return.quantile(0.65)
    sell_threshold = future_return.quantile(0.35)
    labels = pd.Series(0, index=df.index)
    labels[future_return >= buy_threshold]  = 1
    labels[future_return <= sell_threshold] = 2
    return labels

def download_candles(symbol: str, timeframe: str, limit: int, start_date: str = '2023-01-01T00:00:00Z'):
    exchange  = ccxt.binance({"enableRateLimit": True})
    all_ohlcv = []
    batch     = 1000
    since     = exchange.parse8601(start_date)

    for _ in range(20):
        if len(all_ohlcv) >= limit:
            break
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=batch)
        if not ohlcv:
            break
        all_ohlcv.extend(ohlcv)
        since = ohlcv[-1][0] + 1
        print(f"[ML] Descarregadas {len(all_ohlcv)} velas...")
        time.sleep(0.3)

    all_ohlcv = all_ohlcv[:limit]
    df = pd.DataFrame(all_ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df = df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    return df

def compute_metrics(trades, starting_balance, final_balance, equity_curve):
    if not trades:
        return {"totalTrades": 0}

    wins   = [t for t in trades if t["win"]]
    losses = [t for t in trades if not t["win"]]

    total_pnl     = sum(t["pnl"] for t in trades)
    win_rate      = len(wins) / len(trades) * 100
    avg_win       = sum(t["pnl_pct"] for t in wins)   / len(wins)   if wins   else 0
    avg_loss      = sum(t["pnl_pct"] for t in losses) / len(losses) if losses else 0
    gains_sum     = sum(t["pnl"] for t in wins)
    losses_sum    = abs(sum(t["pnl"] for t in losses))
    profit_factor = gains_sum / losses_sum if losses_sum > 0 else 999.0
    total_return  = (final_balance - starting_balance) / starting_balance * 100

    peak = starting_balance
    max_drawdown = 0
    for p in equity_curve:
        if p["equity"] > peak:
            peak = p["equity"]
        dd = (peak - p["equity"]) / peak * 100
        if dd > max_drawdown:
            max_drawdown = dd

    returns = [(equity_curve[i]["equity"] - equity_curve[i-1]["equity"]) / equity_curve[i-1]["equity"]
               for i in range(1, len(equity_curve))]
    avg_r  = sum(returns) / len(returns) if returns else 0
    std_r  = (sum((r - avg_r) ** 2 for r in returns) / len(returns)) ** 0.5 if returns else 0
    sharpe = (avg_r / std_r) * (252 ** 0.5) if std_r > 0 else 0

    return {
        "totalTrades":  len(trades),
        "wins":         len(wins),
        "losses":       len(losses),
        "winRate":      round(win_rate, 1),
        "avgWinPct":    round(avg_win, 2),
        "avgLossPct":   round(avg_loss, 2),
        "profitFactor": round(profit_factor, 2),
        "totalPnL":     round(total_pnl, 2),
        "totalReturn":  round(total_return, 2),
        "finalBalance": round(final_balance, 2),
        "maxDrawdown":  round(max_drawdown, 2),
        "sharpeRatio":  round(sharpe, 2),
    }

@app.get("/")
def root():
    return {"status": "online", "model_trained": model is not None, "info": model_info}

@app.post("/train")
async def train(symbol: str = "BTC/USDT", timeframe: str = "1h", limit: int = 5000):
    global model, scaler, model_info

    print(f"[ML] A descarregar {limit} velas de {symbol} ({timeframe})...")
    df = download_candles(symbol, timeframe, limit, start_date='2023-01-01T00:00:00Z')

    print(f"[ML] {len(df)} velas descarregadas. A calcular features...")
    df          = compute_features(df)
    df["label"] = compute_labels(df)
    df          = df.dropna()

    X = df[FEATURES].values
    y = df["label"].values.astype(int)

    print(f"[ML] Dataset: {len(X)} amostras | BUY: {(y==1).sum()} | SELL: {(y==2).sum()} | HOLD: {(y==0).sum()}")

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

    scaler  = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test  = scaler.transform(X_test)

    counts         = Counter(y_train.tolist())
    total          = len(y_train)
    weights        = {cls: total / (len(counts) * cnt) for cls, cnt in counts.items()}
    sample_weights = np.array([weights[label] for label in y_train])

    print("[ML] A treinar XGBoost...")
    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=4,
        learning_rate=0.02,
        subsample=0.7,
        colsample_bytree=0.7,
        min_child_weight=5,
        gamma=0.2,
        reg_alpha=0.1,
        reg_lambda=1.5,
        eval_metric="mlogloss",
        random_state=42,
    )
    model.fit(
        X_train, y_train,
        sample_weight=sample_weights,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred   = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report   = classification_report(y_test, y_pred, target_names=["HOLD","BUY","SELL"], output_dict=True)

    print(f"[ML] Accuracy: {accuracy:.2%}")
    print(classification_report(y_test, y_pred, target_names=["HOLD","BUY","SELL"]))

    with open(MODEL_PATH,  "wb") as f: pickle.dump(model,  f)
    with open(SCALER_PATH, "wb") as f: pickle.dump(scaler, f)

    model_info = {
        "symbol":         symbol,
        "timeframe":      timeframe,
        "samples":        len(X),
        "accuracy":       round(accuracy, 4),
        "buy_precision":  round(report.get("BUY",  {}).get("precision", 0), 3),
        "sell_precision": round(report.get("SELL", {}).get("precision", 0), 3),
        "hold_precision": round(report.get("HOLD", {}).get("precision", 0), 3),
        "trained_at":     pd.Timestamp.now().isoformat(),
    }

    return {"ok": True, "metrics": model_info}


class BacktestRequest(BaseModel):
    symbol:           str   = "BTC/USDT"
    timeframe:        str   = "1h"
    limit:            int   = 1000
    starting_balance: float = 10000
    stop_loss_pct:    float = 0.03
    take_profit_pct:  float = 0.06
    max_position_pct: float = 0.10
    fees_pct:         float = 0.001
    warmup:           int   = 50


@app.post("/backtest")
async def backtest_ml(req: BacktestRequest):
    global model, scaler

    symbol           = req.symbol
    timeframe        = req.timeframe
    limit            = req.limit
    starting_balance = req.starting_balance
    stop_loss_pct    = req.stop_loss_pct
    take_profit_pct  = req.take_profit_pct
    max_position_pct = req.max_position_pct
    fees_pct         = req.fees_pct
    warmup           = req.warmup

    if model is None:
        if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
            with open(MODEL_PATH,  "rb") as f: model  = pickle.load(f)
            with open(SCALER_PATH, "rb") as f: scaler = pickle.load(f)
        else:
            return {"ok": False, "error": "Modelo não treinado — chama /train primeiro"}

    print(f"[Backtest ML] A descarregar {limit} velas RECENTES de {symbol} ({timeframe})...")
    df = download_candles(symbol, timeframe, limit, start_date='2025-01-01T00:00:00Z')
    df = compute_features(df)
    df = df.dropna().reset_index(drop=True)

    print(f"[Backtest ML] A simular {len(df) - warmup} velas de {symbol} ({timeframe}) com dados de 2025...")

    balance      = starting_balance
    position     = None
    trades       = []
    equity_curve = []

    for i in range(warmup, len(df)):
        row   = df.iloc[i]
        price = float(row["close"])

        if position:
            if float(row["low"]) <= position["stop_loss"]:
                exit_price = position["stop_loss"]
                pnl = (exit_price - position["entry_price"]) * position["quantity"] * (1 - fees_pct)
                balance += position["quantity"] * exit_price * (1 - fees_pct)
                trades.append({
                    "type":        "SELL",
                    "entry_price": position["entry_price"],
                    "exit_price":  exit_price,
                    "quantity":    position["quantity"],
                    "pnl":         round(pnl, 2),
                    "pnl_pct":     round((exit_price / position["entry_price"] - 1) * 100, 3),
                    "reason":      "stop-loss",
                    "win":         bool(pnl > 0),
                    "entry_time":  str(position["entry_time"]),
                    "exit_time":   str(row["timestamp"]),
                })
                position = None

            elif float(row["high"]) >= position["take_profit"]:
                exit_price = position["take_profit"]
                pnl = (exit_price - position["entry_price"]) * position["quantity"] * (1 - fees_pct)
                balance += position["quantity"] * exit_price * (1 - fees_pct)
                trades.append({
                    "type":        "SELL",
                    "entry_price": position["entry_price"],
                    "exit_price":  exit_price,
                    "quantity":    position["quantity"],
                    "pnl":         round(pnl, 2),
                    "pnl_pct":     round((exit_price / position["entry_price"] - 1) * 100, 3),
                    "reason":      "take-profit",
                    "win":         bool(pnl > 0),
                    "entry_time":  str(position["entry_time"]),
                    "exit_time":   str(row["timestamp"]),
                })
                position = None

        features        = np.array([[float(row[f]) for f in FEATURES]])
        features_scaled = scaler.transform(features)
        proba           = model.predict_proba(features_scaled)[0]
        pred_class      = int(np.argmax(proba))
        label_map       = {0: "HOLD", 1: "BUY", 2: "SELL"}
        action          = label_map[pred_class]

        if action == "BUY" and not position:
            spend    = balance * max_position_pct
            quantity = (spend - spend * fees_pct) / price
            position = {
                "quantity":    quantity,
                "entry_price": price,
                "entry_time":  str(row["timestamp"]),
                "stop_loss":   price * (1 - stop_loss_pct),
                "take_profit": price * (1 + take_profit_pct),
            }
            balance -= spend

        elif action == "SELL" and position:
            pnl = (price - position["entry_price"]) * position["quantity"] * (1 - fees_pct)
            balance += position["quantity"] * price * (1 - fees_pct)
            trades.append({
                "type":        "SELL",
                "entry_price": position["entry_price"],
                "exit_price":  price,
                "quantity":    position["quantity"],
                "pnl":         round(pnl, 2),
                "pnl_pct":     round((price / position["entry_price"] - 1) * 100, 3),
                "reason":      "sinal-venda",
                "win":         bool(pnl > 0),
                "entry_time":  position["entry_time"],
                "exit_time":   str(row["timestamp"]),
            })
            position = None

        open_value = position["quantity"] * price if position else 0
        equity_curve.append({
            "timestamp": str(row["timestamp"]),
            "equity":    round(balance + open_value, 2),
            "price":     price,
        })

    if position:
        last_price = float(df.iloc[-1]["close"])
        pnl = (last_price - position["entry_price"]) * position["quantity"] * (1 - fees_pct)
        balance += position["quantity"] * last_price * (1 - fees_pct)
        trades.append({
            "type":        "SELL",
            "entry_price": position["entry_price"],
            "exit_price":  last_price,
            "quantity":    position["quantity"],
            "pnl":         round(pnl, 2),
            "pnl_pct":     round((last_price / position["entry_price"] - 1) * 100, 3),
            "reason":      "fim-backtest",
            "win":         bool(pnl > 0),
            "entry_time":  position["entry_time"],
            "exit_time":   str(df.iloc[-1]["timestamp"]),
        })

    metrics = compute_metrics(trades, starting_balance, balance, equity_curve)
    print(f"[Backtest ML] Concluído — {len(trades)} trades | retorno: {metrics.get('totalReturn', 0)}%")

    return to_python({
        "ok":           True,
        "symbol":       symbol,
        "timeframe":    timeframe,
        "candles_used": len(df) - warmup,
        "trades":       trades,
        "equity_curve": equity_curve,
        "metrics":      metrics,
    })

# ── Chatbot ───────────────────────────────────────────────────────────────

KNOWLEDGE_BASE = {
    "rsi": """O RSI (Relative Strength Index) é um indicador de momentum que mede a velocidade e magnitude das variações de preço numa escala de 0 a 100.
- RSI abaixo de 30: mercado sobrevendido — possível sinal de compra
- RSI acima de 70: mercado sobrecomprado — possível sinal de venda
- RSI entre 30 e 70: zona neutra
O sistema usa RSI de 3 períodos diferentes: 7, 14 e 21.""",

    "macd": """O MACD (Moving Average Convergence Divergence) é um indicador de tendência que mostra a relação entre duas médias móveis exponenciais (EMA 12 e EMA 26).
- Quando o MACD cruza acima da linha de sinal: sinal de compra (bullish)
- Quando o MACD cruza abaixo da linha de sinal: sinal de venda (bearish)
- O histograma mostra a diferença entre o MACD e a linha de sinal""",

    "bollinger": """As Bollinger Bands são bandas de volatilidade calculadas com base numa média móvel e desvio padrão.
- Banda superior: média + 2 desvios padrão
- Banda inferior: média - 2 desvios padrão
- Preço próximo da banda inferior: possível reversão para cima
- Preço próximo da banda superior: possível reversão para baixo
- Bandas largas: alta volatilidade; bandas estreitas: baixa volatilidade""",

    "ema": """As EMA (Exponential Moving Averages) são médias móveis que dão mais peso aos preços recentes.
- EMA 50: tendência de médio prazo
- EMA 200: tendência de longo prazo
- EMA 50 acima de EMA 200: tendência bullish (mercado em alta)
- EMA 50 abaixo de EMA 200: tendência bearish (mercado em queda)
Este cruzamento chama-se Golden Cross (bullish) ou Death Cross (bearish)""",

    "xgboost": """O XGBoost é o modelo de machine learning que toma as decisões de trading.
Foi treinado com dados históricos do BTC/USDT de 2023-2024 usando 24 features técnicas.
Devolve 3 probabilidades: P(HOLD), P(BUY), P(SELL).
A decisão final é a classe com maior probabilidade.
Precision atual: ~45% para BUY e ~40% para SELL.""",

    "backtest": """O backtest simula a estratégia em dados históricos para avaliar a performance antes de usar dinheiro real.
Métricas principais:
- Retorno total: ganho ou perda percentual no período
- Taxa de acerto: % de trades vencedores
- Profit factor: rácio entre ganhos totais e perdas totais (>1 é lucrativo)
- Max drawdown: maior queda do capital do pico ao fundo
- Sharpe ratio: retorno ajustado ao risco (>1 é bom, >2 é excelente)""",

    "paper_trading": """Paper trading é simulação com dinheiro fictício usando preços reais da exchange.
Permite testar a estratégia sem arriscar capital real.
O sistema começa com $10.000 simulados e executa ordens reais na Binance mas sem enviar fundos.""",

    "stop_loss": """O stop-loss é uma ordem automática que fecha a posição quando o preço cai abaixo de um nível definido.
Protege o capital de perdas excessivas.
Exemplo: stop-loss de 3% significa que se comprar a $100, a posição fecha automaticamente a $97.""",

    "take_profit": """O take-profit é uma ordem automática que fecha a posição quando o preço sobe acima de um nível definido.
Garante os lucros antes que o mercado reverta.
Exemplo: take-profit de 6% significa que se comprar a $100, a posição fecha automaticamente a $106.""",

    "volume": """O volume indica quantas unidades foram negociadas num período.
O sistema calcula o volume relativo: volume atual vs média das últimas 20 velas.
- Volume alto (>1.5x): confirma o sinal e aumenta a confiança
- Volume baixo (<0.7x): enfraquece o sinal""",

    "pnl": """PnL significa Profit and Loss (Lucro e Perda).
- PnL realizado: lucro/perda de trades já fechados
- PnL não realizado: lucro/perda da posição atualmente aberta
- PnL total: soma de todos os trades fechados""",

    "momentum": """O momentum mede a velocidade de variação do preço num período.
- Momentum positivo: preço a subir mais rápido que no passado
- Momentum negativo: preço a cair
O sistema calcula momentum a 3, 6 e 12 períodos.""",

    "volatilidade": """A volatilidade mede a magnitude das variações de preço.
Alta volatilidade = preço a oscilar muito = mais risco e oportunidade.
O sistema calcula volatilidade a 6 e 12 períodos usando o desvio padrão dos retornos.""",
}

def find_answer(question: str, context: dict = None) -> str:
    q = question.lower()

    # Perguntas sobre indicadores
    if any(w in q for w in ["rsi", "relative strength"]):
        return KNOWLEDGE_BASE["rsi"]
    if any(w in q for w in ["macd", "moving average convergence"]):
        return KNOWLEDGE_BASE["macd"]
    if any(w in q for w in ["bollinger", "bandas", "banda"]):
        return KNOWLEDGE_BASE["bollinger"]
    if any(w in q for w in ["ema", "média móvel", "media movel", "golden cross", "death cross"]):
        return KNOWLEDGE_BASE["ema"]
    if any(w in q for w in ["xgboost", "modelo", "machine learning", "ml", "ia", "inteligência artificial"]):
        return KNOWLEDGE_BASE["xgboost"]
    if any(w in q for w in ["backtest", "backtesting", "histórico", "historico"]):
        return KNOWLEDGE_BASE["backtest"]
    if any(w in q for w in ["paper trading", "simulação", "simulacao", "fictício", "ficticio"]):
        return KNOWLEDGE_BASE["paper_trading"]
    if any(w in q for w in ["stop loss", "stop-loss", "stoploss"]):
        return KNOWLEDGE_BASE["stop_loss"]
    if any(w in q for w in ["take profit", "take-profit", "takeprofit"]):
        return KNOWLEDGE_BASE["take_profit"]
    if any(w in q for w in ["volume"]):
        return KNOWLEDGE_BASE["volume"]
    if any(w in q for w in ["pnl", "lucro", "perda", "profit", "loss"]):
        return KNOWLEDGE_BASE["pnl"]
    if any(w in q for w in ["momentum"]):
        return KNOWLEDGE_BASE["momentum"]
    if any(w in q for w in ["volatilidade", "volatilidade", "volatility"]):
        return KNOWLEDGE_BASE["volatilidade"]

    # Perguntas sobre o estado atual
    if context:
        if any(w in q for w in ["saldo", "balance", "dinheiro", "capital"]):
            return f"O teu saldo atual é de ${context.get('balance', 0):.2f} USDT."

        if any(w in q for w in ["posição", "posicao", "position", "aberta"]):
            pos = context.get("position")
            if pos:
                return (f"Tens uma posição aberta em {pos.get('symbol')}.\n"
                        f"Entrada: ${pos.get('entryPrice', 0):.2f}\n"
                        f"Stop-loss: ${pos.get('stopLoss', 0):.2f}\n"
                        f"Take-profit: ${pos.get('takeProfit', 0):.2f}")
            return "Não tens nenhuma posição aberta no momento."

        if any(w in q for w in ["preço", "preco", "price", "btc", "bitcoin"]):
            return f"O preço atual do BTC/USDT é ${context.get('price', 0):.2f}."

        if any(w in q for w in ["sinal", "signal", "comprar", "vender", "decisão", "decisao"]):
            action    = context.get("action", "HOLD")
            conf      = context.get("confidence", 0) * 100
            action_pt = {"BUY": "COMPRAR", "SELL": "VENDER", "HOLD": "AGUARDAR"}.get(action, action)
            return f"O sinal atual da IA é {action_pt} com {conf:.0f}% de confiança."

        if any(w in q for w in ["trades", "histórico", "historico", "operações", "operacoes"]):
            total = context.get("totalTrades", 0)
            pnl   = context.get("totalPnL", 0)
            return f"Realizaste {total} trades com um PnL total de ${pnl:.2f}."

    # Lista de tópicos disponíveis
    if any(w in q for w in ["ajuda", "help", "o que sabes", "tópicos", "topicos", "perguntas"]):
        return """Posso responder a perguntas sobre:

📊 **Indicadores técnicos**: RSI, MACD, Bollinger Bands, EMA, Volume, Momentum, Volatilidade
🤖 **Modelo ML**: XGBoost, como funciona, precisão
📈 **Trading**: Backtest, Paper trading, Stop-loss, Take-profit, PnL
💰 **Estado atual**: Saldo, posição aberta, preço atual, sinal da IA, histórico de trades

Exemplos de perguntas:
- "O que é o RSI?"
- "Como funciona o MACD?"
- "Qual é o meu saldo atual?"
- "Tenho alguma posição aberta?"
- "Qual é o sinal atual?"
"""

    return """Não encontrei uma resposta específica para essa pergunta. 

Tenta perguntar sobre:
- Indicadores: RSI, MACD, Bollinger Bands, EMA, Volume
- Sistema: XGBoost, backtest, paper trading
- Estado: saldo, posição, sinal atual, trades

Escreve **ajuda** para ver todos os tópicos disponíveis."""


class ChatRequest(BaseModel):
    message: str
    context: dict = {}


@app.post("/chat")
def chat(req: ChatRequest):
    answer = find_answer(req.message, req.context)
    return {"answer": answer, "ok": True}

class PredictRequest(BaseModel):
    rsi:              float
    rsi_7:            float
    rsi_21:           float
    macd:             float
    macd_signal:      float
    macd_hist:        float
    bb_position:      float
    bb_width:         float
    ema50_dist:       float
    ema200_dist:      float
    ema_cross:        int
    sma20_dist:       float
    sma50_dist:       float
    volume_ratio:     float
    return_1:         float
    return_3:         float
    return_6:         float
    momentum_3:       float
    momentum_6:       float
    momentum_12:      float
    volatility_6:     float
    volatility_12:    float
    high_low_ratio:   float
    close_open_ratio: float


@app.post("/predict")
def predict(req: PredictRequest):
    global model, scaler

    if model is None:
        if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
            with open(MODEL_PATH,  "rb") as f: model  = pickle.load(f)
            with open(SCALER_PATH, "rb") as f: scaler = pickle.load(f)
            print("[ML] Modelo carregado do disco")
        else:
            return {
                "action":     "HOLD",
                "confidence": 0,
                "score":      0,
                "reasons":    ["Modelo não treinado — chama /train primeiro"],
                "source":     "fallback",
            }

    features = np.array([[
        req.rsi, req.rsi_7, req.rsi_21,
        req.macd, req.macd_signal, req.macd_hist,
        req.bb_position, req.bb_width,
        req.ema50_dist, req.ema200_dist, req.ema_cross,
        req.sma20_dist, req.sma50_dist,
        req.volume_ratio,
        req.return_1, req.return_3, req.return_6,
        req.momentum_3, req.momentum_6, req.momentum_12,
        req.volatility_6, req.volatility_12,
        req.high_low_ratio, req.close_open_ratio,
    ]])

    features_scaled = scaler.transform(features)
    proba           = model.predict_proba(features_scaled)[0]
    pred_class      = int(np.argmax(proba))

    label_map  = {0: "HOLD", 1: "BUY", 2: "SELL"}
    action     = label_map[pred_class]
    confidence = float(proba[pred_class])
    score      = confidence if action == "BUY" else -confidence if action == "SELL" else 0

    reasons = [
        f"XGBoost — probabilidade {action}: {confidence:.1%}",
        f"P(HOLD): {proba[0]:.1%} | P(BUY): {proba[1]:.1%} | P(SELL): {proba[2]:.1%}",
    ]

    return {
        "action":     action,
        "confidence": round(confidence, 4),
        "score":      round(score, 4),
        "reasons":    reasons,
        "proba": {
            "hold": round(float(proba[0]), 4),
            "buy":  round(float(proba[1]), 4),
            "sell": round(float(proba[2]), 4),
        },
        "source": "xgboost",
    }