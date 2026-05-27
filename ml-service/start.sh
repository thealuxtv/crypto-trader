#!/bin/bash
echo "A arrancar o ML Service..."
uvicorn main:app --host 0.0.0.0 --port $PORT
