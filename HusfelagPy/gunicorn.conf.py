bind = "0.0.0.0:8080"
workers = 4
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 120          # kill worker only after 120 s of silence (default 30)
keepalive = 5
