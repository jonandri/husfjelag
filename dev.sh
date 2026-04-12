#!/bin/bash
# Start backend and frontend for local development

trap 'kill 0' EXIT

echo "Running migrations..."
(cd HusfelagPy && poetry run python manage.py migrate)

echo "Starting backend on http://localhost:8010 ..."
(cd HusfelagPy && poetry run python manage.py runserver 8010) &

echo "Waiting for backend to be ready..."
until curl -s http://localhost:8010 > /dev/null 2>&1; do
  sleep 1
done
echo "Backend is up."

echo "Starting frontend on http://localhost:3010 ..."
(cd HusfelagJS && PORT=3010 REACT_APP_API_URL=http://localhost:8010 npm start) &

wait
