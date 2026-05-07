# ml-service/main.py
import os
import json
import pickle
import numpy as np
import pandas as pd
import ccxt
from collections import Counter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
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

# ── Estado global ──────────────────────────────────────────────────────────
model      = None
scaler     = None
model_info = {}

MODEL_PATH  = "/workspaces/crypto-trader/ml-service/model.pkl"
SCALER_PATH = "/workspaces/crypto-trader/ml-service/scaler.pkl"

# ── Features ──────────────────────────────────────────────────────────────
FEATURES = [
    "rsi", "macd", "macd_signal", "macd_hist",
    "bb_position", "bb_width",
    "ema50_dist", "ema200_dist", "ema_cross",
    "volume_ratio",
    "return_1", "return_3", "return_6",
    "high_low_ratio", "close_open_ratio",
]

# ── Calcular indicadores ──────────────────────────────────────────────────
def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    closes  = df["close"]
    highs   = df["high"]
    lows    = df["low"]
    volumes = df["volume"]

    # RSI
    delta = closes.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / (loss + 1e-10)
    df["rsi"] = 100 - (100 / (1 + rs))

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

    # Volume relativo
    df["volume_ratio"] = volumes / (volumes.rolling(20).mean() + 1e-10)

    # Retornos
    df["return_1"] = closes.pct_change(1)
    df["return_3"] = closes.pct_change(3)
    df["return_6"] = closes.pct_change(6)

    # Padrões de vela
    df["high_low_ratio"]   = (highs - lows) / (closes + 1e-10)
    df["close_open_ratio"] = (closes - df["open"]) / (df["open"] + 1e-10)

    return df

def compute_labels(df: pd.DataFrame, horizon: int = 3, threshold: float = 0.005) -> pd.Series:
    future_return = df["close"].shift(-horizon) / df["close"] - 1
    
    # Usa percentis para garantir equilíbrio entre classes
    buy_threshold  = future_return.quantile(0.65)   # top 35% = BUY
    sell_threshold = future_return.quantile(0.35)   # bottom 35% = SELL
    
    labels = pd.Series(0, index=df.index)
    labels[future_return >= buy_threshold]  = 1
    labels[future_return <= sell_threshold] = 2
    return labels

# ── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "online", "model_trained": model is not None, "info": model_info}

@app.post("/train")
async def train(symbol: str = "BTC/USDT", timeframe: str = "1h", limit: int = 2000):
    global model, scaler, model_info

    print(f"[ML] A descarregar {limit} velas de {symbol} ({timeframe})...")

    # Descarregar dados
    exchange = ccxt.binance({"enableRateLimit": True})
    ohlcv    = exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
    df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")

    print(f"[ML] {len(df)} velas descarregadas. A calcular features...")

    # Features e labels
    df     = compute_features(df)
    labels = compute_labels(df, horizon=3, threshold=0.005)
    df["label"] = labels

    # Remove NaN
    df = df.dropna()
    df = df[df["label"].notna()]

    X = df[FEATURES].values
    y = df["label"].values.astype(int)

    print(f"[ML] Dataset: {len(X)} amostras | BUY: {(y==1).sum()} | SELL: {(y==2).sum()} | HOLD: {(y==0).sum()}")

    # Split treino/teste
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

    # Normalizar
    scaler  = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test  = scaler.transform(X_test)

    # Pesos para equilibrar classes
    counts  = Counter(y_train.tolist())
    total   = len(y_train)
    weights = {cls: total / (len(counts) * cnt) for cls, cnt in counts.items()}
    sample_weights = np.array([weights[label] for label in y_train])

    # Treinar XGBoost
    print("[ML] A treinar XGBoost...")
    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        eval_metric="mlogloss",
        random_state=42,
    )
    model.fit(
        X_train, y_train,
        sample_weight=sample_weights,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    # Avaliar
    y_pred   = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report   = classification_report(y_test, y_pred, target_names=["HOLD","BUY","SELL"], output_dict=True)

    print(f"[ML] Accuracy: {accuracy:.2%}")
    print(classification_report(y_test, y_pred, target_names=["HOLD","BUY","SELL"]))

    # Guardar modelo
    with open(MODEL_PATH,  "wb") as f: pickle.dump(model,  f)
    with open(SCALER_PATH, "wb") as f: pickle.dump(scaler, f)

    model_info = {
        "symbol":          symbol,
        "timeframe":       timeframe,
        "samples":         len(X),
        "accuracy":        round(accuracy, 4),
        "buy_precision":   round(report.get("BUY",  {}).get("precision", 0), 3),
        "sell_precision":  round(report.get("SELL", {}).get("precision", 0), 3),
        "hold_precision":  round(report.get("HOLD", {}).get("precision", 0), 3),
        "trained_at":      pd.Timestamp.now().isoformat(),
    }

    return {"ok": True, "metrics": model_info}


class PredictRequest(BaseModel):
    rsi:              float
    macd:             float
    macd_signal:      float
    macd_hist:        float
    bb_position:      float
    bb_width:         float
    ema50_dist:       float
    ema200_dist:      float
    ema_cross:        int
    volume_ratio:     float
    return_1:         float
    return_3:         float
    return_6:         float
    high_low_ratio:   float
    close_open_ratio: float


@app.post("/predict")
def predict(req: PredictRequest):
    global model, scaler

    # Tenta carregar modelo do disco se não estiver em memória
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
        req.rsi, req.macd, req.macd_signal, req.macd_hist,
        req.bb_position, req.bb_width,
        req.ema50_dist, req.ema200_dist, req.ema_cross,
        req.volume_ratio,
        req.return_1, req.return_3, req.return_6,
        req.high_low_ratio, req.close_open_ratio,
    ]])

    features_scaled = scaler.transform(features)
    proba           = model.predict_proba(features_scaled)[0]   # [HOLD, BUY, SELL]
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