import os

env_name = os.environ.get("DJANGO_ENV", "development")
if env_name == "production":
    from .prod import *
else:
    from .dev import *
