# ml-service/main.py
import os
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

def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    closes  = df["close"]
    highs   = df["high"]
    lows    = df["low"]
    volumes = df["volume"]

    # RSI 14
    delta = closes.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    df["rsi"] = 100 - (100 / (1 + gain / (loss + 1e-10)))

    # RSI 7
    gain7 = delta.clip(lower=0).rolling(7).mean()
    loss7 = (-delta.clip(upper=0)).rolling(7).mean()
    df["rsi_7"] = 100 - (100 / (1 + gain7 / (loss7 + 1e-10)))

    # RSI 21
    gain21 = delta.clip(lower=0).rolling(21).mean()
    loss21 = (-delta.clip(upper=0)).rolling(21).mean()
    df["rsi_21"] = 100 - (100 / (1 + gain21 / (loss21 + 1e-10)))

    # MACD
    ema12 = closes.ewm(span=12).mean()
    ema26 = closes.ewm(span=26).mean()
    df["macd"]        = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    # Bollinger Bands
    bb_middle = closes.rolling(20).mean()
    bb_std    = closes.rolling(20).std()
    bb_upper  = bb_middle + 2 * bb_std
    bb_lower  = bb_middle - 2 * bb_std
    df["bb_position"] = (closes - bb_lower) / (bb_upper - bb_lower + 1e-10)
    df["bb_width"]    = (bb_upper - bb_lower) / (bb_middle + 1e-10)

    # EMA 50 e 200
    ema50  = closes.ewm(span=50).mean()
    ema200 = closes.ewm(span=200).mean()
    df["ema50_dist"]  = (closes - ema50)  / (ema50  + 1e-10)
    df["ema200_dist"] = (closes - ema200) / (ema200 + 1e-10)
    df["ema_cross"]   = (ema50 > ema200).astype(int)

    # SMA 20 e 50
    sma20 = closes.rolling(20).mean()
    sma50 = closes.rolling(50).mean()
    df["sma20_dist"] = (closes - sma20) / (sma20 + 1e-10)
    df["sma50_dist"] = (closes - sma50) / (sma50 + 1e-10)

    # Volume relativo
    df["volume_ratio"] = volumes / (volumes.rolling(20).mean() + 1e-10)

    # Retornos
    df["return_1"] = closes.pct_change(1)
    df["return_3"] = closes.pct_change(3)
    df["return_6"] = closes.pct_change(6)

    # Momentum
    df["momentum_3"]  = closes / closes.shift(3)  - 1
    df["momentum_6"]  = closes / closes.shift(6)  - 1
    df["momentum_12"] = closes / closes.shift(12) - 1

    # Volatilidade
    df["volatility_6"]  = closes.pct_change().rolling(6).std()
    df["volatility_12"] = closes.pct_change().rolling(12).std()

    # Padrões de vela
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

@app.get("/")
def root():
    return {"status": "online", "model_trained": model is not None, "info": model_info}

@app.post("/train")
async def train(symbol: str = "BTC/USDT", timeframe: str = "1h", limit: int = 5000):
    global model, scaler, model_info

    print(f"[ML] A descarregar {limit} velas de {symbol} ({timeframe})...")

    exchange  = ccxt.binance({"enableRateLimit": True})
    all_ohlcv = []
    batch     = 1000
    since     = exchange.parse8601('2023-01-01T00:00:00Z')

    for _ in range(10):
        if len(all_ohlcv) >= limit:
            break
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=batch)
        if not ohlcv:
            break
        all_ohlcv.extend(ohlcv)
        since = ohlcv[-1][0] + 1
        print(f"[ML] Descarregadas {len(all_ohlcv)} velas... última: {pd.to_datetime(ohlcv[-1][0], unit='ms')}")
        time.sleep(0.3)

    all_ohlcv = all_ohlcv[:limit]
    df = pd.DataFrame(all_ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df = df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

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